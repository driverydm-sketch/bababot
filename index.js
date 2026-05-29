const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const axios = require('axios');
const cron = require('node-cron');

const TELEGRAM_TOKEN = '8900733376:AAH0_tU0l6XW0ocylNGn81klKlIIk6ocScE';
const SUPABASE_URL = 'https://qhwzrabfujxmplcqwktk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFod3pyYWJmdWp4bXBsY3F3a3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzY0MjYsImV4cCI6MjA5NDk1MjQyNn0.gsWHG2ygvs5TevGoy-6iDQKzYWGTkYfa3DMKhGP5Cbs';
const FOOTBALL_API_KEY = '294e5e15dddd1608a7eaea6dde229de8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const bot = new Telegraf(TELEGRAM_TOKEN);
const ADMIN_IDS = [8872067135, 8872067313];

const isAdmin = (userId) => ADMIN_IDS.includes(userId);

async function updateBalance(userId, amount) {
    const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
    await supabase.from('users').update({ balance: (user.balance || 0) + amount }).eq('telegram_id', userId);
}

async function getFirstScorer(fixtureId) {
    try {
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
            headers: { 'x-apisports-key': FOOTBALL_API_KEY }
        });
        const goalEvent = response.data.response.find(e => e.type === 'Goal');
        return goalEvent ? goalEvent.player.name : "ללא כובש";
    } catch { return "שגיאה"; }
}

async function calculateAndPayout(gameId, actualWinner, actualScore, actualScorer) {
    const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);
    if (!bets || bets.length === 0) return;

    const totalPot = bets.length * 100;
    const houseCut = totalPot * 0.20;
    const potToDistribute = totalPot - houseCut;

    await supabase.from('games').update({ house_profit: houseCut }).eq('id', gameId);

    for (const bet of bets) {
        let scorePercent = 0;
        if (bet.winner === actualWinner) scorePercent += 40;
        if (bet.score === actualScore) scorePercent += 40;
        if (bet.scorer === actualScorer) scorePercent += 20;

        if (scorePercent > 0) {
            const winnings = (potToDistribute * (scorePercent / 100));
            await updateBalance(bet.user_id, winnings);
            bot.telegram.sendMessage(bet.user_id, `🎯 פגעת ב-${scorePercent}%! זכית ב-${winnings.toFixed(2)} ש"ח.`);
        }
    }
}
bot.start(async (ctx) => {
    // רישום המשתמש בדאטה-בייס
    await supabase.from('users').upsert([{ 
        telegram_id: ctx.from.id, 
        username: ctx.from.username 
    }], { onConflict: 'telegram_id' });

    // הטקסט המלא להודעת הפתיחה
    const welcomeText = 
        `🔥 **ברוכים הבאים לבאבאבוט!** 🔥\n\n` +
        `הגעתם לזירת ניחושי הספורט החכמה בישראל.\n` +
        `**חוקי המשחק:**\n` +
        `• דמי כניסה: 100 ש"ח.\n` +
        `• ניחוש מנצחת: 40% מהקופה.\n` +
        `• תוצאה מדויקת: 40% מהקופה.\n` +
        `• כובש ראשון: 20% מהקופה.\n\n` +
        `לחצו על הכפתורים למטה כדי להתחיל:`;

    // שליחת ההודעה עם הכפתורים
    await ctx.reply(welcomeText, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')],
            [Markup.button.url('📞 סוכן 24/7', 'https://t.me/YourAgentUsername')]
        ])
    });
});


bot.command('profit', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const { data: games } = await supabase.from('games').select('house_profit').eq('status', 'finished');
    const totalProfit = games.reduce((sum, game) => sum + (game.house_profit || 0), 0);
    ctx.reply(`📊 סך רווחי הבית שנצברו: ${totalProfit} ש"ח.`);
});

bot.command('bet', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply("שימוש: /bet [ID] [מנצחת] [תוצאה] [כובש]");
    await supabase.from('bets').insert([{ user_id: ctx.from.id, game_id: args[1], winner: args[2], score: args[3], scorer: args[4] }]);
    ctx.reply("✅ ההימור נרשם!");
});

bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    await supabase.from('games').insert([{ home_team: args[1], away_team: args[2], fixture_id: args[3], status: 'active' }]);
    ctx.reply("✅ המשחק נוסף.");
});

async function checkAndFinishGames() {
    const { data: activeGames } = await supabase.from('games').select('*').eq('status', 'active');
    if (!activeGames) return;

    for (const game of activeGames) {
        try {
            const response = await axios.get(`https://v3.football.api-sports.io/fixtures?id=${game.fixture_id}`, {
                headers: { 'x-apisports-key': FOOTBALL_API_KEY }
            });
            const match = response.data.response[0];
            if (match.fixture.status.short === 'FT') {
                const home = match.score.fulltime.home, away = match.score.fulltime.away;
                const winner = home > away ? 'בית' : (away > home ? 'חוץ' : 'תיקו');
                const scorer = await getFirstScorer(game.fixture_id);
                
                await calculateAndPayout(game.id, winner, `${home}-${away}`, scorer);
                await supabase.from('games').update({ status: 'finished' }).eq('id', game.id);
            }
        } catch (err) { console.error(err); }
    }
}

cron.schedule('*/30 * * * *', checkAndFinishGames);
http.createServer((req, res) => res.end("Bot is running!")).listen(process.env.PORT || 3000);
bot.launch();
console.log('🚀 BOT RUNNING');
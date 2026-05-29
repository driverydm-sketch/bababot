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

// פקודת /start
bot.start(async (ctx) => {
    await supabase.from('users').upsert([{ 
        telegram_id: ctx.from.id, 
        username: ctx.from.username 
    }], { onConflict: 'telegram_id' });

    const welcomeText = 
        `🔥 **ברוכים הבאים לבאבאבוט!** 🔥\n\n` +
        `הגעתם לזירת ניחושי הספורט החכמה בישראל.\n` +
        `**חוקי המשחק:**\n` +
        `• דמי כניסה: 100 ש"ח.\n` +
        `• ניחוש מנצחת: 40% מהקופה.\n` +
        `• תוצאה מדויקת: 40% מהקופה.\n` +
        `• כובש ראשון: 20% מהקופה.\n\n` +
        `לחצו על הכפתורים למטה כדי להתחיל:`;

    await ctx.reply(welcomeText, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')],
            [Markup.button.url('📞 סוכן 24/7', 'https://t.me/YourAgentUsername')]
        ])
    });
});

// ==========================================
//      האזנה לכפתורי משתמשים (CALLBACKS)
// ==========================================

// כפתור משחקים פתוחים
bot.action('list_games', async (ctx) => {
    try {
        const { data: games, error } = await supabase.from('games').select('*').eq('status', 'active');
        
        if (error || !games || games.length === 0) {
            await ctx.reply("⚽ אין משחקים פתוחים להימורים כרגע.");
            return await ctx.answerCbQuery();
        }

        let message = "📅 **משחקים פתוחים להימורים:**\n\n";
        games.forEach(game => {
            message += `🆔 **ID:** ${game.id}\n⚽ ${game.home_team} נגד ${game.away_team}\n📝 להימור שלח: \`/bet ${game.id} [מנצחת] [תוצאה] [כובש]\`\n\n`;
        });

        await ctx.replyWithMarkdown(message);
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
        await ctx.answerCbQuery("❌ שגיאה בטעינת המשחקים");
    }
});

// כפתור בדיקת יתרה
bot.action('check_balance', async (ctx) => {
    try {
        const { data: user, error } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
        
        if (error || !user) {
            await ctx.reply("💰 לא נמצאה יתרה במערכת, פנה לסוכן.");
            return await ctx.answerCbQuery();
        }

        await ctx.reply(`💰 **היתרה הנוכחית שלך:** ${(user.balance || 0).toFixed(2)} ש"ח.`);
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
        await ctx.answerCbQuery("❌ שגיאה בבדיקת היתרה");
    }
});

// ==========================================
//      האזנה לכפתורי אדמין (CALLBACKS)
// ==========================================

bot
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

// מיפוי משתני סביבה חכם (תומך גם במחשב וגם ב-Render)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const botToken = process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN;
const adminId = parseInt(process.env.ADMIN_ID) || 0;
const footballApiKey = process.env.FOOTBALL_API_KEY;

if (!supabaseUrl || !supabaseKey || !botToken) {
    console.error("❌ חסרים משתני סביבה חיוניים בקובץ ה-Environment!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(botToken);

// פונקציית הגנה לבדיקת מנהל
const isAdmin = (userId) => {
    if (!adminId) return false;
    return parseInt(userId) === adminId;
};

// פונקציית חלוקת כספים בסיום משחק
async function calculateAndPayout(gameId, actualWinner, actualScore, actualScorer) {
    try {
        const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);
        if (!bets || bets.length === 0) return;

        const totalPot = bets.length * 100;
        const houseCommission = totalPot * 0.20;
        const netPot = totalPot - houseCommission;

        if (adminId > 0) {
            const { data: currentAdmin } = await supabase.from('users').select('balance').eq('telegram_id', adminId).single();
            await supabase.from('users').update({ balance: (currentAdmin?.balance || 0) + houseCommission }).eq('telegram_id', adminId);
        }

        const winnerBets = bets.filter(b => b.predicted_winner === actualWinner);
        const scoreBets = bets.filter(b => b.predicted_score === actualScore);
        const scorerBets = bets.filter(b => b.predicted_scorer?.toLowerCase() === actualScorer?.toLowerCase());

        const payoutPerWinner = winnerBets.length > 0 ? (netPot * 0.40) / winnerBets.length : 0;
        const payoutPerScore = scoreBets.length > 0 ? (netPot * 0.40) / scoreBets.length : 0;
        const payoutPerScorer = scorerBets.length > 0 ? (netPot * 0.20) / scorerBets.length : 0;

        for (const bet of bets) {
            let userTotal = 0;
            if (bet.predicted_winner === actualWinner) userTotal += payoutPerWinner;
            if (bet.predicted_score === actualScore) userTotal += payoutPerScore;
            if (bet.predicted_scorer?.toLowerCase() === actualScorer?.toLowerCase()) userTotal += payoutPerScorer;

            if (userTotal > 0) {
                const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', bet.telegram_id).single();
                await supabase.from('users').update({ balance: (user?.balance || 0) + userTotal }).eq('telegram_id', bet.telegram_id);
                try { await bot.telegram.sendMessage(bet.telegram_id, `🎯 זכייה של ${userTotal.toFixed(2)} ש"ח!`); } catch (e) {}
            }
        }
    } catch (err) {
        console.error("Error in payout:", err);
    }
}

// פקודת סטארט ראשית למשתמשים
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'משתמש';
        
        try {
            const { data: existingUser } = await supabase.from('users').select('*').eq('telegram_id', userId).single();
            if (!existingUser) { 
                await supabase.from('users').insert([{ telegram_id: userId, username: username, balance: 0.0 }]); 
            }
        } catch (supabaseErr) {
            console.error("Supabase user integration error:", supabaseErr);
        }

        return ctx.reply("🔥 ברוכים הבאים לבאבאבוט!\nהגעתם לזירת ניחושי הספורט החכמה בישראל.", Markup.inlineKeyboard([
            [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')]
        ]));
    } catch (err) {
        console.error("Error in start command:", err);
    }
});

// פקודת אדמין ייעודית לפתיחת פאנל הניהול
bot.command('admin', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) {
            return ctx.reply("❌ פקודה זו מיועדת למנהלי המערכת בלבד.");
        }
        
        return ctx.reply("🛠️ *פאנל ניהול אדמין:*", Markup.inlineKeyboard([
            [Markup.button.callback('📊 סטטיסטיקה', 'admin_stats')],
            [Markup.button.callback('👥 רשימת משתמשים', 'admin_users')]
        ]));
    } catch (err) {
        console.error("Error in admin command:", err);
    }
});

// פקודת שליחת הימור למשחק משתמש
bot.command('bet', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        if (args.length < 5) return ctx.reply("❌ פורמט: /bet [ID] [בית/חוץ/תיקו] [תוצאה] [כובש]");
        const userId = ctx.from.id, gameId = args[1], winner = args[2], score = args[3], scorer = args[4];

        const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
        if (!user || user.balance < 100) return ctx.reply("❌ יתרה נמוכה מ-100 ש\"ח.");

        await supabase.from('users').update({ balance: user.balance - 100 }).eq('telegram_id', userId);
        await supabase.from('bets').insert([{ telegram_id: userId, game_id: gameId, predicted_winner: winner, predicted_score: score, predicted_scorer: scorer }]);
        ctx.reply("✅ ההימור נקלט בהצלחה!");
    } catch (err) { 
        console.error(err); 
        ctx.reply("❌ שגיאה בקליטת ההימור."); 
    }
});

// פקודת אדמין להוספת משחק חדש
bot.command('addgame', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply("❌ פקודה זו מיועדת למנהלים בלבד.");
        const args = ctx.message.text.split(' ');
        if (args.length < 4) return ctx.reply("❌ פורמט: /addgame [קבוצה1] [קבוצה2] [ID]");
        
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);
        
        await supabase.from('games').insert([{ home_team: args[1], away_team: args[2], fixture_id: parseInt(args[3]), status: 'active', kickoff: futureDate.toISOString() }]);
        ctx.reply("✅ המשחק נוסף בהצלחה ופתוח להימורים!");
    } catch (err) { 
        console.error(err); 
        ctx.reply("❌ שגיאה בהוספת המשחק."); 
    }
});

// פקודת אדמין לבדיקת סטטוס משחק מול ה-API החיצוני
bot.command('checkapi', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply("❌ פקודה זו מיועדת למנהלים בלבד.");
        const args = ctx.message.text.split(' ');
        const fixtureId = args[1];
        if (!fixtureId) return ctx.reply("❌ נא לספק Fixture ID. דוגמה: /checkapi 12345");
        if (!footballApiKey) return ctx.reply("❌ מפתח FOOTBALL_API_KEY לא מוגדר במערכת.");

        ctx.reply("🔄 בודק נתונים מול שרתי ה-API...");
        const response = await axios.get(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
            headers: { 'x-apisports-key': footballApiKey }
        });

        const gameData = response.data.response[0];
        if (!gameData) return ctx.reply("❌ לא נמצאו נתונים עבור ה-ID הזה.");

        const home = gameData.teams.home.name;
        const away = gameData.teams.away.name;
        const status = gameData.fixture.status.long;
        const homeGoals = gameData.goals.home ?? '-';
        const awayGoals = gameData.goals.away ?? '-';

        ctx.reply(`⚽ *נתוני משחק מה-API:*\n\n🏟️ ${home} נגד ${away}\n📊 סטטוס: ${status}\nתוצאה: ${homeGoals} - ${awayGoals}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(error);
        ctx.reply("❌ שגיאה בתקשורת מול ה-API.");
    }
});

// פקודת אדמין לסגירת משחק ידנית וחלוקת כספים לפי תוצאות
bot.command('endgame', async (ctx) => {
    try {
        if (!isAdmin(ctx.from.id)) return ctx.reply("❌ פקודה זו מיועדת למנהלים בלבד.");
        const args = ctx.message.text.split(' ');
        if (args.length < 5) return ctx.reply("❌ פורמט: /endgame [ID] [בית/חוץ/תיקו] [תוצאה] [כובש]");
        
        await calculateAndPayout(args[1], args[2], args[3], args[4]);
        await supabase.from('games').update({ status: 'finished' }).eq('id', args[1]);
        ctx.reply(`✅ משחק ${args[1]} נסגר בהצלחה והכספים חולקו!`);
    } catch (err) { 
        console.error(err); 
        ctx.reply("❌ שגיאה בסגירת המשחק."); 
    }
});

// טיפול בלחיצות על כפתורי אינליין (Callback Queries)
bot.on('callback_query', async (ctx) => {
    try {
        const data = ctx.data;
        const userId = ctx.from.id;

        // 1. משחקים פתוחים (משתמש רגיל)
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) {
                await ctx.reply("⚽ אין משחקים פתוחים להימורים כרגע.");
            } else {
                let res = "🎮 *משחקים פתוחים להימורים:*\n\n";
                games.forEach(g => {
                    res += `• 🆔 ID: \`${g.id}\` | *${g.home_team}* נגד *${g.away_team}*\n📝 שלח: \`/bet ${g.id} [בית/חוץ/תיקו] [תוצאה] [כובש]\`\n\n`;
                });
                await ctx.reply(res, { parse_mode: 'Markdown' });
            }
        } 
        
        // 2. בדיקת יתרה (משתמש רגיל)
        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            await ctx.reply(`💰 *היתרה הנוכחית שלך:* **${user?.balance || 0} ש"ח**.`);
        }

        // 3. פאנל סטטיסטיקה (מנהל בלבד)
        else if (data === 'admin_stats') {
            if (!isAdmin(userId)) {
                return ctx.answerCbQuery("❌ אין לך הרשאה לכך.", { show_alert: true });
            }

            const [usersCount, activeGames, totalBets] = await Promise.all([
                supabase.from('users').select('*', { count: 'exact', head: true }),
                supabase.from('games').select('*', { count: 'exact', head: true }).eq('status', 'active'),
                supabase.from('bets').select('*', { count: 'exact', head: true })
            ]);

            const statsMessage = `📊 *סטטיסטיקת מערכת עכשווית:*\n\n` +
                                 `👤 *סה"כ משתמשים רשומים:* ${usersCount.count || 0}\n` +
                                 `⚽ *משחקים פעילים כרגע:* ${activeGames.count || 0}\n` +
                                 `🎰 *סה"כ הימורים שנשלחו:* ${totalBets.count || 0}`;

            await ctx.reply(statsMessage, {
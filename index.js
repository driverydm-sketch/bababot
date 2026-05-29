const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// אתחול
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// פקודות בסיסיות
bot.start((ctx) => {
    ctx.reply("🔥 ברוכים הבאים לבאבאבוט!", Markup.inlineKeyboard([
        [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')]
    ]));
});

bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול:", Markup.inlineKeyboard([
        [Markup.button.callback('📊 סטטיסטיקה', 'admin_stats'), Markup.button.callback('👥 משתמשים', 'admin_users')]
    ]));
});

// הפקודה המלאה והמתוקנת להוספת משחק
bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ מורשה למנהלים בלבד.");
    
    // חילוץ המידע עם ביטוי רגולרי (regex) שמתעלם מרווחים כפולים
    const text = ctx.message.text;
    const parts = text.split(/\s+/);
    
    if (parts.length < 4) {
        return ctx.reply("❌ פורמט לא תקין. השתמש ב: /addgame [בית] [חוץ] [ID]");
    }
    
    const homeTeam = parts[1];
    const awayTeam = parts[2];
    const fixtureId = parseInt(parts[3]);

    try {
        const { error } = await supabase.from('games').insert([{ 
            home_team: homeTeam, 
            away_team: awayTeam, 
            fixture_id: fixtureId, 
            status: 'active' 
        }]);

        if (error) throw error;
        
        ctx.reply(`✅ המשחק ${homeTeam} נגד ${awayTeam} (ID: ${fixtureId}) נוסף בהצלחה!`);
    } catch (e) { 
        console.error("Supabase Error:", e);
        ctx.reply("❌ שגיאה בשמירת המשחק למסד הנתונים."); 
    }
});

// טיפול בכפתורים
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            let msg = games?.length ? "🎮 משחקים פתוחים:\n" : "אין משחקים כרגע.";
            games?.forEach(g => msg += `• ${g.home_team} vs ${g.away_team} (ID: ${g.fixture_id})\n`);
            ctx.reply(msg);
        } else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
            ctx.reply(`💰 יתרה: ${user?.balance || 0} ש"ח`);
        }
    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// שרת Keep-Alive ל-Render
const app = express();
app.get('/', (req, res) => res.send('Bot is live'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

bot.launch();

// ניקוי בעת כיבוי
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
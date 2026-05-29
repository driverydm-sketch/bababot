const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// אתחול הבוט וחיבור ל-Supabase
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// פקודת /start - הודעת פתיחה מלאה וכפתור לסוכן זמין
bot.start((ctx) => {
    const welcomeMessage = "🔥 ברוכים הבאים לבאבאבוט! 🔥\n\n" +
                           "המקום המושלם לחוויית המשחק שלכם. 🎮\n" +
                           "כאן תוכלו לצפות במשחקים פתוחים, לנהל את היתרה שלכם ולשחק בראש שקט.\n\n" +
                           "📌 השתמשו בכפתורים למטה כדי להתחיל תנועה:";

    ctx.reply(welcomeMessage, Markup.inlineKeyboard([
        [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')],
        [Markup.button.url('👨‍💻 סוכן זמין 24/7', 'https://t.me/driverydm_sketch')]
    ]));
});

// פאנל ניהול (אדמין)
bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול:", Markup.inlineKeyboard([
        [Markup.button.callback('📊 סטטיסטיקה', 'admin_stats'), Markup.button.callback('👥 משתמשים', 'admin_users')]
    ]));
});

// פקודה להוספת משחק - מותאמת ב-100% לטבלה החדשה והנקייה
bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ מורשה למנהלים בלבד.");
    
    const text = ctx.message.text;
    const parts = text.split(/\s+/);
    
    if (parts.length < 4) {
        return ctx.reply("❌ פורמט לא תקין. השתמש ב: /addgame [קבוצה_א] [קבוצה_ב] [ID]");
    }
    
    const teamA = parts[1];
    const teamB = parts[2];
    const fixtureId = parseInt(parts[3]);

    try {
        // הכנסת הנתונים למבנה החדש והפשוט
        const { error } = await supabase.from('games').insert([{ 
            id: fixtureId,
            team_a: teamA, 
            team_b: teamB,
            status: 'active'
        }]);

        if (error) throw error;
        
        ctx.reply(`✅ המשחק ${teamA} נגד ${teamB} (ID: ${fixtureId}) נוסף בהצלחה!`);
    } catch (e) { 
        console.error("Supabase Error Details:", e);
        ctx.reply(`❌ שגיאה בשמירת המשחק: ${e.message || 'ודא שה-ID ייחודי'}`); 
    }
});

// טיפול בלחיצות כפתורים (Callback Queries)
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            let msg = games?.length ? "🎮 משחקים פתוחים:\n" : "אין משחקים כרגע.";
            games?.forEach(g => msg += `• ${g.team_a} vs ${g.team_b} (ID: ${g.id})\n`);
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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
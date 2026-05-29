const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// תפריט ראשי
bot.start((ctx) => {
    ctx.reply("🔥 ברוכים הבאים לבאבאבוט!", Markup.inlineKeyboard([
        [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')]
    ]));
});

// פאנל אדמין
bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול:", Markup.inlineKeyboard([
        [Markup.button.callback('📊 סטטיסטיקה', 'admin_stats'), Markup.button.callback('👥 משתמשים', 'admin_users')]
    ]));
});

// פקודה להוספת משחק (הגרסה המתוקנת)
bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ מורשה למנהלים בלבד.");
    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) return ctx.reply("❌ פורמט: /addgame [בית] [חוץ] [ID]");
    
    try {
        const { error } = await supabase.from('games').insert([{ 
            home_team: parts[1], 
            away_team: parts[2], 
            fixture_id: parseInt(parts[3]), 
            status: 'active' 
        }]);
        if (error) throw error;
        ctx.reply(`✅ נוסף: ${parts[1]} נגד ${parts[2]} (ID: ${parts[3]})`);
    } catch (e) { 
        ctx.reply("❌ שגיאה בהוספת המשחק."); 
    }
});

// טיפול בכפתורים
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === 'list_games') {
        const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
        let msg = games?.length ? "🎮 משחקים פתוחים:\n" : "אין משחקים.";
        games?.forEach(g => msg += `• ${g.home_team} vs ${g.away_team} (ID: ${g.fixture_id})\n`);
        ctx.reply(msg);
    }
    await ctx.answerCbQuery();
});

// שרת Keep-Alive
const app = express();
app.get('/', (req, res) => res.send('Bot is live'));
app.listen(process.env.PORT || 3000);

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
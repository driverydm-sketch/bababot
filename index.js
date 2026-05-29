const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const express = require('express');

// הגדרות מהסביבה (משתמש ב-Render)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const botToken = process.env.TELEGRAM_TOKEN;
const adminId = parseInt(process.env.ADMIN_ID) || 0;
const footballApiKey = process.env.FOOTBALL_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(botToken);

// --- לוגיקה של הבוט ---
bot.start((ctx) => {
    ctx.reply("🔥 ברוכים הבאים לבאבאבוט!\nהגעתם לזירת ניחושי הספורט החכמה.", Markup.inlineKeyboard([
        [Markup.button.callback('🎮 משחקים פתוחים', 'list_games'), Markup.button.callback('💰 יתרה', 'check_balance')]
    ]));
});

bot.command('admin', async (ctx) => {
    if (parseInt(ctx.from.id) !== adminId) return;
    ctx.reply("🛠️ *פאנל ניהול אדמין:*", Markup.inlineKeyboard([
        [Markup.button.callback('📊 סטטיסטיקה', 'admin_stats')],
        [Markup.button.callback('👥 רשימת משתמשים', 'admin_users')]
    ]));
});

// --- Callback Query Handler (חייב להישאר סגור עם סוגריים תקינים) ---
bot.on('callback_query', async (ctx) => {
    try {
        const data = ctx.callbackQuery.data;
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            let msg = games.length ? "🎮 *משחקים פתוחים:*\n" : "אין משחקים כרגע.";
            games.forEach(g => msg += `• ${g.home_team} נגד ${g.away_team} (ID: ${g.id})\n`);
            ctx.reply(msg, { parse_mode: 'Markdown' });
        } 
        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
            ctx.reply(`💰 יתרה נוכחית: ${user?.balance || 0} ש"ח.`);
        }
        else if (data === 'admin_stats') {
            const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
            ctx.reply(`📊 סה"כ משתמשים: ${count}`);
        }
        await ctx.answerCbQuery();
    } catch (e) { console.error(e); }
});

// --- שרת Keep-Alive ל-Render ---
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000);

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
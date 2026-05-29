const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// /start command
bot.start((ctx) => {
    // השתמש בטקסטים ממשתני הסביבה כדי למנוע בעיות קידוד בשרת
    const welcomeText = process.env.MSG_WELCOME || "Welcome to Bababot!";
    const btnGames = process.env.BTN_GAMES || "Games";
    const btnBalance = process.env.BTN_BALANCE || "Balance";
    const btnAgent = process.env.BTN_AGENT || "Agent 24/7";

    ctx.reply(welcomeText, Markup.inlineKeyboard([
        [Markup.button.callback(btnGames, 'list_games'), Markup.button.callback(btnBalance, 'check_balance')],
        [Markup.button.url(btnAgent, 'https://t.me/driverydm_sketch')]
    ]));
});

// Admin command
bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ Admin Panel:", Markup.inlineKeyboard([
        [Markup.button.callback('Stats', 'admin_stats'), Markup.button.callback('Users', 'admin_users')]
    ]));
});

// Add game command
bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Unauthorized.");
    
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length < 4) return ctx.reply("❌ Format: /addgame [TeamA] [TeamB] [ID]");
    
    const teamA = parts[1];
    const teamB = parts[2];
    const fixtureId = parseInt(parts[3]);

    try {
        const { error } = await supabase.from('games').insert([{ 
            id: fixtureId,
            team_a: teamA, 
            team_b: teamB,
            status: 'active'
        }]);

        if (error) throw error;
        ctx.reply(`✅ Game ${teamA} vs ${teamB} (ID: ${fixtureId}) added!`);
    } catch (e) { 
        console.error("Supabase Error:", e);
        ctx.reply(`❌ Database Error: ${e.message || 'Check unique ID'}`); 
    }
});

// Callback queries
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            let msg = games?.length ? "🎮 Games:\n" : "No active games.";
            games?.forEach(g => msg += `• ${g.team_a} vs ${g.team_b} (ID: ${g.id})\n`);
            ctx.reply(msg);
        } else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
            ctx.reply(`💰 Balance: ${user?.balance || 0} NIS`);
        }
    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// Express Server
const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
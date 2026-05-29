const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;
const userSessions = {};

bot.telegram.setMyCommands([
    { command: 'start', description: '🚀 הפעל את הבוט' },
    { command: 'admin', description: '🛠️ פאנל ניהול' }
]).catch(console.error);

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'שחקן';
    await supabase.from('users').upsert({ telegram_id: userId, username: username }, { onConflict: 'telegram_id' });

    ctx.reply(`👋 ברוכים הבאים לבאבאבוט! ⚽\n\nלחץ על "משחקים פתוחים" כדי להתחיל להמר.`, 
        Markup.inlineKeyboard([
            [Markup.button.callback("🎮 משחקים פתוחים", 'list_games'), Markup.button.callback("💰 בדיקת יתרה", 'check_balance')],
            [Markup.button.url("💬 פנייה לסוכן", 'https://t.me/driverydm_sketch')]
        ])
    );
});

bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול:", Markup.inlineKeyboard([
        [Markup.button.callback('👥 ניהול משתמשים', 'admin_users')],
        [Markup.button.callback('⚽ עדכון משחק חי', 'admin_live_games')]
    ]));
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    try {
        if (data === 'admin_users') {
            const { data: usersList } = await supabase.from('users').select('*').limit(10);
            for (const u of usersList) {
                ctx.reply(`👤 ${u.username} | 💰 ${u.balance} ש"ח`, Markup.inlineKeyboard([[Markup.button.callback(`💵 הפקד ל-${u.username}`, `adm_dep_${u.telegram_id}`)]]));
            }
        } 
        else if (data.startsWith('adm_dep_')) {
            userSessions[userId] = { targetId: parseInt(data.replace('adm_dep_', '')), step: 'ADMIN_AWAITING_DEPOSIT' };
            ctx.reply("💸 שלח את סכום ההפקדה:");
        }
        else if (data === 'admin_live_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            ctx.reply("⚽ בחר משחק לעדכון:", Markup.inlineKeyboard(games.map(g => [Markup.button.callback(`${g.team_a} vs ${g.team_b}`, `adm_live_set_${g.id}`)])));
        }
        else if (data.startsWith('adm_live_set_')) {
            userSessions[userId] = { gameId: parseInt(data.replace('adm_live_set_', '')), step: 'ADMIN_AWAITING_LIVE_DATA' };
            ctx.reply("📝 שלח: [דקה] [תוצאה] [כובש ראשון]");
        }
        else if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            for (const g of games) {
                ctx.reply(`⚽ *${g.team_a} vs ${g.team_b}*\n⏱️ ${g.live_minute} | 🎯 ${g.live_score}`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🎰 המר (100 ש"ח)', `b1_${g.id}`)],
                        [Markup.button.callback('📊 מצב קופה לייב', `live_pool_${g.id}`)]
                    ])
                });
            }
        }
        else if (data.startsWith('live_pool_')) {
            const gameId = parseInt(data.replace('live_pool_', ''));
            const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
            const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);
            const total = (bets.length * 100);
            ctx.reply(`📊 *מצב קופה לייב*\nסך הכל בקופה: ${total} ש"ח\n${game.team_a} vs ${game.team_b}\nדקה: ${game.live_minute}\nתוצאה: ${game.live_score}`, { parse_mode: 'Markdown' });
        }
        else if (data.startsWith('b1_')) {
            userSessions[userId] = { gameId: parseInt(data.replace('b1_', '')), step: 'AWAITING_WINNER' };
            ctx.reply("👑 מי המנצחת?", Markup.inlineKeyboard([[Markup.button.callback('1', 'b2_1'), Markup.button.callback('X', 'b2_X'), Markup.button.callback('2', 'b2_2')]]));
        }

    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return;

    if (session.step === 'ADMIN_AWAITING_LIVE_DATA') {
        const parts = ctx.message.text.split(' ');
        await supabase.from('games').update({ live_minute: parts[0], live_score: parts[1], live_scorer: parts.slice(2).join(' ') }).eq('id', session.gameId);
        ctx.reply("✅ עודכן!");
        delete userSessions[userId];
    } 
    else if (session.step === 'ADMIN_AWAITING_DEPOSIT') {
        const amount = parseInt(ctx.message.text);
        const { data: u } = await supabase.from('users').select('balance').eq('telegram_id', session.targetId).single();
        await supabase.from('users').update({ balance: u.balance + amount }).eq('telegram_id', session.targetId);
        ctx.reply("✅ הופקד!");
        delete userSessions[userId];
    }
});

const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);
bot.launch();
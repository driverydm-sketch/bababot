const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

const userSessions = {};

bot.telegram.setMyCommands([
    { command: 'start', description: '🚀 הפעל את הבוט ותפריט ראשי' },
    { command: 'admin', description: '🛠️ פאנל ניהול (לאדמין בלבד)' }
]).catch(console.error);

bot.start(async (ctx) => {
    delete userSessions[ctx.from.id];
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'שחקן';

    try {
        const { data: extUser } = await supabase.from('users').select('*').eq('telegram_id', userId).single();
        if (!extUser) {
            await supabase.from('users').insert([{ telegram_id: userId, username: username, balance: 0 }]);
        } else if (extUser.username !== username) {
            await supabase.from('users').update({ username: username }).eq('telegram_id', userId);
        }
    } catch (e) { console.error("Error saving user on start:", e); }

    const welcomeText = 
        `👋 *ברוכים הבאים לבאבאבוט!* ⚽🏆\n\n` +
        `כאן אנחנו משנים את חוקי המשחק ומנהלים את הימורי הספורט בצורה החברתית, השקופה והמשתלמת ביותר. *לא עוד הימורים מול הבית – מהיום מהמרים אחד נגד השני על קופה משותפת!*\n\n` +
        `🔥 *הקופה כבר חמה! לחצו עכשיו על "🎮 משחקים פתוחים" למטה, תפסו את המקום שלכם ב-Pool ותתחילו לנחש! בהצלחה! 👇*`;

    ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("🎮 משחקים פתוחים", 'list_games'), Markup.button.callback("💰 בדיקת יתרה", 'check_balance')],
            [Markup.button.url("💬 פנייה לסוכן", 'https://t.me/driverydm_sketch')]
        ])
    });
});

bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול אדמין:", Markup.inlineKeyboard([
        [Markup.button.callback('👥 ניהול משתמשים והפקדות', 'admin_users')],
        [Markup.button.callback('⚽ עדכון משחק חי (לייב)', 'admin_live_games')]
    ]));
});

bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Unauthorized.");
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length < 4) return ctx.reply("❌ Format: /addgame [TeamA] [TeamB] [ID]");
    const teamA = parts[1];
    const teamB = parts[2];
    const fixtureId = parseInt(parts[3]);

    try {
        await supabase.from('games').insert([{ 
            id: fixtureId, team_a: teamA, team_b: teamB, status: 'active',
            live_score: '0-0', live_scorer: 'אין', live_minute: 'טרם החל'
        }]);
        ctx.reply(`✅ Game ${teamA} vs ${teamB} (ID: ${fixtureId}) added!`);
    } catch (e) { console.error(e); ctx.reply("❌ Database Error."); }
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    try {
        if (data === 'admin_users') {
            if (!isAdmin(userId)) return;
            const { data: usersList } = await supabase.from('users').select('*').limit(20);
            if (!usersList || usersList.length === 0) return ctx.reply("לא נמצאו משתמשים.");
            ctx.reply("👥 בחר משתמש לביצוע הפקדה:");
            for (const u of usersList) {
                ctx.reply(`👤 ${u.username || 'ללא שם'}\n🆔 \`${u.telegram_id}\`\n💰 ${u.balance} ש"ח`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback(`💵 הפקד ל-${u.username || 'משתמש'}`, `adm_dep_${u.telegram_id}`)]])
                });
            }
        } else if (data.startsWith('adm_dep_')) {
            if (!isAdmin(userId)) return;
            const targetId = parseInt(data.replace('adm_dep_', ''));
            userSessions[userId] = { targetId: targetId, step: 'ADMIN_AWAITING_DEPOSIT_AMOUNT' };
            ctx.reply(`💸 הקלד סכום להפקדה (ID: ${targetId}):`);
        } else if (data === 'admin_live_games') {
            if (!isAdmin(userId)) return;
            const { data: activeGames } = await supabase.from('games').select('*').eq('status', 'active');
            if (!activeGames || activeGames.length === 0) return ctx.reply("אין משחקים.");
            ctx.reply("⚽ בחר משחק:", Markup.inlineKeyboard(activeGames.map(g => [Markup.button.callback(`${g.team_a} vs ${g.team_b}`, `adm_live_set_${g.id}`)])));
        } else if (data.startsWith('adm_live_set_')) {
            if (!isAdmin(userId)) return;
            userSessions[userId] = { gameId: parseInt(data.replace('adm_live_set_', '')), step: 'ADMIN_AWAITING_LIVE_DATA' };
            ctx.reply("📝 שלח: [דקה] [תוצאה] [כובש]");
        } else if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) return ctx.reply("אין משחקים פעילים.");
            for (const g of games) {
                ctx.reply(`⚽ *${g.team_a} vs ${g.team_b}*\n⏱️ ${g.live_minute} | 🎯 ${g.live_score}`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🎰 המר (100 ש"ח)', `b1_${g.id}`)],
                        [Markup.button.callback('📊 מצב קופה לייב', `live_pool_${g.id}`)]
                    ])
                });
            }
        } else if (data.startsWith('live_pool_')) {
            // ... (הלוגיקה נשארת כאן כפי שהייתה)
            ctx.reply("📊 מצב הקופה יחושב כאן...");
        } else if (data.startsWith('b1_')) {
            userSessions[userId] = { gameId: parseInt(data.replace('b1_', '')), step: 'AWAITING_WINNER' };
            ctx.reply("👑 מי המנצחת?", Markup.inlineKeyboard([[Markup.button.callback('1', 'b2_1'), Markup.button.callback('X', 'b2_X'), Markup.button.callback('2', 'b2_2')]]));
        }
        // הוסף כאן את שאר ה-if/else לבחירת שערים וכו'...
    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// פקודה להרצת השרת
const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);
bot.launch();
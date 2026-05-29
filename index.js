const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const app = express();
app.use(express.json());

const isAdmin = (id) => parseInt(id) === adminId;
const userSessions = {};

// הגדרת Webhook ל-Render
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
});

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'שחקן';
    await supabase.from('users').upsert({ telegram_id: userId, username: username }, { onConflict: 'telegram_id' });

    const welcomeText = 
        `👋 *ברוכים הבאים לבאבאבוט!* ⚽🏆\n\n` +
        `כאן אנחנו משנים את חוקי המשחק ומנהלים את הימורי הספורט בצורה החברתית, השקופה והמשתלמת ביותר. *לא עוד הימורים מול הבית – מהיום מהמרים אחד נגד השני על קופה משותפת!*\n\n` +
        `📋 *איך זה עובד? פשוט וקל:*\n` +
        `1️⃣ *פתיחת ה-Pool:* המשחק עולה למערכת ופתוח מיידית להגשת הימורים.\n` +
        `2️⃣ *עלות השתתפות:* דמי הכניסה לכל Pool הם *100 ש"ח* קבועים.\n` +
        `3️⃣ *שליחת הטופס:* בכל משחק תתבקשו לנחש 3 פרמטרים: מנצחת (1,X,2), תוצאה מדויקת ושם כובש ראשון.\n\n` +
        `🔥 *הקופה כבר חמה! לחצו על "🎮 משחקים פתוחים" למטה, תפסו את המקום שלכם ב-Pool ותתחילו לנחש! בהצלחה! 👇*`;

    ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("🎮 משחקים פתוחים", 'list_games'), Markup.button.callback("💰 בדיקת יתרה", 'check_balance')],
            [Markup.button.url("💬 סוכן זמין Live 24/7", 'https://t.me/driverydm_sketch')]
        ])
    });
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    try {
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            for (const g of games) {
                ctx.reply(`⚽ *${g.team_a} vs ${g.team_b}*\n⏱️ ${g.live_minute || 'טרם התחיל'}`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🎰 המר (100 ש"ח)', `b1_${g.id}`)],
                        [Markup.button.callback('📊 מצב קופה לייב', `live_pool_${g.id}`)]
                    ])
                });
            }
        } else if (data.startsWith('b1_')) {
            userSessions[userId] = { gameId: parseInt(data.replace('b1_', '')), step: 'AWAITING_WINNER' };
            ctx.reply("👑 מי המנצחת?", Markup.inlineKeyboard([[Markup.button.callback('1', 'b2_1'), Markup.button.callback('X', 'b2_X'), Markup.button.callback('2', 'b2_2')]]));
        } else if (data.startsWith('b2_')) {
            const betType = data.replace('b2_', '');
            const session = userSessions[userId];
            if (session) {
                await supabase.from('bets').insert({ user_id: userId, game_id: session.gameId, bet: betType });
                ctx.reply(`✅ ההימור שלך על ${betType} נקלט בהצלחה!`);
                delete userSessions[userId];
            }
        } else if (data === 'admin') { // גישה לאדמין
            if (!isAdmin(userId)) return;
            ctx.reply("🛠️ פאנל ניהול פעיל.");
        }
        await ctx.answerCbQuery();
    } catch (e) { console.error(e); }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
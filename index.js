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

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'שחקן';
    await supabase.from('users').upsert(
        { telegram_id: userId, username: username },
        { onConflict: 'telegram_id' }
    );

    const welcomeText =
        `👋 *ברוכים הבאים לבאבאבוט!* ⚽🏆\n\n` +
        `כאן אנחנו משנים את חוקי המשחק ומנהלים את הימורי הספורט בצורה החברתית, השקופה והמשתלמת ביותר. *לא עוד הימורים מול הבית – מהיום מהמרים אחד נגד השני על קופה משותפת!*\n\n` +
        `📋 *איך זה עובד? פשוט וקל:*\n` +
        `1️⃣ *פתיחת ה-Pool:* המשחק עולה למערכת ופתוח מיידית להגשת הימורים.\n` +
        `2️⃣ *עלות השתתפות:* דמי הכניסה לכל Pool הם *100 ש"ח* קבועים.\n` +
        `3️⃣ *שליחת הטופס:* בכל משחק תתבקשו לנחש 3 פרמטרים: מנצחת (1,X,2), תוצאה מדויקת ושם כובש ראשון.\n\n` +
        `🛑 *תנאי סף וביטול משחק:*\n` +
        `• *מינימום המשתתפים להתחלת המשחק הוא 20 שחקנים.*\n` +
        `• במידה ועד *15 דקות משריקת הפתיחה* אין 20 משתתפים – המשחק מבוטל אוטומטית והכסף חוזר ישירות ליתרה שלכם בבוט!\n\n` +
        `💰 *חלוקת הכספים והפרסים:*\n\n` +
        `🥇 *הפרס המושלם (3 מתוך 3):*\n` +
        `משתתף שינחש נכונה את *כל 3 הפרמטרים* (מנצחת + תוצאה + כובש) – *לוקח את כל הקופה הביתה!* (אם יש יותר מאחד, הקופה מתחלקת ביניהם).\n\n` +
        `📊 *חלוקת האחוזים (אם אף אחד לא פגע בטופס מושלם):*\n` +
        `הכסף בקופה יחולק בין המנחשים לפי אחוזים קבועים:\n` +
        `• 👑 מי שניחש את *המנצחת* לוקח *40%* מהקופה.\n` +
        `• 🎯 מי שניחש *תוצאה מדויקת* לוקח *40%* מהקופה.\n` +
        `• 🏃 מי שניחש את *הכובש הראשון* לוקח *20%* מהקופה.\n\n` +
        `💳 *הפקדות ומשיכות:*\n` +
        `• 💵 *להטענת יתרה:* יש לפנות לסוכן הזמין עבורכם 24/7. *מכבדים את כל צורות התשלום:* ביט (Bit), פייבוקס (PayBox), העברה בנקאית, ביטקוין (Bitcoin), קוד משיכה ו-PayPal!\n` +
        `• 🏧 *משיכת כספים:* חלוקת המשיכות מתבצעת *בכל יום שלישי* באופן מסודר מול הסוכן.\n` +
        `• ⚡ *משיכה מוקדמת:* ניתן לבצע משיכה מוקדמת בכל יום אחר בשבוע *בניכוי עמלה של 20%*.\n\n` +
        `🔥 *הקופה כבר חמה! לחצו עכשיו על "🎮 משחקים פתוחים" למטה, תפסו את המקום שלכם ב-Pool ותתחילו לנחש! בהצלחה! 👇*`;

    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("🎮 משחקים פתוחים", 'list_games'), Markup.button.callback("💰 בדיקת יתרה", 'check_balance')],
            [Markup.button.url("💬 סוכן זמין Live 24/7 - שלח הודעה עכשיו", 'https://t.me/driverydm_sketch')]
        ])
    });
});

// ─── /admin ───────────────────────────────────────────────────────────────────
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ אין לך הרשאת אדמין.");
    await ctx.reply("🛠️ *פאנל ניהול*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("👥 רשימת משתמשים", 'admin_users')],
            [Markup.button.callback("⚽ עדכון משחק לייב", 'admin_live_games')]
        ])
    });
});

// ─── callback_query (מאוחד – פעם אחת בלבד) ──────────────────────────────────
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    try {

        // ── אדמין ──────────────────────────────────────────────────────────────
        if (data === 'admin_users') {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const { data: usersList } = await supabase.from('users').select('*').limit(10);
            for (const u of usersList) {
                await ctx.reply(
                    `👤 ${u.username} | 💰 ${u.balance} ש"ח`,
                    Markup.inlineKeyboard([[
                        Markup.button.callback(`💵 הפקד ל-${u.username}`, `adm_dep_${u.telegram_id}`)
                    ]])
                );
            }

        } else if (data.startsWith('adm_dep_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            userSessions[userId] = {
                targetId: parseInt(data.replace('adm_dep_', '')),
                step: 'ADMIN_AWAITING_DEPOSIT'
            };
            await ctx.reply("💸 שלח את סכום ההפקדה:");

        } else if (data === 'admin_live_games') {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            await ctx.reply("⚽ בחר משחק לעדכון:", Markup.inlineKeyboard(
                games.map(g => [Markup.button.callback(`${g.team_a} vs ${g.team_b}`, `adm_live_set_${g.id}`)])
            ));

        } else if (data.startsWith('adm_live_set_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            userSessions[userId] = {
                gameId: parseInt(data.replace('adm_live_set_', '')),
                step: 'ADMIN_AWAITING_LIVE_DATA'
            };
            await ctx.reply("📝 שלח: [דקה] [תוצאה] [כובש ראשון]");

        // ── משחקים פתוחים ──────────────────────────────────────────────────────
        } else if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) {
                return ctx.reply("😕 אין משחקים פתוחים כרגע.");
            }
            for (const g of games) {
                await ctx.reply(
                    `⚽ *${g.team_a} vs ${g.team_b}*\n⏱️ ${g.live_minute || '-'} | 🎯 ${g.live_score || '-'}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🎰 המר (100 ש"ח)', `b1_${g.id}`)],
                            [Markup.button.callback('📊 מצב קופה לייב', `live_pool_${g.id}`)]
                        ])
                    }
                );
            }

        // ── מצב קופה לייב ──────────────────────────────────────────────────────
        } else if (data.startsWith('live_pool_')) {
            const gameId = parseInt(data.replace('live_pool_', ''));
            const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
            const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);
            const total = (bets?.length || 0) * 100;
            await ctx.reply(
                `📊 *מצב קופה לייב*\nסך הכל בקופה: ${total} ש"ח\n${game.team_a} vs ${game.team_b}\nדקה: ${game.live_minute || '-'}\nתוצאה: ${game.live_score || '-'}`,
                { parse_mode: 'Markdown' }
            );

        // ── שלב 1: התחלת הימור ────────────────────────────────────────────────
        } else if (data.startsWith('b1_')) {
            const gameId = parseInt(data.replace('b1_', ''));

            const { data: existingBet } = await supabase
                .from('bets').select('*')
                .eq('telegram_id', userId).eq('game_id', gameId).single();
            if (existingBet) {
                return ctx.reply("❌ כבר נרשמת למשחק זה. לא ניתן להמר פעמיים.");
            }

            const { data: user } = await supabase
                .from('users').select('balance')
                .eq('telegram_id', userId).single();
            if (!user || user.balance < 100) {
                return ctx.reply(`❌ אין לך מספיק יתרה בקופה. עלות כניסה: 100 ש"ח.\nיתרה: ${user?.balance || 0} ש"ח.`);
            }

            userSessions[userId] = { gameId, step: 'AWAITING_WINNER' };
            await ctx.reply(`שלב 1/4: מי המנצחת? 👑`, Markup.inlineKeyboard([
                [Markup.button.callback('1 (בית)', 'b2_1'), Markup.button.callback('X (תיקו)', 'b2_X'), Markup.button.callback('2 (חוץ)', 'b2_2')]
            ]));

        // ── שלב 2: בחירת מנצחת ───────────────────────────────────────────────
        } else if (data.startsWith('b2_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_WINNER') {
                return ctx.reply("⚠️ הסשן פג תוקף. התחל מחדש.");
            }
            userSessions[userId].winner = data.replace('b2_', '');
            userSessions[userId].step = 'AWAITING_GOALS_A';
            await ctx.reply(`שלב 2/4 (חלק א'): כמה שערים תבקיע קבוצת הבית? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0', 'b3a_0'), Markup.button.callback('1', 'b3a_1'), Markup.button.callback('2', 'b3a_2')],
                [Markup.button.callback('3', 'b3a_3'), Markup.button.callback('4', 'b3a_4'), Markup.button.callback('5', 'b3a_5')]
            ]));

        // ── שלב 3: שערים קבוצת בית ───────────────────────────────────────────
        } else if (data.startsWith('b3a_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_A') {
                return ctx.reply("⚠️ הסשן פג תוקף. התחל מחדש.");
            }
            userSessions[userId].goalsA = data.replace('b3a_', '');
            userSessions[userId].step = 'AWAITING_GOALS_B';
            await ctx.reply(`שלב 2/4 (חלק ב'): כמה שערים תבקיע קבוצת החוץ? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0', 'b3b_0'), Markup.button.callback('1', 'b3b_1'), Markup.button.callback('2', 'b3b_2')],
                [Markup.button.callback('3', 'b3b_3'), Markup.button.callback('4', 'b3b_4'), Markup.button.callback('5', 'b3b_5')]
            ]));
          
        // ── שלב 4: שערים קבוצת חוץ → בקשת כובש ──────────────────────────────
        } else if (data.startsWith('b3b_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_B') {
                return ctx.reply("⚠️ הסשן פג תוקף. התחל מחדש.");
            }
            const goalsB = data.replace('b3b_', '');
            const finalScore = `${userSessions[userId].goalsA}-${goalsB}`;
            userSessions[userId].score = finalScore;
            userSessions[userId].step = 'AWAITING_SCORER';
            await ctx.reply(`נבחרה תוצאה: ${finalScore} 🎯\n\nשלב 3/4: הימור פתוח! 🏃\nהקלד עכשיו בצ'אט את שם השחקן שיבקיע את הגול הראשון:`);

        // ── בדיקת יתרה ───────────────────────────────────────────────────────
        } else if (data === 'check_balance') {
            const { data: user } = await supabase
                .from('users').select('balance')
                .eq('telegram_id', userId).single();
            await ctx.reply(`💰 היתרה שלך היא: ${user?.balance || 0} ש"ח`);
        }

    } catch (e) {
        console.error('callback_query error:', e);
        await ctx.reply("❌ אירעה שגיאה, נסה שוב.");
    }

    await ctx.answerCbQuery();
});

const cron = require('node-cron');

// פונקציה שרצה כל דקה
cron.schedule('* * * * *', async () => {
    const now = new Date();
    // חישוב זמן של 15 דקות מהעכשיו
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60000);

    // שליפת משחקים שמתחילים בעוד 15 דקות בדיוק
    const { data: games } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'active')
        .lt('start_time', fifteenMinutesLater.toISOString());

    for (const game of games) {
        // ספירת משתתפים
        const { count, error } = await supabase
            .from('bets')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', game.id);

        if (count < 20) {
            // ביטול המשחק והחזרת כספים
            await cancelGame(game.id);
        } else {
            // נעילת המשחק להימורים חדשים
            await supabase.from('games').update({ status: 'locked' }).eq('id', game.id);
        }
    }
});
 
async function cancelGame(gameId) {
    console.log(`מבצע ביטול למשחק: ${gameId}...`);
    
    // כאן אנחנו קוראים לפונקציה שכתבנו ב-SQL
    const { error } = await supabase.rpc('cancel_game_and_refund', { target_game_id: gameId });
    
    if (error) {
        console.error("שגיאה בביטול המשחק:", error);
    } else {
        console.log("המשחק בוטל והכספים הוחזרו בהצלחה.");
    }
}

// ─── text (מאוחד – פעם אחת בלבד) ────────────────────────────────────────────
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return;

    try {

        // אדמין: עדכון נתוני משחק לייב
        if (session.step === 'ADMIN_AWAITING_LIVE_DATA') {
            const parts = ctx.message.text.split(' ');
            if (parts.length < 2) return ctx.reply("⚠️ פורמט שגוי. שלח: [דקה] [תוצאה] [כובש ראשון]");
            await supabase.from('games').update({
                live_minute: parts[0],
                live_score: parts[1],
                live_scorer: parts.slice(2).join(' ') || null
            }).eq('id', session.gameId);
            await ctx.reply("✅ עודכן בהצלחה!");
            delete userSessions[userId];

        // אדמין: הפקדה ליוזר
        } else if (session.step === 'ADMIN_AWAITING_DEPOSIT') {
            const amount = parseInt(ctx.message.text);
            if (isNaN(amount) || amount <= 0) return ctx.reply("⚠️ סכום לא תקין.");
            const { data: u } = await supabase.from('users').select('balance').eq('telegram_id', session.targetId).single();
            if (!u) return ctx.reply("❌ משתמש לא נמצא.");
            await supabase.from('users').update({ balance: u.balance + amount }).eq('telegram_id', session.targetId);
            await ctx.reply(`✅ הופקד ${amount} ש"ח בהצלחה!`);
            delete userSessions[userId];

        // שחקן: שם כובש + שמירת הימור מלא
        } else if (session.step === 'AWAITING_SCORER') {
            const scorer = ctx.message.text.trim();
            if (!scorer) return ctx.reply("⚠️ שלח שם שחקן תקין.");

            // ניכוי יתרה
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < 100) {
                delete userSessions[userId];
                return ctx.reply("❌ אין מספיק יתרה להשלמת ההימור.");
            }
            await supabase.from('users').update({ balance: user.balance - 100 }).eq('telegram_id', userId);

            // שמירת ההימור
            await supabase.from('bets').insert({
                telegram_id: userId,
                game_id: session.gameId,
                winner: session.winner,
                score: session.score,
                scorer: scorer
            });

            await ctx.reply(
                `✅ *ההימור שלך נשמר בהצלחה!*\n\n` +
                `🏆 מנצחת: ${session.winner}\n` +
                `🎯 תוצאה: ${session.score}\n` +
                `🏃 כובש: ${scorer}\n\n` +
                `💰 עלות: 100 ש"ח | יתרה חדשה: ${user.balance - 100} ש"ח`,
                { parse_mode: 'Markdown' }
            );
            delete userSessions[userId];
        }

    } catch (e) {
        console.error('text handler error:', e);
        await ctx.reply("❌ אירעה שגיאה, נסה שוב.");
    }
});

// ─── Express keepalive ────────────────────────────────────────────────────────
const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

// ─── הפעלת הבוט ──────────────────────────────────────────────────────────────
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


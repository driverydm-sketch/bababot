const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// אובייקט זמני בזיכרון לניהול שלבי ההימור וההפקדות
const userSessions = {};

// הגדרת כפתור Start קבוע בתפריט של טלגרם ברגע שהבוט עולה
bot.telegram.setMyCommands([
    { command: 'start', description: '🚀 הפעל את הבוט ותפריט ראשי' },
    { command: 'admin', description: '🛠️ פאנל ניהול (לאדמין בלבד)' }
]).catch(console.error);

// 🚀 פקודת ההפעלה עם הנוסח המקצועי, המעודכן והמניע לפעולה
bot.start(async (ctx) => {
    delete userSessions[ctx.from.id];
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'שחקן';

    // רישום או עדכון המשתמש בבסיס הנתונים
    try {
        const { data: extUser } = await supabase.from('users').select('*').eq('telegram_id', userId).single();
        if (!extUser) {
            await supabase.from('users').insert([{ telegram_id: userId, username: username, balance: 0 }]);
        } else if (extUser.username !== username) {
            await supabase.from('users').update({ username: username }).eq('telegram_id', userId);
        }
    } catch (e) { console.error("Error saving user on start:", e); }

    // 📜 הודעת הפתיחה הסופית והמלאה - באבאבוט!
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

    const btnGames = process.env.BTN_GAMES || "🎮 משחקים פתוחים";
    const btnBalance = process.env.BTN_BALANCE || "💰 בדיקת יתרה";
    const btnAgent = process.env.BTN_AGENT || "💬 פנייה לסוכן";

    ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(btnGames, 'list_games'), Markup.button.callback(btnBalance, 'check_balance')],
            [Markup.button.url(btnAgent, 'https://t.me/driverydm_sketch')]
        ])
    });
});

// פאנל ניהול (אדמין)
bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול אדמין:", Markup.inlineKeyboard([
        [Markup.button.callback('👥 ניהול משתמשים והפקדות', 'admin_users')]
    ]));
});

// פקודת אדמין להוספת משחק
bot.command('addgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Unauthorized.");
    
    const parts = ctx.message.text.split(/\s+/);
    if (parts.length < 4) return ctx.reply("❌ Format: /addgame [TeamA] [TeamB] [ID]");
    
    const teamA = parts[1];
    const teamB = parts[2];
    const fixtureId = parseInt(parts[3]);

    try {
        await supabase.from('games').insert([{ 
            id: fixtureId,
            team_a: teamA, 
            team_b: teamB,
            status: 'active'
        }]);
        ctx.reply(`✅ Game ${teamA} vs ${teamB} (ID: ${fixtureId}) added!`);
    } catch (e) { 
        console.error(e);
        ctx.reply("❌ Database Error."); 
    }
});

// טיפול בלחיצות כפתורים (Callback Queries)
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    try {
        // פאנל אדמין: הצגת רשימת משתמשים להפקדה
        if (data === 'admin_users') {
            if (!isAdmin(userId)) return;
            const { data: usersList } = await supabase.from('users').select('*').limit(20);
            
            if (!usersList || usersList.length === 0) {
                return ctx.reply("לא נמצאו משתמשים רשומים במערכת.");
            }

            ctx.reply("👥 בחר משתמש לביצוע הפקדה:");

            for (const u of usersList) {
                ctx.reply(
                    `👤 *שם:* ${u.username || 'ללא שם'}\n🆔 *ID:* \`${u.telegram_id}\`\n💰 *יתרה:* ${u.balance} ש"ח`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback(`💵 הפקד ל-${u.username || 'משתמש זה'}`, `adm_dep_${u.telegram_id}`)]
                        ])
                    }
                );
            }
        }

        // אדמין לחץ על הפקדה למשתמש ספציפי
        else if (data.startsWith('adm_dep_')) {
            if (!isAdmin(userId)) return;
            const targetId = parseInt(data.replace('adm_dep_', ''));

            userSessions[userId] = {
                targetId: targetId,
                step: 'ADMIN_AWAITING_DEPOSIT_AMOUNT'
            };

            ctx.reply(`💸 הקלד עכשיו בצ'אט את סכום ההפקדה שברצונך להעביר למשתמש (ID: ${targetId}):`);
        }

        // ממשק משתמש רגיל: הצגת משחקים
        else if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) {
                return ctx.reply("אין משחקים פעילים כרגע.");
            }

            ctx.reply("🎮 משחקים נבחרים היום ל-Pool (100 ש\"ח כניסה):");

            for (const g of games) {
                const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', g.id);
                
                ctx.reply(
                    `⚽ *${g.team_a} vs ${g.team_b}*\n👥 רשומים: ${count || 0} שחקנים`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🎰 המר על משחק זה', `b1_${g.id}`)]
                        ])
                    }
                );
            }
        } 

        // שלב 1: בחירת מנצחת
        else if (data.startsWith('b1_')) {
            const gameId = parseInt(data.replace('b1_', ''));

            const { data: existingBet } = await supabase.from('bets').select('*').eq('telegram_id', userId).eq('game_id', gameId).single();
            if (existingBet) {
                return ctx.reply("❌ כבר נרשמת למשחק זה. לא ניתן להמר פעמיים.");
            }

            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < 100) {
                return ctx.reply(`❌ אין לך מספיק יתרה בקופה. עלות כניסה: 100 ש"ח.\nיתרה: ${user?.balance || 0} ש"ח.`);
            }

            userSessions[userId] = { gameId: gameId, step: 'AWAITING_WINNER' };

            ctx.reply(`שלב 1/4: מי המנצחת? 👑`, Markup.inlineKeyboard([
                [Markup.button.callback('1 (בית)', `b2_1`), Markup.button.callback('X (תיקו)', `b2_X`), Markup.button.callback('2 (חוץ)', `b2_2`)]
            ]));
        }

        // שלב 2: בחירת שערים א'
        else if (data.startsWith('b2_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_WINNER') return ctx.reply("הסשן פג תוקף.");
            userSessions[userId].winner = data.replace('b2_', '');
            userSessions[userId].step = 'AWAITING_GOALS_A';

            ctx.reply(`שלב 2/4 (חלק א'): כמה שערים תבקיע קבוצת הבית? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0', `b3a_0`), Markup.button.callback('1', `b3a_1`), Markup.button.callback('2', `b3a_2`)],
                [Markup.button.callback('3', `b3a_3`), Markup.button.callback('4', `b3a_4`), Markup.button.callback('5', `b3a_5`)]
            ]));
        }

        // שלב 3: בחירת שערים ב'
        else if (data.startsWith('b3a_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_A') return ctx.reply("הסשן פג תוקף.");
            userSessions[userId].goalsA = data.replace('b3a_', '');
            userSessions[userId].step = 'AWAITING_GOALS_B';

            ctx.reply(`שלב 2/4 (חלק ב'): כמה שערים תבקיע קבוצת החוץ? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0', `b3b_0`), Markup.button.callback('1', `b3b_1`), Markup.button.callback('2', `b3b_2`)],
                [Markup.button.callback('3', `b3b_3`), Markup.button.callback('4', `b3b_4`), Markup.button.callback('5', `b3b_5`)]
            ]));
        }

        // שלב 4: הכנה לטקסט חופשי (כובש)
        else if (data.startsWith('b3b_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_B') return ctx.reply("הסשן פג תוקף.");
            const goalsB = data.replace('b3b_', '');
            const finalScore = `${userSessions[userId].goalsA}-${goalsB}`;
            
            userSessions[userId].score = finalScore;
            userSessions[userId].step = 'AWAITING_SCORER';

            ctx.reply(`נבחרה תוצאה: ${finalScore} 🎯\n\nשלב 3/4: הימור פתוח! 🏃\nהקלד עכשיו בצ'אט את שם השחקן שיבקיע את הגול הראשון:`);
        }

        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            ctx.reply(`💰 היתרה שלך היא: ${user?.balance || 0} ש"ח`);
        }

    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// קשב להודעות טקסט (הפקדות אדמין ושם כובש שער)
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];

    if (!session) return;

    try {
        // אדמין מקליד סכום להפקדה
        if (session.step === 'ADMIN_AWAITING_DEPOSIT_AMOUNT' && isAdmin(userId)) {
            const amount = parseInt(ctx.message.text.trim());
            const targetId = session.targetId;

            if (isNaN(amount) || amount <= 0) {
                return ctx.reply("❌ סכום לא חוקי. אנא הקלד מספר חיובי גדול מ-0.");
            }

            const { data: user } = await supabase.from('users').select('*').eq('telegram_id', targetId).single();
            if (!user) {
                delete userSessions[userId];
                return ctx.reply("❌ המשתמש לא נמצא במסד הנתונים.");
            }

            const newBalance = user.balance + amount;
            await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', targetId);

            ctx.reply(`✅ ההפקדה בוצעה!\n👤 ליוזר: ${user.username || targetId}\n💵 סכום: ${amount} ש"ח\n📉 יתרה נוכחית: ${newBalance} ש"ח.`);
            
            bot.telegram.sendMessage(targetId, `💰 *הודעת הפקדה!*\nהסוכן הפקיד בחשבונך ${amount} ש"ח.\n📉 יתרה מעודכנת: ${newBalance} ש"ח. בהצלחה! ⚽`, { parse_mode: 'Markdown' }).catch(() => {});

            delete userSessions[userId];
            return;
        }

        // המשתמש מקליד את שם השחקן (כובש ראשון)
        if (session.step === 'AWAITING_SCORER') {
            const scorerInput = ctx.message.text.trim();
            const poolFee = 100;

            const { data: game } = await supabase.from('games').select('*').eq('id', session.gameId).single();
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();

            if (!game || !user || user.balance < poolFee) {
                delete userSessions[userId];
                return ctx.reply("❌ הימור נכשל. משחק לא פעיל או יתרה נמוכה מדי.");
            }

            await supabase.from('users').update({ balance: user.balance - poolFee }).eq('telegram_id', userId);
            await supabase.from('bets').insert([{
                telegram_id: userId,
                game_id: session.gameId,
                prediction_winner: session.winner,
                prediction_score: session.score,
                prediction_scorer: scorerInput,
                amount: poolFee
            }]);

            const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', session.gameId);
            ctx.reply(`✅ *הטופס נשלח בהצלחה!* 🎉\n\n⚽ *משחק:* ${game.team_a} vs ${game.team_b}\n👑 *מנצחת:* ${session.winner}\n🎯 *תוצאה:* ${session.score}\n🏃 *כובש:* ${scorerInput}\n💰 100 ש"ח נוכו.\n\n👥 רשומים: ${count} שחקנים.`, { parse_mode: 'Markdown' });

            delete userSessions[userId];
        }

    } catch (e) {
        console.error(e);
        ctx.reply("❌ שגיאה בעיבוד הפעולה.");
        delete userSessions[userId];
    }
});

const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

bot.launch();
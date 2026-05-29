const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// אובייקט זמני בזיכרון לניהול שלבי ההימור, ההפקדות והעדכונים
const userSessions = {};

bot.telegram.setMyCommands([
    { command: 'start', description: '🚀 הפעל את הבוט ותפריט ראשי' },
    { command: 'admin', description: '🛠️ פאנל ניהול (לאדמין בלבד)' }
]).catch(console.error);

// 🚀 פקודת ההפעלה
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

    ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("🎮 משחקים פתוחים", 'list_games'), Markup.button.callback("💰 בדיקת יתרה", 'check_balance')],
            [Markup.button.url("💬 פנייה לסוכן", 'https://t.me/driverydm_sketch')]
        ])
    });
});

// 🛠️ פאנל ניהול (אדמין)
bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ פאנל ניהול אדמין:", Markup.inlineKeyboard([
        [Markup.button.callback('👥 ניהול משתמשים והפקדות', 'admin_users')],
        [Markup.button.callback('⚽ עדכון משחק חי (לייב)', 'admin_live_games')]
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
            id: fixtureId, team_a: teamA, team_b: teamB, status: 'active',
            live_score: '0-0', live_scorer: 'אין', live_minute: 'טרם החל'
        }]);
        ctx.reply(`✅ Game ${teamA} vs ${teamB} (ID: ${fixtureId}) added!`);
    } catch (e) { console.error(e); ctx.reply("❌ Database Error."); }
});

// 🎰 טיפול בלחיצות כפתורים
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
                ctx.reply(`👤 *שם:* ${u.username || 'ללא שם'}\n🆔 *ID:* \`${u.telegram_id}\`\n💰 *יתרה:* ${u.balance} ש"ח`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback(`💵 הפקד ל-${u.username || 'משתמש זה'}`, `adm_dep_${u.telegram_id}`)]])
                });
            }
        }

        else if (data.startsWith('adm_dep_')) {
            if (!isAdmin(userId)) return;
            const targetId = parseInt(data.replace('adm_dep_', ''));
            userSessions[userId] = { targetId: targetId, step: 'ADMIN_AWAITING_DEPOSIT_AMOUNT' };
            ctx.reply(`💸 הקלד עכשיו בצ'אט את סכום ההפקדה ליוזר (ID: ${targetId}):`);
        }

        // אדמין: בחירת משחק לעדכון לייב
        else if (data === 'admin_live_games') {
            if (!isAdmin(userId)) return;
            const { data: activeGames } = await supabase.from('games').select('*').eq('status', 'active');
            if (!activeGames || activeGames.length === 0) return ctx.reply("אין משחקים פעילים כרגע.");

            ctx.reply("⚽ בחר משחק לעדכון נתונים בלייב:");
            for (const g of activeGames) {
                ctx.reply(` המשחק: ${g.team_a} vs ${g.team_b} (ID: ${g.id})`, Markup.inlineKeyboard([
                    [Markup.button.callback('📝 עדכן דקה, תוצאה וכובש', `adm_live_set_${g.id}`)]
                ]));
            }
        }

        else if (data.startsWith('adm_live_set_')) {
            if (!isAdmin(userId)) return;
            const gameId = parseInt(data.replace('adm_live_set_', ''));
            userSessions[userId] = { gameId: gameId, step: 'ADMIN_AWAITING_LIVE_DATA' };
            ctx.reply(`📝 שלח את נתוני הלייב בפורמט הבא בדיוק:\n[דקה] [תוצאה] [כובש ראשון]\n\nלדוגמה:\n*65 2-1 זהבי*\n\n(אם עדיין אין גול, רשום "אין" בכובש)`);
        }

        // ממשק משתמש: הצגת משחקים ומצב קופה בלייב
        else if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) return ctx.reply("אין משחקים פעילים כרגע.");

            ctx.reply("🎮 משחקים נבחרים היום ל-Pool:");
            for (const g of games) {
                const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', g.id);
                ctx.reply(
                    `⚽ *${g.team_a} vs ${g.team_b}*\n👥 שחקנים רשומים: ${count || 0}\n⏱️ מצב נוכחי: דקה ${g.live_minute || '0'}, תוצאה: ${g.live_score || '0-0'}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🎰 המר על משחק זה (100 ש"ח)', `b1_${g.id}`)],
                            [Markup.button.callback('📊 צפה במצב הקופה בלייב', `live_pool_${g.id}`)]
                        ])
                    }
                );
            }
        }

        // 📊 חישוב וחלוקת קופה בזמן אמת (לייב) למשתמש
        else if (data.startsWith('live_pool_')) {
            const gameId = parseInt(data.replace('live_pool_', ''));
            const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
            const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);

            if (!game || !bets || bets.length === 0) {
                return ctx.reply("טרם הוגשו הימורים למשחק זה או שהמשחק לא קיים.");
            }

            const totalPlayers = bets.length;
            const totalPoolNet = totalPlayers * 100; // סך הקופה שנאספה מהשחקנים

            // קביעת כיוון מנצחת לפי תוצאת הלייב הנוכחית
            const [scoreA, scoreB] = game.live_score.split('-').map(Number);
            let currentWinnerSide = 'X';
            if (scoreA > scoreB) currentWinnerSide = '1';
            else if (scoreB > scoreA) currentWinnerSide = '2';

            // פילטור המנחשים הנכונים נכון לרגע זה
            const correctWinnerBets = bets.filter(b => b.prediction_winner === currentWinnerSide);
            const correctScoreBets = bets.filter(b => b.prediction_score === game.live_score);
            const correctScorerBets = bets.filter(b => b.prediction_scorer.trim().toLowerCase() === game.live_scorer.trim().toLowerCase());
            const perfectBets = bets.filter(b => b.prediction_winner === currentWinnerSide && b.prediction_score === game.live_score && b.prediction_scorer.trim().toLowerCase() === game.live_scorer.trim().toLowerCase());

            let reportText = `📊 *מצב קופה בזמן אמת - לייב*\n⚽ המשחק: *${game.team_a} vs ${game.team_b}*\n⏱️ *דקה:* ${game.live_minute} | *תוצאה:* ${game.live_score} | *כובש ראשון:* ${game.live_scorer}\n👥 *סה"כ מהמרים ב-Pool:* ${totalPlayers} (${totalPoolNet} ש"ח בקופה)\n\n--- \n`;

            if (perfectBets.length > 0) {
                // יש מישהו עם ניחוש מושלם של 3/3 - הוא/הם לוקחים הכל
                const payoutPerPerfect = (totalPoolNet / perfectBets.length).toFixed(0);
                reportText += `🥇 *וואו! יש פגיעה מושלמת (3 מתוך 3)!*\n👥 כמות פוגעים: ${perfectBets.length}\n💰 *צפי זכייה נוכחי:* ${payoutPerPerfect} ש"ח לכל אחד! (לוקחים את כל הקופה)`;
            } else {
                // אין ניחוש מושלם, מחלקים לפי אחוזים (40-40-20)
                const poolWinnerSum = totalPoolNet * 0.4;
                const poolScoreSum = totalPoolNet * 0.4;
                const poolScorerSum = totalPoolNet * 0.2;

                const winWinner = correctWinnerBets.length > 0 ? (poolWinnerSum / correctWinnerBets.length).toFixed(0) : 0;
                const winScore = correctScoreBets.length > 0 ? (poolScoreSum / correctScoreBets.length).toFixed(0) : 0;
                const winScorer = correctScorerBets.length > 0 ? (poolScorerSum / correctScorerBets.length).toFixed(0) : 0;

                reportText += 
                    `👑 *ניחוש מנצחת (40% מהקופה - ${poolWinnerSum} ש"ח):*\n 👥 פוגעים כרגע: ${correctWinnerBets.length} שחקנים\n💰 *חלוקה נוכחית:* ${winWinner} ש"ח לכל אחד\n\n` +
                    `🎯 *תוצאה מדויקת (40% מהקופה - ${poolScoreSum} ש"ח):*\n👥 פוגעים כרגע: ${correctScoreBets.length} שחקנים\n💰 *חלוקה נוכחית:* ${winScore} ש"ח לכל אחד\n\n` +
                    `🏃 *כובש שער ראשון (20% מהקופה - ${poolScorerSum} ש"ח):*\n👥 פוגעים כרגע: ${correctScorerBets.length} שחקנים\n💰 *חלוקה נוכחית:* ${winScorer} ש"ח לכל אחד\n\n` +
                    `⚠️ _הנתונים משתנים בלייב עם התפתחות המשחק על המגרש!_`;
            }

            ctx.reply(reportText, { parse_mode: 'Markdown' });
        }

        // שלבי הגשת הטופס (1,2,3,4)
        else if (data.startsWith('b1_')) {
            const gameId = parseInt(data.replace('b1_', ''));
            const { data: existingBet } = await supabase.from('bets').select('*').eq('telegram_id', userId).eq('game_id', gameId).single();
            if (existingBet) return ctx.reply("❌ כבר נרשמת למשחק זה.");

            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < 100) return ctx.reply(`❌ יתרה נמוכה מדי (100 ש"ח כניסה). יתרה: ${user?.balance || 0} ש"ח.`);

            userSessions[userId] = { gameId: gameId, step: 'AWAITING_WINNER' };
            ctx.reply(`שלב 1/4: מי המנצחת? 👑`, Markup.inlineKeyboard([[Markup.button.callback('1 (בית)', `b2_1`), Markup.button.callback('X (תיקו)', `b2_X`), Markup.button.callback('2 (חוץ)', `b2_2`)]]));
        }

        else if (data.startsWith('b2_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_WINNER') return ctx.reply("פג תוקף.");
            userSessions[userId].winner = data.replace('b2_', '');
            userSessions[userId].step = 'AWAITING_GOALS_A';
            ctx.reply(`שלב 2/4 (חלק א'): כמה שערים תבקיע קבוצת הבית? ⚽`, Markup.inlineKeyboard([[Markup.button.callback('0', `b3a_0`), Markup.button.callback('1', `b3a_1`), Markup.button.callback('2', `b3a_2`)],[Markup.button.callback('3', `b3a_3`), Markup.button.callback('4', `b3a_4`), Markup.button.callback('5', `b3a_5`)]]));
        }

        else if (data.startsWith('b3a_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_A') return ctx.reply("פג תוקף.");
            userSessions[userId].goalsA = data.replace('b3a_', '');
            userSessions[userId].step = 'AWAITING_GOALS_B';
            ctx.reply(`שלב 2/4 (חלק ב'): כמה שערים תבקיע קבוצת החוץ? ⚽`, Markup.inlineKeyboard([[Markup.button.callback('0', `b3b_0`), Markup.button.callback('1', `b3b_1`), Markup.button.callback('2', `b3b_2`)],[Markup.button.callback('3', `b3b_3`), Markup.button.callback('4', `b3b_4`), Markup.button.callback('5', `b3b_5`)]]));
        }

        else if (data.startsWith('b3b_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_B') return ctx.reply("פג תוקף.");
            const goalsB = data.replace('b3b_', '');
            userSessions[userId].score = `${userSessions[userId].goalsA}-${goalsB}`;
            userSessions[userId].step = 'AWAITING_SCORER';
            ctx.reply(`נבחרה תוצאה: ${userSessions[userId].score} 🎯\n\nשלב 3/4: הימור פתוח! 🏃\nהקלד עכשיו בצ'אט את שם השחקן שיבקיע את הגול הראשון:`);
        }

        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            ctx.reply(`💰 היתרה שלך היא: ${user?.balance || 0} ש"ח`);
        }

    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// 📩 קשב להודעות טקסט (לייב אדמין, הפקדות, כובש שער)
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return;

    try {
        // אדמין מעדכן את נתוני הלייב של המשחק
        if (session.step === 'ADMIN_AWAITING_LIVE_DATA' && isAdmin(userId)) {
            const text = ctx.message.text.trim();
            const parts = text.split(/\s+/); // פירוק לפי רווחים

            if (parts.length < 3) {
                return ctx.reply("❌ פורמט שגוי. אנא שלח בפורמט: [דקה] [תוצאה] [כובש]");
            }

            const minute = parts[0];
            const score = parts[1];
            const scorer = parts.slice(2).join(" "); // תמיכה בשם מלא (למשל "ערן זהבי")

            await supabase.from('games').update({
                live_minute: minute,
                live_score: score,
                live_scorer: scorer
            }).eq('id', session.gameId);

            ctx.reply(`✅ נתוני הלייב עודכנו בהצלחה!\n⏱️ דקה: ${minute}\n🎯 תוצאה: ${score}\n🏃 כובש ראשון: ${scorer}`);
            delete userSessions[userId];
            return;
        }

        // אדמין מבצע הפקדה כספית ליוזר
        if (session.step === 'ADMIN_AWAITING_DEPOSIT_AMOUNT' && isAdmin(userId)) {
            const amount = parseInt(ctx.message.text.trim());
            const targetId = session.targetId;
            if (isNaN(amount) || amount <= 0) return ctx.reply("❌ סכום לא חוקי.");

            const { data: user } = await supabase.from('users').select('*').eq('telegram_id', targetId).single();
            if (!user) return ctx.reply("❌ משתמש לא נמצא.");

            const newBalance = user.balance + amount;
            await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', targetId);

            ctx.reply(`✅ ההפקדה בוצעה בהצלחה! יתרה נוכחית: ${newBalance} ש"ח.`);
            bot.telegram.sendMessage(targetId, `💰 *הודעת הפקדה!*\nהס
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// אובייקט זמני בזיכרון לשמירת שלבי ההימור של המשתמשים
const userSessions = {};

// /start command
bot.start((ctx) => {
    // איפוס סשן אם היה קיים
    delete userSessions[ctx.from.id];

    const welcomeText = process.env.MSG_WELCOME || "Welcome to Bababot!";
    const btnGames = process.env.BTN_GAMES || "Games";
    const btnBalance = process.env.BTN_BALANCE || "Balance";
    const btnAgent = process.env.BTN_AGENT || "Agent 24/7";

    ctx.reply(welcomeText, Markup.inlineKeyboard([
        [Markup.button.callback(btnGames, 'list_games'), Markup.button.callback(btnBalance, 'check_balance')],
        [Markup.button.url(btnAgent, 'https://t.me/driverydm_sketch')]
    ]));
});

// פאנל ניהול (אדמין)
bot.command('admin', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply("🛠️ Admin Panel:", Markup.inlineKeyboard([
        [Markup.button.callback('Stats', 'admin_stats'), Markup.button.callback('Users', 'admin_users')]
    ]));
});

// פקודה להוספת משחק על ידי המנהל
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
        ctx.reply(`✅ Game ${teamA} vs ${teamB} (ID: ${fixtureId}) added to Pool!`);
    } catch (e) { 
        console.error(e);
        ctx.reply(`❌ Database Error: ${e.message}`); 
    }
});

// טיפול בלחיצות כפתורים ובתהליך ההימור הידידותי
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    try {
        // הצגת רשימת המשחקים עם כפתור הימור ייעודי לכל משחק
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games?.length) {
                return ctx.reply("אין משחקים פעילים כרגע.");
            }

            ctx.reply("🎮 משחקים נבחרים היום ל-Pool (100 ש\"ח כniסה):");

            for (const g of games) {
                const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', g.id);
                
                // שליחת כל משחק עם כפתור אינטראקטיבי משלו
                ctx.reply(
                    `⚽ *${g.team_a} vs ${g.team_b}*\n👥 רשומים: ${count || 0}/20 שחקנים\n🆔 מזהה משחק: ${g.id}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🎰 המר על משחק זה', `start_bet_${g.id}`)]
                        ])
                    }
                );
            }
        } 
        
        // המשתמש לחץ על כפתור "המר על משחק זה"
        else if (data.startsWith('start_bet_')) {
            const gameId = parseInt(data.replace('start_bet_', ''));

            // בדיקה אם המשתמש כבר הימר על המשחק הזה בעבר
            const { data: existingBet } = await supabase.from('bets').select('*').eq('telegram_id', userId).eq('game_id', gameId).single();
            if (existingBet) {
                return ctx.reply("❌ כבר שלחת טופס למשחק זה! לא ניתן להמר פעמיים.");
            }

            // בדיקת יתרה ראשונית לפני שבכלל מתחילים את השאלות
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < 100) {
                return ctx.reply(`❌ יתרה נמוכה מדי. כניסה ל-Pool עולה 100 ש"ח.\nהיתרה שלך: ${user?.balance || 0} ש"ח. פנה לסוכן להפקדה.`);
            }

            // פתיחת סשן והתחלת השלב הראשון - בחירת מנצחת
            userSessions[userId] = {
                gameId: gameId,
                step: 'AWAITING_WINNER'
            };

            ctx.reply("שלב 1 מתוך 3: מי המנצחת במשחק? 👑", Markup.inlineKeyboard([
                [Markup.button.callback('1 (קבוצה א\')', 'pick_winner_1'), Markup.button.callback('X (תיקו)', 'pick_winner_X'), Markup.button.callback('2 (קבוצה ב\')', 'pick_winner_2')]
            ]));
        }

        // קליטת הבחירה של המנצחת מהכפתורים
        else if (data.startsWith('pick_winner_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_WINNER') {
                return ctx.reply("הסשן פג תוקף. אנא לחץ שוב על 'משחקים פתוחים' והתחל מחדש.");
            }

            const winnerPick = data.replace('pick_winner_', '');
            userSessions[userId].winner = winnerPick;
            userSessions[userId].step = 'AWAITING_SCORE';

            ctx.reply("שלב 2 מתוך 3: 🎯 הקלד עכשיו את התוצאה המדויקת של המשחק בחלון הצ'אט.\n(לדוגמה: 2-1 או 0-0):");
        }

        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            ctx.reply(`💰 Balance: ${user?.balance || 0} NIS`);
        }

    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// הקשבה להודעות טקסט רגילות (עבור שלבי הזנת התוצאה והכובש)
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];

    // אם למשתמש אין סשן פעיל, הבוט יתעלם או יתנהג רגיל
    if (!session) return;

    try {
        // שלב קליטת תוצאה מדויקת
        if (session.step === 'AWAITING_SCORE') {
            const scoreInput = ctx.message.text.trim();
            
            session.score = scoreInput;
            session.step = 'AWAITING_SCORER';

            return ctx.reply("שלב 3 ואחרון: 🏃 הקלד עכשיו את שם השחקן שיבקיע את הגול הראשון במשחק:");
        }

        // שלב קליטת כובש ראשון וסיום ההימור
        if (session.step === 'AWAITING_SCORER') {
            const scorerInput = ctx.message.text.trim();
            const poolFee = 100;

            session.scorer = scorerInput;

            // משיכת נתוני המשחק בשביל הודעת הסיכום
            const { data: game } = await supabase.from('games').select('*').eq('id', session.gameId).single();
            
            // בדיקת יתרה סופית רגע לפני החיוב
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < poolFee) {
                delete userSessions[userId];
                return ctx.reply("❌ אופס! נראה שהיתרה שלך השתנתה או שאינה מספקת יותר. ההימור מבוטל.");
            }

            // 1. חיוב המשתמש ב-100 ש"ח
            await supabase.from('users').update({ balance: user.balance - poolFee }).eq('telegram_id', userId);

            // 2. שמירת ההימור המלא בבסיס הנתונים
            await supabase.from('bets').insert([{
                telegram_id: userId,
                game_id: session.gameId,
                prediction_winner: session.winner,
                prediction_score: session.score,
                prediction_scorer: session.scorer,
                amount: poolFee
            }]);

            // 3. קבלת כמות המשתתפים המעודכנת
            const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', session.gameId);
            const statusMsg = count >= 20 ? "🔥 ה-Pool פעיל! המינימום הושג." : `⏳ עוד ${20 - count} שחקנים למינימום לפתיחת הקופה.`;

            ctx.reply(`✅ *הטופס נשלח בהצלחה!* 🎉\n\n` +
                      `⚽ *משחק:* ${game.team_a} vs ${game.team_b}\n` +
                      `👑 *הימור מנצחת:* ${session.winner}\n` +
                      `🎯 *תוצאה מדויקת:* ${session.score}\n` +
                      `🏃 *כובש ראשון:* ${session.scorer}\n` +
                      `💰 *דמי כניסה:* 100 ש"ח נוכו מחשבונך.\n\n` +
                      `📊 *רשומים למשחק זה:* ${count}/20 שחקנים.\n${statusMsg}`, { parse_mode: 'Markdown' });

            // ניקוי הסשן בסיום בהצלחה
            delete userSessions[userId];
        }

    } catch (e) {
        console.error("Wizard error:", e);
        ctx.reply("❌ תקלה זמנית בעיבוד הנתונים. אנא נסה שוב.");
        delete userSessions[userId];
    }
});

const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

bot.launch();
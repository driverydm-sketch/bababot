const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

const userSessions = {};

// /start command
bot.start((ctx) => {
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

// טיפול בלחיצות כפתורים
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    try {
        // 1. הצגת רשימת המשחקים
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) {
                return ctx.reply("אין משחקים פעילים כרגע.");
            }

            ctx.reply("🎮 משחקים נבחרים היום ל-Pool (100 ש\"ח כניסה):");

            for (const g of games) {
                const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', g.id);
                
                ctx.reply(
                    `⚽ *${g.team_a} vs ${g.team_b}*\n👥 רשומים: ${count || 0}/20 שחקנים`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🎰 המר על משחק זה', `b1_${g.id}`)]
                        ])
                    }
                );
            }
        } 

        // 2. שלב א' - בחירת מנצחת
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

            userSessions[userId] = {
                gameId: gameId,
                step: 'AWAITING_WINNER'
            };

            ctx.reply(`שלב 1/4: מי המנצחת? 👑`, Markup.inlineKeyboard([
                [Markup.button.callback('1 (בית)', `b2_1`), Markup.button.callback('X (תיקו)', `b2_X`), Markup.button.callback('2 (חוץ)', `b2_2`)]
            ]));
        }

        // 3. שלב ב' חלק 1 - בחירת שערים לקבוצה א' (0-5)
        else if (data.startsWith('b2_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_WINNER') {
                return ctx.reply("הסשן פג תוקף. אנא התחל מחדש.");
            }

            const winner = data.replace('b2_', '');
            userSessions[userId].winner = winner;
            userSessions[userId].step = 'AWAITING_GOALS_A';

            ctx.reply(`שלב 2/4 (חלק א'): כמה שערים תבקיע קבוצת הבית? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0 שערים', `b3a_0`), Markup.button.callback('1 שער', `b3a_1`), Markup.button.callback('2 שערים', `b3a_2`)],
                [Markup.button.callback('3 שערים', `b3a_3`), Markup.button.callback('4 שערים', `b3a_4`), Markup.button.callback('5 שערים', `b3a_5`)]
            ]));
        }

        // 4. שלב ב' חלק 2 - בחירת שערים לקבוצה ב' (0-5)
        else if (data.startsWith('b3a_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_A') {
                return ctx.reply("הסשן פג תוקף. אנא התחל מחדש.");
            }

            const goalsA = data.replace('b3a_', '');
            userSessions[userId].goalsA = goalsA;
            userSessions[userId].step = 'AWAITING_GOALS_B';

            ctx.reply(`שלב 2/4 (חלק ב'): כמה שערים תבקיע קבוצת החוץ? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0 שערים', `b3b_0`), Markup.button.callback('1 שער', `b3b_1`), Markup.button.callback('2 שערים', `b3b_2`)],
                [Markup.button.callback('3 שערים', `b3b_3`), Markup.button.callback('4 שערים', `b3b_4`), Markup.button.callback('5 שערים', `b3b_5`)]
            ]));
        }

        // 5. שלב ג' - מעבר להימור הפתוח על הכובש
        else if (data.startsWith('b3b_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_B') {
                return ctx.reply("הסשן פג תוקף. אנא התחל מחדש.");
            }

            const goalsB = data.replace('b3b_', '');
            const finalScore = `${userSessions[userId].goalsA}-${goalsB}`; // מחבר לתוצאה כמו 5-5 או 2-1
            
            userSessions[userId].score = finalScore;
            userSessions[userId].step = 'AWAITING_SCORER';

            ctx.reply(`נבחרה תוצאה: ${finalScore} 🎯\n\nשלב 3/4: הימור פתוח! 🏃\nהקלד עכשיו בצ'אט את שם השחקן שיבקיע את הגול הראשון (לדוגמה: מסי, חמד, או 'אין כובש'):`);
        }

        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            ctx.reply(`💰 Balance: ${user?.balance || 0} NIS`);
        }

    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

// קליטת שם השחקן בטקסט חופשי וסגירת ההימור
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];

    if (!session || session.step !== 'AWAITING_SCORER') return;

    try {
        const scorerInput = ctx.message.text.trim();
        const poolFee = 100;

        const { data: game } = await supabase.from('games').select('*').eq('id', session.gameId).single();
        if (!game || game.status !== 'active') {
            delete userSessions[userId];
            return ctx.reply("❌ אופס, המשחק הזה כבר נסגר או לא קיים יותר.");
        }

        const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
        if (!user || user.balance < poolFee) {
            delete userSessions[userId];
            return ctx.reply("❌ אין לך מספיק יתרה בקופה כדי להשלים את ההימור.");
        }

        // 1. חיוב
        await supabase.from('users').update({ balance: user.balance - poolFee }).eq('telegram_id', userId);

        // 2. שמירה בטבלה
        await supabase.from('bets').insert([{
            telegram_id: userId,
            game_id: session.gameId,
            prediction_winner: session.winner,
            prediction_score: session.score, // יישמר בפורמט שבחר (למשל 5-5)
            prediction_scorer: scorerInput,
            amount: poolFee
        }]);

        const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', session.gameId);
        const statusMsg = count >= 20 ? "🔥 ה-Pool פעיל! המינימום הושג." : `⏳ עוד ${20 - count} שחקנים למינימום לפתיחת הקופה.`;

        ctx.reply(`✅ *הטופס נשלח בהצלחה!* 🎉\n\n` +
                  `⚽ *משחק:* ${game.team_a} vs ${game.team_b}\n` +
                  `👑 *הימור מנצחת:* ${session.winner}\n` +
                  `🎯 *תוצאה מדויקת:* ${session.score}\n` +
                  `🏃 *כובש ראשון:* ${scorerInput}\n` +
                  `💰 *דמי כניסה:* 100 ש"ח נוכו מחשבונך.\n\n` +
                  `📊 *רשומים למשחק זה:* ${count}/20 שחקנים.\n${statusMsg}`, { parse_mode: 'Markdown' });

        delete userSessions[userId];

    } catch (e) {
        console.error("Error saving bet:", e);
        ctx.reply("❌ תקלה זמנית בעיבוד הנתונים. אנא נסה שוב.");
        delete userSessions[userId];
    }
});

const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

bot.launch();
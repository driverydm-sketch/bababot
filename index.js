const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;

// /start command
bot.start((ctx) => {
    const welcomeText = process.env.MSG_WELCOME || "Welcome to Bababot!";
    const btnGames = process.env.BTN_GAMES || "Games";
    const btnBalance = process.env.BTN_BALANCE || "Balance";
    const btnAgent = process.env.BTN_AGENT || "Agent 24/7";

    ctx.reply(welcomeText, Markup.inlineKeyboard([
        [Markup.button.callback(btnGames, 'list_games'), Markup.button.callback(btnBalance, 'check_balance')],
        [Markup.button.url(btnAgent, 'https://t.me/driverydm_sketch')]
    ]));
});

// פקודת הימור עם 3 ניחושים: /bet [ID] [מנצחת] [תוצאה] [כובש]
bot.command('bet', async (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    
    // בדיקה שיש מספיק פרמטרים (הפקודה + 4 ארגומנטים)
    if (parts.length < 5) {
        return ctx.reply("❌ פורמט הימור לא תקין!\nהשתמש ב: /bet [ID משחק] [1/X/2] [תוצאה] [כובש_ראשון]\n\n📌 דוגמה: /bet 101 1 2-1 Mbappe");
    }

    const gameId = parseInt(parts[1]);
    const winner = parts[2].toUpperCase(); // 1, X, 2
    const score = parts[3]; // למשל 2-1
    const scorer = parts.slice(4).join(' '); // תומך בשמות מלאים כמו Leo Messi
    const telegramId = ctx.from.id;
    const poolFee = 100;

    if (!['1', 'X', '2'].includes(winner)) {
        return ctx.reply("❌ ניחוש מנצחת לא חוקי. בחר 1, 2 או X.");
    }

    try {
        // 1. בדיקת סטטוס המשחק
        const { data: game, error: gameError } = await supabase.from('games').select('*').eq('id', gameId).single();
        if (gameError || !game || game.status !== 'active') {
            return ctx.reply("❌ המשחק לא נמצא או סגור להימורים.");
        }

        // 2. בדיקה אם כבר הימר
        const { data: existingBet } = await supabase.from('bets').select('*').eq('telegram_id', telegramId).eq('game_id', gameId).single();
        if (existingBet) {
            return ctx.reply("❌ כבר שלחת טופס למשחק זה. לא ניתן להמר פעמיים.");
        }

        // 3. בדיקת יתרה
        const { data: user, error: userError } = await supabase.from('users').select('balance').eq('telegram_id', telegramId).single();
        if (userError || !user) {
            return ctx.reply("❌ משתמש לא נמצא. פנה לסוכן להפקדה.");
        }

        if (user.balance < poolFee) {
            return ctx.reply(`❌ יתרה נמוכה מדי. עלות כניסה ל-Pool היא 100 ש"ח.\nהיתרה שלך: ${user.balance} ש"ח.`);
        }

        // 4. חיוב ועדכון יתרה
        const { error: updateError } = await supabase.from('users').update({ balance: user.balance - poolFee }).eq('telegram_id', telegramId);
        if (updateError) throw updateError;

        // 5. שמירת 3 הניחושים בטבלה
        const { error: betError } = await supabase.from('bets').insert([{
            telegram_id: telegramId,
            game_id: gameId,
            prediction_winner: winner,
            prediction_score: score,
            prediction_scorer: scorer,
            amount: poolFee
        }]);
        if (betError) throw betError;

        // 6. ספירת שחקנים נוכחית ב-Pool
        const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', gameId);
        const statusMsg = count >= 20 ? "🔥 ה-Pool פעיל! המינימום הושג." : `⏳ עוד ${20 - count} שחקנים למינימום לפתיחת הקופה.`;

        ctx.reply(`✅ הטופס שלך התקבל ב-Pool!\n\n` +
                  `⚽ משחק: ${game.team_a} vs ${game.team_b}\n` +
                  `👑 מנצחת: ${winner}\n` +
                  `🎯 תוצאה: ${score}\n` +
                  `🏃 כובש ראשון: ${scorer}\n` +
                  `💰 דמי כניסה: 100 ש"ח הופחתו.\n\n` +
                  `📊 רשומים למשחק: ${count}/20 שחקנים.\n${statusMsg}`);

    } catch (e) {
        console.error(e);
        ctx.reply("❌ שגיאה זמנית בשליחת הטופס. נסה שוב.");
    }
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
        ctx.reply(`✅ Game ${teamA} vs ${teamB} (ID: ${fixtureId}) added to Pool!`);
    } catch (e) { 
        console.error(e);
        ctx.reply(`❌ Database Error: ${e.message}`); 
    }
});

// Callback queries
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
        if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            let msg = games?.length ? "🎮 משחקים נבחרים היום (100 ש\"ח כניסה):\n\n" : "אין משחקים כרגע.";
            
            for (const g of games || []) {
                const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', g.id);
                msg += `• ${g.team_a} vs ${g.team_b} (ID: ${g.id})\n👥 רשומים: ${count || 0}/20 שחקנים\n📝 להימור שלח:\n\`/bet ${g.id} [1/X/2] [תוצאה] [כובש]\`\n\n`;
            }
            ctx.replyWithMarkdown(msg);
        } else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
            ctx.reply(`💰 Balance: ${user?.balance || 0} NIS`);
        }
    } catch (e) { console.error(e); }
    await ctx.answerCbQuery();
});

const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

bot.launch();
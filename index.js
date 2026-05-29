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

// טיפול בכל הלחיצות (האינטראקציה הידידותית)
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

            for (const g of games) {
                const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', g.id);
                
                // שליחה נקייה ללא שימוש ב-Spread Operator בעייתי
                ctx.reply(
                    `⚽ ${g.team_a} נגד ${g.team_b}\n👥 רשומים: ${count || 0}/20 שחקנים`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🎰 המר על משחק זה (100 ש"ח)', `b1_${g.id}`)]
                    ])
                );
            }
        } 

        // 2. שלב א' - המשתמש לחץ על משחק, בוחר מנצחת (קיצרנו את הנתונים בגלל מגבלת תווים בטבקסט)
        else if (data.startsWith('b1_')) {
            const gameId = data.replace('b1_', '');

            // בדיקת יתרה מהירה
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < 100) {
                return ctx.reply(`❌ אין לך מספיק יתרה בקופה. עלות כניסה: 100 ש"ח.\nיתרה: ${user?.balance || 0} ש"ח.`);
            }

            ctx.reply(`שלב 1/3: מי המנצחת? 👑`, Markup.inlineKeyboard([
                [Markup.button.callback('1 (בית)', `b2_${gameId}_1`), Markup.button.callback('X (תיקו)', `b2_${gameId}_X`), Markup.button.callback('2 (חוץ)', `b2_${gameId}_2`)]
            ]));
        }

        // 3. שלב ב' - המשתמש בחר מנצחת, כעת בוחר תוצאה מתוך רשימה מהירה וידידותית
        else if (data.startsWith('b2_')) {
            const parts = data.split('_'); // b2_[gameId]_[winner]
            const gameId = parts[2];
            const winner = parts[3];

            ctx.reply(`שלב 2/3: בחר תוצאה מדויקת משוערת: 🎯`, Markup.inlineKeyboard([
                [Markup.button.callback('1-0', `b3_${gameId}_${winner}_1-0`), Markup.button.callback('2-0', `b3_${gameId}_${winner}_2-0`), Markup.button.callback('2-1', `b3_${gameId}_${winner}_2-1`)],
                [Markup.button.callback('0-1', `b3_${gameId}_${winner}_0-1`), Markup.button.callback('0-2', `b3_${gameId}_${winner}_0-2`), Markup.button.callback('1-2', `b3_${gameId}_${winner}_1-2`)],
                [Markup.button.callback('0-0', `b3_${gameId}_${winner}_0-0`), Markup.button.callback('1-1', `b3_${gameId}_${winner}_1-1`), Markup.button.callback('2-2', `b3_${gameId}_${winner}_2-2`)]
            ]));
        }

        // 4. שלב ג' - בחירת קטגוריית מבקיע ראשון (למניעת הקלדות מסובכות בצ'אט)
        else if (data.startsWith('b3_')) {
            const parts = data.split('_'); // b3_[gameId]_[winner]_[score]
            const gameId = parts[2];
            const winner = parts[3];
            const score = parts[4];

            ctx.reply(`שלב 3/3: מי יבקיע ראשון? 🏃`, Markup.inlineKeyboard([
                [Markup.button.callback('חלוץ מוביל (קבוצה א\')', `b4_${gameId}_${winner}_${score}_StrikerA`)],
                [Markup.button.callback('חלוץ מוביל (קבוצה ב\')', `b4_${gameId}_${winner}_${score}_StrikerB`)],
                [Markup.button.callback('קשר / שחקן אחר', `b4_${gameId}_${winner}_${score}_Other`)],
                [Markup.button.callback('אף אחד (0-0)', `b4_${gameId}_${winner}_${score}_None`)]
            ]));
        }

        // 5. שלב ד' - עיבוד סופי, הורדת יתרה ושמירה במסד הנתונים
        else if (data.startsWith('b4_')) {
            const parts = data.split('_'); // b4_[gameId]_[winner]_[score]_[scorer]
            const gameId = parseInt(parts[2]);
            const winner = parts[3];
            const score = parts[4];
            const scorer = parts[5];
            const poolFee = 100;

            // בדיקת כפל הימורים
            const { data: existingBet } = await supabase.from('bets').select('*').eq('telegram_id', userId).eq('game_id', gameId).single();
            if (existingBet) {
                return ctx.reply("❌ כבר נרשמת למשחק זה. לא ניתן להמר פעמיים.");
            }

            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < poolFee) {
                return ctx.reply("❌ יתרה לא מספקת.");
            }

            // חיוב ועדכון
            await supabase.from('users').update({ balance: user.balance - poolFee }).eq('telegram_id', userId);
            
            await supabase.from('bets').insert([{
                telegram_id: userId,
                game_id: gameId,
                prediction_winner: winner,
                prediction_score: score,
                prediction_scorer: scorer,
                amount: poolFee
            }]);

            const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', gameId);
            const statusMsg = count >= 20 ? "🔥 ה-Pool פעיל!" : `⏳ עוד ${20 - count} שחקנים למינימום.`;

            ctx.reply(`✅ הימור Pool נרשם בהצלחה!\n\n👑 מנצחת: ${winner}\n🎯 תוצאה: ${score}\n🏃 מבקיע: ${scorer}\n💰 100 ש"ח נוכו.\n\n📊 רשומים: ${count}/20\n${statusMsg}`);
        }

        else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            ctx.reply(`💰 Balance: ${user?.balance || 0} NIS`);
        }

    } catch (e) {
        console.error(e);
    }
    await ctx.answerCbQuery();
});

const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

bot.launch();
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
                ctx.reply(`המשחק: ${g.team_a} vs ${g.team_b} (ID: ${g.id})`, Markup.inlineKeyboard([
                    [Markup.button.callback('📝 עדכן דקה, תוצאה וכובש', `adm_live_set_${g.id}`)]
                ]));
            }
        }

        else if (data.startsWith('adm_live_set_')) {
            if (!isAdmin(userId)) return;
            const gameId = parseInt(data.replace('adm_live_set_', ''));
            userSessions[userId] = { gameId: gameId, step: 'ADMIN_AWAITING_LIVE_DATA' };
            ctx.reply(`📝 שלח את
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cron = require('node-cron');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const adminId = parseInt(process.env.ADMIN_ID);

const isAdmin = (id) => parseInt(id) === adminId;
const userSessions = {};

// ─── Rate limiting ────────────────────────────────────────────────────────────
const lastAction = {};
function isRateLimited(userId) {
    const now = Date.now();
    if (lastAction[userId] && now - lastAction[userId] < 1000) return true;
    lastAction[userId] = now;
    return false;
}

bot.telegram.setMyCommands([
    { command: 'start',       description: '🚀 הפעל את הבוט' },
    { command: 'admin',       description: '🛠️ פאנל ניהול' },
    { command: 'leaderboard', description: '🏆 לוח מובילים' },
    { command: 'mybets',      description: '📋 ההימורים שלי' },
    { command: 'balance',     description: '💰 יתרה' },
    { command: 'withdraw',    description: '💸 בקשת משיכה' },
]).catch(console.error);

// ─── טקסט ברוכים הבאים ───────────────────────────────────────────────────────
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
    `משתתף שינחש נכונה את *כל 3 הפרמטרים* – *לוקח את כל הקופה הביתה!*\n\n` +
    `📊 *חלוקת האחוזים (אם אין טופס מושלם):*\n` +
    `• 👑 מנצחת → *40%* | 🎯 תוצאה מדויקת → *40%* | 🏃 כובש → *20%*\n\n` +
    `💳 *הפקדות:* ביט, פייבוקס, העברה בנקאית, ביטקוין, PayPal\n` +
    `🏧 *משיכות:* כל יום שלישי | משיכה מוקדמת בניכוי 20%\n\n` +
    `🔥 *לחצו על "🎮 משחקים פתוחים" ותתחילו לנחש! 👇*`;

const mainKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🎮 משחקים פתוחים", 'list_games'), Markup.button.callback("💰 בדיקת יתרה", 'check_balance')],
    [Markup.button.callback("📋 ההימורים שלי", 'my_bets'), Markup.button.callback("🏆 לוח מובילים", 'leaderboard')],
    [Markup.button.callback("💸 בקשת משיכה", 'withdraw'), Markup.button.callback("🔗 הפנה חבר", 'get_referral')],
    [Markup.button.url("💬 סוכן זמין 24/7", 'https://t.me/driverydm_sketch')]
]);

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'שחקן';
    const referredBy = ctx.startPayload ? parseInt(ctx.startPayload) : null;

    // בדיקה אם משתמש חדש
    const { data: existing } = await supabase
        .from('users').select('telegram_id').eq('telegram_id', userId).single();

    await supabase.from('users').upsert(
        { telegram_id: userId, username },
        { onConflict: 'telegram_id' }
    );

    // בונוס referral — רק אם משתמש חדש לגמרי
    if (!existing && referredBy && referredBy !== userId) {
        // בונוס למפנה
        const { data: refUser } = await supabase.from('users').select('balance').eq('telegram_id', referredBy).single();
        if (refUser) {
            await supabase.from('users').update({ balance: refUser.balance + 10 }).eq('telegram_id', referredBy);
            try {
                await bot.telegram.sendMessage(referredBy,
                    `🎉 *חבר חדש הצטרף דרך הקישור שלך!*\nקיבלת *10 ש"ח בונוס* לחשבונך. המשך להפיץ! 💪`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        // בונוס למצטרף
        const { data: newUserData } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
        await supabase.from('users').update({ balance: (newUserData?.balance || 0) + 10, referred_by: referredBy }).eq('telegram_id', userId);
        await ctx.reply(`🎁 *קיבלת 10 ש"ח בונוס הצטרפות!*`, { parse_mode: 'Markdown' });
    }

    await ctx.reply(welcomeText, { parse_mode: 'Markdown', ...mainKeyboard });
});

// ─── /balance ─────────────────────────────────────────────────────────────────
bot.command('balance', async (ctx) => {
    const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', ctx.from.id).single();
    await ctx.reply(`💰 היתרה שלך: *${user?.balance || 0} ש"ח*`, { parse_mode: 'Markdown' });
});

// ─── /mybets ──────────────────────────────────────────────────────────────────
bot.command('mybets', async (ctx) => {
    await showMyBets(ctx, ctx.from.id);
});

// ─── /leaderboard ─────────────────────────────────────────────────────────────
bot.command('leaderboard', async (ctx) => {
    await showLeaderboard(ctx);
});

// ─── /withdraw ────────────────────────────────────────────────────────────────
bot.command('withdraw', async (ctx) => {
    await startWithdraw(ctx, ctx.from.id);
});

// ─── /admin ───────────────────────────────────────────────────────────────────
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ אין לך הרשאת אדמין.");
    await showAdminPanel(ctx);
});

// ─── /newgame ─────────────────────────────────────────────────────────────────
bot.command('newgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ אין הרשאה.");
    userSessions[ctx.from.id] = { step: 'NEWGAME_TEAM_A' };
    await ctx.reply("🆕 *פתיחת משחק חדש*\n\nשלב 1/3: מה שם קבוצת הבית?", { parse_mode: 'Markdown' });
});

// ─── /endgame ─────────────────────────────────────────────────────────────────
bot.command('endgame', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ אין הרשאה.");
    const parts = ctx.message.text.split(' ');
    // /endgame [game_id] [מנצחת: 1/X/2] [תוצאה: 2-1] [כובש]
    if (parts.length < 5) {
        return ctx.reply("📝 פורמט: `/endgame [id] [1/X/2] [תוצאה] [כובש]`\nדוגמה: `/endgame 7 1 2-1 מסי`", { parse_mode: 'Markdown' });
    }
    const [, gameId, winner, score, ...scorerParts] = parts;
    const scorer = scorerParts.join(' ').trim();
    if (!scorer) {
        return ctx.reply("⚠️ חובה לציין שם כובש.\nדוגמה: `/endgame 7 1 2-1 מסי`", { parse_mode: 'Markdown' });
    }
    if (!['1', 'X', '2'].includes(winner)) {
        return ctx.reply("⚠️ מנצחת חייבת להיות 1, X או 2.", { parse_mode: 'Markdown' });
    }
    if (!/^\d+-\d+$/.test(score)) {
        return ctx.reply("⚠️ תוצאה לא תקינה. פורמט: `2-1`", { parse_mode: 'Markdown' });
    }
    await distributeWinnings(ctx, parseInt(gameId), winner, score, scorer);
});

// ─── /broadcast ───────────────────────────────────────────────────────────────
bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ אין הרשאה.");
    const text = ctx.message.text.replace('/broadcast', '').trim();
    if (!text) return ctx.reply("⚠️ שלח: `/broadcast [הודעה]`", { parse_mode: 'Markdown' });
    await broadcastMessage(ctx, text);
});

// ─── פונקציות עזר ─────────────────────────────────────────────────────────────

async function showAdminPanel(ctx) {
    // סטטיסטיקות מהירות
    const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: betsCount } = await supabase.from('bets').select('*', { count: 'exact', head: true });
    const { data: activeGames } = await supabase.from('games').select('*').eq('status', 'active');

    await ctx.reply(
        `🛠️ *פאנל ניהול*\n\n` +
        `👥 משתמשים: ${usersCount || 0}\n` +
        `🎰 הימורים: ${betsCount || 0}\n` +
        `⚽ משחקים פתוחים: ${activeGames?.length || 0}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback("👥 רשימת משתמשים", 'admin_users')],
                [Markup.button.callback("⚽ עדכון משחק לייב", 'admin_live_games')],
                [Markup.button.callback("💸 בקשות משיכה", 'admin_withdrawals')],
                [Markup.button.callback("📢 שלח broadcast", 'admin_broadcast')]
            ])
        }
    );
}

async function showMyBets(ctx, userId) {
    const { data: bets } = await supabase
        .from('bets')
        .select('*, games(team_a, team_b, status, live_score)')
        .eq('telegram_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (!bets || bets.length === 0) {
        return ctx.reply("📋 אין לך הימורים עדיין.");
    }

    let text = `📋 *ההימורים האחרונים שלך:*\n\n`;
    for (const b of bets) {
        const g = b.games;
        const status = g?.status === 'active' ? '🟢 פתוח' : g?.status === 'locked' ? '🔒 נעול' : '✅ הסתיים';
        text += `⚽ *${g?.team_a} vs ${g?.team_b}*\n`;
        text += `👑 ${b.winner} | 🎯 ${b.score} | 🏃 ${b.scorer}\n`;
        text += `${status}${g?.live_score ? ` | תוצאה: ${g.live_score}` : ''}\n\n`;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function showLeaderboard(ctx) {
    const { data: users } = await supabase
        .from('users')
        .select('username, total_winnings')
        .order('total_winnings', { ascending: false })
        .limit(10);

    if (!users || users.length === 0) {
        return ctx.reply("🏆 לוח המובילים ריק עדיין.");
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    let text = `🏆 *לוח מובילים — TOP 10*\n\n`;
    users.forEach((u, i) => {
        text += `${medals[i]} *${u.username}* — ${u.total_winnings || 0} ש"ח\n`;
    });

    await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function startWithdraw(ctx, userId) {
    const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
    if (!user || user.balance <= 0) {
        return ctx.reply("❌ אין לך יתרה זמינה למשיכה.");
    }
    userSessions[userId] = { step: 'AWAITING_WITHDRAW_AMOUNT' };
    await ctx.reply(
        `💸 *בקשת משיכה*\n\nיתרה זמינה: *${user.balance} ש"ח*\n\nכמה תרצה למשוך?`,
        { parse_mode: 'Markdown' }
    );
}

async function distributeWinnings(ctx, gameId, winner, score, scorer) {
    await ctx.reply(`⏳ מחשב תוצאות למשחק ${gameId}...`);

    const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);
    if (!bets || bets.length === 0) return ctx.reply("❌ לא נמצאו הימורים למשחק זה.");

    const total = bets.length * 100;

    // בדיקת טופס מושלם
    const perfect = bets.filter(b => b.winner === winner && b.score === score && b.scorer === scorer);

    if (perfect.length > 0) {
        const share = Math.floor(total / perfect.length);
        for (const b of perfect) {
            const { data: u } = await supabase.from('users').select('balance, total_winnings').eq('telegram_id', b.telegram_id).single();
            await supabase.from('users').update({
                balance: (u?.balance || 0) + share,
                total_winnings: (u?.total_winnings || 0) + share
            }).eq('telegram_id', b.telegram_id);
            try {
                await bot.telegram.sendMessage(b.telegram_id,
                    `🥇 *טופס מושלם! ניצחת!*\n\nניחשת נכון את כל 3 הפרמטרים!\nזכית ב-*${share} ש"ח* 🎉`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        await ctx.reply(`✅ חולקו ${total} ש"ח ל-${perfect.length} זוכים (טופס מושלם).`);
    } else {
        // חלוקה לפי 40/40/20
        const winnerBets  = bets.filter(b => b.winner === winner);
        const scoreBets   = bets.filter(b => b.score === score);
        const scorerBets  = bets.filter(b => b.scorer === scorer);

        const pot40winner = Math.floor(total * 0.4);
        const pot40score  = Math.floor(total * 0.4);
        const pot20scorer = Math.floor(total * 0.2);

        const payGroup = async (group, pot, label) => {
            if (group.length === 0) return;
            const share = Math.floor(pot / group.length);
            for (const b of group) {
                const { data: u } = await supabase.from('users').select('balance, total_winnings').eq('telegram_id', b.telegram_id).single();
                await supabase.from('users').update({
                    balance: (u?.balance || 0) + share,
                    total_winnings: (u?.total_winnings || 0) + share
                }).eq('telegram_id', b.telegram_id);
                try {
                    await bot.telegram.sendMessage(b.telegram_id,
                        `🎉 *זכית בחלק מהקופה!*\n\nניחשת נכון את *${label}*\nקיבלת: *${share} ש"ח* 💰`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
        };

        await payGroup(winnerBets,  pot40winner, 'המנצחת 👑');
        await payGroup(scoreBets,   pot40score,  'התוצאה המדויקת 🎯');
        await payGroup(scorerBets,  pot20scorer, 'הכובש הראשון 🏃');

        await ctx.reply(
            `✅ *חלוקת קופה הושלמה*\n\n` +
            `סה"כ: ${total} ש"ח\n` +
            `👑 מנצחת (${winnerBets.length} זוכים): ${pot40winner} ש"ח\n` +
            `🎯 תוצאה (${scoreBets.length} זוכים): ${pot40score} ש"ח\n` +
            `🏃 כובש (${scorerBets.length} זוכים): ${pot20scorer} ש"ח`,
            { parse_mode: 'Markdown' }
        );
    }

    // סגירת המשחק + עדכון תוצאות הימורים
    await supabase.from('games').update({ status: 'finished', final_winner: winner, final_score: score, final_scorer: scorer }).eq('id', gameId);

    // סימון תוצאת כל הימור
    for (const b of bets) {
        const isPerfect = b.winner === winner && b.score === score && b.scorer === scorer;
        const wonWinner = b.winner === winner;
        const wonScore  = b.score === score;
        const wonScorer = b.scorer === scorer;
        const result = isPerfect ? 'perfect' : (wonWinner || wonScore || wonScorer) ? 'partial' : 'lost';
        await supabase.from('bets').update({ result }).eq('id', b.id);
    }
}

async function broadcastMessage(ctx, text) {
    const { data: users } = await supabase.from('users').select('telegram_id');
    if (!users || users.length === 0) return ctx.reply("❌ אין משתמשים.");

    let sent = 0, failed = 0;
    await ctx.reply(`📢 שולח ל-${users.length} משתמשים...`);

    for (const u of users) {
        try {
            await bot.telegram.sendMessage(u.telegram_id, text, { parse_mode: 'Markdown' });
            sent++;
        } catch (e) {
            failed++;
        }
        // עיכוב קל למניעת flood
        await new Promise(r => setTimeout(r, 50));
    }

    await ctx.reply(`✅ Broadcast הושלם!\n📤 נשלח: ${sent}\n❌ נכשל: ${failed}`);
}

// ─── callback_query (מאוחד) ───────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (isRateLimited(userId)) return ctx.answerCbQuery("⏳ רגע...");

    try {

        // ── אדמין ─────────────────────────────────────────────────────────────
        if (data === 'admin_users') {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const { data: usersList } = await supabase.from('users').select('*').order('balance', { ascending: false }).limit(10);
            for (const u of usersList) {
                await ctx.reply(
                    `👤 *${u.username}* | 💰 ${u.balance} ש"ח | 🏆 ${u.total_winnings || 0} ש"ח`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[
                            Markup.button.callback(`💵 הפקד`, `adm_dep_${u.telegram_id}`),
                            Markup.button.callback(`📋 הימורים`, `adm_bets_${u.telegram_id}`)
                        ]])
                    }
                );
            }
            await ctx.answerCbQuery();

        } else if (data.startsWith('adm_dep_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            userSessions[userId] = { targetId: parseInt(data.replace('adm_dep_', '')), step: 'ADMIN_AWAITING_DEPOSIT' };
            await ctx.reply("💸 שלח את סכום ההפקדה:");
            await ctx.answerCbQuery();

        } else if (data.startsWith('adm_bets_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const targetId = parseInt(data.replace('adm_bets_', ''));
            const { data: bets } = await supabase.from('bets').select('*, games(team_a, team_b)').eq('telegram_id', targetId).limit(5);
            if (!bets || bets.length === 0) return ctx.reply("אין הימורים.");
            let text = `📋 *הימורים אחרונים:*\n\n`;
            for (const b of bets) {
                text += `⚽ ${b.games?.team_a} vs ${b.games?.team_b}\n👑 ${b.winner} | 🎯 ${b.score} | 🏃 ${b.scorer}\n\n`;
            }
            await ctx.reply(text, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery();

        } else if (data === 'admin_live_games') {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games?.length) return ctx.reply("אין משחקים פתוחים.");
            await ctx.reply("⚽ בחר משחק לעדכון:", Markup.inlineKeyboard(
                games.map(g => [Markup.button.callback(`${g.team_a} vs ${g.team_b}`, `adm_live_set_${g.id}`)])
            ));
            await ctx.answerCbQuery();

        } else if (data.startsWith('adm_live_set_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            userSessions[userId] = { gameId: parseInt(data.replace('adm_live_set_', '')), step: 'ADMIN_AWAITING_LIVE_DATA' };
            await ctx.reply("📝 שלח: [דקה] [תוצאה] [כובש ראשון]");
            await ctx.answerCbQuery();

        } else if (data === 'admin_withdrawals') {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const { data: reqs } = await supabase.from('withdrawal_requests').select('*, users(username)').eq('status', 'pending').limit(10);
            if (!reqs?.length) { await ctx.reply("✅ אין בקשות משיכה ממתינות."); return ctx.answerCbQuery(); }
            for (const r of reqs) {
                await ctx.reply(
                    `💸 *בקשת משיכה*\n👤 ${r.users?.username}\n💰 ${r.amount} ש"ח`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[
                            Markup.button.callback("✅ אשר", `adm_withdraw_approve_${r.id}`),
                            Markup.button.callback("❌ דחה", `adm_withdraw_reject_${r.id}`)
                        ]])
                    }
                );
            }
            await ctx.answerCbQuery();

        } else if (data.startsWith('adm_withdraw_approve_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const reqId = parseInt(data.replace('adm_withdraw_approve_', ''));
            const { data: req } = await supabase.from('withdrawal_requests').select('*').eq('id', reqId).single();
            await supabase.from('withdrawal_requests').update({ status: 'approved' }).eq('id', reqId);
            try {
                await bot.telegram.sendMessage(req.telegram_id,
                    `✅ *בקשת המשיכה שלך אושרה!*\nסכום: *${req.amount} ש"ח* יועבר אליך בקרוב.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            await ctx.answerCbQuery("✅ אושר!");

        } else if (data.startsWith('adm_withdraw_reject_')) {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            const reqId = parseInt(data.replace('adm_withdraw_reject_', ''));
            const { data: req } = await supabase.from('withdrawal_requests').select('*').eq('id', reqId).single();
            // החזרת הכסף ליתרה
            const { data: u } = await supabase.from('users').select('balance').eq('telegram_id', req.telegram_id).single();
            await supabase.from('users').update({ balance: (u?.balance || 0) + req.amount }).eq('telegram_id', req.telegram_id);
            await supabase.from('withdrawal_requests').update({ status: 'rejected' }).eq('id', reqId);
            try {
                await bot.telegram.sendMessage(req.telegram_id,
                    `❌ *בקשת המשיכה נדחתה.*\nהסכום *${req.amount} ש"ח* הוחזר ליתרתך.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            await ctx.answerCbQuery("❌ נדחה");

        } else if (data === 'admin_broadcast') {
            if (!isAdmin(userId)) return ctx.answerCbQuery("❌ אין הרשאה");
            userSessions[userId] = { step: 'ADMIN_AWAITING_BROADCAST' };
            await ctx.reply("📢 שלח את ההודעה לשידור לכל המשתמשים:");
            await ctx.answerCbQuery();

        // ── referral link ──────────────────────────────────────────────────────
        } else if (data === 'get_referral') {
            const botInfo = await bot.telegram.getMe();
            const link = `https://t.me/${botInfo.username}?start=${userId}`;
            await ctx.reply(
                `🔗 *הקישור האישי שלך:*\n\n${link}\n\nכל חבר שנרשם דרכך — שניכם מקבלים *10 ש"ח בונוס!* 🎁`,
                { parse_mode: 'Markdown' }
            );
            await ctx.answerCbQuery();

        // ── ההימורים שלי ──────────────────────────────────────────────────────
        } else if (data === 'my_bets') {
            await showMyBets(ctx, userId);
            await ctx.answerCbQuery();

        // ── לוח מובילים ───────────────────────────────────────────────────────
        } else if (data === 'leaderboard') {
            await showLeaderboard(ctx);
            await ctx.answerCbQuery();

        // ── משיכה ─────────────────────────────────────────────────────────────
        } else if (data === 'withdraw') {
            await startWithdraw(ctx, userId);
            await ctx.answerCbQuery();

        // ── אישור הימור ───────────────────────────────────────────────────────
        } else if (data.startsWith('bet_confirm_')) {
            const session = userSessions[userId];
            if (!session || session.step !== 'AWAITING_BET_CONFIRM') return ctx.answerCbQuery("הסשן פג תוקף.");

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
                scorer: session.scorer
            });

            await ctx.editMessageText(
                `✅ *ההימור שלך נשמר!*\n\n` +
                `🏆 מנצחת: ${session.winner}\n` +
                `🎯 תוצאה: ${session.score}\n` +
                `🏃 כובש: ${session.scorer}\n\n` +
                `💰 עלות: 100 ש"ח | יתרה חדשה: ${user.balance - 100} ש"ח`,
                { parse_mode: 'Markdown' }
            );
            delete userSessions[userId];
            await ctx.answerCbQuery("✅ ההימור נשמר!");

        } else if (data === 'bet_cancel') {
            delete userSessions[userId];
            await ctx.editMessageText("❌ ההימור בוטל. ניתן להתחיל מחדש.");
            await ctx.answerCbQuery("בוטל");

        // ── משחקים פתוחים ─────────────────────────────────────────────────────
        } else if (data === 'list_games') {
            const { data: games } = await supabase.from('games').select('*').eq('status', 'active');
            if (!games || games.length === 0) {
                await ctx.reply("😕 אין משחקים פתוחים כרגע.");
                return ctx.answerCbQuery();
            }
            for (const g of games) {
                await ctx.reply(
                    `⚽ *${g.team_a} vs ${g.team_b}*\n⏱️ ${g.live_minute || 'טרם התחיל'} | 🎯 ${g.live_score || '-'}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🎰 המר (100 ש"ח)', `b1_${g.id}`)],
                            [Markup.button.callback('📊 מצב קופה לייב', `live_pool_${g.id}`)]
                        ])
                    }
                );
            }
            await ctx.answerCbQuery();

        // ── מצב קופה לייב ─────────────────────────────────────────────────────
        } else if (data.startsWith('live_pool_')) {
            const gameId = parseInt(data.replace('live_pool_', ''));
            const { data: game } = await supabase.from('games').select('*').eq('id', gameId).single();
            const { data: bets } = await supabase.from('bets').select('*').eq('game_id', gameId);
            const total = (bets?.length || 0) * 100;
            await ctx.reply(
                `📊 *מצב קופה לייב*\n\n⚽ ${game.team_a} vs ${game.team_b}\n💰 בקופה: *${total} ש"ח* (${bets?.length || 0} הימורים)\n⏱️ דקה: ${game.live_minute || '-'} | 🎯 תוצאה: ${game.live_score || '-'}`,
                { parse_mode: 'Markdown' }
            );
            await ctx.answerCbQuery();

        // ── שלב 1: התחלת הימור ────────────────────────────────────────────────
        } else if (data.startsWith('b1_')) {
            const gameId = parseInt(data.replace('b1_', ''));

            const { data: game } = await supabase.from('games').select('status').eq('id', gameId).single();
            if (!game || game.status !== 'active') {
                await ctx.reply("❌ ההימורים לא פתוחים עוד למשחק זה.");
                return ctx.answerCbQuery();
            }

            const { data: existingBet } = await supabase
                .from('bets').select('id')
                .eq('telegram_id', userId).eq('game_id', gameId).single();
            if (existingBet) return ctx.answerCbQuery("❌ כבר הימרת במשחק זה");

            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < 100) {
                await ctx.reply(`❌ אין מספיק יתרה. עלות: 100 ש"ח | יתרה: ${user?.balance || 0} ש"ח`);
                return ctx.answerCbQuery();
            }

            userSessions[userId] = { gameId, step: 'AWAITING_WINNER' };
            await ctx.reply(`שלב 1/3: מי המנצחת? 👑`, Markup.inlineKeyboard([
                [Markup.button.callback('1 (בית)', 'b2_1'), Markup.button.callback('X (תיקו)', 'b2_X'), Markup.button.callback('2 (חוץ)', 'b2_2')]
            ]));
            await ctx.answerCbQuery();

        // ── שלב 2: מנצחת ──────────────────────────────────────────────────────
        } else if (data.startsWith('b2_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_WINNER') return ctx.answerCbQuery("⚠️ הסשן פג");
            userSessions[userId].winner = data.replace('b2_', '');
            userSessions[userId].step = 'AWAITING_GOALS_A';
            await ctx.reply(`שלב 2/3 (א'): כמה שערים קבוצת הבית? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0', 'b3a_0'), Markup.button.callback('1', 'b3a_1'), Markup.button.callback('2', 'b3a_2')],
                [Markup.button.callback('3', 'b3a_3'), Markup.button.callback('4', 'b3a_4'), Markup.button.callback('5', 'b3a_5')]
            ]));
            await ctx.answerCbQuery();

        // ── שלב 3: שערים בית ──────────────────────────────────────────────────
        } else if (data.startsWith('b3a_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_A') return ctx.answerCbQuery("⚠️ הסשן פג");
            userSessions[userId].goalsA = data.replace('b3a_', '');
            userSessions[userId].step = 'AWAITING_GOALS_B';
            await ctx.reply(`שלב 2/3 (ב'): כמה שערים קבוצת החוץ? ⚽`, Markup.inlineKeyboard([
                [Markup.button.callback('0', 'b3b_0'), Markup.button.callback('1', 'b3b_1'), Markup.button.callback('2', 'b3b_2')],
                [Markup.button.callback('3', 'b3b_3'), Markup.button.callback('4', 'b3b_4'), Markup.button.callback('5', 'b3b_5')]
            ]));
            await ctx.answerCbQuery();

        // ── שלב 4: שערים חוץ → בקשת כובש ────────────────────────────────────
        } else if (data.startsWith('b3b_')) {
            if (!userSessions[userId] || userSessions[userId].step !== 'AWAITING_GOALS_B') return ctx.answerCbQuery("⚠️ הסשן פג");
            const goalsB = data.replace('b3b_', '');
            userSessions[userId].score = `${userSessions[userId].goalsA}-${goalsB}`;
            userSessions[userId].step = 'AWAITING_SCORER';
            await ctx.reply(`נבחרה תוצאה: *${userSessions[userId].score}* 🎯\n\nשלב 3/3: הקלד את שם הכובש הראשון:`, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery();

        // ── בדיקת יתרה ────────────────────────────────────────────────────────
        } else if (data === 'check_balance') {
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            const botInfo = await bot.telegram.getMe();
            const refLink = `https://t.me/${botInfo.username}?start=${userId}`;
            await ctx.reply(
                `💰 *היתרה שלך: ${user?.balance || 0} ש"ח*\n\n🔗 קישור חבר שלך: ${refLink}`,
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback("💸 משוך כסף", 'withdraw')]]) }
            );
            await ctx.answerCbQuery();

        } else {
            await ctx.answerCbQuery();
        }

    } catch (e) {
        console.error('callback_query error:', e);
        try { await ctx.answerCbQuery("❌ שגיאה"); } catch {}
        await ctx.reply("❌ אירעה שגיאה, נסה שוב.");
    }
});

// ─── text (מאוחד) ─────────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return;

    try {

        // ── אדמין: עדכון לייב ──────────────────────────────────────────────────
        if (session.step === 'ADMIN_AWAITING_LIVE_DATA' && isAdmin(userId)) {
            const parts = ctx.message.text.split(' ');
            if (parts.length < 2) return ctx.reply("⚠️ פורמט: [דקה] [תוצאה] [כובש]");
            await supabase.from('games').update({
                live_minute: parts[0],
                live_score: parts[1],
                live_scorer: parts.slice(2).join(' ') || null
            }).eq('id', session.gameId);
            await ctx.reply("✅ עודכן!");
            delete userSessions[userId];

        // ── אדמין: הפקדה ──────────────────────────────────────────────────────
        } else if (session.step === 'ADMIN_AWAITING_DEPOSIT' && isAdmin(userId)) {
            const amount = parseInt(ctx.message.text);
            if (isNaN(amount) || amount <= 0) return ctx.reply("❌ מספר לא תקין.");
            const { data: u } = await supabase.from('users').select('balance, username').eq('telegram_id', session.targetId).single();
            if (!u) return ctx.reply("❌ משתמש לא נמצא.");
            await supabase.from('users').update({ balance: u.balance + amount }).eq('telegram_id', session.targetId);
            await ctx.reply(`✅ הופקדו ${amount} ש"ח ל-${u.username}.`);
            try {
                await bot.telegram.sendMessage(session.targetId,
                    `💰 *יש לך הפקדה חדשה!*\n\nהסוכן הפקיד *${amount} ש"ח* לחשבונך.\nיתרה חדשה: *${u.balance + amount} ש"ח* ⚽`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            delete userSessions[userId];

        // ── אדמין: broadcast ───────────────────────────────────────────────────
        } else if (session.step === 'ADMIN_AWAITING_BROADCAST' && isAdmin(userId)) {
            await broadcastMessage(ctx, ctx.message.text);
            delete userSessions[userId];

        // ── אדמין: משחק חדש — שם קבוצה א' ────────────────────────────────────
        } else if (session.step === 'NEWGAME_TEAM_A' && isAdmin(userId)) {
            userSessions[userId] = { step: 'NEWGAME_TEAM_B', teamA: ctx.message.text.trim() };
            await ctx.reply(`✅ קבוצת בית: *${ctx.message.text.trim()}*\n\nשלב 2/3: מה שם קבוצת החוץ?`, { parse_mode: 'Markdown' });

        } else if (session.step === 'NEWGAME_TEAM_B' && isAdmin(userId)) {
            userSessions[userId] = { ...session, step: 'NEWGAME_START_TIME', teamB: ctx.message.text.trim() };
            await ctx.reply(`✅ קבוצת חוץ: *${ctx.message.text.trim()}*\n\nשלב 3/3: מתי המשחק? (פורמט: YYYY-MM-DD HH:MM)\nדוגמה: 2025-06-15 21:00`, { parse_mode: 'Markdown' });

        } else if (session.step === 'NEWGAME_START_TIME' && isAdmin(userId)) {
            const startTime = new Date(ctx.message.text.trim());
            if (isNaN(startTime.getTime())) return ctx.reply("⚠️ תאריך לא תקין. נסה: YYYY-MM-DD HH:MM");
            const { data: newGame } = await supabase.from('games').insert({
                team_a: session.teamA,
                team_b: session.teamB,
                start_time: startTime.toISOString(),
                status: 'active'
            }).select().single();
            await ctx.reply(
                `✅ *משחק נפתח בהצלחה!*\n\n⚽ ${session.teamA} vs ${session.teamB}\n📅 ${ctx.message.text.trim()}\n🆔 Game ID: ${newGame.id}`,
                { parse_mode: 'Markdown' }
            );
            delete userSessions[userId];

            // התראה לכולם על משחק חדש
            const { data: users } = await supabase.from('users').select('telegram_id');
            let sent = 0;
            for (const u of users || []) {
                try {
                    await bot.telegram.sendMessage(u.telegram_id,
                        `🔥 *משחק חדש נפתח!*\n\n⚽ *${session.teamA} vs ${session.teamB}*\n📅 ${ctx.message.text.trim()}\n\nלחץ /start להימור!`,
                        { parse_mode: 'Markdown' }
                    );
                    sent++;
                } catch (e) {}
                await new Promise(r => setTimeout(r, 50));
            }
            await ctx.reply(`📢 נשלחה התראה ל-${sent} משתמשים.`);

        // ── שחקן: שם כובש + אישור ─────────────────────────────────────────────
        } else if (session.step === 'AWAITING_SCORER') {
            const scorer = ctx.message.text.trim();
            if (!scorer) return ctx.reply("⚠️ שלח שם שחקן תקין.");
            userSessions[userId] = { ...session, scorer, step: 'AWAITING_BET_CONFIRM' };
            await ctx.reply(
                `📋 *אישור הימור:*\n\n` +
                `🏆 מנצחת: *${session.winner}*\n` +
                `🎯 תוצאה: *${session.score}*\n` +
                `🏃 כובש: *${scorer}*\n` +
                `💰 עלות: *100 ש"ח*\n\n` +
                `האם לאשר?`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("✅ אשר הימור", `bet_confirm_1`), Markup.button.callback("❌ בטל", 'bet_cancel')]
                    ])
                }
            );

        // ── שחקן: סכום משיכה ──────────────────────────────────────────────────
        } else if (session.step === 'AWAITING_WITHDRAW_AMOUNT') {
            const amount = parseInt(ctx.message.text);
            if (isNaN(amount) || amount <= 0) return ctx.reply("❌ סכום לא תקין.");
            const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
            if (!user || user.balance < amount) {
                return ctx.reply(`❌ אין מספיק יתרה. יתרה: ${user?.balance || 0} ש"ח`);
            }
            // ניכוי מהיתרה ושמירת הבקשה
            await supabase.from('users').update({ balance: user.balance - amount }).eq('telegram_id', userId);
            await supabase.from('withdrawal_requests').insert({
                telegram_id: userId,
                amount,
                status: 'pending'
            });
            await ctx.reply(`✅ *בקשת המשיכה נשלחה!*\nסכום: *${amount} ש"ח*\nהסוכן יצור איתך קשר בקרוב.`, { parse_mode: 'Markdown' });
            // התראה לאדמין
            try {
                const { data: u } = await supabase.from('users').select('username').eq('telegram_id', userId).single();
                await bot.telegram.sendMessage(adminId,
                    `💸 *בקשת משיכה חדשה!*\n👤 ${u?.username}\n💰 ${amount} ש"ח\n\nלאישור: /admin`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            delete userSessions[userId];
        }

    } catch (e) {
        console.error('text handler error:', e);
        await ctx.reply("❌ אירעה שגיאה, נסה שוב.");
    }
});

// ─── cron: בדיקת מינימום משתתפים + התראה 5 דקות ─────────────────────────────
cron.schedule('* * * * *', async () => {
    const now = new Date();

    // 1. ביטול משחקים עם פחות מ-20 משתתפים לאחר 15 דקות
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60000);
    const { data: oldGames } = await supabase.from('games').select('*')
        .eq('status', 'active').lt('start_time', fifteenMinutesAgo.toISOString());

    for (const game of oldGames || []) {
        const { count } = await supabase.from('bets').select('*', { count: 'exact', head: true }).eq('game_id', game.id);
        if (count < 20) {
            await cancelGame(game.id);
        } else {
            await supabase.from('games').update({ status: 'locked' }).eq('id', game.id);
        }
    }

    // 2. התראה 5 דקות לפני נעילה — למי שטרם הימר
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60000);
    const sixMinutesLater  = new Date(now.getTime() + 6 * 60000);
    const { data: upcomingGames } = await supabase.from('games').select('*')
        .eq('status', 'active')
        .gt('start_time', fiveMinutesLater.toISOString())
        .lt('start_time', sixMinutesLater.toISOString());

    for (const game of upcomingGames || []) {
        const { data: bettors } = await supabase.from('bets').select('telegram_id').eq('game_id', game.id);
        const bettorIds = new Set((bettors || []).map(b => b.telegram_id));
        // שולחים רק למשתמשים עם יתרה שעדיין לא הימרו
        const { data: allUsers } = await supabase.from('users').select('telegram_id').gt('balance', 99);
        for (const u of allUsers || []) {
            if (!bettorIds.has(u.telegram_id)) {
                try {
                    await bot.telegram.sendMessage(u.telegram_id,
                        `⏰ *נותרו 5 דקות!*\n\n⚽ ${game.team_a} vs ${game.team_b}\n\nמהר, לחץ /start לפני שהמשחק ינעל! 🔥`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
        }
    }
});

// ─── cron: סיכום יומי לאדמין (כל יום ב-9:00) ─────────────────────────────────
cron.schedule('0 9 * * *', async () => {
    const { count: usersCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: betsCount }  = await supabase.from('bets').select('*', { count: 'exact', head: true });
    const { data: activeGames } = await supabase.from('games').select('*').eq('status', 'active');
    const { data: pendingWithdrawals } = await supabase.from('withdrawal_requests').select('*').eq('status', 'pending');

    try {
        await bot.telegram.sendMessage(adminId,
            `📊 *סיכום בוקר — ${new Date().toLocaleDateString('he-IL')}*\n\n` +
            `👥 משתמשים רשומים: ${usersCount || 0}\n` +
            `🎰 סה"כ הימורים: ${betsCount || 0}\n` +
            `⚽ משחקים פתוחים: ${activeGames?.length || 0}\n` +
            `💸 משיכות ממתינות: ${pendingWithdrawals?.length || 0}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('שגיאה בשליחת סיכום יומי:', e);
    }
});

// ─── ביטול משחק והחזרת כספים ─────────────────────────────────────────────────
async function cancelGame(gameId) {
    console.log(`מבצע ביטול למשחק: ${gameId}...`);
    // שולפים את פרטי המשחק וההימורים לפני הביטול
    const { data: bets } = await supabase.from('bets').select('telegram_id').eq('game_id', gameId);
    const { data: game } = await supabase.from('games').select('team_a, team_b').eq('id', gameId).single();

    const { error } = await supabase.rpc('cancel_game_and_refund', { target_game_id: gameId });
    if (error) {
        console.error("שגיאה בביטול המשחק:", error);
        return; // לא שולחים הודעות אם הביטול נכשל
    }

    console.log("המשחק בוטל והכספים הוחזרו.");
    for (const b of bets || []) {
        try {
            await bot.telegram.sendMessage(b.telegram_id,
                `🚫 *המשחק בוטל*\n\n⚽ ${game?.team_a} vs ${game?.team_b}\n\nלא הגיעו 20 משתתפים. *100 ש"ח הוחזרו לחשבונך.*`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
    }
}

// ─── Express keepalive ────────────────────────────────────────────────────────
const app = express();
app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000);

// ─── הפעלת הבוט ──────────────────────────────────────────────────────────────
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));



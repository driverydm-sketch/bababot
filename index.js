const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 1. חיבור ל-Supabase וטעינת משתני סביבה
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const botToken = process.env.BOT_TOKEN;
const adminId = parseInt(process.env.ADMIN_ID) || 0;

if (!supabaseUrl || !supabaseKey || !botToken) {
    console.error("❌ חסרים משתני סביבה בקובץ .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(botToken);

// פונקציית עזר לבדיקת אדמין
const isAdmin = (userId) => parseInt(userId) === adminId;

// ==========================================
// פונקציות עזר וחישובי קופות (Core Logic)
// ==========================================

async function calculateAndPayout(gameId, actualWinner, actualScore, actualScorer) {
    console.log(`🎬 מתחיל חישוב חלוקת קופה למשחק מספר: ${gameId}`);
    
    // 1. משיכת כל ההימורים של המשחק הספציפי
    const { data: bets, error: betsError } = await supabase
        .from('bets')
        .select('*')
        .eq('game_id', gameId);
        
    if (betsError) throw betsError;
    if (!bets || bets.length === 0) {
        console.log("🤷‍♂️ לא נמצאו הימורים למשחק זה.");
        return;
    }

    const totalPot = bets.length * 100; // 100 ש"ח כניסה לכל שחקן
    const houseCommission = totalPot * 0.20; // 20% עמלת בית
    const netPot = totalPot - houseCommission;

    // 2. עדכון רווחי האדמין/הבית בדאטה-בייס
    const { data: currentAdmin } = await supabase.from('users').select('balance').eq('telegram_id', adminId).single();
    const newAdminBalance = (currentAdmin?.balance || 0) + houseCommission;
    await supabase.from('users').update({ balance: newAdminBalance }).eq('telegram_id', adminId);

    // 3. סינון המנצחים לפי הקטגוריות
    const winnerBets = bets.filter(b => b.predicted_winner === actualWinner);
    const scoreBets = bets.filter(b => b.predicted_score === actualScore);
    const scorerBets = bets.filter(b => b.predicted_scorer?.toLowerCase() === actualScorer?.toLowerCase());

    // 4. חישוב שווי כל קופה יחסית (40% מנצחת, 40% תוצאה, 20% כובש)
    const winnerPotShare = netPot * 0.40;
    const scorePotShare = netPot * 0.40;
    const scorerPotShare = netPot * 0.20;

    const payoutPerWinner = winnerBets.length > 0 ? winnerPotShare / winnerBets.length : 0;
    const payoutPerScore = scoreBets.length > 0 ? scorePotShare / scoreBets.length : 0;
    const payoutPerScorer = scorerBets.length > 0 ? scorerPotShare / scorerBets.length : 0;

    // 5. חלוקת הכספים למשתמשים ושליחת הודעות
    const userPayouts = {};

    bets.forEach(bet => {
        let userTotal = 0;
        let details = [];

        if (bet.predicted_winner === actualWinner && payoutPerWinner > 0) {
            userTotal += payoutPerWinner;
            details.push(`ניחשת נכון את המנצחת (+${payoutPerWinner.toFixed(2)} ש"ח)`);
        }
        if (bet.predicted_score === actualScore && payoutPerScore > 0) {
            userTotal += payoutPerScore;
            details.push(`ניחשת נכון את התוצאה המדויקת (+${payoutPerScore.toFixed(2)} ש"ח)`);
        }
        if (bet.predicted_scorer?.toLowerCase() === actualScorer?.toLowerCase() && payoutPerScorer > 0) {
            userTotal += payoutPerScorer;
            details.push(`ניחשת נכון את הכובש הראשון (+${payoutPerScorer.toFixed(2)} ש"ח)`);
        }

        if (userTotal > 0) {
            userPayouts[bet.telegram_id] = {
                amount: userTotal,
                msg: `🎯 *מזל טוב! פגעת בהימורים על המשחק!*\n\n${details.join('\n')}\n\n💰 סה"כ זכייה: *${userTotal.toFixed(2)} ש"ח* הועברו ליתרה שלך.`
            };
        }
    });

    // 6. עדכון היתרות ב-Supabase ושליחת ההודעות בפועל ליוזרים
    for (const [userId, payout] of Object.entries(userPayouts)) {
        const { data: user } = await supabase.from('users').select('balance').eq('telegram_id', userId).single();
        const newBalance = (user?.balance || 0) + payout.amount;
        
        await supabase.from('users').update({ balance: newBalance }).eq('telegram_id', userId);
        
        // שליחת הודעה פרטית מהבוט לזוכה
        try {
            await bot.telegram.sendMessage(userId, payout.msg, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error(`⚠️ לא ניתן לשלוח הודעה ליוזר ${userId}:`, e.message);
        }
    }
}

// ==========================================
// פקודות בוט בסיסיות (Core Commands)
// ==========================================

// פקודת ההתחלה /start
bot.start(async (ctx) => {
    const userId = ctx.from.
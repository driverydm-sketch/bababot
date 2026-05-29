const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const app = express();

app.use(express.json());

// הגדרת ה-Webhook כך שכל בקשה שנשלחת ל-/webhook תעבור לבוט
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
    res.status(200).send('ok');
});

// פקודת start
bot.start((ctx) => {
    ctx.reply("👋 שלום! הבוט מחובר ועובד.");
});

// הגדרת הפורט הדינמי של Render - קריטי למניעת EADDRINUSE
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
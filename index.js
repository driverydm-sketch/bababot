const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const app = express();

app.use(express.json());

// הגדרת נתיב ה-Webhook
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body, res);
    res.status(200).send('OK');
});

bot.start((ctx) => ctx.reply("הבוט פעיל ומחובר!"));

// הגדרת הפורט הדינמי - קריטי ל-Render!
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
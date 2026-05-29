// שרת פיקטיבי קטן כדי ש-Render לא יאתחל את הבוט
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BabaBot is alive! ⚽'));
app.listen(PORT, () => console.log(`🌍 Keeping alive server listening on port ${PORT}`));
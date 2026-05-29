bot.command('addgame', async (ctx) => {
    // 1. בדיקת הרשאת מנהל
    if (!isAdmin(ctx.from.id)) return ctx.reply("❌ מורשה למנהלים בלבד.");
    
    // 2. פיצול ההודעה לפרמטרים
    const parts = ctx.message.text.split(' ');
    
    // 3. בדיקת תקינות הפורמט
    if (parts.length < 4) {
        return ctx.reply("❌ פורמט לא תקין. השתמש ב: /addgame [בית] [חוץ] [ID]");
    }
    
    try {
        // 4. שליחה ל-Supabase
        const { error } = await supabase.from('games').insert([{ 
            home_team: parts[1], 
            away_team: parts[2], 
            fixture_id: parseInt(parts[3]), 
            status: 'active' 
        }]);

        if (error) throw error;
        
        // 5. אישור למשתמש
        ctx.reply(`✅ המשחק ${parts[1]} נגד ${parts[2]} (ID: ${parts[3]}) נוסף בהצלחה!`);
        
    } catch (e) {
        console.error("Error adding game:", e);
        ctx.reply("❌ שגיאה בשמירת המשחק במסד הנתונים.");
    }
});
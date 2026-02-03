const TelegramBot = require('node-telegram-bot-api');
const token = '8129270648:AAHFKCMRO8F1SamS1l9-eXIZ_y2qgwS74-s'; 
const bot = new TelegramBot(token, {polling: true});

console.log("=== SAVORIA BOT NOLDAN ISHGA TUSHDI ===");

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Savoria Restuarant botiga xush kelibsiz! Tanlang:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Joy buyurtma qilish', url: 'https://laziz712.github.io/Savoria-Restuarant/' }],
                [{ text: "🌐 Saytga o'tish", url: 'https://laziz712.github.io/Savoria-Restuarant/' }],
                [{ text: '📸 Instagram', url: 'https://www.instagram.com/shavkatov.o07/' }]
            ]
        }
    });
});

bot.on("polling_error", (err) => console.log("Xato:", err.message));
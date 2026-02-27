window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-5F427474HP');

const TelegramBot = require("node-telegram-bot-api");


const token = "8129270648:AAGkSR08g2oZbNUWdoCqMyiUAdnWtLaQD4k"; 
const ADMIN_ID = "8584049635";
const bot = new TelegramBot(token, { polling: true });

let userCount = 0;
const usersList = new Set();

console.log("✅ Savoria bot muvaffaqiyatli ishga tushdi...");


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;


    if (!usersList.has(user.id)) {
        usersList.add(user.id);
        userCount++;

        const now = new Date();
        const enterTime = now.toLocaleString('uz-UZ', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });

        const username = user.username ? `@${user.username}` : "mavjud emas";

        const log = `🔔 <b>Yangi foydalanuvchi!</b>\n\n` +
            `👤 <b>Ism:</b> ${user.first_name}\n` +
            `🆔 <b>ID:</b> ${user.id}\n` +
            `🔗 <b>Nik:</b> ${username}\n` +
            `⏰ <b>Vaqt:</b> ${enterTime}\n` +
            `📈 <b>Jami foydalanuvchilar:</b> ${userCount}-ta`;

        bot.sendMessage(ADMIN_ID, log, { parse_mode: 'HTML' });
    }

    const welcomeText = `Assalomu alaykum, <b>${user.first_name}</b>!\n\n🍽 <b>Savoria Restaurant</b> botiga xush kelibsiz!`;

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📜 To'liq Menyu", callback_data: "full_menu" }],
                [{ text: "🛒 Buyurtma berish", callback_data: "order" }],
                [{ text: "📍 Manzil", callback_data: "location" }, { text: "📞 Aloqa", callback_data: "contact" }],
                [
                    { text: "🌐 Sayt", url: "https://laziz712.github.io/Savoria-Restuarant/" },
                    { text: "📸 Instagram", url: "https://www.instagram.com/shavkatov.o07/" }
                ]
            ]
        }
    });
});


bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === "full_menu") {
        const menuText = 
            `📋 <b>SAVORIA RESTAURANT MENYUSI</b>\n\n` +
            `🍕 <b>PIZZALAR</b>\n` +
            `• Margarita — 65,000 so'm\n` +
            `• Pepperoni — 75,000 so'm\n` +
            `• Savoria Maxsus — 95,000 so'm\n\n` +
            `🍔 <b>BURGERLAR</b>\n` +
            `• Cheeseburger — 35,000 so'm\n` +
            `• Double Beef Burger — 48,000 so'm\n\n` +
            `🥗 <b>SALATLAR</b>\n` +
            `• Sezar — 38,000 so'm\n` +
            `• Gretskiy — 30,000 so'm\n\n` +
            `🥤 <b>ICHIMLIKLAR</b>\n` +
            `• Coca-Cola (0.5L) — 10,000 so'm\n` +
            `• Limonad — 20,000 so'm\n\n` +
            `✨ <i>Yoqimli ishtaha!</i>`;

        bot.sendMessage(chatId, menuText, { parse_mode: "HTML" });

    } else if (data === "order") {
        bot.sendMessage(chatId, "🛒 <b>Buyurtma berish uchun telefon:</b>\n\n📞 +998 71 345 07 82", { parse_mode: "HTML" });

    } else if (data === "location") {
        bot.sendMessage(chatId, "📍 <b>Savoria Restuarant manzili:</b>", { parse_mode: "HTML" });
    
        bot.sendLocation(chatId, 41.311081, 69.240562);
    } else if (data === "contact") {
        bot.sendMessage(chatId, "📞 <b>Admin bilan aloqa:</b>\n\n📞 @lazizshavkatov712\n☎️ Tel: +998 71 271 07 82", { parse_mode: "HTML" });
    }


    bot.answerCallbackQuery(query.id);

});

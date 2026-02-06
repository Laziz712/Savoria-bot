require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = "8129270648:AAGpmaVMMRwp3rHmsgTStqvElYHIYUNtjjA"; 
const bot = new TelegramBot(token, { polling: true });

console.log("🤖 Savoria bot ishga tushdi");

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🍽 *Savoria Restaurant botiga xush kelibsiz!*", {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 Buyurtma berish", callback_data: "order" }],
        [{ text: "📋 Menu", callback_data: "menu" }],
        [{ text: "📍 Manzil", callback_data: "location" }],
        [{ text: "📞 Aloqa", callback_data: "contact" }],
        [
          { text: "🌐 Sayt", url: "https://laziz712.github.io/Savoria-Restuarant/" },
          { text: "📸 Instagram", url: "https://www.instagram.com/shavkatov.o07/" }
        ]
      ]
    }
  });
});

bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;

  if (q.data === "menu") {
    bot.sendMessage(chatId, "📋 *Bizning menu:* \n\n🍕 Pizza\n🍔 Burger\n🥗 Salatlar", { parse_mode: "Markdown" });
  } else if (q.data === "order") {
    bot.sendMessage(chatId, "🛒 Buyurtma: +998 71 345 07 82");
  } else if (q.data === "location") {
    bot.sendLocation(chatId, 22.3570728, 91.821282);
  } else if (q.data === "contact") {
    bot.sendMessage(chatId, "📞 Tel: +998 71 271 07 82");
  }

  bot.answerCallbackQuery(q.id);
});

bot.on("message", (msg) => {
  if (msg.text && msg.text !== "/start") {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(err => console.log("Xabarni o'chirib bo'lmadi"));
  }
});
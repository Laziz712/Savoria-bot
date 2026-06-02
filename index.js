const TelegramBot = require("node-telegram-bot-api");
const express = require('express');
require('dotenv').config();

const token = process.env.BOT_TOKEN || "8129270648:AAEkWJ7DrkvoGCXRVPYMDaES1sAQG3JZ9CQ"; 
const ADMIN_ID = "8584049635";

const bot = new TelegramBot(token);

const app = express();
app.use(express.json());

let userCount = 0;
const usersList = new Set();
const userStates = {};

const TAOMLAR = [
    {
        id: "margarita",
        nomi: "🍕 Margarita Pizza",
        narxi: 65000,
        rasm: "https://i.pinimg.com/736x/76/ce/18/76ce18a00bda94201875548caaf90876.jpg"
    },
    {
        id: "pepperoni",
        nomi: "🍕 Pepperoni Pizza",
        narxi: 75000,
        rasm: "https://i.pinimg.com/1200x/4d/a7/3f/4da73f313deef52c2373795a970b4082.jpg"
    },
    {
        id: "cheeseburger",
        nomi: "🍔 Cheeseburger",
        narxi: 35000,
        rasm: "https://i.pinimg.com/736x/37/00/ef/3700ef80f448d2a59dd80a78debce0c6.jpg"
    }
];

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => { 
    res.send('Savoria Bot Status: Active'); 
});

function sendMainMenu(chatId, text) {
    bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📜 Rasmli Menyu", callback_data: "rasmli_menyu" }],
                [{ text: "🛒 Savatni ko'rish", callback_data: "view_cart" }],
                [{ text: "🪑 Joy buyurtma qilish", callback_data: "start_order" }],
                [{ text: "📍 Manzil", callback_data: "location" }, { text: "📞 Aloqa", callback_data: "contact" }],
                [
                    { text: "🌐 Sayt", url: "https://savoria-restaurant.uz" },
                    { text: "📸 Instagram", url: "https://www.instagram.com/shavkatov.o07/" }
                ]
            ]
        }
    });
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;

    userStates[chatId] = { savat: [], step: "idle", kishiSoni: "Tanlanmagan" };

    if (!usersList.has(user.id)) {
        usersList.add(user.id);
        userCount++;

        const now = new Date();
        const enterTime = now.toLocaleString('uz-UZ', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric',
            timeZone: 'Asia/Tashkent' 
        });

        const username = user.username ? `@${user.username}` : "mavjud emas";
        const log = `🔔 Yangi foydalanuvchi!\n\n👤 Ism: ${user.first_name}\n🆔 ID: ${user.id}\n🔗 Nik: ${username}\n⏰ Vaqt: ${enterTime}\n📈 Jami: ${userCount}-ta`;
        bot.sendMessage(ADMIN_ID, log, { parse_mode: 'HTML' });
    }

    const welcomeText = `Assalomu alaykum, ${user.first_name}!\n\n🍽 <b>Savoria Restaurant</b> botiga xush kelibsiz!`;
    sendMainMenu(chatId, welcomeText);
});

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    const user = query.from;

    if (!userStates[chatId]) {
        userStates[chatId] = { savat: [], step: "idle", kishiSoni: "Tanlanmagan" };
    }

    if (data === "rasmli_menyu") {
        bot.sendMessage(chatId, "📋 Savoria Taomlari (Savatga qo'shish uchun bosing):", { parse_mode: "HTML" });
        for (const taom of TAOMLAR) {
            await bot.sendPhoto(chatId, taom.rasm, {
                caption: `${taom.nomi}\n\n💰 Narxi: ${taom.narxi.toLocaleString('uz-UZ')} so'm`,
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [[{ text: "📥 Savatga qo'shish", callback_data: `buy_${taom.id}` }]]
                }
            });
        }
    } 
    else if (data === "location") {
        bot.sendMessage(chatId, "📍 Savoria Restaurant manzili:", { parse_mode: "HTML" });
        bot.sendLocation(chatId, 41.311081, 69.240562);
    } 
    else if (data === "contact") {
        bot.sendMessage(chatId, "📞 Admin bilan aloqa:</b>\n\n📞 @lazizshavkatov712\n☎️ Tel: +998 71 271 07 82", { parse_mode: "HTML" });
    }

    if (data.startsWith("buy_")) {
        const taomId = data.replace("buy_", "");
        const tanlanganTaom = TAOMLAR.find(t => t.id === taomId);

        if (tanlanganTaom) {
            userStates[chatId].savat.push(tanlanganTaom);
            bot.answerCallbackQuery(query.id, { 
                text: `📥 ${tanlanganTaom.nomi} savatga muvaffaqiyatli qo'shildi!`,
                show_alert: false 
            });
            return;
        }
    }

    if (data === "view_cart") {
        const savat = userStates[chatId].savat;

        if (!savat || savat.length === 0) {
            bot.answerCallbackQuery(query.id, { text: "Savatingiz hozircha bo'sh!" });
            bot.sendMessage(chatId, "🛒 Savatingiz bo'sh. Iltimos, menyudan taom tanlang.");
            return;
        }

        let savatMatni = "🛒 Siz tanlagan taomlar:\n\n";
        let jamiSumma = 0;

        savat.forEach((taom, index) => {
            savatMatni += `${index + 1}. ${taom.nomi} — ${taom.narxi.toLocaleString('uz-UZ')} so'm\n`;
            jamiSumma += taom.narxi;
        });

        savatMatni += `\n💵 Jami summa: ${jamiSumma.toLocaleString('uz-UZ')} so'm`;
        userStates[chatId].jamiSumma = jamiSumma;

        bot.sendMessage(chatId, savatMatni, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 Buyurtmani rasmiylashtirish", callback_data: "checkout_food_only" }],
                    [{ text: "🗑 Savatni bo'shatish", callback_data: "clear_cart" }]
                ]
            }
        });
    }

    if (data === "checkout_food_only") {
        userStates[chatId].step = "waiting_for_phone_ovqat";
        bot.sendMessage(chatId, `📱 Taomlar buyurtmasi qabul qilinmoqda.\n\n📞 Pastdagi tugma orqali telefon raqamingizni yuboring yoki qo'lda kiriting:`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    if (data === "start_order") {
        bot.sendMessage(chatId, "🪑 Iltimos, kishi sonini tanlang:", {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🙋‍♂️ 1 kishilik", callback_data: "seats_1" }, { text: "👥 2 kishilik", callback_data: "seats_2" }],
                    [{ text: "👨‍👩‍👦 3 kishilik", callback_data: "seats_3" }, { text: "👨‍👩‍👧‍👦 4 kishilik", callback_data: "seats_4" }],
                    [{ text: "🤝 5 kishilik", callback_data: "seats_5" }, { text: "🎉 6+ kishilik", callback_data: "seats_6" }]
                ]
            }
        });
    }

    if (data.startsWith("seats_")) {
        const soni = data.replace("seats_", "");
        userStates[chatId].kishiSoni = soni === "6" ? "6+ kishi" : `${soni} kishi`;
        userStates[chatId].step = "waiting_for_phone_joy";

        bot.sendMessage(chatId, `🪑 ${userStates[chatId].kishiSoni} tanlandi.\n\n📞 Iltimos, pastdagi tugma orqali telefon raqamingizni yuboring yoki qo'lda kiriting:`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    if (data === "clear_cart") {
        userStates[chatId].savat = [];
        userStates[chatId].step = "idle";
        bot.answerCallbackQuery(query.id, { text: "Savat bo'shatildi" });
        bot.sendMessage(chatId, "🗑 Savatingiz muvaffaqiyatli tozalandi.", {
            reply_markup: { remove_keyboard: true }
        });
    }

    if (data.startsWith("pay_")) {
        const tolovTuri = data === "pay_click" ? "Click" : data === "pay_payme" ? "Payme" : "Naqd pul";
        const orderInfo = userStates[chatId];

        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (e) {
            console.log("Tugmalarni o'chirishda xato:", e.message);
        }

        await bot.sendMessage(chatId, "✅ Rahmat! Buyurtmangiz muvaffaqiyatli qabul qilindi.\n\nTez orada operatorimiz siz bilan bog'lanadi.", { parse_mode: "HTML" });
        
        sendMainMenu(chatId, "🍽 Savoria Bosh Sahifa:");

        let adminLog = `🛍 YANGI TAOM BUYURTMASI!\n\n` +
            `👤 Xaridor: ${user.first_name}\n` +
            `📞 Tel: ${orderInfo.phone || "Kiritilmagan"}\n` +
            `💳 To'lov turi: ${tolovTuri}\n\n` +
            `📋 Taomlar:\n`;

        if (orderInfo.savat && orderInfo.savat.length > 0) {
            orderInfo.savat.forEach((taom, index) => {
                adminLog += `  ${index + 1}. ${taom.nomi} — ${taom.narxi.toLocaleString('uz-UZ')} so'm\n`;
            });
        } else {
            adminLog += `Savat aniqlanmadi (qayta tekshiring)\n`;
        }
        adminLog += `\n💵 Jami summa: ${(orderInfo.jamiSumma || 0).toLocaleString('uz-UZ')} so'm\n`;
        adminLog += `🆔 Xaridor ID: <code>${user.id}</code>`;
        
        bot.sendMessage(ADMIN_ID, adminLog, { parse_mode: "HTML" });
        
        userStates[chatId] = { savat: [], step: "idle", kishiSoni: "Tanlanmagan" };
    }

    bot.answerCallbackQuery(query.id).catch(() => {});
});

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;

    if (msg.text === "/start") return;
    if (!userStates[chatId]) return;

    let phoneNum = "";
    if (msg.contact) {
        phoneNum = msg.contact.phone_number;
    } else if (msg.text) {
        phoneNum = msg.text;
    } else {
        return;
    }

    if (userStates[chatId].step === "waiting_for_phone_joy") {
        userStates[chatId].phone = phoneNum;
        
        await bot.sendMessage(chatId, "✅ Rahmat! Joyingiz muvaffaqiyatli band qilindi.\n\nSizni restoranimizda kutib qolamiz!", { 
            parse_mode: "HTML",
            reply_markup: { remove_keyboard: true } 
        });
        
        sendMainMenu(chatId, "🍽 Savoria Bosh Sahifa:");

        let adminLog = `🪑 YANGI JOY BAND QILINDI!\n\n` +
            `👤 Mijoz: ${user.first_name}\n` +
            `🪑 Kishi soni: ${userStates[chatId].kishiSoni}\n` +
            `📞 Tel: ${phoneNum}\n` +
            `🆔 ID: <code>${user.id}</code>`;
            
        bot.sendMessage(ADMIN_ID, adminLog, { parse_mode: "HTML" });
        userStates[chatId] = { savat: [], step: "idle", kishiSoni: "Tanlanmagan" };
    } 
    else if (userStates[chatId].step === "waiting_for_phone_ovqat") {
        userStates[chatId].phone = phoneNum;
        userStates[chatId].step = "waiting_for_payment";

        bot.sendMessage(chatId, "💳 To'lov usulini tanlang:", {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Click", callback_data: "pay_click" }, { text: "🔵 Payme", callback_data: "pay_payme" }],
                    [{ text: "💵 Naqd pul (Kuryerga)", callback_data: "pay_naqd" }]
                ]
            }
        });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
    
    const SERVER_URL = process.env.SERVER_URL;
    if (SERVER_URL) {
        try {
            await bot.setWebHook(`${SERVER_URL}/bot${token}`);
            console.log(`🚀 Webhook muvaffaqiyatli o'rnatildi: ${SERVER_URL}/bot${token}`);
        } catch (error) {
            console.log("Webhook o'rnatishda xato:", error.message);
        }
    } else {
        console.log("⚠️ DIQQAT: Render Dashboard-da SERVER_URL o'rnatilmagan!");
    }
});
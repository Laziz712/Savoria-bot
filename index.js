require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

/* ===================== SOZLAMALAR ===================== */
const TOKEN = process.env.BOT_TOKEN;
// Bir nechta admin bo'lsa: ADMIN_ID=111,222
const ADMIN_IDS = (process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const SERVER_URL = process.env.SERVER_URL;
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './savoria.db';

if (!TOKEN || ADMIN_IDS.length === 0) {
    console.error('❌ BOT_TOKEN va ADMIN_ID .env faylida (yoki Render Environment) bo\'lishi shart!');
    process.exit(1);
}

const RESTAURANT = {
    name: 'Savoria Restaurant',
    site: 'https://savoria-restaurant.uz',
    instagram: 'https://www.instagram.com/shavkatovv.o07/',
    telegram: '@lazizshavkatov712',
    phones: ['+998 71 271 07 82', '+998 71 345 07 82', '+998 71 954 07 82'],
    hours: 'Du–Pay: 11:00–22:00\nJu–Sha: 11:00–23:00\nYak: 11:00–21:00',
    lat: 41.311081,
    lng: 69.240562
};

// Bron qilish mumkin bo'lgan vaqtlar
const TIMES = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const BOOKING_DAYS = 7;

// Narxlarni o'zingizga moslab o'zgartiring (so'm)
const TAOMLAR = [
    { id: 'margarita', nomi: '🍕 Margarita Pizza', narxi: 65000, rasm: 'https://i.pinimg.com/736x/76/ce/18/76ce18a00bda94201875548caaf90876.jpg' },
    { id: 'pepperoni', nomi: '🍕 Pepperoni Pizza', narxi: 75000, rasm: 'https://i.pinimg.com/1200x/4d/a7/3f/4da73f313deef52c2373795a970b4082.jpg' },
    { id: 'cheeseburger', nomi: '🍔 Cheeseburger', narxi: 35000, rasm: 'https://i.pinimg.com/736x/37/00/ef/3700ef80f448d2a59dd80a78debce0c6.jpg' },
    { id: 'pasta', nomi: '🍝 Gourmet Pasta', narxi: 95000, rasm: encodeURI('https://savoria-restaurant.uz/img/pasta img.jpg') },
    { id: 'salmon', nomi: '🐟 Grilled Salmon', narxi: 125000, rasm: encodeURI('https://savoria-restaurant.uz/img/grilled salomon img.jpg') },
    { id: 'salad', nomi: '🥗 Fresh Garden Salad', narxi: 60000, rasm: encodeURI('https://savoria-restaurant.uz/img/fresh garden img.jpg') },
    { id: 'dessert', nomi: '🍫 Chocolate Delight', narxi: 55000, rasm: encodeURI('https://savoria-restaurant.uz/img/chocolate delight img.jpg') }
];

/* ===================== BAZA (SQLite) ===================== */
const db = new sqlite3.Database(DB_PATH);
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));

async function initDb() {
    await run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, first_name TEXT, username TEXT, joined_at TEXT)`);
    await run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, phone TEXT,
        guests TEXT, date TEXT, time TEXT, status TEXT DEFAULT 'pending', created_at TEXT)`);
}

/* ===================== YORDAMCHI FUNKSIYALAR ===================== */
const bot = new TelegramBot(TOKEN, { polling: false });
const userStates = {};

const isAdmin = id => ADMIN_IDS.includes(String(id));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = n => `${Number(n).toLocaleString('uz-UZ')} so'm`;
const newState = () => ({ cart: [], step: 'idle', res: {}, phone: null });
const getState = id => (userStates[id] ||= newState());

// Toshkent vaqti (UTC+5)
function tashkentNow() { return new Date(Date.now() + 5 * 3600 * 1000); }
function ymd(d) { return d.toISOString().slice(0, 10); }
function prettyDate(iso) { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }
const WEEKDAYS = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];

async function notifyAdmins(text, options = {}) {
    for (const id of ADMIN_IDS) {
        try { await bot.sendMessage(id, text, { parse_mode: 'HTML', ...options }); }
        catch (e) { console.error(`Adminga (${id}) xabar yuborilmadi:`, e.message); }
    }
}

const removeKb = { remove_keyboard: true };
const phoneKb = {
    keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }]],
    resize_keyboard: true, one_time_keyboard: true
};
const validPhone = p => /^\+?\d[\d\s\-()]{7,17}$/.test(p.trim());

function mainMenu(chatId, text) {
    return bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📜 Rasmli Menyu', callback_data: 'menu' }],
                [{ text: '🪑 Joy bron qilish', callback_data: 'book' }, { text: '📋 Bronlarim', callback_data: 'my_res' }],
                [{ text: '🛒 Savat', callback_data: 'cart' }],
                [{ text: '📍 Manzil', callback_data: 'loc' }, { text: '📞 Aloqa', callback_data: 'contact' }],
                [{ text: '🌐 Sayt', url: RESTAURANT.site }, { text: '📸 Instagram', url: RESTAURANT.instagram }]
            ]
        }
    });
}

// Xabarni tahrirlash (xato bo'lsa yangi yuborish)
async function editOrSend(query, text, kb) {
    const opts = { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: kb };
    try { await bot.editMessageText(text, opts); }
    catch (e) { await bot.sendMessage(query.message.chat.id, text, { parse_mode: 'HTML', reply_markup: kb }); }
}

/* ===================== EXPRESS ===================== */
const app = express();
app.use(express.json());
app.post(`/bot${TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('Savoria Bot Status: Active'));

/* ===================== /start ===================== */
bot.onText(/^\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    userStates[chatId] = newState();

    const exists = await get('SELECT id FROM users WHERE id = ?', [user.id]);
    if (!exists) {
        await run('INSERT INTO users (id, first_name, username, joined_at) VALUES (?,?,?,?)',
            [user.id, user.first_name, user.username || null, new Date().toISOString()]);
        const total = (await get('SELECT COUNT(*) AS c FROM users')).c;
        const time = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
        await notifyAdmins(
            `🔔 <b>Yangi foydalanuvchi!</b>\n\n👤 Ism: ${esc(user.first_name)}\n🆔 ID: <code>${user.id}</code>\n` +
            `🔗 Nik: ${user.username ? '@' + esc(user.username) : 'mavjud emas'}\n⏰ Vaqt: ${time}\n📈 Jami: ${total}-ta`
        );
    }
    mainMenu(chatId, `Assalomu alaykum, ${esc(user.first_name)}!\n\n🍽 <b>${RESTAURANT.name}</b> botiga xush kelibsiz!`);
});

/* ===================== ADMIN BUYRUQLARI ===================== */
bot.onText(/^\/stats/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    const users = (await get('SELECT COUNT(*) AS c FROM users')).c;
    const pending = (await get(`SELECT COUNT(*) AS c FROM reservations WHERE status='pending'`)).c;
    const total = (await get('SELECT COUNT(*) AS c FROM reservations')).c;
    bot.sendMessage(msg.chat.id, `📊 <b>Statistika</b>\n\n👥 Foydalanuvchilar: ${users}\n🪑 Jami bronlar: ${total}\n⏳ Kutilayotgan: ${pending}`, { parse_mode: 'HTML' });
});

bot.onText(/^\/bronlar/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;
    const rows = await all(
        `SELECT * FROM reservations WHERE date >= ? AND status != 'rejected' AND status != 'cancelled' ORDER BY date, time LIMIT 30`,
        [ymd(tashkentNow())]);
    if (!rows.length) return bot.sendMessage(msg.chat.id, 'Yaqin bronlar yo\'q.');
    const icon = { pending: '⏳', confirmed: '✅' };
    const text = rows.map(r =>
        `${icon[r.status] || ''} <b>#${r.id}</b> ${prettyDate(r.date)} ${r.time} — ${esc(r.name)}, ${esc(r.guests)}, ${esc(r.phone)}`).join('\n');
    bot.sendMessage(msg.chat.id, `📋 <b>Yaqin bronlar:</b>\n\n${text}`, { parse_mode: 'HTML' });
});

/* ===================== CALLBACKLAR ===================== */
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const user = query.from;
    const st = getState(chatId);
    let answered = false;
    const answer = (text, alert = false) => {
        answered = true;
        return bot.answerCallbackQuery(query.id, text ? { text, show_alert: alert } : {}).catch(() => {});
    };

    try {
        /* ---------- Admin: bronni tasdiqlash / rad etish ---------- */
        if (data.startsWith('adm_')) {
            if (!isAdmin(user.id)) return answer('Bu tugma faqat admin uchun!', true);
            const [, action, idStr] = data.split('_');
            const r = await get('SELECT * FROM reservations WHERE id = ?', [Number(idStr)]);
            if (!r) return answer('Bron topilmadi');
            if (r.status !== 'pending') return answer(`Bu bron allaqachon: ${r.status}`);

            const confirmed = action === 'ok';
            await run('UPDATE reservations SET status = ? WHERE id = ?', [confirmed ? 'confirmed' : 'rejected', r.id]);
            await answer(confirmed ? 'Tasdiqlandi ✅' : 'Rad etildi ❌');

            const label = confirmed ? '✅ TASDIQLANDI' : '❌ RAD ETILDI';
            try {
                await bot.editMessageText(`${query.message.text}\n\n<b>${label}</b> (${esc(user.first_name)})`, {
                    chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML'
                });
            } catch (e) { /* e'tiborsiz */ }

            const userText = confirmed
                ? `✅ <b>Broningiz tasdiqlandi!</b>\n\n🆔 Bron #${r.id}\n📅 ${prettyDate(r.date)}  ⏰ ${r.time}\n👥 ${esc(r.guests)}\n\nSizni kutib qolamiz! 🍽`
                : `❌ Afsuski, <b>#${r.id}</b> raqamli broningiz tasdiqlanmadi.\n\nBoshqa vaqtni tanlab ko'ring yoki biz bilan bog'laning: ${RESTAURANT.phones[0]}`;
            bot.sendMessage(r.user_id, userText, { parse_mode: 'HTML' }).catch(() => {});
            return;
        }

        /* ---------- Menyu ---------- */
        if (data === 'menu') {
            await answer();
            await bot.sendMessage(chatId, '📋 <b>Savoria taomlari</b>\nSavatga qo\'shish uchun tugmani bosing:', { parse_mode: 'HTML' });
            for (const t of TAOMLAR) {
                const caption = `${t.nomi}\n\n💰 Narxi: ${money(t.narxi)}`;
                const kb = { inline_keyboard: [[{ text: '📥 Savatga qo\'shish', callback_data: `buy_${t.id}` }]] };
                try { await bot.sendPhoto(chatId, t.rasm, { caption, reply_markup: kb }); }
                catch (e) { await bot.sendMessage(chatId, caption, { reply_markup: kb }); }
            }
            return;
        }

        if (data.startsWith('buy_')) {
            const taom = TAOMLAR.find(t => t.id === data.slice(4));
            if (!taom) return answer();
            st.cart.push(taom.id);
            return answer(`📥 ${taom.nomi} savatga qo'shildi! (Savatda: ${st.cart.length} ta)`);
        }

        /* ---------- Savat ---------- */
        if (data === 'cart') {
            await answer();
            if (!st.cart.length) return bot.sendMessage(chatId, '🛒 Savatingiz bo\'sh. Menyudan taom tanlang.');
            const counts = {};
            st.cart.forEach(id => (counts[id] = (counts[id] || 0) + 1));
            let total = 0;
            let text = '🛒 <b>Siz tanlagan taomlar:</b>\n\n';
            Object.entries(counts).forEach(([id, n], i) => {
                const t = TAOMLAR.find(x => x.id === id);
                total += t.narxi * n;
                text += `${i + 1}. ${t.nomi} × ${n} — ${money(t.narxi * n)}\n`;
            });
            text += `\n💵 <b>Jami: ${money(total)}</b>`;
            st.total = total;
            return bot.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Buyurtmani rasmiylashtirish', callback_data: 'checkout' }],
                        [{ text: '🗑 Savatni bo\'shatish', callback_data: 'clear' }]
                    ]
                }
            });
        }

        if (data === 'clear') {
            st.cart = []; st.step = 'idle';
            await answer('Savat bo\'shatildi');
            return bot.sendMessage(chatId, '🗑 Savat tozalandi.', { reply_markup: removeKb });
        }

        if (data === 'checkout') {
            if (!st.cart.length) return answer('Savat bo\'sh!', true);
            await answer();
            st.step = 'food_phone';
            return bot.sendMessage(chatId, '📞 Telefon raqamingizni yuboring (tugma orqali yoki qo\'lda, masalan +998901234567):', { reply_markup: phoneKb });
        }

        if (data.startsWith('pay_')) {
            await answer();
            if (st.step !== 'food_pay' || !st.cart.length) return;
            const tolov = { pay_click: 'Click', pay_payme: 'Payme', pay_naqd: 'Naqd pul' }[data] || 'Noma\'lum';
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }); } catch (e) { }

            const orderNo = Date.now().toString().slice(-6);
            let adminLog = `🛍 <b>YANGI TAOM BUYURTMASI #${orderNo}</b>\n\n👤 Xaridor: ${esc(user.first_name)}` +
                (user.username ? ` (@${esc(user.username)})` : '') +
                `\n📞 Tel: ${esc(st.phone)}\n💳 To'lov: ${tolov}\n\n📋 Taomlar:\n`;
            const counts = {};
            st.cart.forEach(id => (counts[id] = (counts[id] || 0) + 1));
            let total = 0;
            Object.entries(counts).forEach(([id, n], i) => {
                const t = TAOMLAR.find(x => x.id === id);
                total += t.narxi * n;
                adminLog += `  ${i + 1}. ${t.nomi} × ${n} — ${money(t.narxi * n)}\n`;
            });
            adminLog += `\n💵 <b>Jami: ${money(total)}</b>\n🆔 ID: <code>${user.id}</code>`;
            await notifyAdmins(adminLog);

            userStates[chatId] = newState();
            await bot.sendMessage(chatId, `✅ Rahmat! Buyurtmangiz <b>#${orderNo}</b> qabul qilindi.\nTez orada operatorimiz siz bilan bog'lanadi.`, { parse_mode: 'HTML' });
            return mainMenu(chatId, '🍽 Bosh sahifa:');
        }

        /* ---------- JOY BRON QILISH ---------- */
        if (data === 'book') {
            await answer();
            st.step = 'idle'; st.res = {};
            return bot.sendMessage(chatId, '🪑 <b>Joy bron qilish</b>\n\nNecha kishi bo\'lasiz?', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '1 kishi', callback_data: 'g_1 kishi' }, { text: '2 kishi', callback_data: 'g_2 kishi' }, { text: '3 kishi', callback_data: 'g_3 kishi' }],
                        [{ text: '4 kishi', callback_data: 'g_4 kishi' }, { text: '5 kishi', callback_data: 'g_5 kishi' }, { text: '6 kishi', callback_data: 'g_6 kishi' }],
                        [{ text: '7+ kishi', callback_data: 'g_7+ kishi' }]
                    ]
                }
            });
        }

        if (data.startsWith('g_')) {
            await answer();
            st.res = { guests: data.slice(2) };
            const now = tashkentNow();
            const rows = [];
            let row = [];
            for (let i = 0; i < BOOKING_DAYS; i++) {
                const d = new Date(now.getTime() + i * 86400000);
                const label = i === 0 ? 'Bugun' : i === 1 ? 'Ertaga' : `${WEEKDAYS[d.getUTCDay()]} ${prettyDate(ymd(d)).slice(0, 5)}`;
                row.push({ text: label, callback_data: `d_${ymd(d)}` });
                if (row.length === 2) { rows.push(row); row = []; }
            }
            if (row.length) rows.push(row);
            return editOrSend(query, `👥 ${esc(st.res.guests)}\n\n📅 Qaysi kunga?`, { inline_keyboard: rows });
        }

        if (data.startsWith('d_')) {
            await answer();
            st.res.date = data.slice(2);
            const now = tashkentNow();
            const isToday = st.res.date === ymd(now);
            const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
            const free = TIMES.filter(t => {
                if (!isToday) return true;
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m > nowMin + 30;
            });
            if (!free.length) {
                return editOrSend(query, '😔 Bugun uchun bo\'sh vaqt qolmadi. Boshqa kunni tanlang:', {
                    inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: `g_${st.res.guests}` }]]
                });
            }
            const rows = [];
            for (let i = 0; i < free.length; i += 3) {
                rows.push(free.slice(i, i + 3).map(t => ({ text: t, callback_data: `t_${t}` })));
            }
            rows.push([{ text: '⬅️ Orqaga', callback_data: `g_${st.res.guests}` }]);
            return editOrSend(query, `👥 ${esc(st.res.guests)}\n📅 ${prettyDate(st.res.date)}\n\n⏰ Qaysi vaqtga?`, { inline_keyboard: rows });
        }

        if (data.startsWith('t_')) {
            await answer();
            st.res.time = data.slice(2);
            st.step = 'res_name';
            await editOrSend(query, `👥 ${esc(st.res.guests)}\n📅 ${prettyDate(st.res.date)}\n⏰ ${st.res.time}`, undefined);
            return bot.sendMessage(chatId, '✍️ Ismingizni yozing (bron kimning nomiga bo\'lsin?):', {
                reply_markup: { keyboard: [[{ text: user.first_name }]], resize_keyboard: true, one_time_keyboard: true }
            });
        }

        if (data === 'res_confirm') {
            await answer();
            const r = st.res;
            if (st.step !== 'res_confirm' || !r.time || !r.phone) return;
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }); } catch (e) { }

            const ins = await run(
                'INSERT INTO reservations (user_id, name, phone, guests, date, time, created_at) VALUES (?,?,?,?,?,?,?)',
                [user.id, r.name, r.phone, r.guests, r.date, r.time, new Date().toISOString()]);
            const id = ins.lastID;

            // ADMINGA XABAR
            await notifyAdmins(
                `🪑 <b>YANGI JOY BRON QILINDI! #${id}</b>\n\n` +
                `👤 Ism: ${esc(r.name)}\n📞 Tel: ${esc(r.phone)}\n👥 Kishi soni: ${esc(r.guests)}\n` +
                `📅 Sana: <b>${prettyDate(r.date)}</b>\n⏰ Vaqt: <b>${r.time}</b>\n\n` +
                `💬 Telegram: <a href="tg://user?id=${user.id}">${esc(user.first_name)}</a>` +
                (user.username ? ` (@${esc(user.username)})` : '') + `\n🆔 <code>${user.id}</code>`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Tasdiqlash', callback_data: `adm_ok_${id}` },
                            { text: '❌ Rad etish', callback_data: `adm_no_${id}` }
                        ]]
                    }
                });

            userStates[chatId] = newState();
            await bot.sendMessage(chatId,
                `✅ <b>So'rovingiz qabul qilindi!</b>\n\n🆔 Bron #${id}\n📅 ${prettyDate(r.date)}  ⏰ ${r.time}\n👥 ${esc(r.guests)}\n\n` +
                `Administrator tasdiqlagach, sizga xabar yuboramiz.`, { parse_mode: 'HTML' });
            return mainMenu(chatId, '🍽 Bosh sahifa:');
        }

        if (data === 'res_cancel') {
            await answer('Bekor qilindi');
            userStates[chatId] = newState();
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }); } catch (e) { }
            return mainMenu(chatId, 'Bron bekor qilindi. 🍽 Bosh sahifa:');
        }

        /* ---------- Bronlarim ---------- */
        if (data === 'my_res') {
            await answer();
            const rows = await all(
                `SELECT * FROM reservations WHERE user_id = ? AND date >= ? AND status IN ('pending','confirmed') ORDER BY date, time`,
                [user.id, ymd(tashkentNow())]);
            if (!rows.length) return bot.sendMessage(chatId, 'Sizda faol bronlar yo\'q.');
            for (const r of rows) {
                const status = r.status === 'confirmed' ? '✅ Tasdiqlangan' : '⏳ Kutilmoqda';
                await bot.sendMessage(chatId,
                    `🆔 <b>Bron #${r.id}</b>\n📅 ${prettyDate(r.date)}  ⏰ ${r.time}\n👥 ${esc(r.guests)}\n${status}`, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[{ text: '🚫 Bekor qilish', callback_data: `ucancel_${r.id}` }]] }
                });
            }
            return;
        }

        if (data.startsWith('ucancel_')) {
            const id = Number(data.slice(8));
            const r = await get('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [id, user.id]);
            if (!r || !['pending', 'confirmed'].includes(r.status)) return answer('Bu bronni bekor qilib bo\'lmaydi', true);
            await run(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`, [id]);
            await answer('Bron bekor qilindi');
            try { await bot.editMessageText(`🚫 Bron #${id} bekor qilindi.`, { chat_id: chatId, message_id: query.message.message_id }); } catch (e) { }
            await notifyAdmins(`🚫 <b>BRON BEKOR QILINDI #${id}</b>\n\n👤 ${esc(r.name)}\n📞 ${esc(r.phone)}\n📅 ${prettyDate(r.date)} ⏰ ${r.time}\n👥 ${esc(r.guests)}`);
            return;
        }

        /* ---------- Manzil / Aloqa ---------- */
        if (data === 'loc') {
            await answer();
            await bot.sendMessage(chatId, `📍 <b>${RESTAURANT.name}</b> manzili:\n\n🕐 Ish vaqti:\n${RESTAURANT.hours}`, { parse_mode: 'HTML' });
            return bot.sendLocation(chatId, RESTAURANT.lat, RESTAURANT.lng);
        }

        if (data === 'contact') {
            await answer();
            return bot.sendMessage(chatId,
                `📞 <b>Aloqa</b>\n\n💬 Telegram: ${RESTAURANT.telegram}\n☎️ ${RESTAURANT.phones.join('\n☎️ ')}`, { parse_mode: 'HTML' });
        }
    } catch (err) {
        console.error('Callback xatosi:', err);
    } finally {
        if (!answered) bot.answerCallbackQuery(query.id).catch(() => {});
    }
});

/* ===================== MATNLI XABARLAR ===================== */
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    const user = msg.from;
    const st = userStates[chatId];
    if (!st || st.step === 'idle') return;

    const text = (msg.text || '').trim();

    try {
        /* --- Bron: ism --- */
        if (st.step === 'res_name') {
            if (!text || text.length < 2 || text.length > 50) return bot.sendMessage(chatId, 'Iltimos, ismingizni to\'g\'ri yozing.');
            st.res.name = text;
            st.step = 'res_phone';
            return bot.sendMessage(chatId, '📞 Telefon raqamingizni yuboring (tugma orqali yoki qo\'lda, masalan +998901234567):', { reply_markup: phoneKb });
        }

        /* --- Telefon (bron yoki taom) --- */
        if (st.step === 'res_phone' || st.step === 'food_phone') {
            const phone = msg.contact ? msg.contact.phone_number : text;
            if (!phone || !validPhone(phone)) {
                return bot.sendMessage(chatId, '⚠️ Raqam noto\'g\'ri. Masalan: +998901234567');
            }
            const normalized = phone.startsWith('+') ? phone : (/^\d{12}$/.test(phone) ? `+${phone}` : phone);

            if (st.step === 'res_phone') {
                st.res.phone = normalized;
                st.step = 'res_confirm';
                await bot.sendMessage(chatId, '👍 Raqam qabul qilindi.', { reply_markup: removeKb });
                return bot.sendMessage(chatId,
                    `📋 <b>Bronni tekshiring:</b>\n\n👤 ${esc(st.res.name)}\n📞 ${esc(st.res.phone)}\n👥 ${esc(st.res.guests)}\n` +
                    `📅 ${prettyDate(st.res.date)}\n⏰ ${st.res.time}\n\nHammasi to'g'rimi?`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Tasdiqlash', callback_data: 'res_confirm' },
                            { text: '❌ Bekor qilish', callback_data: 'res_cancel' }
                        ]]
                    }
                });
            }

            // food_phone
            st.phone = normalized;
            st.step = 'food_pay';
            await bot.sendMessage(chatId, '👍 Raqam qabul qilindi.', { reply_markup: removeKb });
            return bot.sendMessage(chatId, '💳 To\'lov usulini tanlang:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🟢 Click', callback_data: 'pay_click' }, { text: '🔵 Payme', callback_data: 'pay_payme' }],
                        [{ text: '💵 Naqd pul (Kuryerga)', callback_data: 'pay_naqd' }]
                    ]
                }
            });
        }
    } catch (err) {
        console.error('Message xatosi:', err);
    }
});

bot.on('polling_error', e => console.error('Polling xatosi:', e.message));

/* ===================== ISHGA TUSHIRISH ===================== */
(async () => {
    await initDb();
    app.listen(PORT, async () => {
        console.log(`Server ${PORT}-portda ishlamoqda`);
        if (SERVER_URL) {
            try {
                await bot.setWebHook(`${SERVER_URL}/bot${TOKEN}`);
                console.log('🚀 Webhook o\'rnatildi');
            } catch (e) { console.error('Webhook xatosi:', e.message); }
        } else {
            // SERVER_URL yo'q bo'lsa (lokal test) — polling rejimi
            await bot.deleteWebHook().catch(() => {});
            bot.startPolling();
            console.log('🔄 Polling rejimida ishlamoqda (SERVER_URL berilmagan)');
        }
    });
})();

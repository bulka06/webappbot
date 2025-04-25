require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const db = require('./order');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;
const adminChatId = process.env.ADMIN_CHAT_ID; // У .env файл ОБОВ'ЯЗКОВО додай цей рядок: ADMIN_CHAT_ID=123456789

const bot = new TelegramBot(token, { polling: true });

const app = express();
app.use(cors());
app.use(express.json());

/* === ТЕЛЕГРАМ БОТ === */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    await bot.sendMessage(chatId, 'Нижче є кнопка для замовлення:', {
      reply_markup: {
        keyboard: [
          [{ text: '🛍️ Зробити замовлення', web_app: { url: webAppUrl + 'form' } }]
        ],
        resize_keyboard: true, // Щоб кнопка була акуратна
        one_time_keyboard: true // Приховається після натискання
      }
    });

    await bot.sendMessage(chatId, 'Або натисніть кнопку нижче:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Відкрити меню', web_app: { url: webAppUrl } }]
        ]
      }
    });
  }
});

// Обробка даних, якщо відправлено через Telegram WebApp
bot.on('web_app_data', async (msg) => {
  const chatId = msg.chat.id;
  const data = JSON.parse(msg.web_app_data.data);

  try {
    await saveOrder(chatId, data);

    if (adminChatId) {
      await bot.sendMessage(
        adminChatId,
        formatOrderMessage(data)
      );
    }

    await bot.sendMessage(chatId, '✅ Ваше замовлення прийнято! Очікуйте дзвінка.');
  } catch (err) {
    console.error('❌ Помилка при обробці web_app_data:', err);
    await bot.sendMessage(chatId, '⚠️ Сталася помилка при оформленні замовлення.');
  }
});

/* === HTTP API для фронтенду === */
app.post('/api/order', async (req, res) => {
  const data = req.body;

  try {
    await saveOrder(data.chatId || null, data);

    if (adminChatId) {
      await bot.sendMessage(
        adminChatId,
        formatOrderMessage(data)
      );
    }

    res.status(200).json({ message: 'Замовлення прийнято' });
  } catch (err) {
    console.error('❌ API помилка:', err);
    res.status(500).json({ message: 'Помилка при збереженні замовлення' });
  }
});

/* === ФУНКЦІЯ ЗБЕРЕЖЕННЯ ЗАМОВЛЕННЯ === */
async function saveOrder(chatId, data) {
  await db.query(
    `INSERT INTO orders (chat_id, name, lastname, phone, city, street, email, time, payment_method, items, total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      chatId,
      data.name,
      data.lastname,
      data.phone,
      data.city,
      data.street,
      data.email,
      data.time,
      data.paymentMethod,
      JSON.stringify(data.baskItems),
      data.total
    ]
  );
}

/* === ФУНКЦІЯ ФОРМУВАННЯ ТЕКСТУ ДЛЯ АДМІНА === */
function formatOrderMessage(data) {
  const items = data.baskItems?.map(item => `🍔 ${item.title} x${item.count}`).join('\n') || 'Без товарів';
  return `🛒 НОВЕ ЗАМОВЛЕННЯ

👤 Клієнт: ${data.name} ${data.lastname}
📱 Телефон: ${data.phone}
🏙️ Адреса: ${data.city}, ${data.street}
📧 Email: ${data.email || 'немає'}
🕐 Час доставки: ${data.time}
💳 Оплата: ${data.paymentMethod}
💰 Сума: ${data.total} грн

Замовлені товари:
${items}`;
}

/* === СТАРТ СЕРВЕРА === */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${PORT}`);
});

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ==== Telegram Bot ====
const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;
const adminChatId = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(token);
const app = express();

// ==== Middleware ====
app.use(cors());
app.use(express.json());

// ==== SSL сертифікат ====


// ==== Підключення до CockroachDB ====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
  }
});

// ==== Створення таблиці, якщо ще не існує ====
(async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      lastname TEXT,
      phone TEXT,
      city TEXT,
      street TEXT,
      email TEXT,
      delivery_time TEXT,
      payment_method TEXT,
      total NUMERIC,
      items JSONB,
      created_at TIMESTAMP DEFAULT now()
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log('✅ Таблиця orders готова');
  } catch (err) {
    console.error('❌ Помилка при створенні таблиці:', err);
  }
})();

// ==== Функція збереження замовлення ====
const insertOrder = async (orderData) => {
  const query = `
    INSERT INTO orders
    (name, lastname, phone, city, street, email, delivery_time, payment_method, total, items)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;
  const values = [
    orderData.name,
    orderData.lastname,
    orderData.phone,
    orderData.city,
    orderData.street,
    orderData.email,
    orderData.time,
    orderData.paymentMethod,
    orderData.total,
    JSON.stringify(orderData.baskItems)
  ];
  await pool.query(query, values);
};

// ==== Telegram WebApp: Отримання замовлення ====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    await bot.sendMessage(chatId, 'Або відкрий магазин прямо зараз:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Відкрити меню', web_app: { url: webAppUrl } }]
        ]
      }
    });
  }

  if (msg?.web_app_data?.data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      console.log('✅ Отримано з WebApp:', data);

      await insertOrder(data);

      await bot.sendMessage(chatId, '✅ Дані отримано!');
      await bot.sendMessage(chatId, `Імʼя: ${data.name}`);
      await bot.sendMessage(chatId, `Прізвище: ${data.lastname}`);
      await bot.sendMessage(chatId, `Телефон: ${data.phone}`);
      await bot.sendMessage(chatId, `Адреса: ${data.city}, ${data.street}`);
      await bot.sendMessage(chatId, `Email: ${data.email}`);
      await bot.sendMessage(chatId, `Час: ${data.time}`);
      await bot.sendMessage(chatId, `Оплата: ${data.paymentMethod}`);
      await bot.sendMessage(chatId, `Сума: ${data.total} грн`);

      const items = data.baskItems?.map(item => `🍔 ${item.title} x${item.quantity}`).join('\n') || 'Без товарів';
      await bot.sendMessage(chatId, `Товари:\n${items}`);
    } catch (err) {
      console.error('❌ Помилка при обробці WebApp даних:', err);
      await bot.sendMessage(chatId, '⚠️ Сталася помилка при обробці даних.');
    }
  }
});

const db = require('./db');
// ==== Обробник POST-запиту з WebApp форми ====
app.post('/order', async (req, res) => {
  try {
    const data = req.body;
    console.log('📦 Отримано замовлення з форми:', data);

    const {
      name, lastname, phone, city, street,
      email, time, paymentMethod, total, baskItems
    } = data;

    // Зберігаємо замовлення в базу
    await db.query(`
      INSERT INTO orders (
        name, lastname, phone, city, street,
        email, delivery_time, payment_method, total, items
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      name, lastname, phone, city, street,
      email, time, paymentMethod, total,
      JSON.stringify(baskItems)
    ]);

    // Надсилаємо адміну
    const message = `
📥 НОВЕ ЗАМОВЛЕННЯ
👤 ${name} ${lastname}
📞 ${phone}
🏙️ ${city}, ${street}
📧 ${email}
🕒 ${time}
💳 ${paymentMethod}
💰 ${total} грн
🛒 ${baskItems?.map(item => `• ${item.title} x${item.quantity}`).join('\n') || '—'}
    `;

    await bot.sendMessage(process.env.ADMIN_CHAT_ID, message);

    res.status(200).send({ success: true });

  } catch (err) {
    console.error('❌ Помилка при збереженні замовлення:', err);
    res.status(500).send({ error: 'Помилка сервера' });
  }
});

// ==== Запуск сервера ====
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Сервер працює на порту ${PORT}`);

  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    await bot.setWebHook(`${url}/bot${token}`);
  }
});
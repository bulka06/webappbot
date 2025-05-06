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

// Використовуємо polling замість webhook для надійнішої роботи
const bot = new TelegramBot(token, { polling: true });

const app = express();

// ==== Middleware ====
app.use(cors());
app.use(express.json());

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
    RETURNING id
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
  const result = await pool.query(query, values);
  return result.rows[0].id;
};

// ==== Telegram WebApp: Обробка команд ====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`✅ Отримано команду /start від користувача ${chatId}`);
  
  try {
    await bot.sendMessage(chatId, 'Вітаємо ! 🛍️');
    await bot.sendMessage(chatId, 'Зробити замовлення їжі:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Відкрити меню', web_app: { url: webAppUrl } }]
        ]
      }
    });
    console.log(`✅ Відправлено повідомлення з кнопкою користувачу ${chatId}`);
  } catch (error) {
    console.error('❌ Помилка при відправці повідомлення з кнопкою:', error);
  }
});

// ==== Обробка даних з веб-додатку ====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  if (msg?.web_app_data?.data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      console.log('✅ Отримано з WebApp:', data);

      const orderId = await insertOrder(data);

      await bot.sendMessage(chatId, '✅ Дякуємо за замовлення!');
      await bot.sendMessage(chatId, `🆔 Номер замовлення: ${orderId}`);
      await bot.sendMessage(chatId, `👤 ${data.name} ${data.lastname}`);
      await bot.sendMessage(chatId, `📞 Телефон: ${data.phone}`);
      await bot.sendMessage(chatId, `🏙️ Адреса: ${data.city}, ${data.street}`);
      await bot.sendMessage(chatId, `📧 Email: ${data.email}`);
      await bot.sendMessage(chatId, `🕒 Час доставки: ${data.time}`);
      await bot.sendMessage(chatId, `💳 Оплата: ${data.paymentMethod}`);
      await bot.sendMessage(chatId, `💰 Сума: ${data.total} грн`);

      const items = data.baskItems?.map(item => `🍔 ${item.title} x${item.quantity}`).join('\n') || 'Без товарів';
      await bot.sendMessage(chatId, `🛒 Товари:\n${items}`);
      
      // Відправка повідомлення адміністратору
      if (adminChatId) {
        const adminMessage = `
📥 НОВЕ ЗАМОВЛЕННЯ
🆔 ${orderId}
👤 ${data.name} ${data.lastname}
📞 ${data.phone}
🏙️ ${data.city}, ${data.street}
📧 ${data.email}
🕒 ${data.time}
💳 ${data.paymentMethod}
💰 ${data.total} грн
🛒 ${data.baskItems?.map(item => `• ${item.title} x${item.quantity}`).join('\n') || '—'}
        `;
        await bot.sendMessage(adminChatId, adminMessage);
      }
    } catch (err) {
      console.error('❌ Помилка при обробці WebApp даних:', err);
      await bot.sendMessage(chatId, '⚠️ Сталася помилка при обробці даних.');
    }
  }
});

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
    const query = `
      INSERT INTO orders (
        name, lastname, phone, city, street,
        email, delivery_time, payment_method, total, items
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `;
    
    const values = [
      name, lastname, phone, city, street,
      email, time, paymentMethod, total,
      JSON.stringify(baskItems)
    ];
    
    const result = await pool.query(query, values);
    const orderId = result.rows[0].id;

    // Надсилаємо повідомлення адміну
    if (adminChatId) {
      const message = `
📥 НОВЕ ЗАМОВЛЕННЯ
🆔 ${orderId}
👤 ${name} ${lastname}
📞 ${phone}
🏙️ ${city}, ${street}
📧 ${email}
🕒 ${time}
💳 ${paymentMethod}
💰 ${total} грн
🛒 ${baskItems?.map(item => `• ${item.title} x${item.quantity}`).join('\n') || '—'}
      `;

      await bot.sendMessage(adminChatId, message);
    }

    res.status(200).send({ success: true, orderId });

  } catch (err) {
    console.error('❌ Помилка при збереженні замовлення:', err);
    res.status(500).send({ error: 'Помилка сервера' });
  }
});

// ==== Запуск сервера ====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер працює на порту ${PORT}`);
  
  // Перевіряємо статус з'єднання бота
  bot.getMe().then(botInfo => {
    console.log(`✅ Бот @${botInfo.username} успішно запущено`);
  }).catch(error => {
    console.error('❌ Помилка  з Telegram APі:', error);
  });
});
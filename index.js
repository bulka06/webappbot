require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

const bot = new TelegramBot(token);
const app = express();

app.use(cors());
app.use(express.json());

// === Webhook обробка повідомлень ===
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === Основна логіка бота ===
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

      await bot.sendMessage(chatId, '✅ Дані отримано!');
      await bot.sendMessage(chatId, `Імʼя: ${data.name}`);
      await bot.sendMessage(chatId, `Прізвище: ${data.lastname}`);
      await bot.sendMessage(chatId, `Телефон: ${data.phone}`);
      await bot.sendMessage(chatId, `Адреса: ${data.city}, ${data.street}`);
      await bot.sendMessage(chatId, `Email: ${data.email}`);
      await bot.sendMessage(chatId, `Час: ${data.time}`);
      await bot.sendMessage(chatId, `Оплата: ${data.paymentMethod}`);
      await bot.sendMessage(chatId, `Сума: ${data.total} грн`);

      const items = data.baskItems?.map(item => `🍔 ${item.title} x${item.count}`).join('\n') || 'Без товарів';
      await bot.sendMessage(chatId, `Товари:\n${items}`);
    } catch (err) {
      console.error('❌ Помилка при обробці WebApp даних:', err);
      await bot.sendMessage(chatId, '⚠️ Сталася помилка при обробці даних.');
    }
  }
});

// === Запуск сервера ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Сервер працює на порту ${PORT}`);

  // === Встановлюємо webhook ===
  const url = process.env.RENDER_EXTERNAL_URL || `https://твій-домен.onrender.com`; // додай цю змінну в Render
  await bot.setWebHook(`${url}/bot${token}`);
});

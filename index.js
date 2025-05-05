require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

const bot = new TelegramBot(token); // без polling
const app = express();

app.use(cors());
app.use(express.json());

// === Обробка повідомлень Telegram ===
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

// === Новий обробник POST /order ===
app.post('/order', async (req, res) => {
  try {
    const data = req.body;
    console.log('📦 Отримано замовлення з форми:', data);

    // (необовʼязково) Надсилаємо адміну в Telegram
    const message = `
📥 НОВЕ ЗАМОВЛЕННЯ
👤 Імʼя: ${data.name} ${data.lastname}
📞 Телефон: ${data.phone}
🏙️ Адреса: ${data.city}, ${data.street}
📧 Email: ${data.email}
🕒 Час доставки: ${data.time}
💳 Оплата: ${data.paymentMethod}
💰 Сума: ${data.total} грн
🛒 Товари:
${data.baskItems?.map(item => `• ${item.title} x${item.quantity}`).join('\n') || '—'}
    `;

    await bot.sendMessage(process.env.ADMIN_CHAT_ID, message);

    res.status(200).send({ success: true });
  } catch (err) {
    console.error('❌ Помилка при обробці замовлення:', err);
    res.status(500).send({ error: 'Помилка сервера' });
  }
});

// === Запуск сервера ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Сервер працює на порту ${PORT}`);

  // === Webhook (для продакшну з Render) ===
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    await bot.setWebHook(`${url}/bot${token}`);
  }
});

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

const bot = new TelegramBot(token, { polling: true });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    await bot.sendMessage(chatId, 'Нижче є кнопка', {
      reply_markup: {
        keyboard: [
          [{
            text: 'Натисни', web_app: { url: webAppUrl + 'form' }
          }]
        ]
      }
    });

    await bot.sendMessage(chatId, 'Нижче є кнопка', {
      reply_markup: {
        inline_keyboard: [
          [{
            text: 'Натисни мене', web_app: { url: webAppUrl }
          }]
        ]
      }
    });

    // приклад запиту до БД
    db.query('SELECT 1 + 2 AS result', (err, results) => {
      if (err) {
        console.error('Помилка запиту:', err);
        return;
      }
      console.log('Результат запиту до БД:', results[0].result);
    });
  }
});

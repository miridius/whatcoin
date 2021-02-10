const { createAzureTelegramWebhook } = require('serverless-telegram');
const MY_CHAT_ID = 60764253;

module.exports = createAzureTelegramWebhook(require('./handler'), MY_CHAT_ID);

const { createAwsTelegramWebhook } = require('serverless-telegram');
const MY_CHAT_ID = 60764253;

exports.webhook = createAwsTelegramWebhook(require('./handler'), MY_CHAT_ID);

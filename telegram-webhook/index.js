const { createAzureTelegramWebhook } = require('serverless-telegram');
const CoinGecko = require('coingecko-api');
const api = new CoinGecko();

const DAVO_CHAT_ID = 60764253;

let debug, info, warn, error;

let _coinsList;
const getCoinsList = async () => {
  if (!_coinsList) {
    info('fetching coins list...');
    _coinsList = (await api.coins.list())?.data?.map((coin) => {
      coin.id = coin.id?.toLowerCase();
      coin.symbol = coin.symbol?.toLowerCase();
      coin.name = coin.name?.toLowerCase();
      return coin;
    });
    info('got', _coinsList?.length, 'coins');
  }
  return _coinsList;
};

const getCurrencyId = async (currency) => {
  currency = currency.toLowerCase();
  debug('searching for', currency);
  let symMatch, nameMatch, idPreMatch, symPreMatch, namePreMatch;
  for (const { id, symbol, name } of await getCoinsList()) {
    if (id === currency) {
      debug('exact match');
      return id;
    } else if (symbol === currency) {
      symMatch = id;
      break; // don't need to keep searching, this is the best type of match
    } else if (name === currency) {
      nameMatch = id;
    } else if (symbol.startsWith(currency)) {
      symPreMatch = id;
    } else if (id.startsWith(currency)) {
      idPreMatch = id;
    } else if (name.startsWith(currency)) {
      namePreMatch = id;
    }
  }
  const id = symMatch || nameMatch || idPreMatch || symPreMatch || namePreMatch;
  debug(id ? `closest match is ${id}` : 'no match found');
  return id;
};

const getPrice = async (currency = 'bitcoin', vs = 'usd') => {
  id = await getCurrencyId(currency);
  if (!id) return `Sorry, I couldn't find ${currency}. Try using the full name`;
  vs = vs.toLowerCase();
  debug('getPrice(', id, vs, ')');
  const res = await api.simple.price({ ids: [id], vs_currencies: [vs] });
  debug('res:', res);
  return res?.data?.[id] && `1 ${id} = ${res.data[id][vs]} ${vs.toUpperCase()}`;
};

module.exports = createAzureTelegramWebhook(async ({ text }, _log) => {
  // set global loggers so we don't need to pass them to every function
  ({ verbose: debug, info, warn, error } = _log);
  // ignore non-text messages and non-commands
  if (!text?.startsWith('/')) return;
  // parse the message into command + args
  const [cmd, ...args] = text.split(/\s+/);
  debug({ cmd, args });
  // route the command to the appropriate handler
  switch (cmd) {
    case '/start':
    case '/usage':
      return 'usage: /price <crypto name or symbol> [<base currency symbol>]';
    case '/price':
      return getPrice(...args);
    default:
      warn(`Unknown command: ${cmd}`);
      return;
  }
}, DAVO_CHAT_ID);

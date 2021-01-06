const { createAzureTelegramWebhook } = require('serverless-telegram');
const CoinGecko = require('coingecko-api');
const api = new CoinGecko();

const DAVO_CHAT_ID = 60764253;

let locale, debug, info, warn;

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
  if (currency === 'bitcoin') return currency;
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

const formatNumber = (num, currency, sigFig = 6) =>
  new Intl.NumberFormat(locale, {
    ...(currency && { style: 'currency', currency, minimumFractionDigits: 0 }),
    ...(num < 10 ** sigFig
      ? { maximumSignificantDigits: sigFig }
      : { maximumFractionDigits: 0 }),
  }).format(num);
const formatPercent = (num) =>
  num == undefined ? '?' : formatNumber(num, undefined, 3) + '%';

const formatPriceData = (data, vs) => {
  const pctH = formatPercent(data.price_change_percentage_1h_in_currency);
  const pctD = formatPercent(data.price_change_percentage_24h_in_currency);
  const pctW = formatPercent(data.price_change_percentage_7d_in_currency);
  const pctM = formatPercent(data.price_change_percentage_30d_in_currency);
  return {
    parse_mode: 'markdown',
    text: `*${data.name} (${data.symbol.toUpperCase()})* in ${vs.toUpperCase()}
Current price:  \`${formatNumber(data.current_price, vs)}\`
h/d/w/m: \`${pctH}\` / \`${pctD}\` / \`${pctW}\` / \`${pctM}\` 
Market cap:  \`${formatNumber(data.market_cap, vs)}\`
24h volume:  \`${formatNumber(data.total_volume, vs)}\`
_(updated ${new Date(data.last_updated).toUTCString()})_`,
  };
};

const getPrice = async (currency = 'bitcoin', vs = 'usd') => {
  const id = await getCurrencyId(currency);
  if (!id) return `Sorry, I couldn't find ${currency}. Try using the full name`;
  vs = vs.toLowerCase();
  debug('getPrice(', id, vs, ')');
  const res = await api.coins.markets({
    ids: id,
    vs_currency: vs,
    price_change_percentage: '1h,24h,7d,30d',
  });
  debug('res:', res);
  return res?.data?.[0] && formatPriceData(res?.data?.[0], vs);
};

module.exports = createAzureTelegramWebhook(
  async ({ text, from: { language_code } = {} }, _log) => {
    // set global loggers & lang so we don't need to pass them to every function
    ({ verbose: debug, info, warn } = _log);
    locale = language_code || 'en';
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
  },
  DAVO_CHAT_ID,
);

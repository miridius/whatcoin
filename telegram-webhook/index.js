const { createAzureTelegramWebhook } = require('serverless-telegram');
const CoinGecko = require('coingecko-api');
const api = new CoinGecko();

const DAVO_CHAT_ID = 60764253;

let locale, debug, info, warn;

let _coinsList;
let _gettingCoinsList = false;
const getCoinsList = async () => {
  while (_gettingCoinsList) await new Promise((r) => setTimeout(r, 10));
  if (!_coinsList) {
    info('fetching coins list...');
    _gettingCoinsList = true;
    _coinsList = (await api.coins.list())?.data?.map((coin) => {
      coin.id = coin.id?.toLowerCase();
      coin.symbol = coin.symbol?.toLowerCase();
      coin.name = coin.name?.toLowerCase();
      return coin;
    });
    _gettingCoinsList = false;
    info('got', _coinsList?.length, 'coins');
  }
  return _coinsList;
};

let _vsCurrencies;
const getVsCurrencies = async () => {
  if (!_vsCurrencies?.size) {
    info('fetching supported vs currencies...');
    _vsCurrencies = new Set((await api.simple.supportedVsCurrencies())?.data);
    info('got', _vsCurrencies?.size, 'vs currencies');
  }
  return _vsCurrencies;
};

const getCoin = async (searchString) => {
  searchString = searchString.toLowerCase();
  debug('searching for', searchString);
  let symbolMatch, nameMatch, idPreMatch, symbolPreMatch, namePreMatch;
  for (const coin of await getCoinsList()) {
    const { id, symbol, name } = coin;
    if (id === searchString) {
      debug(`${id} is an exact match`);
      return coin;
    } else if (symbol === searchString) {
      symbolMatch = coin;
      break; // don't need to keep searching, this is the best type of match
    } else if (name === searchString) {
      nameMatch = coin;
    } else if (symbol.startsWith(searchString)) {
      symbolPreMatch = coin;
    } else if (id.startsWith(searchString)) {
      idPreMatch = coin;
    } else if (name.startsWith(searchString)) {
      namePreMatch = coin;
    }
  }
  const coin =
    symbolMatch || nameMatch || idPreMatch || symbolPreMatch || namePreMatch;
  debug(coin ? `closest match is ${coin.id}` : 'no match found');
  return coin;
};

const getVs = async (vs_currency) => {
  vs_currency = vs_currency.toLowerCase();
  if ((await getVsCurrencies()).has(vs_currency)) return vs_currency;
  debug(`${vs_currency} is not a valid vs currency, looking up its symbol`);
  const { symbol } = (await getCoin(vs_currency)) || {};
  if (symbol && (await getVsCurrencies()).has(symbol)) return symbol;
};

const fmt = (num, currency, sigFig = 6) =>
  new Intl.NumberFormat(locale, {
    ...(currency && { style: 'currency', currency, minimumFractionDigits: 0 }),
    ...(num < 10 ** sigFig
      ? { maximumSignificantDigits: sigFig }
      : { maximumFractionDigits: 0 }),
  }).format(num);
const fmtPct = (num) => (num == undefined ? '?' : fmt(num, undefined, 3) + '%');

const formatPriceData = (data, vs) => {
  const pctH = fmtPct(data.price_change_percentage_1h_in_currency);
  const pctD = fmtPct(data.price_change_percentage_24h_in_currency);
  const pctW = fmtPct(data.price_change_percentage_7d_in_currency);
  const pctM = fmtPct(data.price_change_percentage_30d_in_currency);
  return {
    parse_mode: 'markdown',
    text: `*${data.name} (${data.symbol.toUpperCase()})* in ${vs.toUpperCase()}
Current price:  \`${fmt(data.current_price, vs)}\`
h/d/w/m: \`${pctH}\` / \`${pctD}\` / \`${pctW}\` / \`${pctM}\` 
Market cap:  \`${fmt(data.market_cap, vs)}\`
24h volume:  \`${fmt(data.total_volume, vs)}\`
_(updated ${new Date(data.last_updated).toUTCString()})_`,
  };
};

const getPrice = async (currency = 'bitcoin', in_currency = 'usd') => {
  const [{ id } = {}, vs] = await Promise.all([
    getCoin(currency),
    getVs(in_currency),
  ]);
  if (!id) return `Sorry, I couldn't find ${currency}. Try using the full name`;
  if (!vs)
    return `Sorry, I can't list prices in ${in_currency}. Supported base currencies are: ${[
      ...(await getVsCurrencies()),
    ].join(', ')}`;
  debug(`getting market info for ${id} in ${vs}...`);
  const res = await api.coins.markets({
    ids: id,
    vs_currency: vs,
    price_change_percentage: '1h,24h,7d,30d',
  });
  debug('res:', res);
  return res?.data?.[0] && formatPriceData(res?.data?.[0], vs);
};

const parseIntlNumber = (numString) => {
  if (typeof numString !== 'string') return numString;
  debug('parsing:', numString, 'using locale:', locale);
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1)?.[1]?.value;
  const num = parseFloat(
    numString
      .split(decimal)
      .map((s) => s.replace(/\D/g, ''))
      .join('.'),
  );
  debug('result:', num);
  return parseFloat(num);
};

const convert = async (amount = 1, from = 'bitcoin', to = 'usd') => {
  const amt = parseIntlNumber(amount);
  if (isNaN(amt)) return `Amount '${amount}' is not a valid number`;
  const [{ id, symbol } = {}, vs] = await Promise.all([
    getCoin(from),
    getVs(to),
  ]);
  if (!id) return `Sorry, I couldn't find ${from}. Try using the full name`;
  if (vs) {
    debug(`getting simple price for ${id} in ${vs}...`);
    const res = await api.simple.price({ ids: id, vs_currencies: vs });
    debug('res:', res);
    const price = res?.data?.[id]?.[vs];
    if (!price) return `Sorry, I couldn't look up the price for ${id} in ${vs}`;
    return `${fmt(amt)} ${symbol.toUpperCase()} = ${fmt(amt * price, vs)}`;
  } else {
    const { id: to_id, symbol: to_symbol } = (await getCoin(to)) || {};
    if (!to_id) return `Sorry, I couldn't find ${to}. Try using the full name`;
    debug(`getting simple price for ${id} and ${to_id} in usd...`);
    const res = await api.simple.price({
      ids: [id, to_id],
      vs_currencies: 'usd',
    });
    debug('res:', res);
    const price = res?.data?.[id]?.usd;
    if (!price) return `Sorry, I couldn't look up the price for ${id}`;
    const to_price = res?.data?.[to_id]?.usd;
    if (!to_price) return `Sorry, I couldn't look up the price for ${to_id}`;
    return `${fmt(amt)} ${symbol.toUpperCase()} = ${fmt(
      (amt * price) / to_price,
    )} ${to_symbol.toUpperCase()}`;
  }
};

const regret = async (
  inputAmt = 1,
  inputCoin = 'bitcoin',
  inputSoldFor = 100,
  inputVs = 'USD',
) => {
  const amt = parseIntlNumber(inputAmt);
  if (isNaN(amt)) return `Amount '${inputAmt}' is not a valid number`;
  const soldFor = parseIntlNumber(inputSoldFor);
  if (isNaN(soldFor))
    return `Sell price '${inputSoldFor}' is not a valid number`;
  const [{ id, symbol } = {}, vs] = await Promise.all([
    getCoin(inputCoin),
    getVs(inputVs),
  ]);
  if (!id)
    return `Sorry, I couldn't find ${inputCoin}. Try using the full name`;
  if (!vs)
    return `Sorry, I can't get prices in ${inputVs}. Supported base currencies are: ${[
      ...(await getVsCurrencies()),
    ].join(', ')}`;
  debug(`getting simple price for ${id} in ${vs}...`);
  const res = await api.simple.price({ ids: id, vs_currencies: vs });
  debug('res:', res);
  const current = res?.data?.[id]?.[vs];
  if (!current) return `Sorry, I couldn't look up the price for ${id} in ${vs}`;
  const missedProfit = current * amt - soldFor;
  const sym = symbol.toUpperCase();
  return missedProfit > 0
    ? `If you hadn't sold your ${fmt(amt)} ${sym} for ${fmt(
        soldFor,
        vs,
      )}, you'd be ${fmt(missedProfit, vs)} richer now 🚀!`
    : `Wow, No Ragerts 💥! Your ${fmt(amt)} ${sym} would be worth ${fmt(
        -missedProfit,
        vs,
      )} less today than the ${fmt(soldFor, vs)} you sold it for!`;
};

module.exports = createAzureTelegramWebhook(
  async ({ text, from: { language_code } }, _log) => {
    // set global loggers & lang so we don't need to pass them to every function
    ({ verbose: debug, info, warn } = _log);
    locale = language_code || 'en';
    // ignore non-text messages and non-commands
    if (!text?.startsWith('/')) return;
    // parse the message into command + args
    const [cmd, ...args] = text.split(/\s+/);
    debug({ cmd, args });
    // route the command to the appropriate handler & remove @mention if present
    switch (cmd.split('@')[0]) {
      case '/start':
        return 'Hi there! To get started try typing /price';
      case '/price':
        return getPrice(...args);
      case '/convert':
        return convert(...args);
      case '/regret':
      case '/regrets':
      case '/ragert':
      case '/ragerts':
        return regret(...args);
      default:
        warn(`Unknown command: ${cmd}`);
        return;
    }
  },
  DAVO_CHAT_ID,
);

const { createAzureTelegramWebhook } = require('serverless-telegram');
const CoinGecko = require('coingecko-api');
const api = new CoinGecko();

const DAVO_CHAT_ID = 60764253;

let locale, debug, info, warn;

const memoize = (fn) => {
  const cache = {};
  return (...args) => (cache[args] = cache[args] ?? fn(...args));
};

const getCoinsList = memoize(async () => {
  info('fetching coins list...');
  const coinsList = (await api.coins.list())?.data?.map((coin) => ({
    id: coin.id?.toLowerCase(),
    symbol: coin.symbol?.toLowerCase(),
    name: coin.name?.toLowerCase(),
  }));
  info('got', coinsList?.length, 'coins');
  return coinsList;
});

const getVsCurrencies = memoize(async () => {
  info('fetching supported vs currencies...');
  const vsCurrs = new Set((await api.simple.supportedVsCurrencies())?.data);
  info('got', vsCurrs?.size, 'vs currencies');
  return vsCurrs;
});

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

const getAmount = (amtString) => {
  if (typeof amtString !== 'string') return amtString;
  debug('parsing:', amtString, 'using locale:', locale);
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1)?.[1]?.value;
  const num = parseFloat(
    amtString
      .split(decimal)
      .map((s) => s.replace(/\D/g, ''))
      .join('.'),
  );
  debug('result:', num);
  return isNaN(num) ? undefined : num;
};

const fmt = (num, currency, sigFig = 6) =>
  new Intl.NumberFormat(locale, {
    ...(currency && { style: 'currency', currency, minimumFractionDigits: 0 }),
    ...(num < 10 ** sigFig
      ? { maximumSignificantDigits: sigFig }
      : { maximumFractionDigits: 0 }),
  }).format(num);
const fmtPct = (num) => (num == undefined ? '?' : fmt(num, undefined, 3) + '%');

const fmtDate = (date) => new Date(date).toUTCString();

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
_(updated ${fmtDate(data.last_updated)})_`,
  };
};

const getPrice = async ({ id }, vs) => {
  debug(`getting market info for ${id} in ${vs}...`);
  const res = await api.coins.markets({
    ids: id,
    vs_currency: vs,
    // @ts-ignore
    price_change_percentage: '1h,24h,7d,30d',
  });
  debug('res:', res);
  return res?.data?.[0] && formatPriceData(res?.data?.[0], vs);
};

const convert = async (amt, { id, symbol }, vs) => {
  debug(`getting simple price for ${id} in ${vs}...`);
  // @ts-ignore
  const res = await api.simple.price({ ids: id, vs_currencies: vs });
  debug('res:', res);
  const price = res?.data?.[id]?.[vs];
  if (!price) return `Sorry, I couldn't look up the price for ${id} in ${vs}`;
  return `${fmt(amt)} ${symbol.toUpperCase()} = ${fmt(amt * price, vs)}`;
};

const convertCoinToCoin = async (
  amt,
  { id, symbol },
  { id: to_id, symbol: to_symbol },
) => {
  debug(`getting simple price for ${id} and ${to_id} in usd...`);
  // @ts-ignore
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
};

const convertVsToVs = convert; // TODO

const regret = async (amt, { id, symbol }, soldFor, vs) => {
  debug(`getting simple price for ${id} in ${vs}...`);
  // @ts-ignore
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
      )}, you'd be ${fmt(missedProfit, vs)} richer now 🚀!${
        missedProfit > soldFor ? ' ... fuck!' : ''
      }`
    : `Wow, No Ragerts 💥! Your ${fmt(amt)} ${sym} would be worth ${fmt(
        -missedProfit,
        vs,
      )} less today than the ${fmt(soldFor, vs)} you sold it for!`;
};

const top = async (n, inputVs = 'usd') => {
  const vs = await getVs(inputVs);
  if (!vs)
    return `Sorry, I can't list prices in ${inputVs}. Supported base currencies are: ${[
      ...(await getVsCurrencies()),
    ].join(', ')}`;
  // @ts-ignore
  const { data } = await api.coins.markets({ vs_currency: vs, per_page: n });
  debug('data:', data);
  if (!data?.length)
    return "Sorry, I couldn't fetch market data from the API. Please try again later.";
  return {
    parse_mode: 'markdown',
    text: [
      `*Top ${n} Cryptocurrencies*`,
      ...data.map(
        ({
          market_cap_rank: rank,
          name,
          current_price: price,
          price_change_percentage_24h: pct24h,
          market_cap,
        }) =>
          `*${rank}. ${name}:*  ${fmt(price, vs)} (\`${fmtPct(pct24h)}\`)` +
          (n <= 10 ? ` - Market ${fmt(market_cap, vs)}` : ''),
      ),
      `_(updated ${fmtDate(data[0].last_updated)})_`,
    ].join('\n'),
  };
};

const version = () => {
  const { name, version } = require('../package.json');
  return `${name.charAt(0).toUpperCase() + name.slice(1)} v${version}`;
};

/** @typedef {{defaultVal?: any, parser: (v: string) => any, errorMsg: (v: string) => string}} */
// eslint-disable-next-line no-unused-vars
var ArgSpec;

/** @type {ArgSpec} */
const coin = {
  defaultVal: 'bitcoin',
  parser: getCoin,
  errorMsg: (input) =>
    `Sorry, I couldn't find ${input}. Try using the full name`,
};
/** @type {ArgSpec} */
const vs = {
  defaultVal: 'usd',
  parser: getVs,
  errorMsg: (input) => `Sorry, I can't get prices in ${input}.
Try using a major currency symbol such as USD, EUR, GBP, BTC, ETH, LTC, etc.`,
};
/** @type {ArgSpec} */
const amount = {
  defaultVal: 1,
  parser: getAmount,
  errorMsg: (input) => `Amount '${input}' is not a valid number`,
};

const withDefault = (argSpec, defaultVal) => ({ ...argSpec, defaultVal });

/**
 * [command, argSpecs, commandParser][]
 * @type {[string, ArgSpec[], Function][]}
 */
const commands = [
  ['/start', [], () => 'Hi there! To get started try typing /price'],
  ['/version', [], version],
  ['/price', [coin, vs], getPrice],
  ['/price', [amount, coin, vs], convert],
  ['/price', [coin, amount, vs], (c, amt, vs) => convert(amt, c, vs)],
  ['/convert', [amount, coin, vs], convert],
  ['/convert', [amount, coin, coin], convertCoinToCoin],
  ['/convert', [amount, vs, coin], (amt, vs, c) => convert(amt, c, vs)],
  ['/convert', [amount, vs, vs], convertVsToVs],
  [
    '/regret',
    [withDefault(amount, 10000), coin, withDefault(amount, 41), vs],
    regret,
  ],
  ['/top10', [vs], (vs) => top(10, vs)],
  ['/top20', [vs], (vs) => top(20, vs)],
];

/**
 * @param {string} cmd
 * @param {string[]} args
 */
const execute = async (cmd, args) => {
  let firstError;
  for (const [command, argSpecs, commandParser] of commands) {
    if (command !== cmd) continue;
    const vals = await Promise.all(
      argSpecs.map(async ({ defaultVal, parser, errorMsg }, i) => {
        const val = args[i];
        const parsed = await parser(val ?? defaultVal);
        const error = parsed == undefined && errorMsg(val);
        return { parsed, error };
      }),
    );
    const error = vals.find((v) => v.error)?.error;
    if (error) {
      firstError = firstError ?? error;
    } else {
      return commandParser(...vals.map((v) => v.parsed));
    }
  }
  if (!firstError) warn(`Unknown command: ${cmd}`);
  return firstError;
};

module.exports = createAzureTelegramWebhook(
  async ({ text, from: { language_code } = {} }, _log) => {
    // set global loggers & lang so we don't need to pass them to every function
    ({ verbose: debug, info, warn } = _log);
    locale = language_code || 'en';
    // ignore non-text messages and non-commands
    if (!text?.startsWith('/')) return;
    // parse the message into command + args
    let [cmd, ...args] = text.split(/\s+/);
    // remove @mention if present
    cmd = cmd.split('@')[0];
    debug({ cmd, args });
    // route the command to the appropriate handler
    return execute(cmd, args);
  },
  DAVO_CHAT_ID,
);

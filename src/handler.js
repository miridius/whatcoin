const CoinGecko = require('coingecko-api');
const { MessageEnv } = require('serverless-telegram');
const { makeChart } = require('./chart');
const api = new CoinGecko();

const memoize = (fn) => {
  const cache = {};
  return function (...args) {
    // @ts-ignore
    return (cache[args] = cache[args] ?? fn.apply(this, args));
  };
};

const getCoinsList = memoize(
  /** @this {WhatcoinEnv} */
  async function () {
    this.info('fetching coins list...');
    const coinsList = (await api.coins.list())?.data?.map((coin) => ({
      id: coin.id?.toLowerCase(),
      symbol: coin.symbol?.toLowerCase(),
      name: coin.name?.toLowerCase(),
    }));
    this.info('got', coinsList?.length, 'coins');
    return coinsList;
  },
);

const getVsCurrencies = memoize(
  /** @this {WhatcoinEnv} */
  async function () {
    this.info('fetching supported vs currencies...');
    const vsCurrs = new Set((await api.simple.supportedVsCurrencies())?.data);
    this.info('got', vsCurrs?.size, 'vs currencies');
    return vsCurrs;
  },
);

/** @this {WhatcoinEnv} */
async function getCoin(searchString) {
  searchString = searchString.toLowerCase();
  this.debug('searching for', searchString);
  let symbolMatch, nameMatch, idPreMatch, symbolPreMatch, namePreMatch;
  for (const coin of await getCoinsList.call(this)) {
    const { id, symbol, name } = coin;
    if (id === searchString) {
      this.debug(`${id} is an exact match`);
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
  this.debug(coin ? `closest match is ${coin.id}` : 'no match found');
  return coin;
}

/** @this {WhatcoinEnv} */
async function getVs(vs_currency) {
  vs_currency = vs_currency.toLowerCase();
  if ((await getVsCurrencies.call(this)).has(vs_currency)) return vs_currency;
}

/** @this {WhatcoinEnv} */
function getAmount(amtString) {
  if (typeof amtString !== 'string') return amtString;
  this.debug('parsing:', amtString, 'using locale:', this.lang);
  const decimal = new Intl.NumberFormat(this.lang).formatToParts(1.1)?.[1]
    ?.value;
  const num = parseFloat(
    amtString
      .split(decimal)
      .map((s) => s.replace(/\D/g, ''))
      .join('.'),
  );
  this.debug('result:', num);
  return isNaN(num) ? undefined : num;
}

const reverseWords = (str) => str.split(/\s+/).reverse().join(' ');

const fmtDate = (date) => new Date(date).toUTCString();

/** @this {WhatcoinEnv} */
async function getPrice({ id }, vs) {
  this.debug(`getting market this.info for ${id} in ${vs}...`);
  const res = await api.coins.markets({
    ids: id,
    vs_currency: vs,
    // @ts-ignore
    price_change_percentage: '1h,24h,7d,30d',
  });
  this.debug('res:', res);
  return res?.data?.[0] && this.formatPriceData(res?.data?.[0], vs);
}

/** @this {WhatcoinEnv} */
async function convertC2V(amt, { id, symbol }, vs) {
  const price = (await this.simplePrice(id, vs))?.[id]?.[vs];
  if (!price) return `Sorry, I couldn't look up the price for ${id} in ${vs}`;
  return this.formatConvertData(amt, price, symbol, vs);
}

/** @this {WhatcoinEnv} */
async function convertV2C(amt, vs, { id, symbol }) {
  const price = (await this.simplePrice(id, vs))?.[id]?.[vs];
  if (!price) return `Sorry, I couldn't look up the price for ${id} in ${vs}`;
  return this.formatConvertData(amt, 1 / price, vs, symbol);
}

/** @this {WhatcoinEnv} */
async function convertC2C(amt, { id, symbol }, { id: toId, symbol: toSymbol }) {
  const data = await this.simplePrice([id, toId], 'usd');
  const price = data?.[id]?.usd;
  if (!price) return `Sorry, I couldn't look up the price for ${id}`;
  const to_price = data?.[toId]?.usd;
  if (!to_price) return `Sorry, I couldn't look up the price for ${toId}`;
  return this.formatConvertData(amt, price / to_price, symbol, toSymbol);
}

/** @this {WhatcoinEnv} */
async function convertV2V(amt, fromVs, toVs) {
  const bitcoin = (await this.simplePrice('bitcoin', [fromVs, toVs]))?.bitcoin;
  const rate = bitcoin?.[toVs] / bitcoin?.[fromVs];
  if (!rate) {
    return `Sorry, I couldn't look up the exchange rate for ${fromVs} to ${toVs}`;
  }
  return this.formatConvertData(amt, rate, fromVs, toVs);
}

/** @this {WhatcoinEnv} */
async function regret(amt, { id, symbol }, soldFor, vs) {
  const current = (await this.simplePrice(id, vs))?.[id]?.[vs];
  if (!current) return `Sorry, I couldn't look up the price for ${id} in ${vs}`;
  const missedProfit = current * amt - soldFor;
  const sym = symbol.toUpperCase();
  return missedProfit > 0
    ? `If you hadn't sold your ${this.fmt(amt)} ${sym} for ${this.fmt(
        soldFor,
        vs,
      )}, you'd be ${this.fmt(missedProfit, vs)} richer now 🚀!${
        missedProfit > soldFor ? ' ... fuck!' : ''
      }`
    : `Wow, No Ragerts 💥! Your ${this.fmt(
        amt,
      )} ${sym} would be worth ${this.fmt(
        -missedProfit,
        vs,
      )} less today than the ${this.fmt(soldFor, vs)} you sold it for!`;
}

/** @this {WhatcoinEnv} */
async function top(n, vs) {
  // @ts-ignore
  const { data } = await api.coins.markets({ vs_currency: vs, per_page: n });
  this.debug('data:', data);
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
          `*${rank}. ${name}:*  ${this.fmt(price, vs)} (\`${this.fmtPct(
            pct24h,
          )}\`)` + (n <= 10 ? ` - Market ${this.fmt(market_cap, vs)}` : ''),
      ),
      `_(updated ${fmtDate(data[0].last_updated)})_`,
    ].join('\n'),
  };
}

function version() {
  const { name, version } = require('../package.json');
  return `${name.charAt(0).toUpperCase() + name.slice(1)} v${version}`;
}

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
 * @type {[string, ArgSpec[], Function, Function?][]}
 */
const commands = [
  ['/start', [], () => 'Hi there! To get started try typing /price'],
  ['/version', [], version],
  ['/price', [coin, vs], getPrice],
  ['/price', [amount, coin, vs], convertC2V],
  ['/price', [coin, amount, vs], convertC2V, ([c, a, v]) => [a, c, v]],
  ['/convert', [amount, vs, vs], convertV2V],
  ['/convert', [amount, coin, vs], convertC2V],
  ['/convert', [amount, vs, coin], convertV2C],
  ['/convert', [amount, coin, coin], convertC2C],
  [
    '/regret',
    [withDefault(amount, 10000), coin, withDefault(amount, 41), vs],
    regret,
  ],
  ['/top10', [vs], top, ([vs]) => [10, vs]],
  ['/top20', [vs], top, ([vs]) => [20, vs]],
  ['/chart', [amount, coin, vs], makeChart, ([a, c, v]) => [c, v, a]],
  ['/chart', [coin, amount, vs], makeChart, ([c, a, v]) => [c, v, a]],
  ['/chart', [coin, vs, amount], makeChart],
];

class WhatcoinEnv extends MessageEnv {
  /** @param {MessageEnv} env */
  constructor({ context, message }) {
    // set global loggers & lang so we don't need to pass them to every function
    super(context, message);
    this.lang = message.from?.language_code || 'en';
  }

  /** @param {import('serverless-telegram').Message} msg */
  onMessage({ text }) {
    // ignore non-text messages and non-commands
    if (!text?.startsWith('/')) return;
    // parse the message into command + args
    let [cmd, ...args] = text.split(/\s+/);
    // remove @mention if present
    cmd = cmd.split('@')[0];
    this.debug({ cmd, args });
    // route the command to the appropriate handler
    return this.execute(cmd, args);
  }

  /**
   * @param {string} cmd
   * @param {string[]} args
   */
  async execute(cmd, args) {
    let closestErrorCount;
    let closestError;
    for (const [command, argSpecs, commandParser, argTransform] of commands) {
      if (command !== cmd) continue;
      const vals = await Promise.all(
        argSpecs.map(async ({ defaultVal, parser, errorMsg }, i) => {
          const val = args[i];
          const parsed = await parser.call(this, val ?? defaultVal);
          const error = parsed == undefined && errorMsg(val);
          return { parsed, error };
        }),
      );
      const errorCount = vals.filter((v) => v.error).length;
      if (errorCount) {
        if (closestErrorCount == undefined || errorCount < closestErrorCount) {
          closestErrorCount = errorCount;
          closestError = vals.find((v) => v.error)?.error;
        }
      } else {
        let parsed = vals.map((v) => v.parsed);
        if (argTransform) parsed = argTransform(parsed);
        return commandParser.apply(this, parsed);
      }
    }
    if (!closestError) this.warn(`Unknown command: ${cmd}`);
    return closestError;
  }

  /**
   * @param {string|string[]} ids
   * @param {string|string[]} vs_currencies
   */
  async simplePrice(ids, vs_currencies) {
    this.debug(`getting simple price for ${ids} in ${vs_currencies}...`);
    // @ts-ignore
    const res = await api.simple.price({ ids, vs_currencies });
    this.debug('res:', res);
    return res?.data;
  }

  formatPriceData(data, vs) {
    const pctH = this.fmtPct(data.price_change_percentage_1h_in_currency);
    const pctD = this.fmtPct(data.price_change_percentage_24h_in_currency);
    const pctW = this.fmtPct(data.price_change_percentage_7d_in_currency);
    const pctM = this.fmtPct(data.price_change_percentage_30d_in_currency);
    return {
      parse_mode: 'markdown',
      text: `*${
        data.name
      } (${data.symbol.toUpperCase()})* in ${vs.toUpperCase()}
Current price:  \`${this.fmt(data.current_price, vs)}\`
h/d/w/m: \`${pctH}\` / \`${pctD}\` / \`${pctW}\` / \`${pctM}\` 
Market cap:  \`${this.fmt(data.market_cap, vs)}\`
24h volume:  \`${this.fmt(data.total_volume, vs)}\`
_(updated ${fmtDate(data.last_updated)})_`,
    };
  }

  formatConvertData(amt, rate, from, to) {
    return `${this.fmt(amt, from)} = ${this.fmt(amt * rate, to)}`;
  }

  fmt(num, currency, sigFig = 6) {
    if (currency && currency.length !== 3) {
      return `${this.fmt(num, undefined, sigFig)} ${currency.toUpperCase()}`;
    } else {
      const opts = {
        ...(currency && {
          style: 'currency',
          currency,
          minimumFractionDigits: 0,
        }),
        ...(num < 10 ** sigFig
          ? { maximumSignificantDigits: sigFig }
          : { maximumFractionDigits: 0 }),
      };
      return reverseWords(new Intl.NumberFormat(this.lang, opts).format(num));
    }
  }

  fmtPct(num) {
    return num == undefined ? '?' : this.fmt(num, undefined, 3) + '%';
  }
}

/** @type import('serverless-telegram').MessageHandler */
module.exports = async (msg, env) => new WhatcoinEnv(env).onMessage(msg);

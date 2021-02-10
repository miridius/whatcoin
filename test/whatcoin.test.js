const webhook = require('../src/webhook');
const handler = require('../src/handler');
const defaultCtx = require('./defaultContext');
const nock = require('nock');
const filenamify = require('filenamify');
const fs = require('fs');
const { toMatchImageSnapshot } = require('jest-image-snapshot');
const {
  MessageEnv,
  utils: { isObject },
} = require('serverless-telegram');

expect.extend({ toMatchImageSnapshot });

afterAll(() => nock.restore());

nock.back.fixtures = __dirname + '/__fixtures__/';
nock.back.setMode(process.env.CI ? 'lockdown' : 'record');

let ctx = { ...defaultCtx };
beforeEach(async () => {
  ctx = { ...defaultCtx };
  const state = expect.getState();
  state.nockBack = await nock.back(`${filenamify(state.currentTestName)}.json`);
});

afterEach(() => {
  const { nockBack } = expect.getState();
  nockBack.nockDone();
  nockBack.context.assertScopesFinished();
});

const updateReplyText = async (text) => {
  /** @type {import('serverless-telegram').HttpRequest} */
  // @ts-ignore
  const req = { body: { update_id: 1, message: { text, chat: { id: 2 } } } };
  const res = await webhook(ctx, req);
  return res?.body?.text;
};

describe('webhook', () => {
  it('ignores everything except known commands', async () => {
    expect(await updateReplyText('/foo')).toBeUndefined();
    expect(await updateReplyText('bar')).toBeUndefined();
    expect(await updateReplyText()).toBeUndefined();
  });
});

describe('/version', () => {
  it('- shows name and version info', () =>
    expect(updateReplyText('/version')).resolves.toMatch(/Whatcoin v[\d.]+/));
});

const commandTests = {
  '/start': 'shows a welcome message',
  '/price': [
    ['defaults to btc in usd'],
    ['supports other currencies', 'ethereum eur'],
    ['finds coins by symbol', 'ETH GBP'],
    ['finds coins by name', 'PEAKDEFI'],
    ['finds coins by id partial match', 'bitm'],
    ['finds coins by symbol partial match', 'algoha'],
    ['finds coins by name partial match', 'peakd'],
    ['returns an error for invalid coin', 'asdfasdf eur'],
    ['returns an error for invalid vs currency', 'bitcoin asdasd'],
    ['redirects to convert when first arg is a number', '10000 doge'],
    ['redirects to convert when second arg is a number', 'doge 10000'],
  ],
  '/convert': [
    ['defaults to 1 usd in usd'],
    ['defaults to converting coins to usd', '42 doge'],
    ['supports other currencies', '1000 ethereum aud'],
    ['supports coin to coin', '100 doge ark'],
    ['supports vs to coin', '100 usd doge'],
    ['supports vs to vs', '100 usd aud'],
    ['returns an error for invalid amount', 'foo'],
    ['returns an error for invalid coin', '100 asdfasdf'],
    ['returns an error for invalid vs', '100 eth asdfasdf'],
    ['ignores commas in en locale', '400,000.00 doge eur'],
    ['understands de locale', '400.000,00 doge eur', 'de'],
    ['ignores xx locale', '400,000.00 doge eur', 'xx'],
    ['ignores empty locale', '400,000.00 doge eur', ''],
  ],
  '/regret': [
    ['defaults to 10,000 btc sold at $41 usd'],
    ['supports other currencies', '0.5 eth 500 aud'],
    ['congratulates no ragerts', '1000 xrp 1000'],
    ['returns an error for invalid amount', 'foo'],
    ['returns an error for invalid coin', '1 asdfasdf'],
    ['returns an error for invalid soldAt', '1 btc foo'],
    ['returns an error for invalid vs', '1 btc 100 asdfasdf'],
  ],
  '/top10': [['defaults to USD'], ['supports other vs currencies', 'aud']],
  '/top20': [['defaults to USD'], ['supports other vs currencies', 'btc']],
  '/chart': [
    ['defaults to bitcoin in USD - last 1d'],
    ['supports other options', 'eth aud 30'],
    ['turns red if price is falling', 'usdc'],
  ],
};

const toArray = (t) => (Array.isArray(t) ? t : [t]);

process.env.BOT_API_TOKEN = process.env.BOT_API_TOKEN || '1111:fake_token';

const msgReply = async (text, locale) => {
  /** @type {import('serverless-telegram').Message} */
  // @ts-ignore
  const message = { text, from: { language_code: locale }, chat: { id: 2 } };
  return handler(message, new MessageEnv(ctx, message));
};

for (const [command, tests] of Object.entries(commandTests)) {
  describe(command, () => {
    for (const [desc, args, locale] of toArray(tests).map(toArray)) {
      it(args ? `${args} - ${desc}` : `- ${desc}`, async () => {
        const text = args ? `${command} ${args}` : command;
        const res = await msgReply(text, locale);
        if (isObject(res) && res.photo) {
          await expect(fs.readFileSync(res.photo)).toMatchImageSnapshot();
          res.photo = `see image snapshot ${expect.getState().currentTestName}`;
        }
        expect(res).toMatchSnapshot();
      });
    }
  });
}
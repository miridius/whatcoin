const webhook = require('../src/webhook').webhook;
const handler = require('../src/handler');
const ctx = require('./defaultContext');
const nock = require('nock');
const filenamify = require('filenamify');
const { toMatchImageSnapshot } = require('jest-image-snapshot');
const {
  MessageEnv,
  utils: { isObject },
} = require('serverless-telegram');
const {
  utils: { isFileBuffer },
} = require('serverless-telegram');

expect.extend({ toMatchImageSnapshot });

afterAll(() => nock.restore());

nock.back.fixtures = __dirname + '/__fixtures__/';
nock.back.setMode(process.env.CI ? 'lockdown' : 'record');

beforeEach(async () => {
  const state = expect.getState();
  state.nockBack = await nock.back(`${filenamify(state.currentTestName)}.json`);
});

afterEach(() => {
  const { nockBack } = expect.getState();
  nockBack.nockDone();
  nockBack.context.assertScopesFinished();
});

const updateReplyText = async (text) => {
  const req = {
    body: JSON.stringify({ update_id: 1, message: { text, chat: { id: 2 } } }),
  };
  //@ts-ignore
  const res = await webhook(req, ctx);
  return res.body && JSON.parse(res.body).text;
};

describe('webhook', () => {
  it('ignores everything except known commands', async () => {
    expect(await updateReplyText('/foo')).toBeFalsy();
    expect(await updateReplyText('bar')).toBeFalsy();
    expect(await updateReplyText()).toBeFalsy();
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
    ['shows most appropriate error', 'doge doge 90'],
    ['shows most appropriate error', 'doge 90 doge'],
    ['shows most appropriate error', '90 doge doge'],
    ['shows most appropriate error', 'doge doge doge'],
  ],
  '/ohlc': [
    ['defaults to bitcoin in USD - last 1d'],
    ['supports other options', 'eth aud max'],
    ['throws an error for unsupported number of days', '31'],
  ],
};

const toArray = (t) => (Array.isArray(t) ? t : [t]);

const id = parseInt(process.env.TEST_CHAT_ID || '') || 2;
process.env.BOT_API_TOKEN = process.env.BOT_API_TOKEN || '1111:fake_token';

const msgReply = async (text, locale) => {
  /** @type {import('serverless-telegram').Message} */
  // @ts-ignore
  const message = { text, from: { language_code: locale }, chat: { id } };
  return handler(message, new MessageEnv(ctx, message));
};

const testPhoto = async (photo) => {
  await expect(photo.buffer).toMatchImageSnapshot({
    customDiffConfig: { threshold: 0.06 },
    failureThreshold: 0.01,
    failureThresholdType: 'percent',
    updatePassedSnapshot: !process.env.CI,
    dumpDiffToConsole: !!process.env.CI,
  });
  expect(photo.filename).toMatch(/\.png$/);
  return `see image snapshot ${expect.getState().currentTestName}`;
};

for (const [command, tests] of Object.entries(commandTests)) {
  describe(command, () => {
    for (const [desc, args, locale] of toArray(tests).map(toArray)) {
      it(args ? `${args} - ${desc}` : `- ${desc}`, async () => {
        const text = args ? `${command} ${args}` : command;
        const res = await msgReply(text, locale);
        if (isObject(res) && isFileBuffer(res.photo)) {
          res.photo = await testPhoto(res.photo);
        }
        expect(res).toMatchSnapshot();
      });
    }
  });
}

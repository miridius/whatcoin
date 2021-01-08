/* eslint-disable jest/expect-expect */
const telegramWebhook = require('../telegram-webhook');
const ctx = require('./defaultContext');
const nock = require('nock');
const filenamify = require('filenamify');

afterAll(() => nock.restore());

nock.back.fixtures = __dirname + '/__fixtures__/';
if (process.env.CI) {
  console.info('Running in CI - locking down nockBack fixtures');
  nock.back.setMode('lockdown');
} else {
  console.info('process.env.CI is not set - running nockBack in record mode');
  nock.back.setMode('record');
}

const msgReply = async (text, locale) => {
  const req = {
    body: {
      update_id: 1,
      message: { text, from: { language_code: locale }, chat: { id: 2 } },
    },
  };
  const res = await telegramWebhook(ctx, req);
  return res?.body;
};

const msgReplyText = async (text) => (await msgReply(text))?.text;

const testWithMock = async (command, args, locale) => {
  expect.assertions(1);
  const text = [command, ...args].join(' ');
  const { nockDone } = await nock.back(`${filenamify(text)}.json`);
  await expect(msgReply(text, locale)).resolves.toMatchSnapshot();
  nockDone();
};

describe('Telegram Webhook', () => {
  it('ignores everything except known commands', async () => {
    expect(await msgReplyText('/foo')).toBeUndefined();
    expect(await msgReplyText('bar')).toBeUndefined();
    expect(await msgReplyText()).toBeUndefined();
  });

  it('shows a welcome message with /start', async () => {
    expect(await msgReplyText('/start')).toMatchSnapshot();
  });

  describe('/price', () => {
    for (const [desc, ...args] of [
      ['defaults to btc in usd'],
      ['supports other currencies', 'ethereum', 'eur'],
      ['finds coins by symbol', 'ETH', 'GBP'],
      ['finds coins by name', 'PEAKDEFI'],
      ['finds coins by id partial match', 'bitm'],
      ['finds coins by symbol partial match', 'algoha'],
      ['finds coins by name partial match', 'peakd'],
      ['finds vs by coin id', 'doge', 'bitcoin'],
      ['returns an error for invalid coin', 'asdfasdf', 'eur'],
      ['returns an error for invalid vs currency', 'bitcoin', 'asdasd'],
    ]) {
      it(`(${args.join(', ')}) - ${desc}`, () => testWithMock('/price', args));
    }
  });

  describe('/convert', () => {
    for (const [desc, args = [], locale] of [
      ['defaults to 1 btc in usd'],
      ['supports other currencies', [1000, 'ethereum', 'aud']],
      ['supports coin to coin', [100, 'doge', 'ark']],
      ['returns an error for invalid amount', ['foo']],
      ['returns an error for invalid coin', [100, 'asdfasdf']],
      ['returns an error for invalid vs', [100, 'eth', 'asdfasdf']],
      ['ignores commas in en locale', ['400,000.00', 'doge', 'eur']],
      ['understands de locale', ['400.000,00', 'doge', 'eur'], 'de'],
      ['ignores xx locale', ['400,000.00', 'doge', 'eur'], 'xx'],
      ['ignores empty locale', ['400,000.00', 'doge', 'eur'], ''],
    ]) {
      it(`(${args.join(', ')}) - ${desc}`, () =>
        testWithMock('/convert', args, locale));
    }
  });

  describe('/regret', () => {
    for (const [desc, args = [], locale] of [
      ['defaults to 1 btc sold at $100 usd'],
      ['supports other currencies', [0.5, 'eth', 500, 'aud']],
      ['correctly calculates pizza regrets', ['10000', 'BTC', '$30']],
      ['congratulates no ragerts', [1000, 'xrp', 1000]],
      ['returns an error for invalid amount', ['foo']],
      ['returns an error for invalid coin', [1, 'asdfasdf']],
      ['returns an error for invalid soldAt', [1, 'btc', 'foo']],
      ['returns an error for invalid vs', [1, 'btc', 100, 'asdfasdf']],
    ]) {
      it(`(${args.join(', ')}) - ${desc}`, () =>
        testWithMock('/regret', args, locale));
    }
  });
});

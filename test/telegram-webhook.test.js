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

const msgReply = async (text) => {
  const req = { body: { update_id: 1, message: { text, chat: { id: 2 } } } };
  const res = await telegramWebhook(ctx, req);
  return res?.body;
};

const msgReplyText = async (text) => (await msgReply(text))?.text;

const testWithMock = async (command, args) => {
  expect.assertions(1);
  const text = [command, ...args].join(' ');
  const { nockDone } = await nock.back(`${filenamify(text)}.json`);
  await expect(msgReply(text)).resolves.toMatchSnapshot();
  nockDone();
};

describe('Telegram Webhook', () => {
  it('ignores everything except known commands', async () => {
    expect(await msgReplyText('/foo')).toBeUndefined();
    expect(await msgReplyText('bar')).toBeUndefined();
    expect(await msgReplyText()).toBeUndefined();
  });

  it('shows usage with /start', async () => {
    expect(await msgReplyText('/start')).toEqual(
      'usage: /price <crypto name or symbol> [<base currency symbol>]',
    );
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
    for (const [desc, ...args] of [
      ['defaults to 1 btc in usd'],
      ['supports other currencies', 1000, 'ethereum', 'aud'],
      ['supports coin to coin', 100, 'doge', 'ark'],
      ['returns an error for invalid amount', 'foo'],
      ['returns an error for invalid coin', 100, 'asdfasdf'],
      ['returns an error for invalid vs', 100, 'eth', 'asdfasdf'],
      // ['finds coins by symbol', 'ETH', 'GBP'],
      // ['finds coins by name', 'PEAKDEFI'],
      // ['finds coins by id partial match', 'bitm'],
      // ['finds coins by symbol partial match', 'algoha'],
      // ['finds coins by name partial match', 'peakd'],
      // ['returns an error for invalid coin', 'asdfasdf', 'eur'],
      // ['returns an error for invalid vs currency', 'bitcoin', 'asdasd'],
    ]) {
      it(`(${args.join(', ')}) - ${desc}`, () =>
        testWithMock('/convert', args));
    }
  });
});

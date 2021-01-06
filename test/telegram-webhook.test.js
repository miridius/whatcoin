const telegramWebhook = require('../telegram-webhook');
const ctx = require('./defaultContext');
const nock = require('nock');

const API_URL = 'https://api.coingecko.com/api/v3';

afterAll(() => nock.restore());

const nockBack = require('nock').back;
nockBack.fixtures = __dirname + '/__fixtures__/';
if (process.env.CI) {
  console.info('Running in CI - locking down nockBack fixtures');
  nockBack.setMode('lockdown');
} else {
  console.info('process.env.CI is not set - running nockBack in record mode');
  nockBack.setMode('record');
}

describe('Telegram Webhook', () => {
  const msgReply = async (text) => {
    const req = { body: { update_id: 1, message: { text, chat: { id: 2 } } } };
    const res = await telegramWebhook(ctx, req);
    return res?.body;
  };
  const msgReplyText = async (text) => (await msgReply(text))?.text;

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

  it('handles API errors', async () => {
    nock(API_URL).get('/coins/markets').query(true).replyWithError('oh no!');
    expect(await msgReplyText('/price')).toContain('Error: oh no!');
  });

  describe('/price', () => {
    const testWithMock = async (text, id, vs = 'usd') => {
      const { nockDone } = await nockBack(`${id}_${vs}.json`);
      await expect(msgReply(text)).resolves.toMatchSnapshot();
      nockDone();
    };

    it('defaults to btc in usd', async () => {
      expect.assertions(1);
      return testWithMock('/price', 'bitcoin', 'usd');
    });
    it('supports other currencies', async () => {
      expect.assertions(1);
      return testWithMock('/price ethereum eur', 'ethereum', 'eur');
    });
    it('finds coins by symbol', async () => {
      expect.assertions(1);
      return testWithMock('/price ETH GBP', 'ethereum', 'gbp');
    });
    it('finds coins by name', async () => {
      expect.assertions(1);
      return testWithMock('/price PEAKDEFI', 'marketpeak');
    });
    it('finds coins by id partial match', () => {
      expect.assertions(1);
      return testWithMock('/price bitm', 'bitmoney');
    });
    it('finds coins by symbol partial match', async () => {
      expect.assertions(1);
      return testWithMock('/price algoha', '0-5x-long-algorand-token');
    });
    it('finds coins by name partial match', async () => {
      expect.assertions(1);
      return testWithMock('/price peakd', 'marketpeak');
    });
    it("returns a default message for coins which don't exist", async () => {
      expect(await msgReplyText('/price asdfasdf eur')).toEqual(
        "Sorry, I couldn't find asdfasdf. Try using the full name",
      );
    });
  });
});

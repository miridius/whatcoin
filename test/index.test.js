const telegramWebhook = require('../telegram-webhook');
const ctx = require('./defaultContext');
const nock = require('nock');

nock('https://api.coingecko.com/api/v3')
  .get('/coins/list')
  .reply(200, [
    { id: '01coin', symbol: 'zoc', name: '01coin' },
    {
      id: '0-5x-long-algorand-token',
      symbol: 'algohalf',
      name: '0.5X Long Algorand Token',
    },
    { id: '0cash', symbol: 'zch', name: '0cash' },
    { id: '0chain', symbol: 'zcn', name: '0chain' },
    { id: '0x', symbol: 'zrx', name: '0x' },
    { id: '0xcert', symbol: 'zxc', name: '0xcert' },
    { id: '0xmonero', symbol: '0xmr', name: '0xMonero' },
    {
      id: '18900-mansfield-st-detroit-mi-48235',
      symbol: 'REALTOKEN-18900-MANSFIELD-ST-DETROIT-MI',
      name: 'RealToken 18900 Mansfield St Detroit MI',
    },
    { id: '1ai', symbol: '1ai', name: '1AI' },
    { id: '1clicktoken', symbol: '1ct', name: '1ClickToken' },
    { id: '1inch', symbol: '1inch', name: '1inch' },
    { id: '1irstgold', symbol: '1gold', name: '1irstGold' },
    { id: '1million-token', symbol: '1mt', name: '1Million Token' },
    { id: '1world', symbol: '1wo', name: '1World' },
    {
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
    },
    {
      id: 'ethereum',
      symbol: 'eth',
      name: 'Ethereum',
    },
    {
      id: 'dogecoin',
      symbol: 'doge',
      name: 'Dogecoin',
    },
    {
      id: 'marketpeak',
      symbol: 'peak',
      name: 'PEAKDEFI',
    },
  ])
  .persist();

describe('Telegram Webhook', () => {
  const msgReply = async (text) => {
    const req = { body: { update_id: 1, message: { text, chat: { id: 2 } } } };
    const res = await telegramWebhook(ctx, req);
    return res?.body?.text;
  };

  it('ignores everything except known commands', async () => {
    expect(await msgReply('/foo')).toBeUndefined();
    expect(await msgReply('bar')).toBeUndefined();
    expect(await msgReply()).toBeUndefined();
  });

  it('shows usage with /start', async () => {
    expect(await msgReply('/start')).toEqual(
      'usage: /price <crypto name or symbol> [<base currency symbol>]',
    );
  });

  describe('/price', () => {
    const mockPrice = (id, vs, price) => {
      nock('https://api.coingecko.com/api/v3')
        .get(`/simple/price?ids=${id}&vs_currencies=${vs}`)
        .reply(200, { [id]: { [vs]: price } });
    };

    it('defaults to btc in usd', async () => {
      mockPrice('bitcoin', 'usd', 100);
      expect(await msgReply('/price')).toEqual(`1 bitcoin = 100 USD`);
    });
    it('finds coins by symbol', async () => {
      mockPrice('bitcoin', 'aud', 200);
      expect(await msgReply('/price BTC AUD')).toEqual('1 bitcoin = 200 AUD');
    });
    it('finds coins by name', async () => {
      mockPrice('marketpeak', 'usd', 0.00001234);
      expect(await msgReply('/price PEAKDEFI')).toEqual(
        '1 marketpeak = 0.00001234 USD',
      );
    });
    it('finds coins by id partial match', async () => {
      mockPrice('bitcoin', 'usd', 1000);
      expect(await msgReply('/price bit')).toEqual('1 bitcoin = 1000 USD');
    });
    it('finds coins by symbol partial match', async () => {
      mockPrice('bitcoin', 'usd', 1000);
      expect(await msgReply('/price bt')).toEqual('1 bitcoin = 1000 USD');
    });
    it('finds coins by name partial match', async () => {
      mockPrice('marketpeak', 'usd', 1);
      expect(await msgReply('/price peakd')).toEqual('1 marketpeak = 1 USD');
    });
    it("returns a default message for coins which don't exist", async () => {
      expect(await msgReply('/price foo')).toEqual(
        "Sorry, I couldn't find foo. Try using the full name",
      );
    });
  });
});

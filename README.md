# WhatcoinJS

WhatCoin is a Telegram Bot which gives price and market information about crypto currencies.

It runs on Azure Functions using the [serverless-telegram](https://github.com/miridius/serverless-telegram) sister library.

## Bot Usage

Notes:

- Coins can be input as name, symbol, or a prefix thereof. Currencies must be a symbol
- Commands and arguments are not case sensitive.
- The user's locale is respected when it comes to number formatting.

### Implemented Commands / TO DOs

- [x] `/price` - get current price info about a currency, with optional conversion. E.g. `/price bitcoin eur`
- [x] `/convert` - convert an amount of one currency into another, e.g. `/convert 100 ark eth`.
- [ ] `/regret` - show how much money you missed out on cos you sold too early - e.g `/regret 10000 BTC 41 USD`
- [ ] `/top10` - get the top 10 currencies by market cap, with optional conversion (symbol). E.g. `/top10 gbp`
- [ ] `/top20` - get the top 20 currencies by market cap, with optional conversion (symbol). E.g. `/top20 btc`
- [ ] `/markets` - show a list of markets (exchanges) where a currency can be traded. E.g. `/markets ark`

### Command Info (to send to BotFather):

```
price - <coin/symbol=bitcoin> <in=USD>
convert - <amount=1> <from=BTC> <to=USD>

price - [<coin/symbol>=bitcoin] [<in>=USD]
convert - [<amount>=1] [<from>=BTC] [<to>=USD]
```

## Local development

- Run the function locally in watch mode with `npm start`
- Run all tests in watch mode with `npm run test:watch`

## Deployment using CI/CD

- Deployment will only run if lint and tests pass
- Push to master (or merge a PR) to deploy to Staging (@DevWhatCoinBot)
- Create a release using `npm run release` to deploy to Prod (@WhatCoinBot)

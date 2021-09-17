# WhatCoin

[![CI/CD](https://github.com/miridius/whatcoin/workflows/Lint%2C%20Test%2C%20and%20Deploy%20to%20Azure/badge.svg)](https://github.com/miridius/whatcoin/actions?query=workflow%3A%22Lint%2C+Test%2C+and+Deploy+to+Azure%22)
[![codecov](https://codecov.io/gh/miridius/whatcoin/branch/master/graph/badge.svg?token=S0Z55GXV84)](https://codecov.io/gh/miridius/whatcoin)

WhatCoin is a Telegram Bot which gives price and market information about crypto currencies.

It runs on AWS Lambda using the [serverless-telegram](https://github.com/miridius/serverless-telegram) sister library.

## Bot Usage

Notes:

- Coins can be input as name, symbol, or a prefix thereof. Currencies must be a symbol
- Commands and arguments are not case sensitive.
- The user's locale is respected when it comes to number formatting.

### Implemented Commands / TO DOs

- [x] `/price` - get current price info about a currency, with optional conversion. E.g. `/price bitcoin eur`
- [x] `/convert` - convert an amount of one currency into another, e.g. `/convert 100 ark eth`.
- [x] `/regret` - show how much money you missed out on cos you sold too early - e.g `/regret 10000 BTC 41 USD`
- [x] `/top10` - get the top 10 currencies by market cap, with optional conversion (symbol). E.g. `/top10 gbp`
- [x] `/top20` - get the top 20 currencies by market cap, with optional conversion (symbol). E.g. `/top20 btc`
- [x] `/chart` - generate a chart of price & volume for the last X days and send it as an image
- [x] `/ohlc` - generate an OHLC candlestick chart for the last X days and send it as an image
- [ ] `/markets` - show a list of markets (exchanges) where a currency can be traded. E.g. `/markets ark`
- [x] `/version` - show bot version (on deploy: send notification/update bot name?)
- [ ] `/help` - show commands & their arguments
- [ ] `/settings` - bot settings (e.g. default vs currency)
- [ ] Update bot about & description

### Command Info (to send to BotFather):

```
price - <coin/symbol=bitcoin> <in=USD>
convert - <amount=1> <from=BTC> <to=USD>
chart - <coin=btc> <in=USD> <days=1>
ohlc - <coin=btc> <in=USD> <days=1>
top10 - <in=USD>
top20 - <in=USD>
regret - <amt> <coin> <soldFor> <in=USD>
```

## Local development

- Run the function as a local web server in watch mode with `npm start`
- Run the function against a live development bot with `npm dev` (create a `.env` file with your `BOT_API_TOKEN first)
- Run all tests in watch mode with `npm run test:watch`

## Deployment using CI/CD

- Deployment will only run if lint and tests pass
- Push to master (or merge a PR) to deploy to Staging (@TestWhatCoinBot)
- Create a release using `npm run release` to deploy to Prod (@WhatCoinBot)

## Manual deployment

Run `npm run deploy` to build & deploy to a stack called "whatcoin-dev" using the BOT_API_TOKEN from your .env file.

This can be useful for troubleshooting build & deployment issues, or issues which only occur when running in AWS but not locally.

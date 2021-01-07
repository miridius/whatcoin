# WhatcoinJS

WhatCoin is a Telegram Bot which gives price and market information about crypto currencies.

It runs on Azure Functions using the [serverless-telegram](https://github.com/miridius/serverless-telegram) sister library.

## Bot Usage

Available commands:

- `/price <crypto name or symbol> [<base currency symbol>]`
- `/convert <amount> <from name or symbol> <to name or symbol>`

## Local development

- Run the function locally in watch mode with `npm start`
- Run all tests in watch mode with `npm run test:watch`

## Deployment using CI/CD

- Deployment will only run if lint and tests pass
- Push to master (or merge a PR) to deploy to Staging (@DevWhatCoinBot)
- Create a release using `npm run release` to deploy to Prod (@WhatCoinBot)

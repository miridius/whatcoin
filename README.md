# WhatcoinJS

WhatCoin is a Telegram Bot which gives price and market information about crypto currencies.

It runs on Azure Functions using the [serverless-telegram](https://github.com/miridius/serverless-telegram) sister library.

## Bot Usage

Available commands:

- `/price <crypto name or symbol> [<base currency symbol>]`

## CI/CD

- Any PR to master will run linting and tests
- Any commit to master that passes lint/tests will deploy to Staging (@DevWhatCoinBot)
- If the commit is tagged it will also deploy to Prod (@WhatCoinBot). Create a tag using `np` as follows:

```bash
# Install np globally if not already installed
npm i -g np
# Choose ONE of the commands below depending on type of release
np patch --no-publish --no-yarn
np minor --no-publish --no-yarn
np major --no-publish --no-yarn
```

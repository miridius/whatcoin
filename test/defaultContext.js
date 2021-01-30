/** @type {import("serverless-telegram").Context} */
module.exports = {
  log: { verbose: jest.fn, info: jest.fn, warn: jest.fn, error: jest.fn },
};

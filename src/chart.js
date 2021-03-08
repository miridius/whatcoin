const CoinGecko = require('coingecko-api');
const { compile } = require('vega-lite');
const vega = require('vega');
const sharp = require('sharp');

const api = new CoinGecko();

const font = 'Arial';
const fontSize = 20;
const titleFont = font;
const titleFontSize = 18;

const labelFontSize = 12;

// https://coolors.co/0a0908-ebebeb-5fad56-819554-a37d52-8f8f8f
const theme = {
  background: '#0A0908',
  title: '#EBEBEB',
  priceUp: '#5FAD56',
  priceDown: '#DC136C',
  volume: '#A37D52',
  dates: '#8F8F8F',
};

const getChartData = async (id, vs_currency, days) => {
  const { data } = await api.coins.fetchMarketChart(id, { vs_currency, days });
  return {
    values: data.total_volumes
      .map(([x, y]) => ({ x, y: y / 1000000, type: 'vol' }))
      .concat(data.prices.map(([x, y]) => ({ x, y, type: 'price' }))),
    isRising: data.prices[data.prices.length - 1][1] >= data.prices[0][1],
  };
};

const makeTitle = (name, vs, days) =>
  `${name} vs ${vs.toUpperCase()} - last ${days} day${days == 1 ? '' : 's'}`;

const createChartSpec = (name, vs, days, values, isRising) => {
  const priceColor = isRising ? theme.priceUp : theme.priceDown;
  return compile({
    $schema: 'https://vega.github.io/schema/vega-lite/v4.json',
    width: 700,
    height: 500,
    background: theme.background,
    title: {
      text: makeTitle(name, vs, days),
      fontSize,
      font,
      color: theme.title,
    },
    data: { values },
    encoding: {
      x: {
        field: 'x',
        type: 'temporal',
        axis: {
          format: '%d/%m %H:%M',
          labelAngle: -45,
          tickCount: 10,
          title: null,
          labelColor: theme.dates,
          labelFontSize,
          grid: false,
        },
      },
      y: { type: 'quantitative' },
    },
    layer: [
      {
        transform: [{ filter: "datum.type == 'vol'" }],
        mark: {
          line: { opacity: 0.5, color: theme.volume },
          type: 'area',
          opacity: 0.25,
          color: {
            x1: 1,
            y1: 1,
            x2: 1,
            y2: 0,
            gradient: 'linear',
            stops: [
              { offset: 0, color: theme.background },
              { offset: 1, color: theme.volume },
            ],
          },
        },
        encoding: {
          y: {
            field: 'y',
            scale: { zero: false },
            title: `24h Volume (Mil. ${vs.toUpperCase()})`,
            axis: {
              titleColor: theme.volume,
              titleFontSize,
              titleFont,
              labelColor: theme.volume,
              labelFontSize,
            },
          },
        },
      },
      {
        transform: [{ filter: "datum.type == 'price'" }],
        mark: { stroke: priceColor, type: 'line' },
        encoding: {
          y: {
            field: 'y',
            scale: { zero: false },
            title: `Price (${vs.toUpperCase()})`,
            axis: {
              titleColor: priceColor,
              titleFontSize,
              titleFont,
              labelColor: priceColor,
              labelFontSize,
              grid: true,
              gridColor: priceColor,
              gridOpacity: 0.25,
            },
          },
        },
      },
    ],
    resolve: { scale: { y: 'independent' } },
  }).spec;
};

const createOhlcSpec = ({ id, name }, vs, days) => {
  return compile({
    $schema: 'https://vega.github.io/schema/vega-lite/v4.json',
    width: 700,
    height: 500,
    title: {
      text: makeTitle(name, vs, days),
      fontSize,
      font,
    },
    data: {
      url: `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=${vs}&days=${days}`,
    },
    encoding: {
      x: {
        field: '0',
        type: 'temporal',
        axis: {
          format: '%d/%m %H:%M',
          labelAngle: -45,
          title: null,
        },
      },
      y: {
        type: 'quantitative',
        scale: { zero: false },
        axis: {
          title: `Price (${vs.toUpperCase()})`,
          titleFontSize,
          titleFont,
          labelFontSize,
        },
      },
      color: {
        condition: {
          test: 'datum[1] < datum[4]',
          value: '#06982d',
        },
        value: '#ae1325',
      },
    },
    layer: [
      {
        mark: 'rule',
        encoding: {
          y: { field: '2' },
          y2: { field: '3' },
        },
      },
      {
        mark: 'bar',
        encoding: {
          y: { field: '1' },
          y2: { field: '4' },
        },
      },
    ],
  }).spec;
};

/**
 * @this {import('serverless-telegram').MessageEnv}
 * @returns {Promise<import('serverless-telegram').MessageResponse>}
 */
async function vegaToPng(spec, filename) {
  this.debug('rendering...');
  const view = new vega.View(vega.parse(spec), { renderer: 'none' });

  this.debug('generating SVG...');
  const svg = await view.toSVG();

  this.debug('saving to PNG file...');
  const buffer = await sharp(Buffer.from(svg)).toBuffer();
  return { photo: { buffer, filename } };
}

/**
 * @this {import('serverless-telegram').MessageEnv}
 * @returns {Promise<import('serverless-telegram').MessageResponse>}
 */
exports.makeChart = async function ({ id, name }, vs, days) {
  // let the user know we're working on it... (`await` ommitted intentionally)
  this.send({ action: 'upload_photo' });

  this.debug('fetching chart data...', id, vs, days);
  const { values, isRising } = await getChartData(id, vs, days);

  this.debug('compiling...');
  const spec = createChartSpec(name, vs, days, values, isRising);

  const filename = `${id}_${vs}_${days}d_${new Date().toJSON()}.png`;
  return vegaToPng.call(this, spec, filename);
};

/**
 * @this {import('serverless-telegram').MessageEnv}
 * @returns {Promise<import('serverless-telegram').MessageResponse>}
 */
exports.ohlc = async function (coin, vs, days) {
  // let the user know we're working on it... (`await` ommitted intentionally)
  this.send({ action: 'upload_photo' });

  this.debug('compiling...');
  const spec = createOhlcSpec(coin, vs, days);

  const filename = `ohlc_${coin.id}_${vs}_${days}d_${new Date().toJSON()}.png`;
  return vegaToPng.call(this, spec, filename);
};

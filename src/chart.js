const CoinGecko = require('coingecko-api');
const vega = require('vega');
const { compile } = require('vega-lite');

const fs = require('fs');
const os = require('os');
const path = require('path');

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

const getData = async (id, vs_currency, days) => {
  const { data } = await api.coins.fetchMarketChart(id, { vs_currency, days });
  return {
    values: data.total_volumes
      .map(([x, y]) => ({ x, y: y / 1000000, type: 'vol' }))
      .concat(data.prices.map(([x, y]) => ({ x, y, type: 'price' }))),
    rising: data.prices[data.prices.length - 1][1] >= data.prices[0][1],
  };
};

const capitalise = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const createSpec = (name, vs, days, values, rising) => {
  const priceColor = rising ? theme.priceUp : theme.priceDown;
  return compile({
    $schema: 'https://vega.github.io/schema/vega-lite/v4.json',
    description:
      'A dual axis chart, created by setting y\'s scale resolution to `"independent"`',
    width: 800,
    height: 600,
    background: theme.background,
    title: {
      text: `${capitalise(name)} - last ${days}d`,
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
          // gridColor: theme.dates,
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

/**
 * @param {vega.View} view
 * @returns {import('canvas').Canvas} canvas
 */
// @ts-ignore
const getCanvas = (view) => view.toCanvas();

/**
 * Generate a static PNG image
 * @param {import('canvas').Canvas} canvas
 */
const savePng = async (canvas) =>
  new Promise((resolve) => {
    const filePath = path.resolve(os.tmpdir(), `${+new Date()}.png`);
    const out = fs.createWriteStream(filePath);
    canvas.createPNGStream().pipe(out);
    out.on('finish', () => resolve(filePath));
  });

/** @this {import('serverless-telegram').MessageEnv} */
exports.makeChart = async function ({ id, name }, vs, days) {
  // let the user know we're working on it... (`await` ommitted intentionally)
  this.send({ action: 'upload_photo' });

  this.debug('fetching chart data...', id, vs, days);
  const { values, rising } = await getData(id, vs, days);
  this.debug({ rising });

  this.debug('compiling...');
  const spec = createSpec(name, vs, days, values, rising);

  this.debug('rendering...');
  const view = new vega.View(vega.parse(spec), { renderer: 'none' });
  const canvas = await getCanvas(view);

  this.debug('saving PNG...');
  const photo = await savePng(canvas);
  return { photo };
};

import log4js from 'log4js';

log4js.configure({
  appenders: {
    out: {
      type: 'stdout',
      layout: {
        type: 'pattern',
        pattern: '[%d{MM-dd hh:mm:ss}] %[[%p]%] %c - %m'
      }
    },
  },
  categories: {
    default: { appenders: ['out'], level: 'all' }
  }
});

const logger = log4js.getLogger();

export default logger;
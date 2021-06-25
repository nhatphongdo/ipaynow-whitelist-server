'use strict';

const _ = require('lodash');

const { Cache } = require('../../../services/cache');

module.exports = {
  find: async ctx => {
    let rates = await Cache.get(strapi.models.rate.AllRatesCache);
    if (!rates) {
      rates = (await strapi.services.rate.find()).map(item => _.omit(item, ['id', 'created_at']));
      await Cache.set(strapi.models.rate.AllRatesCache, rates);
    }

    ctx.send(rates);
  }
};

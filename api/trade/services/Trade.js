'use strict';

const { Cache } = require('../../../services/cache');

module.exports = {
  clearUserCache: async user => {
    await Cache.del(strapi.models.trade.AllTradesByUserCache + user + '-pending');
    await Cache.del(strapi.models.trade.AllTradesByUserCache + user + '-completed');
    await Cache.del(strapi.models.trade.AllTradesByUserCache + user + '-paying');
  }
};

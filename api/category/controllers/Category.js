'use strict';

const _ = require('lodash');

const { Cache } = require('../../../services/cache');

module.exports = {
  find: async ctx => {
    let categories = await Cache.get(strapi.models.category.AllCategoriesCache);
    if (!categories) {
      categories = (await strapi.services.category.find()).map(item => _.omit(item, ['id', 'created_at', 'updated_at']));
      await Cache.set(strapi.models.category.AllCategoriesCache, categories);
    }

    ctx.send(categories);
  }
};

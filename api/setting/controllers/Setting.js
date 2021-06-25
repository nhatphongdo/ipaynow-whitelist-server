'use strict';
const _ = require('lodash');

const { Cache } = require('../../../services/cache');

module.exports = {
  find: async ctx => {
    try {
      let settings = await Cache.get(strapi.models.setting.ClientSettingsCache);
      if (!settings) {
        settings = (await strapi.query('setting').find({ serverOnly: false }));
        await Cache.set(strapi.models.setting.ClientSettingsCache, settings);
      }

      ctx.send(settings.map(item => _.omit(item, ['created_at', 'updated_at', 'serverOnly'])));
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = 'Setting.error.load';
      ctx.badRequest(null, ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message);
    }
  }
};

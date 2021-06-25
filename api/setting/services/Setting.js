"use strict";

const _ = require("lodash");

const { Cache, ShortTtl } = require("../../../services/cache");
const { ACCOUNT_NUMBER } = require("../../format/models/Format");

module.exports = {
  getAccountNumber: async () => {
    // Get all special formats
    let formats = await Cache.get(strapi.models.format.AllFormatsCacheName);
    if (!formats) {
      formats = await strapi
        .query("format")
        .find({ type: ACCOUNT_NUMBER, enabled: true });
      await Cache.set(strapi.models.format.AllFormatsCacheName, formats);
    }

    // Get maximum account number
    let accountNumber = 1;
    let maxAccountNumberRecords = await strapi.services.setting.find({
      name: strapi.models.setting.CurrentAccountNumberSetting
    });
    if (maxAccountNumberRecords.length > 0) {
      accountNumber = parseInt(maxAccountNumberRecords[0].value);
    }

    // Get from cache to see if there is any update already
    let cachedAccountNumber = await Cache.get(
      strapi.models.setting.CurrentAccountNumberCache
    );
    if (cachedAccountNumber && cachedAccountNumber > accountNumber) {
      accountNumber = cachedAccountNumber;
    }

    let valid = true;
    do {
      valid = strapi.services.format.validateAccountNumber(
        accountNumber,
        formats
      );

      if (!valid) {
        accountNumber += 1;
        await Cache.set(
          strapi.models.setting.CurrentAccountNumberCache,
          accountNumber + 1,
          ShortTtl
        );
      }
    } while (!valid);

    // This is selected id, update to database
    if (maxAccountNumberRecords.length > 0) {
      await strapi.services.setting.update(
        { id: maxAccountNumberRecords[0].id },
        {
          value: accountNumber + 1
        }
      );
    } else {
      await strapi.services.setting.create({
        name: strapi.models.setting.CurrentAccountNumberSetting,
        value: accountNumber + 1,
        serverOnly: true
      });
    }

    return accountNumber;
  },

  getSetting: async name => {
    // Get from cache to see if there is any update already
    let cacheValue = await Cache.get("settings." + name);
    if (!cacheValue) {
      let record = _.head(await strapi.services.setting.find({ name: name }));
      if (record) {
        // Set to cache
        await Cache.set("settings." + name, record.value);
        return record.value;
      }
    } else {
      return cacheValue;
    }

    return null;
  },

  updateSetting: async (name, value, serverOnly = true) => {
    let records = await strapi.services.setting.find({ name: name });
    if (records.length > 0) {
      // Update
      return await strapi.services.setting.update(
        { id: records[0].id },
        {
          value: value.toString()
        }
      );
    } else {
      return await strapi.services.setting.create({
        name: name,
        value: value.toString(),
        serverOnly: serverOnly
      });
    }
  }
};

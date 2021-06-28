"use strict";

const Axios = require("axios");
const _ = require("lodash");

const { Cache } = require("../../../services/cache");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const _loadCoinMarketCapQuotes = async (base, currencies, apiKey) => {
  try {
    const response = await Axios.get(
      strapi.models.rate.CMC_API_URL + "/quotes/latest",
      {
        params: {
          symbol: base,
          convert: currencies,
        },
        headers: {
          "X-CMC_PRO_API_KEY": apiKey,
        },
      }
    );
    if (response.data.status.error_code !== 0) {
      // Error from CMC
      return null;
    }
    return response.data;
  } catch (err) {
    if (err.response) {
      console.log(err.response.data);
    } else {
      console.log(err);
    }
    return null;
  }
};

const _saveCoinMarketCapQuotes = async (base, quote) => {
  const keys = Object.keys(quote);
  for (let i = 0; i < keys.length; i++) {
    await strapi.services.rate.updateRate(
      base,
      keys[i],
      quote[keys[i]].price,
      "CMC"
    );
  }
};

module.exports = {
  updateRate: async (base, foreign, rate, source) => {
    if (!rate || !foreign || !rate) {
      return null;
    }

    let records = await strapi.services.rate.find({
      baseCurrency: base.toLowerCase(),
      foreignCurrency: foreign.toLowerCase(),
      source: source || "",
    });
    if (records.length > 0) {
      // Update
      records[0].rate = rate;
      return await strapi.services.rate.update(
        { id: records[0].id },
        records[0]
      );
    } else {
      // Add
      return await strapi.services.rate.create({
        baseCurrency: base.toLowerCase(),
        foreignCurrency: foreign.toLowerCase(),
        rate: rate,
        source: source || "",
      });
    }
  },

  updateFromCoinMarketCap: async () => {
    // Get settings
    let currencies = (
      (await strapi.services.setting.getSetting(
        strapi.models.setting.SupportedCurrenciesSetting
      )) || ""
    ).split(",");
    let freePlan =
      ((await strapi.services.setting.getSetting(
        strapi.models.setting.CoinMarketCapFreePlanSetting
      )) || "1") === "1";
    let apiKey =
      (await strapi.services.setting.getSetting(
        strapi.models.setting.CoinMarketCapApiKeySetting
      )) || "";

    if (freePlan) {
      for (let i = 0; i < currencies.length; i++) {
        const quote = await _loadCoinMarketCapQuotes(
          "ETH",
          currencies[i],
          apiKey
        );
        if (quote != null) {
          await _saveCoinMarketCapQuotes("ETH", quote.data.ETH.quote);
        }
        await sleep(1000);
      }
    } else {
      const quote = await _loadCoinMarketCapQuotes(
        "ETH",
        currencies.join(","),
        apiKey
      );
      if (quote != null) {
        await _saveCoinMarketCapQuotes("ETH", quote.data.ETH.quote);
      }
    }
  },

  getRate: async (from, to, source = "CMC") => {
    if (!from || !to) {
      return 0;
    }

    let rates = await Cache.get(strapi.models.rate.AllRatesCache);
    if (!rates) {
      rates = (await strapi.services.rate.find()).map((item) =>
        _.omit(item, ["id", "created_at"])
      );
      await Cache.set(strapi.models.rate.AllRatesCache, rates);
    }

    // if (from.toLowerCase() === "ruby") {
    //   from = "usd";
    // }
    // if (to.toLowerCase() === "ruby") {
    //   to = "usd";
    // }

    let rate = _.find(rates, {
      baseCurrency: from.toLowerCase(),
      foreignCurrency: to.toLowerCase(),
      source: source,
    });
    if (rate) {
      return rate.rate;
    }
    rate = _.find(rates, {
      baseCurrency: to.toLowerCase(),
      foreignCurrency: from.toLowerCase(),
      source: source,
    });
    if (rate) {
      return 1.0 / rate.rate;
    }

    const base = "eth";
    let fromRate = _.find(rates, {
      baseCurrency: base,
      foreignCurrency: from.toLowerCase(),
      source: source,
    });
    let toRate = _.find(rates, {
      baseCurrency: base,
      foreignCurrency: to.toLowerCase(),
      source: source,
    });
    fromRate = fromRate ? fromRate.rate : null;
    toRate = toRate ? toRate.rate : null;
    if (!fromRate || !toRate) {
      // For non-official supported currencies like REWARD / POINT
      const bases = _.map(
        _.uniqBy(rates, "baseCurrency"),
        (item) => item.baseCurrency
      );
      for (let baseCurrency of bases) {
        const fromCurrentToFrom = _.find(rates, {
          baseCurrency: baseCurrency,
          foreignCurrency: from.toLowerCase(),
          source: source,
        });
        const fromCurrentToTo = _.find(rates, {
          baseCurrency: baseCurrency,
          foreignCurrency: to.toLowerCase(),
          source: source,
        });
        const fromBaseToCurrent = _.find(rates, {
          baseCurrency: base,
          foreignCurrency: baseCurrency,
          source: source,
        });
        if (
          fromBaseToCurrent &&
          ((!fromRate && fromCurrentToFrom) || (!toRate && fromCurrentToTo))
        ) {
          if (!fromRate) {
            fromRate = fromCurrentToFrom.rate * fromBaseToCurrent.rate;
          }
          if (!toRate) {
            toRate = fromCurrentToTo.rate * fromBaseToCurrent.rate;
          }
        }
      }
      if (!fromRate || !toRate) {
        return 0;
      }
    }
    return toRate / fromRate;
  },
};

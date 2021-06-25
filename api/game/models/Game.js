"use strict";

const { Cache } = require("../../../services/cache");

const WIN = "Win";
const LOSE = "Lose";
const PLAYING = "Playing";

const REWARD = "Reward";
const HDN = "HDN";
const PERCENT_OF_TOTAL_COST = "PercentOfTotalCost";

const LUCKY_DRAW = "Lucky Draw";
const ROLLING_DICE = "Rolling Dice";

const AllGamesCache = "games.all";

/**
 * Lifecycle callbacks for the `Game` model.
 */

module.exports = {
  WIN,
  LOSE,
  PLAYING,

  REWARD,
  HDN,
  PERCENT_OF_TOTAL_COST,

  LUCKY_DRAW,
  ROLLING_DICE,

  AllGamesCache,

  // Before saving a value.
  // Fired before an `insert` or `update` query.
  // beforeSave: async (model, attrs, options) => {},

  // After saving a value.
  // Fired after an `insert` or `update` query.
  afterSave: async (model, response, options) => {
    await Cache.del(AllGamesCache);
  },

  // Before fetching a value.
  // Fired before a `fetch` operation.
  // beforeFetch: async (model, columns, options) => {},

  // After fetching a value.
  // Fired after a `fetch` operation.
  // afterFetch: async (model, response, options) => {},

  // Before fetching all values.
  // Fired before a `fetchAll` operation.
  // beforeFetchAll: async (model, columns, options) => {},

  // After fetching all values.
  // Fired after a `fetchAll` operation.
  // afterFetchAll: async (model, response, options) => {},

  // Before creating a value.
  // Fired before an `insert` query.
  // beforeCreate: async (model, attrs, options) => {},

  // After creating a value.
  // Fired after an `insert` query.
  // afterCreate: async (model, attrs, options) => {},

  // Before updating a value.
  // Fired before an `update` query.
  // beforeUpdate: async (model, attrs, options) => {},

  // After updating a value.
  // Fired after an `update` query.
  // afterUpdate: async (model, attrs, options) => {},

  // Before destroying a value.
  // Fired before a `delete` query.
  // beforeDestroy: async (model, attrs, options) => {},

  // After destroying a value.
  // Fired after a `delete` query.
  afterDestroy: async (model, attrs, options) => {
    await Cache.del(AllGamesCache);
  }
};

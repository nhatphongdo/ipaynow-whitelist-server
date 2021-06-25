"use strict";

const TRANSFER = "Transfer";
const SPLIT_TRANSFER = "Split Transfer";
const BUY_REWARD = "Buy Reward";
const DEPOSIT = "Deposit";
const GAME_SPENT = "Game Spent";
const EXCHANGE_SELL_ESCROW = "Exchange Sell Escrow";
const EXCHANGE_SELL_RELEASE = "Exchange Sell Release";
const EXCHANGE_SELL_WITHDRAW = "Exchange Sell Withdraw";
const BUY_STORE_ITEM = "Buy Store Item";

const SUCCESS = "Success";
const FAILED = "Failed";
const PENDING = "Pending";

const ETH = "ETH";
const HDN = "HDN";
const REWARD = "REWARD";

/**
 * Lifecycle callbacks for the `Transaction` model.
 */

module.exports = {
  TRANSFER,
  SPLIT_TRANSFER,
  BUY_REWARD,
  DEPOSIT,
  GAME_SPENT,
  EXCHANGE_SELL_ESCROW,
  EXCHANGE_SELL_RELEASE,
  EXCHANGE_SELL_WITHDRAW,
  BUY_STORE_ITEM,

  SUCCESS,
  FAILED,
  PENDING,

  ETH,
  HDN,
  REWARD

  // Before saving a value.
  // Fired before an `insert` or `update` query.
  // beforeSave: async (model, attrs, options) => {},

  // After saving a value.
  // Fired after an `insert` or `update` query.
  // afterSave: async (model, response, options) => {},

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
  // afterDestroy: async (model, attrs, options) => {}
};

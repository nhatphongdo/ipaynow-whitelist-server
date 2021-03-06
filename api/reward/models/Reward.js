'use strict';

const { Cache } = require('../../../services/cache');

const UNKNOWN = 'Unknown';
const NEW_USER = 'New User';
const SENT_REBATE = 'Sent Rebate';
const DEPOSIT = 'Deposit';
const REFERRAL_BONUS = 'Referral Bonus';
const RECEIVE = 'Receive';
const EARN_LOCKED = 'Earn Locked';
const EARN_UNLOCKED = 'Earn Unlocked';
const EARN_INTEREST = 'Earn Interest';
const DAILY_INTEREST_DEDUCTION = 'Daily Interest Deduction';
const GAME_PRIZE = 'Game Prize';
const GAME_SPENT = 'Game Spent';
const BUY_STORE_ITEM = 'Buy Store Item';

const RewardsByUser = 'rewards.user:';
const RewardBalanceByUser = 'rewards.balance:user:';
const LockBalanceByUser = "rewards.lock-balance.user:";
const LockBalanceByAllUsers = "rewards.lock-balance.users";

module.exports = {
  UNKNOWN,
  NEW_USER,
  SENT_REBATE,
  DEPOSIT,
  REFERRAL_BONUS,
  RECEIVE,
  EARN_LOCKED,
  EARN_UNLOCKED,
  EARN_INTEREST,
  DAILY_INTEREST_DEDUCTION,
  GAME_PRIZE,
  GAME_SPENT,
  BUY_STORE_ITEM,

  RewardsByUser,
  RewardBalanceByUser,
  LockBalanceByUser,
  LockBalanceByAllUsers,

  // Before saving a value.
  // Fired before an `insert` or `update` query.
  // beforeSave: async (model, attrs, options) => {},

  // After saving a value.
  // Fired after an `insert` or `update` query.
  afterSave: async (model, response, options) => {
    await Cache.del(RewardsByUser + (model.attributes.user || ''));
    await Cache.del(RewardBalanceByUser + (model.attributes.user || ''));
    await Cache.del(LockBalanceByUser + (model.attributes.user || ""));
    await Cache.del(LockBalanceByAllUsers);

    if (strapi.socket && model.attributes.user) {
      strapi.socket.emitToUser(model.attributes.user, 'wallet_updated');
    }
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
    await Cache.del(RewardsByUser + (model.attributes.user || ''));
    await Cache.del(RewardBalanceByUser + (model.attributes.user || ''));
    await Cache.del(LockBalanceByUser + (model.attributes.user || ""));
    await Cache.del(LockBalanceByAllUsers);

    if (strapi.socket && model.attributes.user) {
      strapi.socket.emitToUser(model.attributes.user, 'wallet_updated');
    }
  }
};

'use strict';

const { Cache } = require('../../../services/cache');

const PENDING = 'Pending';
const SENT_TO_SELLER = 'Sent to Seller';
const WAIT_FOR_SELLER_APPROVAL = 'Wait for Seller approval';
const WAIT_FOR_PAYMENT = 'Wait for payment';
const PAID_WAIT_FOR_CONFIRMATION = 'Paid and wait for confirmation';
const SENDING_TO_BUYER = 'Sending to Buyer';
const COMPLETED = 'Completed';
const REJECTED = 'Rejected';
const NO_PAYMENT = 'No payment';
const NO_TOKEN = 'No token';
const CANCEL_PAYMENT = 'Cancel payment';
const CANCELLED = 'Cancelled';

const AllTradesByUserCache = 'exchanges.trades.user:';

module.exports = {
  PENDING,
  SENT_TO_SELLER,
  WAIT_FOR_SELLER_APPROVAL,
  WAIT_FOR_PAYMENT,
  PAID_WAIT_FOR_CONFIRMATION,
  SENDING_TO_BUYER,
  COMPLETED,
  REJECTED,
  NO_PAYMENT,
  NO_TOKEN,
  CANCEL_PAYMENT,
  CANCELLED,

  AllTradesByUserCache,

  // Before saving a value.
  // Fired before an `insert` or `update` query.
  // beforeSave: async (model, attrs, options) => {},

  // After saving a value.
  // Fired after an `insert` or `update` query.
  afterSave: async (model, response, options) => {
    await strapi.services.trade.clearUserCache(model.attributes.seller);
    await strapi.services.trade.clearUserCache(model.attributes.buyer);
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
    await strapi.services.trade.clearUserCache(model.attributes.seller);
    await strapi.services.trade.clearUserCache(model.attributes.buyer);
  }
};

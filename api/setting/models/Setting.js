'use strict';

const { Cache } = require('../../../services/cache');

/**
 * Lifecycle callbacks for the `Setting` model.
 */

const CurrentAccountNumberSetting = 'account.current-id';
const CentralWalletSetting = 'blockchain.central-wallet';
const DistributingWalletPrivateKey = 'blockchain.distributing-wallet-private-key';
const LastProcessBlockSetting = 'blockchain.last-block';
const CoinMarketCapApiKeySetting = 'global.coin-market-cap-api-key';
const CoinMarketCapFreePlanSetting = 'global.coin-market-cap-api-free';
const SupportedCurrenciesSetting = 'global.supported-currencies';
const BuyRewardRatioSetting = 'buy-reward.ratio';
const RewardRebateRateSetting = 'reward.rebate-rate';
const RewardReceiveSplitRatioSetting = 'reward.receive-split-ratio';
const RewardInterestRateSetting = 'reward.interest-rate';
const ReferralLevel1BonusSetting = 'referral.level-1.bonus';
const ReferralLevel2BonusSetting = 'referral.level-2.bonus';
const NewUserRewardSetting = 'account.new-user-reward';
const ThresholdInterestSendSetting = 'reward.intereset-threshold-send';
const ExchangeEscrowWalletSetting = 'exchange.escrow-wallet';
const ExchangeEscrowWalletPrivateKeySetting = 'exchange.escrow-wallet-private-key';
const ExchangeLimitAmountPerDaySetting = 'exchange.day-limit-amount';
const ExchangeLimitTimesPerDaySetting = 'exchange.day-limit-times';
const ExchangeMinAmountSetting = 'exchange.min-amount';
const ExchangeFeeRateSetting = 'exchange.fee-rate';
const StoreNumbersPerItemSetting = 'store.numbers-per-item';
const StoreWalletSetting = 'store.wallet';

// Cache keys
const ClientSettingsCache = 'settings.client.all';
const CurrentAccountNumberCache = 'settings.' + CurrentAccountNumberSetting;

module.exports = {
  CurrentAccountNumberSetting,
  LastProcessBlockSetting,
  CentralWalletSetting,
  DistributingWalletPrivateKey,
  CoinMarketCapApiKeySetting,
  CoinMarketCapFreePlanSetting,
  SupportedCurrenciesSetting,
  BuyRewardRatioSetting,
  RewardRebateRateSetting,
  RewardReceiveSplitRatioSetting,
  RewardInterestRateSetting,
  ReferralLevel1BonusSetting,
  ReferralLevel2BonusSetting,
  NewUserRewardSetting,
  ThresholdInterestSendSetting,
  ExchangeEscrowWalletSetting,
  ExchangeEscrowWalletPrivateKeySetting,
  ExchangeLimitAmountPerDaySetting,
  ExchangeLimitTimesPerDaySetting,
  ExchangeMinAmountSetting,
  ExchangeFeeRateSetting,
  StoreNumbersPerItemSetting,
  StoreWalletSetting,

  ClientSettingsCache,
  CurrentAccountNumberCache,

  // Before saving a value.
  // Fired before an `insert` or `update` query.
  //   beforeSave: async (model, attrs, options) => {},

  // After saving a value.
  // Fired after an `insert` or `update` query.
  afterSave: async (model, response, options) => {
    await Cache.del('settings.' + model.attributes.name);
    await Cache.del(ClientSettingsCache);
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
    await Cache.del('settings.' + model.attributes.name);
    await Cache.del(ClientSettingsCache);
  }
};

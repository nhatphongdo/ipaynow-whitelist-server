"use strict";

/**
 * Cron config that gives you an opportunity
 * to run scheduled jobs.
 *
 * The cron format consists of:
 * [SECOND (optional)] [MINUTE] [HOUR] [DAY OF MONTH] [MONTH OF YEAR] [DAY OF WEEK]
 *
 * See more details here: https://strapi.io/documentation/3.0.0-beta.x/concepts/configurations.html#cron-tasks
 */

module.exports = {
  "*/1 * * * *": () => {
    // Every minute
    const ThresholdTime = 55 * 1000; // 55 seconds in milliseconds
    const startTime = new Date().getTime();

    // Update status of pending transaction
    strapi.services.notification.processNotifications(startTime, ThresholdTime);
  },

  "*/5 * * * *": async () => {
    // Every 5 minutes
    const ThresholdTime = 4.5 * 60 * 1000; // 4.5 minutes in milliseconds
    const startTime = new Date().getTime();

    // Update status of pending transaction
    strapi.services.transaction.processPendingTransactions(
      startTime,
      ThresholdTime
    );
  },

  "*/15 * * * *": async () => {
    // Every 15 minutes
    const ThresholdTime = 14 * 60 * 1000; // 14 minutes in milliseconds
    const startTime = new Date().getTime();

    // Process transaction list to rebate to sender, split receiving
    // strapi.services.transaction.processSplitTransactions(
    //   startTime,
    //   ThresholdTime
    // );

    // Process Buy reward request
    strapi.services.transaction.processBuyRewardTransactions(
      startTime,
      ThresholdTime
    );

    // Process Sell request
    strapi.services.transaction.processExchangeSellTransactions(
      startTime,
      ThresholdTime
    );

    // Process Deposit reward request
    // strapi.services.transaction.processDepositTransactions(
    //   startTime,
    //   ThresholdTime
    // );
  },

  "0 */1 * * *": async () => {
    // Every 1 hour from 00:00
    // Process earn lock released every day
    strapi.services.reward.processEarnLocks();
  },

  "0 */6 * * *": async () => {
    // Every 6 hours from 00:00
    // Update rates from CoinMarketCap as CMC allows 333 credits per day / 21 credits per update ~ 12 updates per day
    strapi.services.rate.updateFromCoinMarketCap();
  },

  "0 */24 * * *": async () => {
    // Every 24 hours from 00:00
    // Process daily interest
    // strapi.services.interest.processDailyInterest();
    // Process expired membership
    // strapi.services.account.processMembership();
  },
};

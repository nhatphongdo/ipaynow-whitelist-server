"use strict";

const _ = require("lodash");

const { Cache } = require("../../../services/cache");

module.exports = {
  getRewardBalanceByUser: async (userId) => {
    let rewardBalance = await Cache.get(
      strapi.models.reward.RewardBalanceByUser + userId
    );
    if (!rewardBalance) {
      rewardBalance =
        _.head(
          await strapi.models.reward
            .query()
            .where({ user: userId })
            .sum({ balance: "amount" })
            .select()
        ).balance || 0;
      await Cache.set(
        strapi.models.reward.RewardBalanceByUser + userId,
        rewardBalance
      );
    }

    return rewardBalance;
  },

  getLockBalanceByUser: async (userId) => {
    let lockBalance = await Cache.get(
      strapi.models.reward.LockBalanceByUser + userId
    );
    if (!lockBalance) {
      lockBalance =
        _.head(
          await strapi.models.lock
            .query()
            .where({ user: userId })
            .sum({ balance: "amount" })
            .select()
        ).balance || 0;
      await Cache.set(
        strapi.models.reward.LockBalanceByUser + userId,
        lockBalance
      );
    }

    return lockBalance;
  },

  getLockBalanceByAllUsers: async () => {
    let lockBalance = await Cache.get(
      strapi.models.reward.LockBalanceByAllUsers
    );
    if (!lockBalance) {
      lockBalance =
        _.head(
          await strapi.models.lock.query().sum({ balance: "amount" }).select()
        ).balance || 0;
      await Cache.set(strapi.models.reward.LockBalanceByAllUsers, lockBalance);
    }

    return lockBalance;
  },

  processEarnLocks: async () => {
    // Get locks past completed
    const locks = (
      await strapi.models.lock
        .query((qb) => {
          qb.where("returned", false)
            .andWhere(function () {
              this.where("endedOn", "<=", new Date()).orWhereNull(
                "finished",
                true
              );
            })
            .orderBy("endedOn");
        })
        .fetchAll({ withRelated: ["user"] })
    ).toJSON();

    _.forEach(locks, async (lock) => {
      try {
        // Check if reward already is issued
        let reward = _.head(
          await strapi.services.reward.find({
            lock: lock.id,
            type: strapi.models.reward.EARN_UNLOCKED,
          })
        );

        if (!reward) {
          await strapi.services.reward.create({
            lock: lock.id,
            type: strapi.models.reward.EARN_UNLOCKED,
            amount: lock.amount,
            user: lock.user.id,
          });

          await strapi.services.log.info(
            `User ${lock.user.accountNumber} receives ${lock.amount} Reward back as lock #${lock.id} is released.`,
            lock.user
          );
        }

        reward = _.head(
          await strapi.services.reward.find({
            lock: lock.id,
            type: strapi.models.reward.EARN_INTEREST,
          })
        );

        if (!reward) {
          await strapi.services.reward.create({
            lock: lock.id,
            type: strapi.models.reward.EARN_INTEREST,
            amount: lock.amount * lock.interestRate,
            user: lock.user.id,
          });

          await strapi.services.log.info(
            `User ${lock.user.accountNumber} receives ${
              lock.amount * lock.interestRate
            } Reward as interest rate from lock #${lock.id}.`,
            lock.user
          );
        }

        await strapi.services.lock.update(
          {
            id: lock.id,
          },
          {
            finished: true,
            returnAmount: lock.amount * (1 + lock.interestRate),
            returned: true,
            returnedOn: new Date(),
          }
        );
      } catch (err) {
        strapi.log.fatal(err);
      }
    });
  },
};

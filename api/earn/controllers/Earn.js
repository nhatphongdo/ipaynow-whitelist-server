"use strict";

const _ = require("lodash");
const numeral = require("numeral");
const moment = require("moment");

const { Cache } = require("../../../services/cache");

module.exports = {
  find: async ctx => {
    try {
      let earns = await Cache.get(strapi.models.earn.AlllEarnsCache);
      if (!earns) {
        earns = await strapi.query("earn").find({
          _sort: "id"
        });
        await Cache.set(strapi.models.earn.AlllEarnsCache, earns);
      }

      ctx.send(
        earns.map(item => _.omit(item, ["created_at", "updated_at", "locks"]))
      );
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Earns.error.load";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  apply: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter.");
      }
      if (!message.amount) {
        return ctx.badRequest(null, "Missing `amount` parameter.");
      }

      // Check current lock
      const currentLock = await strapi.query("lock").find({
        user: ctx.state.user.id,
        finished_ne: true,
        endedOn_gt: moment()
          .utc()
          .toDate()
      });
      if (currentLock.length > 0) {
        // Exist
        return ctx.badRequest(null, "You already have locked a period");
      }

      const amountValue = numeral(message.amount);
      if (
        isNaN(amountValue.value()) ||
        amountValue.value() === null ||
        amountValue.value() <= 0
      ) {
        return ctx.badRequest(null, "`amount` is not a valid number");
      }

      // Get available reward of user
      let balance = await strapi.services.reward.getRewardBalanceByUser(
        ctx.state.user.id
      );
      if (!balance || amountValue.value() > balance) {
        return ctx.badRequest(null, "Insufficient balance to lock");
      }

      // Get the earn info
      let earn = await Cache.get(strapi.models.earn.EarnByIdCache + message.id);
      if (!earn) {
        earn = _.head(
          await strapi.query("earn").find({
            id: message.id
          })
        );
        await Cache.set(strapi.models.earn.EarnByIdCache + message.id, earn);
      }

      if (!earn) {
        return ctx.badRequest(null, "Cannot find the specific period to lock");
      }

      // Add to lock list
      let unit = "d";
      if (earn.lockPeriodUnit === strapi.models.earn.WEEK) {
        unit = "w";
      } else if (earn.lockPeriodUnit === strapi.models.earn.MONTH) {
        unit = "M";
      } else if (earn.lockPeriodUnit === strapi.models.earn.QUARTER) {
        unit = "Q";
      } else if (earn.lockPeriodUnit === strapi.models.earn.YEAR) {
        unit = "y";
      }
      const now = moment().utc();
      let lock = await strapi.services.lock.create({
        earn: earn.id,
        startedOn: now.toDate(),
        endedOn: now.add(earn.lockPeriodValue, unit).toDate(),
        amount: amountValue.value(),
        interestRate: earn.wholeRate,
        returned: false,
        finished: false,
        user: ctx.state.user.id
      });

      // Deduct in reward
      const lockReward = await strapi.services.reward.create({
        amount: -amountValue.value(),
        type: strapi.models.reward.EARN_LOCKED,
        user: ctx.state.user.id
      });

      // Add referral
      await strapi.services.transaction.processReferral(ctx.state.user, lock, lockReward);

      balance = await strapi.services.reward.getRewardBalanceByUser(
        ctx.state.user.id
      );

      await strapi.services.log.info(
        `User ${
          ctx.state.user.accountNumber
        } has locked an amount of ${amountValue.value()} Reward for ${
          earn.lockPeriodValue
        } ${earn.lockPeriodUnit} at rate ${numeral(earn.wholeRate).format(
          "0[.][00]%"
        )}.`,
        ctx.state.user
      );

      ctx.send({
        balance,
        lock: _.omit(lock, [
          "created_at",
          "earn.created_at",
          "earn.updated_at",
          "finished",
          "returnAmount",
          "returned",
          "returnedOn",
          "updated_at",
          "user"
        ])
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Earns.error.apply";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  }
};

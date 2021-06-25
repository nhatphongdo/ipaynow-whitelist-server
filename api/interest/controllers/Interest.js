"use strict";

const moment = require("moment");

module.exports = {
  claim: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      let rate =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.RewardInterestRateSetting
        )) || "0.002";
      rate = parseFloat(rate);
      if (isNaN(rate)) {
        rate = 0.002;
      }

      const startTime = moment()
        .utc()
        .startOf("day")
        .toDate();
      const endTime = moment()
        .utc()
        .endOf("day")
        .toDate();

      // Check if this interest exists
      let interest = await strapi.models.interest
        .query()
        .where("user", ctx.state.user.id)
        .andWhere("endedTime", ">=", startTime)
        .andWhere("endedTime", "<=", endTime)
        .select("id");
      if (interest.length > 0) {
        return ctx.badRequest(null, "You already claimed today interest.");
      }

      const rewardTotal = await strapi.services.reward.getRewardBalanceByUser(
        ctx.state.user.id
      );
      const hdnRate = await strapi.services.rate.getRate(
        strapi.models.transaction.REWARD,
        strapi.models.transaction.HDN
      );
      const bonus = rewardTotal * rate;

      await strapi.services.interest.create({
        user: ctx.state.user.id,
        amount: bonus * hdnRate,
        unit: strapi.models.transaction.HDN,
        startedTime: startTime,
        endedTime: endTime,
        processed: false
      });

      // Deduct the same amount in Reward
      await strapi.services.reward.create({
        amount: -bonus,
        user: ctx.state.user.id,
        type: strapi.models.reward.DAILY_INTEREST_DEDUCTION
      });

      await strapi.services.log.info(
        `User ${ctx.state.user.accountNumber} earns ${bonus * hdnRate} HDN as Daily interest.`,
        ctx.state.user
      );

      ctx.send({
        amount: bonus * hdnRate,
        startedTime: startTime,
        endedTime: endTime
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  }
};

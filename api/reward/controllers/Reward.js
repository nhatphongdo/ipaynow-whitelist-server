"use strict";

const _ = require("lodash");
const moment = require("moment");

module.exports = {
  info: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const currentLock = await strapi.services.lock.find(
        {
          user: ctx.state.user.id,
          finished_ne: true,
          endedOn_gt: moment().utc().toDate(),
        },
        ["earn"]
      );
      // const currentLock = _.filter(
      //   ctx.state.user.locks,
      //   item => !item.finished && moment(item.endedOn) > moment()
      // );
      // const earn =
      //   currentLock.length > 0
      //     ? await strapi.services.earn.findOne({ id: currentLock[0].earn })
      //     : null;
      if (currentLock.length > 0) {
        currentLock[0].earn = _.omit(currentLock[0].earn, [
          "created_at",
          "updated_at",
          // "locks"
        ]);
      }

      ctx.send({
        balance: await strapi.services.reward.getRewardBalanceByUser(
          ctx.state.user.id
        ),
        lockBalance: await strapi.services.reward.getLockBalanceByAllUsers(),
        lock: currentLock.length > 0 ? currentLock[0] : null,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },
};

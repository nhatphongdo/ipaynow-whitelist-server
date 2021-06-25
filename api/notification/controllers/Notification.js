"use strict";

const _ = require("lodash");

const { Cache } = require("../../../services/cache");

module.exports = {
  findOne: async ctx => {
    try {
      const id = ctx.params.id;

      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      let notification = await strapi.services.notification.findOne(
        { id: id },
        []
      );
      if (!notification) {
        return ctx.notFound();
      }
      if (notification.user !== ctx.state.user.id) {
        return ctx.notFound();
      }

      ctx.send(_.pick(notification, ["title", "message"]));
    } catch (err) {
      strapi.log.fatal(err);
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: err.message }] }] : err.message
      );
    }
  },

  find: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      let notifications = await Cache.get(
        strapi.models.notification.NotificationByUserCache + ctx.state.user.id
      );
      if (!notifications) {
        notifications = await strapi.services.notification.find(
          {
            sent: true,
            user: ctx.state.user.id,
            read_ne: true,
            _sort: "sentTime:desc"
          },
          []
        );

        await Cache.set(
          strapi.models.notification.NotificationByUserCache +
            ctx.state.user.id,
          notifications
        );
      }

      ctx.send(
        _.map(notifications, item =>
          _.pick(item, ["title", "message", "sentTime", "read"])
        )
      );
    } catch (err) {
      strapi.log.fatal(err);
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: err.message }] }] : err.message
      );
    }
  },

  readNotification: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const id = message.id || 0;
      if (id === 0) {
        await strapi.models.notification
          .query()
          .where("user", ctx.state.user.id)
          .andWhere("sent", true)
          .andWhere("read", false)
          .update({
            read: true
          });
      } else {
        await strapi.models.notification
          .query()
          .where("id", id)
          .andWhere("user", ctx.state.user.id)
          .andWhere("sent", true)
          .andWhere("read", false)
          .update({
            read: true
          });
      }

      await Cache.del(
        strapi.models.notification.NotificationByUserCache + ctx.state.user.id
      );

      ctx.send({ result: "ok" });
    } catch (err) {
      strapi.log.fatal(err);
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: err.message }] }] : err.message
      );
    }
  },

  sendNotification: async ctx => {
    try {
      const { userId, title, message } = ctx.request.body;
      const sendResult = await strapi.services.notification.send(userId, title, message);
      ctx.send({ result: "ok" });
    } catch (err) {
      strapi.log.fatal(err);
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: err.message }] }] : err.message
      );
    }
  }
};

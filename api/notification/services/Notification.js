"use strict";

const _ = require("lodash");
const moment = require("moment");

const { Expo } = require("expo-server-sdk");

// Create a new Expo SDK client
let expo = new Expo();

module.exports = {
  send: async (userId, title, message, notificationId = 0) => {
    try {
      const user = await strapi
        .query("user", "users-permissions")
        .findOne({ id: userId }, []);
      if (!user) {
        return;
      }

      const tokens = (user.pushNotificationTokens || "")
        .split("\n")
        .filter(item => item !== "");
      if (tokens.length === 0) {
        return;
      }

      // Create or update notification logs
      let notification = await strapi.services.notification.findOne(
        { id: notificationId },
        []
      );
      if (notification === null) {
        notification = await strapi.services.notification.create({
          title: title,
          message,
          retries: 0,
          sent: false,
          scheduleTime: moment()
            .utc()
            .toDate(),
          user: userId,
          read: false,
          sending: true
        });
        notificationId = notification.id;
      } else {
        notification.retries = notification.retries + 1;
        notification.sending = true;
        notification = await strapi.services.notification.update(
          { id: notification.id },
          notification
        );
      }

      let messages = [];
      for (let i = 0; i < tokens.length; i++) {
        // Check that all your push tokens appear to be valid Expo push tokens
        if (!Expo.isExpoPushToken(tokens[i])) {
          continue;
        }

        // Construct a message (see https://docs.expo.io/versions/latest/guides/push-notifications.html)
        messages.push({
          to: tokens[i],
          sound: "default",
          title: title,
          body: message,
          data: {
            id: notification.id
          }
        });
      }

      let tokenMaps = {};

      // The Expo push notification service accepts batches of notifications so
      // that you don't need to send 1000 requests to send 1000 notifications. We
      // recommend you batch your notifications to reduce the number of requests
      // and to compress them (notifications with similar content will get
      // compressed).
      let chunks = expo.chunkPushNotifications(messages);
      let tickets = [];
      await (async () => {
        // Send the chunks to the Expo push notification service. There are
        // different strategies you could use. A simple one is to send one chunk at a
        // time, which nicely spreads the load out over time:
        for (let chunk of chunks) {
          try {
            let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
            // NOTE: If a ticket contains an error code in ticket.details.error, you
            // must handle it appropriately. The error codes are listed in the Expo
            // documentation:
            // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
            for (let i = 0; i < chunk.length; i++) {
              if (
                ticketChunk[i].status === "error" &&
                ticketChunk[i].details &&
                ticketChunk[i].details.error === "DeviceNotRegistered"
              ) {
                _.pull(tokens, chunk[i].to);
              } else if (ticketChunk[i].status === "ok") {
                tokenMaps[ticketChunk[i].id] = chunk[i].to;
              }
            }
          } catch (error) {
            strapi.log.fatal(error);
          }
        }
      })();

      // Later, after the Expo push notification service has delivered the
      // notifications to Apple or Google (usually quickly, but allow the the service
      // up to 30 minutes when under load), a "receipt" for each notification is
      // created. The receipts will be available for at least a day; stale receipts
      // are deleted.
      //
      // The ID of each receipt is sent back in the response "ticket" for each
      // notification. In summary, sending a notification produces a ticket, which
      // contains a receipt ID you later use to get the receipt.
      //
      // The receipts may contain error codes to which you must respond. In
      // particular, Apple or Google may block apps that continue to send
      // notifications to devices that have blocked notifications or have uninstalled
      // your app. Expo does not control this policy and sends back the feedback from
      // Apple and Google so you can handle it appropriately.
      let receiptIds = [];
      for (let ticket of tickets) {
        // NOTE: Not all tickets have IDs; for example, tickets for notifications
        // that could not be enqueued will have error information and no receipt ID.
        if (ticket.id) {
          receiptIds.push(ticket.id);
        }
      }

      let receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
      await (async () => {
        // Like sending notifications, there are different strategies you could use
        // to retrieve batches of receipts from the Expo service.
        for (let chunk of receiptIdChunks) {
          try {
            let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            let success = false;
            // The receipts specify whether Apple or Google successfully received the
            // notification and information about an error, if one occurred.
            for (let key in receipts) {
              const receipt = receipts[key];
              if (receipt.status === "ok") {
                success = true;
                continue;
              } else if (receipt.status === "error") {
                if (receipt.details && receipt.details.error) {
                  // The error codes are listed in the Expo documentation:
                  // https://docs.expo.io/versions/latest/guides/push-notifications#response-format
                  // You must handle the errors appropriately.
                  if (receipt.details.error === "DeviceNotRegistered") {
                    if (_.has(tokenMaps, key)) {
                      _.pull(tokens, tokenMaps[key]);
                    }
                  }
                }
              }
            }

            if (success) {
              notification = await strapi.services.notification.update(
                {
                  id: notification.id
                },
                {
                  sent: true,
                  sending: false,
                  sentTime: moment()
                    .utc()
                    .toDate()
                }
              );
            } else {
              notification = await strapi.services.notification.update(
                {
                  id: notification.id
                },
                {
                  sending: false
                }
              );
            }

            await strapi.query("user", "users-permissions").update(
              {
                id: userId
              },
              {
                pushNotificationTokens: tokens.join("\n")
              }
            );
          } catch (error) {
            strapi.log.fatal(error);
          }
        }
      })();
    } catch (err) {
      strapi.log.fatal(err);
      await strapi.services.notification.update(
        {
          id: notificationId
        },
        {
          sending: false
        }
      );
    }
  },

  processNotifications: async (startTime, ThresholdTime) => {
    let currentTime = new Date().getTime();
    if (startTime && ThresholdTime && currentTime - startTime > ThresholdTime) {
      // Stop if over threshold
      return;
    }

    try {
      // Get all unprocessed transactions
      const notifications = (
        await strapi.models.notification
          .query(qb => {
            qb.where("sent", false)
              .andWhere("sending", false)
              .andWhere("retries", "<", 5)
              .andWhere("scheduleTime", "<=", new Date().toISOString())
              .orderBy("scheduleTime");
          })
          .fetchAll({ withRelated: [] })
      ).toJSON();

      for (var i = 0; i < notifications.length; i++) {
        const notification = notifications[i];
        currentTime = new Date().getTime();
        if (
          startTime &&
          ThresholdTime &&
          currentTime - startTime > ThresholdTime
        ) {
          // Stop if over threshold
          return;
        }

        await strapi.services.notification.send(
          notification.user,
          notification.title,
          notification.message,
          notification.id
        );
      }
    } catch (err) {
      strapi.log.fatal(err);
    }
  }
};

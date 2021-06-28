"use strict";

const _ = require("lodash");

module.exports = {
  send: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.txHash) {
        return ctx.badRequest(null, "Missing `txHash` parameter");
      }

      // Load all records related to this hash
      const records = await strapi.services.transaction.find(
        {
          transactionHash: message.txHash.toLowerCase()
        },
        []
      );

      // Find receiver if any
      let receiver = null;
      if (message.toAddress) {
        receiver = await strapi.query("user", "users-permissions").findOne(
          {
            walletAddress: message.toAddress.toLowerCase()
          },
          []
        );
      }

      let transaction;
      if (records.length > 0) {
        // Update old records with user link
        records.forEach(async record => {
          // Validate
          if (
            !ctx.state.user.walletAddress ||
            record.fromAddress !== ctx.state.user.walletAddress.toLowerCase()
          ) {
            return;
          }

          record.sender = ctx.state.user.id;
          if (
            record.type === strapi.models.transaction.TRANSFER &&
            record.toAddress
          ) {
            const user = await strapi
              .query("user", "users-permissions")
              .findOne(
                {
                  walletAddress: record.toAddress.toLowerCase()
                },
                []
              );
            record.receiver = user ? user.id : null;
          }

          // Update type if needed
          if (
            record.type === strapi.models.transaction.TRANSFER &&
            records.length === 1 &&
            message.type
          ) {
            record.type = message.type;
          }

          transaction = await strapi.services.transaction.update(
            { id: record.id },
            record
          );
        });
      } else {
        // Add
        // transaction = await strapi.services.transaction.create({
        //   fromAddress: ctx.state.user.walletAddress ? ctx.state.user.walletAddress.toLowerCase() : '',
        //   toAddress: message.toAddress ? message.toAddress.toLowerCase() : '',
        //   transactionHash: message.txHash.toLowerCase(),
        //   amount: message.amount,
        //   unit: message.isEth ? 'ETH' : 'USDT',
        //   sender: ctx.state.user.id,
        //   receiver: receiver ? receiver.id : null,
        //   type: message.type || strapi.models.transaction.TRANSFER,
        //   processed: false
        // });
      }

      ctx.send({
        receiver: receiver ? receiver.accountNumber : null
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Transactions.error.send";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  }
};

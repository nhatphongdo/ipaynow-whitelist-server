"use strict";

const _ = require("lodash");
const moment = require("moment");
const numeral = require("numeral");

var Hashids = require("hashids");
var hashids = new Hashids(
  "*R6h^4&05!!mq84CMrep5E$ro37gyH*v",
  8,
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789"
);

const { Cache } = require("../../../services/cache");
const Eth = require("../../../services/eth");
const eth = Eth();

module.exports = {
  find: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      let status = (message.status || "").toLowerCase();
      if (
        status !== "paying" &&
        status !== "completed" &&
        status !== "pending"
      ) {
        status = "pending";
      }

      let trades = await Cache.get(
        strapi.models.trade.AllTradesByUserCache +
          ctx.state.user.id +
          "-" +
          status
      );
      if (!trades) {
        let statuses = [];
        if (status === "paying") {
          statuses = [
            strapi.models.trade.WAIT_FOR_PAYMENT,
            strapi.models.trade.PAID_WAIT_FOR_CONFIRMATION
          ];
        } else if (status === "completed") {
          statuses = [
            strapi.models.trade.SENDING_TO_BUYER,
            strapi.models.trade.COMPLETED,
            strapi.models.trade.REJECTED,
            strapi.models.trade.NO_PAYMENT,
            strapi.models.trade.NO_TOKEN,
            strapi.models.trade.CANCEL_PAYMENT,
            strapi.models.trade.CANCELLED
          ];
        } else {
          statuses = [
            strapi.models.trade.PENDING,
            strapi.models.trade.SENT_TO_SELLER,
            strapi.models.trade.WAIT_FOR_SELLER_APPROVAL
          ];
        }
        trades = (
          await strapi.models.trade
            .query(qb => {
              qb.whereIn("status", statuses)
                .andWhere(function() {
                  this.where("seller", ctx.state.user.id).orWhere(
                    "buyer",
                    ctx.state.user.id
                  );
                })
                .orderBy("postTime", status === "completed" ? "desc" : "asc")
                .limit(100);
            })
            .fetchAll({ withRelated: ["buyer", "seller"] })
        ).toJSON();

        for (let i = 0; i < trades.length; i++) {
          trades[i].id = hashids.encode(trades[i].id);
          trades[i].selling = trades[i].seller.id === ctx.state.user.id;
          trades[i].buyer = _.pick(trades[i].buyer, ["accountNumber"]);
          trades[i].seller = _.pick(trades[i].seller, ["accountNumber"]);
          delete trades[i].transaction;
          delete trades[i].created_at;
          delete trades[i].updated_at;
        }

        await Cache.set(
          strapi.models.trade.AllTradesByUserCache +
            ctx.state.user.id +
            "-" +
            status,
          trades
        );
      }

      ctx.send(trades);
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  findOne: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter");
      }
      const numbers = hashids.decode(message.id);
      if (numbers.length === 0) {
        return ctx.badRequest(null, "`id` is not valid");
      }
      const id = numbers[0];
      let trade = await strapi.services.trade.findOne({ id: id });
      if (!trade) {
        return ctx.badRequest(null, "`id` is not valid");
      }

      if (
        trade.buyer.id !== ctx.state.user.id &&
        trade.seller.id !== ctx.state.user.id
      ) {
        return ctx.badRequest(null, "Invalid request");
      }

      let user =
        trade.buyer.id === ctx.state.user.id
          ? await Cache.get("users.id-" + trade.seller.id)
          : await Cache.get("users.id-" + trade.buyer.id);
      if (!user) {
        user =
          trade.buyer.id === ctx.state.user.id
            ? await strapi
                .query("user", "users-permissions")
                .findOne({ id: trade.seller.id }, [])
            : await strapi
                .query("user", "users-permissions")
                .findOne({ id: trade.buyer.id }, []);
        await Cache.set(
          trade.buyer.id === ctx.state.user.id
            ? "users.id-" + trade.seller.id
            : "users.id-" + trade.buyer.id,
          user
        );
      }
      if (!user) {
        return ctx.notFound();
      }

      if (user.availability === "Private") {
        return ctx.badRequest(null, "Invalid request");
      }

      if (
        user.email &&
        user.email.toLowerCase().startsWith("--do-not-use--") &&
        user.email.toLowerCase().endsWith("@fake.haladinar.io")
      ) {
        user.email = "";
      }
      user.isBuyer = trade.buyer.id === ctx.state.user.id;

      ctx.send(
        _.pick(user, [
          "fullName",
          "accountNumber",
          "email",
          "walletAddress",
          "contactNumber",
          "paymentInfo",
          "isBuyer"
        ])
      );
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  approve: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter");
      }
      const numbers = hashids.decode(message.id);
      if (numbers.length === 0) {
        return ctx.badRequest(null, "`id` is not valid");
      }
      const id = numbers[0];
      let trade = await strapi.services.trade.findOne({ id: id });
      if (!trade) {
        return ctx.badRequest(null, "`id` is not valid");
      }

      if (trade.status !== message.status) {
        return ctx.badRequest(null, "Invalid request");
      }

      switch (trade.status) {
        case strapi.models.trade.PENDING:
        case strapi.models.trade.SENT_TO_SELLER:
        case strapi.models.trade.WAIT_FOR_SELLER_APPROVAL:
          // Seller confirms
          if (
            trade.seller.id !== ctx.state.user.id &&
            trade.buyer.id !== ctx.state.user.id
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }

          if (trade.seller.id === ctx.state.user.id) {
            // Accept this trade
            await strapi.services.trade.update(
              {
                id: trade.id
              },
              {
                status: strapi.models.trade.WAIT_FOR_PAYMENT,
                sellerApproveTime: moment()
                  .utc()
                  .toDate()
              }
            );
            await strapi.services.trade.clearUserCache(trade.buyer.id);
            await strapi.services.trade.clearUserCache(trade.seller.id);

            strapi.services.notification.send(
              trade.buyer.id,
              "Haladinar",
              `User ${trade.seller.accountNumber} accepted to sell ${trade.unit} to you. Please check 'P2PX' to continue.`
            );

            return ctx.send({
              status: strapi.models.trade.WAIT_FOR_PAYMENT
            });
          } else if (trade.buyer.id === ctx.state.user.id) {
            // Cancel this trade
            await strapi.services.trade.update(
              {
                id: trade.id
              },
              {
                status: strapi.models.trade.CANCELLED,
                sellerApproveTime: moment()
                  .utc()
                  .toDate()
              }
            );
            await strapi.services.trade.clearUserCache(trade.buyer.id);
            await strapi.services.trade.clearUserCache(trade.seller.id);

            // Add back token
            await strapi.services.exchange.update(
              {
                id: trade.sellExchange.id
              },
              {
                remainAmount: trade.sellExchange.remainAmount + trade.amount
              }
            );

            strapi.services.notification.send(
              trade.seller.id,
              "Haladinar",
              `User ${trade.buyer.accountNumber} cancelled to buy ${trade.unit} from you.`
            );

            return ctx.send({
              status: strapi.models.trade.CANCELLED
            });
          } else {
            return ctx.badRequest(null, "Invalid request");
          }
        case strapi.models.trade.WAIT_FOR_PAYMENT:
          // Buyer confirms
          if (
            trade.buyer.id !== ctx.state.user.id &&
            trade.seller.id !== ctx.state.user.id
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }

          if (trade.buyer.id === ctx.state.user.id) {
            await strapi.services.trade.update(
              {
                id: trade.id
              },
              {
                status: strapi.models.trade.PAID_WAIT_FOR_CONFIRMATION,
                paidTime: moment()
                  .utc()
                  .toDate()
              }
            );
            await strapi.services.trade.clearUserCache(trade.buyer.id);
            await strapi.services.trade.clearUserCache(trade.seller.id);

            strapi.services.notification.send(
              trade.seller.id,
              "Haladinar",
              `User ${trade.buyer.accountNumber} confirmed payment for ${trade.unit} purchase. Please check 'P2PX' to continue.`
            );

            return ctx.send({
              status: strapi.models.trade.PAID_WAIT_FOR_CONFIRMATION
            });
          } else if (trade.seller.id === ctx.state.user.id) {
            await strapi.services.trade.update(
              {
                id: trade.id
              },
              {
                status: strapi.models.trade.CANCELLED,
                paidTime: moment()
                  .utc()
                  .toDate()
              }
            );
            await strapi.services.trade.clearUserCache(trade.buyer.id);
            await strapi.services.trade.clearUserCache(trade.seller.id);

            // Add back token
            await strapi.services.exchange.update(
              {
                id: trade.sellExchange.id
              },
              {
                remainAmount: trade.sellExchange.remainAmount + trade.amount
              }
            );

            strapi.services.notification.send(
              trade.buyer.id,
              "Haladinar",
              `User ${trade.seller.accountNumber} cancelled to sell ${trade.unit} to you.`
            );

            return ctx.send({
              status: strapi.models.trade.CANCELLED
            });
          } else {
            return ctx.badRequest(null, "Invalid request");
          }
        case strapi.models.trade.PAID_WAIT_FOR_CONFIRMATION:
        case strapi.models.trade.NO_PAYMENT:
          // Seller confirms
          if (trade.seller.id !== ctx.state.user.id) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          await strapi.services.trade.update(
            {
              id: trade.id
            },
            {
              status: strapi.models.trade.SENDING_TO_BUYER,
              confirmedTime: moment()
                .utc()
                .toDate()
            }
          );
          await strapi.services.trade.clearUserCache(trade.buyer.id);
          await strapi.services.trade.clearUserCache(trade.seller.id);

          strapi.services.notification.send(
            trade.buyer.id,
            "Haladinar",
            `User ${trade.seller.accountNumber} confirmed receiving payment. We are sending you the ${trade.unit}. Please check 'P2PX' for progress.`
          );

          // Send token
          var account = eth.getAccount(
            await strapi.services.setting.getSetting(
              strapi.models.setting.ExchangeEscrowWalletPrivateKeySetting
            )
          );
          eth.sendToken(
            account,
            trade.buyer.walletAddress,
            trade.amount,
            null,
            async receipt => {
              if (receipt.status) {
                var tx = await strapi.services.transaction.updateBlockchainTransaction(
                  receipt.from,
                  trade.buyer.walletAddress,
                  receipt.transactionHash,
                  trade.amount,
                  false,
                  receipt.status,
                  receipt
                );
                if (tx) {
                  await strapi.services.trade.update(
                    {
                      id: trade.id
                    },
                    {
                      transaction: tx.id
                    }
                  );

                  strapi.services.notification.send(
                    trade.buyer.id,
                    "Haladinar",
                    `We sent ${trade.amount} ${trade.unit} to your wallet. Please check 'P2PX' to finish the trade.`
                  );
                }
              }
            },
            null,
            async (error, receipt) => {}
          );
          return ctx.send({
            status: strapi.models.trade.SENDING_TO_BUYER
          });
        case strapi.models.trade.SENDING_TO_BUYER:
        case strapi.models.trade.NO_TOKEN:
          // Buyer confirms
          if (trade.buyer.id !== ctx.state.user.id) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          await strapi.services.trade.update(
            {
              id: trade.id
            },
            {
              status: strapi.models.trade.COMPLETED,
              completedTime: moment()
                .utc()
                .toDate()
            }
          );
          await strapi.services.trade.clearUserCache(trade.buyer.id);
          await strapi.services.trade.clearUserCache(trade.seller.id);
          // Check and remove Sell request if needed
          var allTrades = await strapi.services.trade.find(
            {
              sellExchange: trade.sellExchange.id,
              status: strapi.models.trade.COMPLETED
            },
            []
          );
          if (
            _.sumBy(allTrades, "amount") >= trade.sellExchange.amount &&
            trade.sellExchange.remainAmount <= 0
          ) {
            // Sold out
            await strapi.services.exchange.update(
              {
                id: trade.sellExchange.id
              },
              {
                isValid: false
              }
            );
          }

          strapi.services.notification.send(
            trade.seller.id,
            "Haladinar",
            `User ${trade.buyer.accountNumber} confirmed receiving ${trade.unit}. This trade is finished and closed.`
          );

          return ctx.send({
            status: strapi.models.trade.COMPLETED
          });
        default:
          return ctx.badRequest(null, "Invalid request");
      }
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  reject: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter");
      }
      const numbers = hashids.decode(message.id);
      if (numbers.length === 0) {
        return ctx.badRequest(null, "`id` is not valid");
      }
      const id = numbers[0];
      let trade = await strapi.services.trade.findOne({ id: id });
      if (!trade) {
        return ctx.badRequest(null, "`id` is not valid");
      }

      if (trade.status !== message.status) {
        return ctx.badRequest(null, "Invalid request");
      }

      switch (trade.status) {
        case strapi.models.trade.PENDING:
        case strapi.models.trade.SENT_TO_SELLER:
        case strapi.models.trade.WAIT_FOR_SELLER_APPROVAL:
          // Seller confirms
          if (trade.seller.id !== ctx.state.user.id) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          await strapi.services.trade.update(
            {
              id: trade.id
            },
            {
              status: strapi.models.trade.REJECTED,
              sellerApproveTime: moment()
                .utc()
                .toDate()
            }
          );
          await strapi.services.trade.clearUserCache(trade.buyer.id);
          await strapi.services.trade.clearUserCache(trade.seller.id);
          // Add back token
          await strapi.services.exchange.update(
            {
              id: trade.sellExchange.id
            },
            {
              remainAmount: trade.sellExchange.remainAmount + trade.amount
            }
          );

          strapi.services.notification.send(
            trade.buyer.id,
            "Haladinar",
            `User ${trade.seller.accountNumber} rejected to sell ${trade.unit} to you. This trade is closed.`
          );

          return ctx.send({
            status: strapi.models.trade.REJECTED
          });
        case strapi.models.trade.WAIT_FOR_PAYMENT:
          // Buyer confirms
          if (trade.buyer.id !== ctx.state.user.id) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          await strapi.services.trade.update(
            {
              id: trade.id
            },
            {
              status: strapi.models.trade.CANCEL_PAYMENT,
              paidTime: moment()
                .utc()
                .toDate()
            }
          );
          await strapi.services.trade.clearUserCache(trade.buyer.id);
          await strapi.services.trade.clearUserCache(trade.seller.id);
          // Add back token
          await strapi.services.exchange.update(
            {
              id: trade.sellExchange.id
            },
            {
              remainAmount: trade.sellExchange.remainAmount + trade.amount
            }
          );

          strapi.services.notification.send(
            trade.seller.id,
            "Haladinar",
            `User ${trade.buyer.accountNumber} rejected payment for ${trade.unit} purchase. Your ${trade.unit} is still in ESCROW. This trade is closed.`
          );

          return ctx.send({
            status: strapi.models.trade.CANCEL_PAYMENT
          });
        case strapi.models.trade.PAID_WAIT_FOR_CONFIRMATION:
          // Seller confirms
          if (trade.seller.id !== ctx.state.user.id) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          await strapi.services.trade.update(
            {
              id: trade.id
            },
            {
              status: strapi.models.trade.NO_PAYMENT,
              confirmedTime: moment()
                .utc()
                .toDate()
            }
          );
          await strapi.services.trade.clearUserCache(trade.buyer.id);
          await strapi.services.trade.clearUserCache(trade.seller.id);

          strapi.services.notification.send(
            trade.buyer.id,
            "Haladinar",
            `User ${trade.seller.accountNumber} confirmed not receiving payment for selling ${trade.unit} to you. This trade is closed.`
          );

          return ctx.send({
            status: strapi.models.trade.NO_PAYMENT
          });
        case strapi.models.trade.SENDING_TO_BUYER:
          // Buyer confirms
          if (trade.buyer.id !== ctx.state.user.id) {
            return ctx.badRequest(null, "Invalid request");
          }
          if (
            !trade.sellExchange.transaction ||
            !trade.sellExchange.isValid ||
            !trade.buyExchange.isValid
          ) {
            return ctx.badRequest(null, "Invalid request");
          }
          await strapi.services.trade.update(
            {
              id: trade.id
            },
            {
              status: strapi.models.trade.NO_TOKEN,
              completedTime: moment()
                .utc()
                .toDate()
            }
          );
          await strapi.services.trade.clearUserCache(trade.buyer.id);
          await strapi.services.trade.clearUserCache(trade.seller.id);

          strapi.services.notification.send(
            trade.seller.id,
            "Haladinar",
            `User ${trade.buyer.accountNumber} confirmed not receiving ${trade.unit} from you. This trade is closed.`
          );

          return ctx.send({
            status: strapi.models.trade.NO_TOKEN
          });
        default:
          return ctx.badRequest(null, "Invalid request");
      }
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

"use strict";

const _ = require("lodash");
const moment = require("moment");
const numeral = require("numeral");

const { Cache } = require("../../../services/cache");
const Eth = require("../../../services/eth");
const eth = Eth();

module.exports = {
  find: async ctx => {
    let exchanges = await Cache.get(strapi.models.exchange.AllExchangesCache);
    if (!exchanges) {
      exchanges = await strapi.services.exchange.find(
        {
          type: strapi.models.exchange.SELL,
          isValid: true,
          remainAmount_gt: 0,
          _sort: "postTime",
          _limit: 100
        },
        ["user"]
      );

      for (let i = 0; i < exchanges.length; i++) {
        exchanges[i].user = _.pick(exchanges[i].user, ["accountNumber"]);
        exchanges[i].paymentMethods = (exchanges[i].paymentMethods || "").split(
          ","
        );
        delete exchanges[i].transaction;
        delete exchanges[i].created_at;
        delete exchanges[i].updated_at;
      }

      await Cache.set(strapi.models.exchange.AllExchangesCache, exchanges);
    }

    ctx.send(exchanges);
  },

  create: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.amount) {
        return ctx.badRequest(null, "Missing `amount` parameter.");
      }
      if (!message.type) {
        return ctx.badRequest(null, "Missing `type` parameter.");
      }

      let minAmount =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.ExchangeMinAmountSetting
        )) || "0";
      minAmount = parseFloat(minAmount);
      if (isNaN(minAmount)) {
        minAmount = 0;
      }

      const amountValue = numeral(message.amount);
      if (
        isNaN(amountValue.value()) ||
        amountValue.value() === null ||
        amountValue.value() <= 0
      ) {
        return ctx.badRequest(null, "`amount` is not a valid number");
      }
      if (amountValue.value() < minAmount) {
        return ctx.badRequest(null, "`amount` is too low");
      }

      if (message.type === strapi.models.exchange.BUY) {
        // Find if there is enough amount to trade
        let exchanges = await strapi.services.exchange.find(
          {
            type: strapi.models.exchange.SELL,
            isValid: true,
            user_ne: ctx.state.user.id,
            remainAmount_gt: 0,
            _limit: 1
          },
          []
        );
        if (exchanges.length === 0) {
          // No trade availabel
          return ctx.badRequest(null, "No one is selling now.");
        }

        // Create Buy request
        const exchange = await strapi.services.exchange.create({
          postTime: moment()
            .utc()
            .toDate(),
          amount: amountValue.value(),
          unit: strapi.models.exchange.HDN,
          minAmount: 0,
          maxAmount: amountValue.value(),
          type: strapi.models.exchange.BUY,
          isValid: true,
          remainAmount: amountValue.value(),
          user: ctx.state.user.id
        });

        // Create trade request
        let amount = amountValue.value();
        do {
          // Find the first SELL
          exchanges = await strapi.services.exchange.find(
            {
              type: strapi.models.exchange.SELL,
              isValid: true,
              user_ne: ctx.state.user.id,
              remainAmount_gt: 0,
              _sort: "postTime",
              _limit: 1
            },
            []
          );

          if (exchanges.length === 0) {
            // No more SELL
            break;
          }

          // Create trade
          const tradeAmount = Math.min(exchanges[0].remainAmount, amount);
          const trade = await strapi.services.trade.create({
            postTime: moment()
              .utc()
              .toDate(),
            amount: tradeAmount,
            unit: exchanges[0].unit,
            buyer: ctx.state.user.id,
            seller: exchanges[0].user,
            status: strapi.models.trade.WAIT_FOR_SELLER_APPROVAL,
            buyExchange: exchange.id,
            sellExchange: exchanges[0].id
          });

          strapi.services.notification.send(
            exchanges[0].user,
            "Haladinar",
            `User ${ctx.state.user.accountNumber} wants to buy ${tradeAmount} ${exchanges[0].unit} from you. Please approve request in 'HDN TRADE'.`
          );

          // Deduct from SELL
          await strapi.services.exchange.update(
            {
              id: exchanges[0].id
            },
            {
              remainAmount: exchanges[0].remainAmount - tradeAmount
            }
          );

          amount -= tradeAmount;
        } while (amount > 0);

        ctx.send({ id: exchange.id });
      } else if (message.type === strapi.models.exchange.SELL) {
        // Check limits
        let amountPerDay =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.ExchangeLimitAmountPerDaySetting
          )) || "0";
        amountPerDay = parseFloat(amountPerDay);
        if (isNaN(amountPerDay)) {
          amountPerDay = 0;
        }
        let timesPerDay =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.ExchangeLimitTimesPerDaySetting
          )) || "0";
        timesPerDay = parseInt(timesPerDay);
        if (isNaN(timesPerDay)) {
          timesPerDay = 0;
        }
        const startTime = moment()
          .utc()
          .startOf("day")
          .toDate();
        const endTime = moment()
          .utc()
          .endOf("day")
          .toDate();
        if (amountPerDay > 0 || timesPerDay > 0) {
          const exchanges = await strapi.services.exchange.find(
            {
              type: strapi.models.exchange.SELL,
              isValid: true,
              user: ctx.state.user.id,
              postTime_gte: startTime,
              postTime_lte: endTime
            },
            []
          );
          if (
            amountPerDay > 0 &&
            _.sumBy(exchanges, "amount") + amountValue.value() > amountPerDay
          ) {
            return ctx.badRequest(null, "The amount limit for today reached.");
          }
          if (timesPerDay > 0 && exchanges.length >= timesPerDay) {
            return ctx.badRequest(null, "The post limit for today reached.");
          }
        }

        if (!message.txHash) {
          // Check limit
          return ctx.send({ id: 0 });
        }

        const transactions = await strapi.services.transaction.find({
          transactionHash: message.txHash.toLowerCase()
        });
        if (transactions.length === 0) {
          return ctx.badRequest(null, "Cannot find corresponding transaction");
        }

        let feeRate =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.ExchangeFeeRateSetting
          )) || "0";
        feeRate = parseFloat(feeRate);
        if (isNaN(feeRate)) {
          feeRate = 0;
        }

        // Validate transaction
        let escrowWallet =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.ExchangeEscrowWalletSetting
          )) || "";
        if (
          transactions[0].toAddress !== escrowWallet.toLowerCase() ||
          transactions[0].unit !== strapi.models.transaction.HDN ||
          Math.abs(numeral(transactions[0].amount).value() - (amountValue.value() + amountValue.value() * feeRate)) >= 0.00001 ||
          transactions[0].processed === true
        ) {
          return ctx.badRequest(null, "Transaction is not valid");
        }
        const receipt = await eth.getTransactionReceipt(
          transactions[0].transactionHash
        );
        if (!receipt || receipt.status !== true) {
          return ctx.badRequest(null, "Transaction is not valid");
        }

        // Create Sell request
        const exchange = await strapi.services.exchange.create({
          postTime: moment()
            .utc()
            .toDate(),
          amount: amountValue.value(),
          unit: strapi.models.exchange.HDN,
          minAmount: 0,
          maxAmount: amountValue.value(),
          type: strapi.models.exchange.SELL,
          paymentMethods: `${strapi.models.exchange.BANK_TRANSFER}`,
          isValid: true,
          remainAmount: amountValue.value(),
          user: ctx.state.user.id,
          transaction: transactions[0].id
        });

        await strapi.services.transaction.update(
          {
            id: transactions[0].id
          },
          {
            exchange: exchange.id,
            processed: true,
            processedOn: moment()
              .utc()
              .toDate(),
            processedNote: `This transaction is processed with Exchange #${exchange.id}`
          }
        );

        ctx.send({ id: exchange.id });
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

  withdraw: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter.");
      }

      const exchange = await strapi.services.exchange.findOne(
        {
          id: message.id
        },
        ["user"]
      );

      if (
        !exchange ||
        exchange.type !== strapi.models.exchange.SELL ||
        exchange.isValid !== true ||
        exchange.user.id !== ctx.state.user.id ||
        exchange.remainAmount <= 0 ||
        !exchange.transaction ||
        exchange.unit !== strapi.models.exchange.HDN
      ) {
        return ctx.badRequest(null, "Invalid request");
      }

      const savedAmount = exchange.remainAmount;
      await strapi.services.exchange.update(
        {
          id: exchange.id
        },
        {
          remainAmount: 0
        }
      );

      // Resend
      var account = eth.getAccount(
        await strapi.services.setting.getSetting(
          strapi.models.setting.ExchangeEscrowWalletPrivateKeySetting
        )
      );
      eth.sendToken(
        account,
        exchange.user.walletAddress,
        savedAmount,
        null,
        async receipt => {
          if (receipt.status) {
            var tx = await strapi.services.transaction.updateBlockchainTransaction(
              receipt.from,
              exchange.user.walletAddress,
              receipt.transactionHash,
              savedAmount,
              false,
              receipt.status,
              receipt
            );
            if (tx) {
              await strapi.services.transaction.update(
                {
                  id: tx.id
                },
                {
                  exchange: exchange.id
                }
              );

              await strapi.services.log.info(
                `User ${exchange.user.accountNumber} withdrawn ${exchange.remainAmount} HDN from Exchange.`,
                exchange.user
              );

              strapi.services.notification.send(
                exchange.user.id,
                "Haladinar",
                `We sent ${exchange.remainAmount} HDN to your wallet.`
              );
            }
          }
        },
        null,
        async (error, receipt) => {
          await strapi.services.exchange.update(
            {
              id: exchange.id
            },
            {
              remainAmount: savedAmount
            }
          );
        }
      );

      return ctx.send({
        id: exchange.id
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

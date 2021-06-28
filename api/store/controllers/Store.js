"use strict";

const _ = require("lodash");
const moment = require("moment");
const numeral = require("numeral");

const { Cache } = require("../../../services/cache");
const Eth = require("../../../services/eth");
const eth = Eth();

module.exports = {
  find: async ctx => {
    let storeItems = await Cache.get(strapi.models.store.AllStoresCache);
    if (!storeItems) {
      const stores = await strapi.services.store.find({ enabled: true });

      // Find corresponding items
      let numbers =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.StoreNumbersPerItemSetting
        )) || "5";
      numbers = parseInt(numbers);
      if (isNaN(numbers)) {
        numbers = 5;
      }
      storeItems = [];
      for (let i = 0; i < stores.length; i++) {
        if (
          stores[i].type === strapi.models.store.SPECIAL_FORMAT &&
          stores[i].specialFormat
        ) {
          // Get some items of this format
          const accountNumbers = await strapi.services.format.getValidAccountNumbers(
            stores[i].specialFormat,
            numbers
          );
          storeItems.push({
            id: stores[i].id,
            name: {
              en: stores[i].nameEN,
              cn: stores[i].nameCN,
              jp: stores[i].nameJP,
              kr: stores[i].nameKR,
              vn: stores[i].nameVN
            },
            type: stores[i].type,
            price: stores[i].price,
            unit: stores[i].unit,
            value: accountNumbers
          });
        } else if (
          stores[i].type === strapi.models.store.MEMBERSHIP &&
          stores[i].membership
        ) {
          storeItems.push({
            id: stores[i].id,
            name: {
              en: stores[i].nameEN,
              cn: stores[i].nameCN,
              jp: stores[i].nameJP,
              kr: stores[i].nameKR,
              vn: stores[i].nameVN
            },
            type: stores[i].type,
            price: stores[i].price,
            unit: stores[i].unit,
            value: {
              id: stores[i].membership.id,
              name: stores[i].membership.name
            }
          });
        }
      }

      await Cache.set(strapi.models.store.AllStoresCache, storeItems);
    }

    ctx.send(storeItems);
  },

  purchase: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter.");
      }

      const stores = await strapi.services.store.find({
        id: message.id,
        enabled: true
      });
      if (stores.length === 0) {
        return ctx.badRequest(null, "Cannot find corresponding item");
      }

      const storeItem = stores[0];
      let purchase = null;
      if (storeItem.type === strapi.models.store.SPECIAL_FORMAT) {
        if (!message.value) {
          return ctx.badRequest(null, "Missing `value` parameter.");
        }

        const accountNumber = parseInt(message.value);
        // Validate this UID
        if (isNaN(accountNumber) || accountNumber <= 0) {
          return ctx.badRequest(null, "This User ID is not valid.");
        }
        const used = await strapi.services.format.accountNumberIsUsed(
          accountNumber
        );
        if (used) {
          return ctx.badRequest(
            null,
            "This User ID is already picked. Please choose another one."
          );
        }

        // Create new purchase
        purchase = await strapi.services.purchase.create({
          user: ctx.state.user.id,
          amount: storeItem.price,
          purchasedTime: moment()
            .utc()
            .toDate(),
          status: strapi.models.purchase.IN_CART,
          total: storeItem.price,
          unit: storeItem.unit,
          store: storeItem.id,
          enabled: true,
          data: {
            oldValue: ctx.state.user.accountNumber,
            newValue: accountNumber.toString()
          }
        });
      } else if (storeItem.type === strapi.models.store.MEMBERSHIP) {
        if (!message.value) {
          return ctx.badRequest(null, "Missing `value` parameter.");
        }

        const membership = await strapi.services.membership.findOne(
          { id: message.value.id },
          []
        );
        if (!membership) {
          return ctx.badRequest(null, "`value` parameter is not valid.");
        }

        // Create new purchase
        purchase = await strapi.services.purchase.create({
          user: ctx.state.user.id,
          amount: storeItem.price,
          purchasedTime: moment()
            .utc()
            .toDate(),
          status: strapi.models.purchase.IN_CART,
          total: storeItem.price,
          unit: storeItem.unit,
          store: storeItem.id,
          enabled: true,
          data: {
            oldValue: ctx.state.user.membership
              ? {
                  id: ctx.state.user.membership.id,
                  name: ctx.state.user.membership.name
                }
              : {},
            newValue: {
              id: membership.id,
              name: membership.name
            }
          }
        });
      }

      if (purchase === null) {
        return ctx.badRequest(null, "Cannot create purchase request");
      }

      ctx.send(_.omit(purchase, ["store", "user"]));
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  pay: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.id) {
        return ctx.badRequest(null, "Missing `id` parameter.");
      }

      const purchases = await strapi.services.purchase.find(
        { id: message.id },
        ["store"]
      );
      if (purchases.length === 0) {
        return ctx.badRequest(null, "Cannot find corresponding request");
      }

      const purchase = purchases[0];
      if (
        purchase.status === strapi.models.purchase.COMPLETED ||
        !purchase.enabled
      ) {
        return ctx.badRequest(null, "Request is not valid");
      }

      if (purchase.unit === strapi.models.store.USDT) {
        if (!message.txHash) {
          purchase.store = purchase.store.id;
          purchase.enabled = false;
          await strapi.services.purchase.update({ id: purchase.id }, purchase);
          return ctx.badRequest(null, "Missing `txHash` parameter.");
        }
        const transactions = await strapi.services.transaction.find({
          transactionHash: message.txHash.toLowerCase(),
        });
        if (transactions.length === 0) {
          purchase.store = purchase.store.id;
          purchase.enabled = false;
          await strapi.services.purchase.update({ id: purchase.id }, purchase);
          return ctx.badRequest(null, "Cannot find corresponding transaction");
        }

        // Validate transaction
        let storeWallet =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.StoreWalletSetting
          )) || "";
        if (
          transactions[0].toAddress !== storeWallet.toLowerCase() ||
          transactions[0].unit !== strapi.models.transaction.USDT ||
          numeral(transactions[0].amount).value() < purchase.total ||
          transactions[0].processed === true ||
          transactions[0].purchase
        ) {
          purchase.store = purchase.store.id;
          purchase.enabled = false;
          await strapi.services.purchase.update({ id: purchase.id }, purchase);
          return ctx.badRequest(null, "Transaction is not valid");
        }
        const receipt = await eth.getTransactionReceipt(
          transactions[0].transactionHash
        );
        if (!receipt || receipt.status !== true) {
          purchase.store = purchase.store.id;
          purchase.enabled = false;
          await strapi.services.purchase.update({ id: purchase.id }, purchase);
          return ctx.badRequest(null, "Transaction is not valid");
        }

        purchase.transaction = transactions[0].id;
        purchase.status = strapi.models.purchase.COMPLETED;
        await strapi.services.transaction.update(
          {
            id: transactions[0].id,
          },
          {
            processed: true,
            processedOn: moment().utc().toDate(),
            processedNote: `This transaction is processed with Purchase #${purchase.id}.`,
            purchase: purchase.id,
          }
        );
      } else if (purchase.unit === strapi.models.store.REWARD) {
        let balance = await strapi.services.reward.getRewardBalanceByUser(
          ctx.state.user.id
        );
        if (!balance || purchase.total > balance) {
          purchase.store = purchase.store.id;
          purchase.enabled = false;
          await strapi.services.purchase.update({ id: purchase.id }, purchase);
          return ctx.badRequest(null, "Insufficient balance to buy");
        }

        // Deduct in reward
        const reward = await strapi.services.reward.create({
          amount: -purchase.total,
          type: strapi.models.reward.BUY_STORE_ITEM,
          user: ctx.state.user.id,
          purchase: purchase.id,
        });
        purchase.reward = reward.id;
        purchase.status = strapi.models.purchase.COMPLETED;
      }

      const itemName = purchase.store.nameEN;
      let user = ctx.state.user;
      if (purchase.store.type === strapi.models.store.SPECIAL_FORMAT) {
        await strapi.services.log.info(
          `User ${ctx.state.user.accountNumber} has bought ${itemName}: ${purchase.data.newValue} with ${purchase.total} ${purchase.unit}.`,
          ctx.state.user
        );

        // Update
        user = await strapi.query("user", "users-permissions").update(
          {
            id: ctx.state.user.id
          },
          {
            accountNumber: purchase.data.newValue
          }
        );
        purchase.store = purchase.store.id;
        await strapi.services.purchase.update({ id: purchase.id }, purchase);

        await strapi.services.log.info(
          `User ${purchase.data.oldValue} has changed UID to ${purchase.data.newValue}.`,
          ctx.state.user
        );

        return ctx.send({
          balance: await strapi.services.reward.getRewardBalanceByUser(
            ctx.state.user.id
          ),
          user: {
            accountNumber: purchase.data.newValue
          }
        });
      } else if (purchase.store.type === strapi.models.store.MEMBERSHIP) {
        const membership = await strapi.services.membership.findOne(
          { id: purchase.data.newValue.id },
          []
        );
        if (!membership) {
          return ctx.badRequest(null, "Membership is not valid.");
        }

        await strapi.services.log.info(
          `User ${ctx.state.user.accountNumber} has bought ${itemName} with ${purchase.total} ${purchase.unit}.`,
          ctx.state.user
        );

        // Update
        user = await strapi.query("user", "users-permissions").update(
          {
            id: ctx.state.user.id
          },
          {
            membership: purchase.data.newValue.id,
            membershipExpiredTime: moment
              .utc()
              .add(membership.period, "d")
              .toDate()
          }
        );
        purchase.store = purchase.store.id;
        await strapi.services.purchase.update({ id: purchase.id }, purchase);

        await strapi.services.log.info(
          `User ${ctx.state.user.accountNumber} has changed membership to ${purchase.data.newValue.name}.`,
          ctx.state.user
        );

        return ctx.send({
          balance: await strapi.services.reward.getRewardBalanceByUser(
            ctx.state.user.id
          ),
          user: {
            membership: purchase.data.newValue.name
          }
        });
      }

      ctx.send({
        balance: await strapi.services.reward.getRewardBalanceByUser(
          ctx.state.user.id
        ),
        user: _.omit(user, ["password", "resetPasswordToken"])
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

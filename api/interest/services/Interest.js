"use strict";

const _ = require("lodash");
const Eth = require("../../../services/eth");
const eth = Eth();

module.exports = {
  processDailyInterest: async () => {
    try {
      // Get all unprocessed interests
      let thresholdSend =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.ThresholdInterestSendSetting
        )) || "10";
      thresholdSend = parseFloat(thresholdSend);
      if (isNaN(thresholdSend)) {
        thresholdSend = 10;
      }
      const subQuery = strapi.models.interest
        .query()
        .where(function () {
          this.where("processed", false).orWhereNull("processed");
        })
        .andWhere("unit", strapi.models.transaction.USDT)
        .groupBy("user") // transaction group which has more than 1 item is split transfer
        .havingRaw("sum(amount) >= " + thresholdSend.toString())
        .select("user");

      let interests = (
        await strapi.models.interest
          .query((qb) => {
            qb.whereIn("user", subQuery)
              .andWhere(function () {
                this.where("processed", false).orWhereNull("processed");
              })
              .andWhere("unit", strapi.models.transaction.USDT)
              .select();
          })
          .fetchAll()
      ).toJSON();
      interests = _.groupBy(interests, _.iteratee("user"));
      _.forOwn(interests, async (value, key) => {
        const user = await strapi
          .query("user", "users-permissions")
          .findOne({ id: parseInt(key) });
        if (!user) {
          return;
        }

        _.forEach(value, async (item) => {
          await strapi.services.interest.update(
            {
              id: item.id,
            },
            {
              processed: true,
            }
          );
        });

        const usdt = _.sumBy(value, "amount");
        const account = eth.getAccount(
          await strapi.services.setting.getSetting(
            strapi.models.setting.DistributingWalletPrivateKey
          )
        );
        eth.sendToken(
          account,
          user.walletAddress,
          usdt,
          null,
          async (receipt) => {
            if (receipt.status) {
              var tx =
                await strapi.services.transaction.updateBlockchainTransaction(
                  receipt.from,
                  user.walletAddress,
                  receipt.transactionHash,
                  usdt,
                  false,
                  receipt.status,
                  receipt
                );
              if (tx) {
                _.forEach(value, async (item) => {
                  await strapi.services.interest.update(
                    {
                      id: item.id,
                    },
                    {
                      processed: true,
                      transaction: tx.id,
                    }
                  );
                });

                await strapi.services.log.info(
                  `User ${user.accountNumber} receives ${usdt} USDT as Daily interest.`,
                  user
                );
              }
            }
          },
          null,
          async (error, receipt) => {
            strapi.log.fatal(error);
            _.forEach(value, async (item) => {
              await strapi.services.interest.update(
                {
                  id: item.id,
                },
                {
                  processed: false,
                }
              );
            });
          }
        );
      });
    } catch (err) {
      strapi.log.fatal(err);
    }
  },
};

"use strict";

const _ = require("lodash");
const moment = require("moment");
const numeral = require("numeral");
// const DevstoreApi = require('../../../client/DevstoreApi')

const Eth = require("../../../services/eth");
const eth = Eth();

module.exports = {
  updateBlockchainTransaction: async (
    from,
    to,
    txHash,
    amount,
    isEth,
    status,
    receipt
  ) => {
    if (!from || !to || !txHash) {
      return null;
    }

    // Search for existed record
    let recordsByTxHash = await strapi.services.transaction.find(
      {
        fromAddress: from.toLowerCase(),
        toAddress: to.toLowerCase(),
        transactionHash: txHash.toLowerCase(),
      },
      []
    );

    let params = {};
    if (recordsByTxHash.length > 0) {
      params = recordsByTxHash[0];
      if (params.status === strapi.models.transaction.SUCCESS) {
        // It's done
        return params;
      }

      // Change relation back to id
      // params.sender = params.sender ? params.sender.id : null;
      // params.receiver = params.receiver ? params.receiver.id : null;
    }

    // Set data
    if (from) params.fromAddress = from.toLowerCase();
    if (to) params.toAddress = to.toLowerCase();
    params.transactionHash = txHash.toLowerCase();
    if (amount) params.amount = amount.toString();
    params.unit = isEth
      ? strapi.models.transaction.ETH
      : strapi.models.transaction.USDT;
    params.status =
      status === true
        ? strapi.models.transaction.SUCCESS
        : status === false
        ? strapi.models.transaction.FAILED
        : strapi.models.transaction.PENDING;
    if (receipt) params.blockchainReceipt = receipt;

    // Process the type
    if (receipt) {
      // Search from address
      const sender = await strapi
        .query("user", "users-permissions")
        .findOne({ walletAddress: params.fromAddress }, []);

      if (sender && !params.sender) {
        params.sender = sender.id;
      }

      let centralWallet =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.CentralWalletSetting
        )) || "";
      let escrowWallet =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.ExchangeEscrowWalletSetting
        )) || "";
      let storeWallet =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.StoreWalletSetting
        )) || "";
      // If there is receipt, we process, otherwise ignore it
      // There is 2 types now:
      // - Buy Reward transfer
      // - Split transfer which has 2 or more log records
      if (receipt.logs.length >= 2) {
        if (params.toAddress === centralWallet.toLowerCase()) {
          params.type = strapi.models.transaction.SPLIT_TRANSFER;
        }
      } else {
        if (params.toAddress === centralWallet.toLowerCase() && sender) {
          params.type = isEth
            ? strapi.models.transaction.DEPOSIT
            : strapi.models.transaction.BUY_REWARD;
        } else if (params.toAddress === escrowWallet.toLowerCase() && sender) {
          params.type = strapi.models.transaction.EXCHANGE_SELL_ESCROW;
        } else if (params.fromAddress === escrowWallet.toLowerCase()) {
          params.type = strapi.models.transaction.EXCHANGE_SELL_RELEASE;
        } else if (params.toAddress === storeWallet.toLowerCase() && sender) {
          params.type = strapi.models.transaction.BUY_STORE_ITEM;
        }
      }
      // send to store to check if any order with transaction hash
    }

    let tx;
    try {
      if (recordsByTxHash.length > 0) {
        // Update
        await strapi.services.transaction.update({ id: params.id }, params);
        tx = params;
        // Don't know why it's there but it's failed when save to database as there is no column `values`
        delete tx.values;
      } else {
        // Create
        params.processed = false;
        // DevstoreApi.orders.updateTransactionOrder({
        //   transactionId: params.transactionHash,
        //   data: {
        //     "transaction_id": params.transactionHash,
        //     "amount": params.amount,
        //     "currency": "USDT",
        //     "status": "succeeded",
        //     "details": "Payment complete.",
        //     "success": true
        //   }
        // })
        tx = await strapi.services.transaction.create(params);
      }
    } catch (err) {
      strapi.log.fatal(err);
      return null;
    }

    // Complete, do additional steps
    strapi.services.transaction.processTransaction(
      tx.toJSON ? tx.toJSON() : tx
    );
    return tx;
  },

  processPendingTransactions: async (startTime, ThresholdTime) => {
    let currentTime = new Date().getTime();
    if (startTime && ThresholdTime && currentTime - startTime > ThresholdTime) {
      // Stop if over threshold
      return;
    }

    try {
      // Get all pending transactions
      let transactions = await strapi.services.transaction.find(
        {
          status: strapi.models.transaction.PENDING,
          _limit: 300, // Limit 300 transactions every 5 minutes
        },
        []
      );

      _.forEach(transactions, async (tx) => {
        currentTime = new Date().getTime();
        if (
          startTime &&
          ThresholdTime &&
          currentTime - startTime > ThresholdTime
        ) {
          // Stop if over threshold
          return;
        }

        // Get transaction receipt
        const receipt = await eth.getTransactionReceipt(tx.transactionHash);
        if (receipt) {
          await strapi.services.transaction.updateBlockchainTransaction(
            tx.fromAddress,
            tx.toAddress,
            tx.transactionHash,
            tx.amount,
            tx.unit === strapi.models.transaction.ETH,
            receipt.status,
            receipt
          );
        }
      });
    } catch (err) {
      strapi.log.fatal(err);
    }
  },

  processBuyRewardTransaction: async (tx) => {
    if (
      tx.status !== strapi.models.transaction.SUCCESS ||
      !tx.blockchainReceipt
    ) {
      return;
    }
    if (
      tx.type !== strapi.models.transaction.BUY_REWARD &&
      tx.unit !== strapi.models.transaction.USDT
    ) {
      return;
    }
    if (tx.blockchainReceipt.logs.length !== 1) {
      return;
    }
    if (tx.blockchainReceipt.status !== true) {
      // Transaction failed then update record and ignore
      tx.status = strapi.models.transaction.FAILED;
      tx.processed = true;
      tx.processedOn = new Date();
      tx.sender = tx.sender ? tx.sender.id || tx.sender : null;
      await strapi.services.transaction.update({ id: tx.id }, tx);
      return;
    }

    let sender = tx.sender;
    if (sender && !sender.id) {
      // sender is a number, get from database
      sender = await strapi
        .query("user", "users-permissions")
        .findOne({ id: sender }, []);
    }
    if (!sender) {
      tx.processed = true;
      tx.processedOn = new Date();
      tx.processedNote = "This transaction does not have attached Sender.";
      await strapi.services.transaction.update({ id: tx.id }, tx);
      return;
    }

    // Check if we already added reward for this transaction
    let reward = _.head(
      await strapi.services.reward.find({ transaction: tx.id })
    );

    if (reward) {
      tx.processed = true;
      tx.processedOn = new Date();
      tx.processedNote = `This transaction is already processed with Reward #${reward.id}.`;
      tx.sender = sender.id;
      await strapi.services.transaction.update({ id: tx.id }, tx);
      return;
    }

    let ratio =
      (await strapi.services.setting.getSetting(
        strapi.models.setting.BuyRewardRatioSetting
      )) || "1";
    ratio = parseFloat(ratio);
    if (isNaN(ratio)) {
      ratio = 1;
    }

    const rate = await strapi.services.rate.getRate(
      strapi.models.transaction.USDT,
      strapi.models.transaction.REWARD
    );
    reward = await strapi.services.reward.create({
      amount: tx.amount * rate * ratio,
      type: strapi.models.reward.DEPOSIT,
      user: sender.id,
      transaction: tx.id,
    });

    tx.processed = true;
    tx.processedOn = new Date();
    tx.processedNote = `This transaction is processed with Reward #${reward.id}.`;
    tx.sender = sender.id;
    await strapi.services.transaction.update({ id: tx.id }, tx);

    await strapi.services.log.info(
      `User ${sender.accountNumber} buys ${tx.amount * ratio} Reward with ${
        tx.amount
      } USDT.`,
      sender
    );
  },

  // processSplitTransaction: async txs => {
  //   if (txs.length <= 1) {
  //     return;
  //   }
  //   if (
  //     !_.some(txs, { type: strapi.models.transaction.SPLIT_TRANSFER }) ||
  //     !_.some(txs, { type: strapi.models.transaction.TRANSFER })
  //   ) {
  //     // No split transfer and transfer
  //     return;
  //   }
  //   if (
  //     !_.every(
  //       txs,
  //       item =>
  //         item.status === strapi.models.transaction.SUCCESS &&
  //         item.blockchainReceipt &&
  //         item.blockchainReceipt.logs.length > 1
  //     )
  //   ) {
  //     return;
  //   }
  //   if (!_.every(txs, { fromAddress: txs[0].fromAddress })) {
  //     return;
  //   }

  //   if (txs[0].blockchainReceipt.status !== true) {
  //     // Transaction failed then update record and ignore
  //     _.each(txs, async tx => {
  //       tx.status = strapi.models.transaction.FAILED;
  //       tx.processed = true;
  //       tx.processedOn = new Date();
  //       tx.sender = tx.sender ? tx.sender.id || tx.sender : null;
  //       tx.receiver = tx.receiver ? tx.receiver.id || tx.receiver : null;
  //       await strapi.services.transaction.update({ id: tx.id }, tx);
  //     });
  //     return;
  //   }

  //   let sender = _.get(
  //     _.find(
  //       txs,
  //       item => item.type === strapi.models.transaction.TRANSFER && item.sender
  //     ),
  //     "sender"
  //   );
  //   if (sender && !sender.id) {
  //     // sender is a number, get from database
  //     sender = await strapi
  //       .query("user", "users-permissions")
  //       .findOne({ id: sender }, []);
  //   }
  //   if (!sender) {
  //     _.each(txs, async tx => {
  //       tx.processed = true;
  //       tx.processedOn = new Date();
  //       tx.processedNote = "This transaction does not have attached Sender.";
  //       tx.receiver = tx.receiver ? tx.receiver.id || tx.receiver : null;
  //       await strapi.services.transaction.update({ id: tx.id }, tx);
  //     });
  //     return;
  //   }

  //   let receiver = _.get(
  //     _.find(
  //       txs,
  //       item =>
  //         item.type === strapi.models.transaction.TRANSFER && item.receiver
  //     ),
  //     "receiver"
  //   );
  //   if (receiver && !receiver.id) {
  //     // receiver is a number, get from database
  //     receiver = await strapi
  //       .query("user", "users-permissions")
  //       .findOne({ id: receiver }, []);
  //   }

  //   // Get total transfer
  //   const total = _.sumBy(txs, tx => numeral(tx.amount).value());

  //   let receiverAddress = null;
  //   let reward = null;
  //   let splitReward = null;
  //   _.forEach(txs, async tx => {
  //     if (tx.type === strapi.models.transaction.TRANSFER) {
  //       // Get receiver
  //       if (!receiver) {
  //         receiver = await strapi
  //           .query("user", "users-permissions")
  //           .findOne({ walletAddress: tx.toAddress.toLowerCase() }, []);
  //       }
  //       if (!receiverAddress) {
  //         receiverAddress = tx.toAddress;
  //       }

  //       // Check if we already added reward for this transaction
  //       reward =
  //         reward ||
  //         _.head(
  //           await strapi.services.reward.find({
  //             transaction: tx.id,
  //             type: strapi.models.reward.SENT_REBATE
  //           })
  //         );

  //       if (reward) {
  //         tx.processed = true;
  //         tx.processedOn = new Date();
  //         tx.processedNote = `This transaction is already processed with Reward #${reward.id}.`;
  //         tx.sender = sender.id;
  //         tx.receiver = receiver ? receiver.id : null;
  //         await strapi.services.transaction.update({ id: tx.id }, tx);
  //         return;
  //       }

  //       let ratio =
  //         (await strapi.services.setting.getSetting(
  //           strapi.models.setting.RewardRebateRateSetting
  //         )) || "0.8";
  //       ratio = parseFloat(ratio);
  //       if (isNaN(ratio)) {
  //         ratio = 0.8;
  //       }

  //       reward = await strapi.services.reward.create({
  //         amount: total * ratio,
  //         type: strapi.models.reward.SENT_REBATE,
  //         user: sender.id,
  //         transaction: tx.id
  //       });

  //       tx.processed = true;
  //       tx.processedOn = new Date();
  //       tx.processedNote = `This transaction is processed with Reward #${reward.id}.`;
  //       tx.sender = sender.id;
  //       tx.receiver = receiver ? receiver.id : null;
  //       await strapi.services.transaction.update({ id: tx.id }, tx);

  //       await strapi.services.log.info(
  //         `User ${sender.accountNumber} receives ${total *
  //         ratio} Reward as rebate of sending ${total} USDT.`,
  //         sender
  //       );
  //     } else if (tx.type === strapi.models.transaction.SPLIT_TRANSFER) {
  //       // Add split reward to receiver
  //       splitReward =
  //         splitReward ||
  //         _.head(
  //           await strapi.services.reward.find({
  //             transaction: tx.id,
  //             type: strapi.models.reward.RECEIVE
  //           })
  //         );

  //       if (splitReward) {
  //         tx.processed = true;
  //         tx.processedOn = new Date();
  //         tx.processedNote = `This transaction is already processed with Reward #${splitReward.id}.`;
  //         tx.sender = sender.id;
  //         tx.receiver = receiver ? receiver.id : null;
  //         await strapi.services.transaction.update({ id: tx.id }, tx);
  //         return;
  //       }

  //       let ratio =
  //         (await strapi.services.setting.getSetting(
  //           strapi.models.setting.RewardReceiveSplitRatioSetting
  //         )) || "1";
  //       ratio = parseFloat(ratio);
  //       if (isNaN(ratio)) {
  //         ratio = 1;
  //       }

  //       splitReward = await strapi.services.reward.create({
  //         amount: tx.amount * ratio,
  //         type: strapi.models.reward.RECEIVE,
  //         user: receiver ? receiver.id : null,
  //         transaction: tx.id
  //       });

  //       tx.processed = true;
  //       tx.processedOn = new Date();
  //       tx.processedNote = `This transaction is processed with Reward #${splitReward.id}.`;
  //       tx.sender = sender.id;
  //       tx.receiver = receiver ? receiver.id : null;
  //       await strapi.services.transaction.update({ id: tx.id }, tx);

  //       await strapi.services.log.info(
  //         `User ${
  //         receiver ? receiver.accountNumber : receiverAddress
  //         } receives ${tx.amount *
  //         ratio} Reward as split of receiving ${total} USDT from ${
  //         sender.accountNumber
  //         }.`,
  //         receiver
  //       );
  //     }
  //   });
  // },

  // processReferral: async (tx, amount) => {
  processReferral: async (sender, lock, lockReward) => {
    // if (
    //   tx.status !== strapi.models.transaction.SUCCESS ||
    //   !tx.blockchainReceipt
    // ) {
    //   return;
    // }
    // if (tx.type === strapi.models.transaction.SPLIT_TRANSFER) {
    //   // Ignore split transfer record
    //   return;
    // }
    // if (tx.blockchainReceipt.status !== true) {
    //   // Transaction failed then update record and ignore
    //   tx.sender = tx.sender ? tx.sender.id || tx.sender : null;
    //   tx.status = strapi.models.transaction.FAILED;
    //   await strapi.services.transaction.update({ id: tx.id }, tx);
    //   return;
    // }

    if (sender && !sender.id) {
      // sender is a number, get from database
      sender = await strapi
        .query("user", "users-permissions")
        .findOne({ id: sender });
    }
    if (!sender) {
      return;
    }

    if (sender.father) {
      if (!sender.father.id) {
        sender.father = await strapi
          .query("user", "users-permissions")
          .findOne({ id: sender.father });
      }

      if (sender.father) {
        let ratio =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.ReferralLevel1BonusSetting
          )) || "0.05";
        ratio = parseFloat(ratio);
        if (isNaN(ratio)) {
          ratio = 0.05;
        }

        // Check if we already added reward for this transaction
        let reward = _.head(
          await strapi.services.reward.find({
            reward: lockReward.id,
            lock: lock.id,
            type: strapi.models.reward.REFERRAL_BONUS,
            user: sender.father.id,
          })
        );

        if (!reward) {
          reward = await strapi.services.reward.create({
            amount: lock.amount * ratio,
            type: strapi.models.reward.REFERRAL_BONUS,
            user: sender.father.id,
            reward: lockReward.id,
            lock: lock.id,
          });
          await strapi.services.log.info(
            `User ${sender.father.accountNumber} receives ${
              lock.amount * ratio
            } Reward as referral bonus (level 1) for stacking of ${
              lock.amount
            } Reward from user ${sender.accountNumber}.`,
            sender.father
          );
        }
      }
    }

    if (sender.grandFather) {
      if (!sender.grandFather.id) {
        sender.grandFather = await strapi
          .query("user", "users-permissions")
          .findOne({ id: sender.grandFather });
      }

      if (sender.grandFather) {
        let ratio =
          (await strapi.services.setting.getSetting(
            strapi.models.setting.ReferralLevel2BonusSetting
          )) || "0.02";
        ratio = parseFloat(ratio);
        if (isNaN(ratio)) {
          ratio = 0.02;
        }

        // Check if we already added reward for this transaction
        let reward = _.head(
          await strapi.services.reward.find({
            reward: lockReward.id,
            lock: lock.id,
            type: strapi.models.reward.REFERRAL_BONUS,
            user: sender.grandFather.id,
          })
        );

        if (!reward) {
          reward = await strapi.services.reward.create({
            amount: lock.amount * ratio,
            type: strapi.models.reward.REFERRAL_BONUS,
            user: sender.grandFather.id,
            reward: lockReward.id,
            lock: lock.id,
          });
          await strapi.services.log.info(
            `User ${sender.grandFather.accountNumber} receives ${
              lock.amount * ratio
            } Reward as referral bonus (level 2) for sending of ${
              lock.amount
            } Reward from user ${sender.accountNumber}.`,
            sender.grandFather
          );
        }
      }
    }
  },

  // processDeposit: async tx => {
  //   if (
  //     tx.status !== strapi.models.transaction.SUCCESS ||
  //     !tx.blockchainReceipt
  //   ) {
  //     return;
  //   }
  //   if (
  //     tx.type !== strapi.models.transaction.DEPOSIT ||
  //     tx.unit !== strapi.models.transaction.ETH
  //   ) {
  //     return;
  //   }
  //   if (tx.blockchainReceipt.status !== true) {
  //     // Transaction failed then update record and ignore
  //     tx.sender = tx.sender ? tx.sender.id || tx.sender : null;
  //     tx.status = strapi.models.transaction.FAILED;
  //     await strapi.services.transaction.update({ id: tx.id }, tx);
  //     return;
  //   }

  //   // Send USDT corresponding to ETH
  //   const rate = await strapi.services.rate.getRate(
  //     strapi.models.transaction.ETH,
  //     strapi.models.transaction.USDT
  //   );
  //   const usdt = rate * tx.amount;
  //   try {
  //     const account = eth.getAccount(
  //       await strapi.services.setting.getSetting(
  //         strapi.models.setting.DistributingWalletPrivateKey
  //       )
  //     );
  //     tx.sender = tx.sender ? tx.sender.id || tx.sender : null;
  //     tx.processed = true;
  //     await strapi.services.transaction.update({ id: tx.id }, tx);
  //     // 'values' appended after update so need to remove for after update
  //     delete tx.values;
  //     await eth.sendToken(
  //       account,
  //       tx.fromAddress,
  //       usdt,
  //       null,
  //       async receipt => {
  //         if (receipt.status) {
  //           tx.sender = tx.sender ? tx.sender.id || tx.sender : null;
  //           tx.processed = true;
  //           tx.processedOn = new Date();
  //           tx.processedNote = `This transaction is processed with sending transaction ${receipt.transactionHash}.`;
  //           await strapi.services.transaction.update({ id: tx.id }, tx);

  //           const sender = await strapi
  //             .query("user", "users-permissions")
  //             .findOne({ id: tx.sender });
  //           await strapi.services.log.info(
  //             `User ${sender.accountNumber} deposits ${usdt} USDT with ${tx.amount} ETH.`,
  //             sender
  //           );
  //         } else {
  //           tx.processed = false;
  //           await strapi.services.transaction.update({ id: tx.id }, tx);
  //         }
  //       },
  //       null,
  //       async (error, receipt) => {
  //         console.log(receipt);
  //         tx.processed = false;
  //         await strapi.services.transaction.update({ id: tx.id }, tx);
  //       }
  //     );
  //   } catch (err) {
  //     strapi.log.fatal(err);
  //     // 'values' appended after update so need to remove for after update
  //     delete tx.values;
  //     tx.processed = false;
  //     await strapi.services.transaction.update({ id: tx.id }, tx);
  //   }
  // },

  processExchangeSellTransaction: async (tx) => {
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
      tx.toAddress !== escrowWallet.toLowerCase() ||
      tx.unit !== strapi.models.transaction.USDT ||      
      tx.processed === true
    ) {
      return;
    }

    const amountValue = Math.max(0, tx.amount - tx.amount * feeRate)
    if (amountValue === 0) {
      return;
    }
    if (!tx.sender || !tx.sender.id) {
      return;
    }
    // Create Sell request
    const exchange = await strapi.services.exchange.create({
      postTime: moment().utc().toDate(),
      amount: amountValue,
      unit: strapi.models.exchange.USDT,
      minAmount: 0,
      maxAmount: amountValue,
      type: strapi.models.exchange.SELL,
      paymentMethods: `${strapi.models.exchange.BANK_TRANSFER}`,
      isValid: receipt.status === true,
      remainAmount: amountValue,
      user: tx.sender.id || tx.sender,
      transaction: tx.id,
    });

    await strapi.services.transaction.update(
      {
        id: tx.id,
      },
      {
        exchange: exchange.id,
        processed: true,
        processedOn: moment().utc().toDate(),
        processedNote: `This transaction is processed with Exchange #${exchange.id}`,
      }
    );
  },

  processTransaction: async (tx) => {
    if (tx.type === strapi.models.transaction.BUY_REWARD) {
      strapi.services.transaction.processBuyRewardTransaction(tx);
    }
    if (tx.type === strapi.models.transaction.EXCHANGE_SELL_ESCROW) {
      strapi.services.transaction.processExchangeSellTransaction(tx);
    }
    // else if (tx.type === strapi.models.transaction.TRANSFER) {
    //   // Find all sub-items of this hash
    //   const transactions = await strapi.services.transaction.find({
    //     transactionHash: tx.transactionHash.toLowerCase()
    //   });
    //   if (transactions.length > 1) {
    //     // This is split transfer
    //     strapi.services.transaction.processSplitTransaction(transactions);
    //   }

    //   // Process referral
    //   strapi.services.transaction.processReferral(
    //     tx,
    //     _.sumBy(transactions, tx => numeral(tx.amount).value())
    //   );
    // } else if (tx.type === strapi.models.transaction.DEPOSIT) {
    //   strapi.services.transaction.processDeposit(tx);
    // }
  },

  // processSplitTransactions: async (startTime, ThresholdTime) => {
  //   let currentTime = new Date().getTime();
  //   if (startTime && ThresholdTime && currentTime - startTime > ThresholdTime) {
  //     // Stop if over threshold
  //     return;
  //   }

  //   try {
  //     // Get all unprocessed transactions
  //     const subQuery = strapi.models.transaction
  //       .query()
  //       .where("status", strapi.models.transaction.SUCCESS)
  //       .andWhere(function () {
  //         this.where("processed", false).orWhereNull("processed");
  //       })
  //       .andWhere(function () {
  //         this.where("type", strapi.models.transaction.TRANSFER).orWhere(
  //           "type",
  //           strapi.models.transaction.SPLIT_TRANSFER
  //         );
  //       })
  //       .andWhere("unit", strapi.models.transaction.USDT)
  //       .groupBy("transactionHash") // transaction group which has more than 1 item is split transfer
  //       .havingRaw("COUNT(*) > 1")
  //       .select("transactionHash")
  //       .limit(1000); // Limit 1000 transactions every 15 minute

  //     let transactions = (
  //       await strapi.models.transaction
  //         .query(qb => {
  //           qb.whereIn("transactionHash", subQuery)
  //             .orderBy(["created_at", "transactionHash"])
  //             .select();
  //         })
  //         .fetchAll({ withRelated: ["sender", "receiver"] })
  //     ).toJSON();

  //     transactions = _.groupBy(transactions, _.iteratee("transactionHash"));
  //     _.forOwn(transactions, async (value, key) => {
  //       currentTime = new Date().getTime();
  //       if (
  //         startTime &&
  //         ThresholdTime &&
  //         currentTime - startTime > ThresholdTime
  //       ) {
  //         // Stop if over threshold
  //         return;
  //       }
  //       await strapi.services.transaction.processSplitTransaction(value);
  //     });
  //   } catch (err) {
  //     strapi.log.fatal(err);
  //   }
  // },

  processBuyRewardTransactions: async (startTime, ThresholdTime) => {
    let currentTime = new Date().getTime();
    if (startTime && ThresholdTime && currentTime - startTime > ThresholdTime) {
      // Stop if over threshold
      return;
    }

    try {
      // Get all unprocessed transactions
      const transactions = (
        await strapi.models.transaction
          .query((qb) => {
            qb.where("status", strapi.models.transaction.SUCCESS)
              .andWhere(function () {
                this.where("processed", false).orWhereNull("processed");
              })
              .andWhere("type", strapi.models.transaction.BUY_REWARD)
              .orderBy("created_at")
              .limit(1000); // Limit 1000 transactions every 15 minute
          })
          .fetchAll({ withRelated: ["sender"] })
      ).toJSON();

      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        currentTime = new Date().getTime();
        if (
          startTime &&
          ThresholdTime &&
          currentTime - startTime > ThresholdTime
        ) {
          // Stop if over threshold
          return;
        }
        await strapi.services.transaction.processBuyRewardTransaction(tx);
      }
    } catch (err) {
      strapi.log.fatal(err);
    }
  },

  // processDepositTransactions: async (startTime, ThresholdTime) => {
  //   let currentTime = new Date().getTime();
  //   if (startTime && ThresholdTime && currentTime - startTime > ThresholdTime) {
  //     // Stop if over threshold
  //     return;
  //   }

  //   try {
  //     // Get all unprocessed transactions
  //     const transactions = (
  //       await strapi.models.transaction
  //         .query(qb => {
  //           qb.where("status", strapi.models.transaction.SUCCESS)
  //             .andWhere(function () {
  //               this.where("processed", false).orWhereNull("processed");
  //             })
  //             .andWhere("type", strapi.models.transaction.DEPOSIT)
  //             .andWhere("unit", strapi.models.transaction.ETH)
  //             .orderBy("created_at")
  //             .limit(1000); // Limit 1000 transactions every 15 minute
  //         })
  //         .fetchAll()
  //     ).toJSON();

  //     for (var i = 0; i < transactions.length; i++) {
  //       const tx = transactions[i];
  //       currentTime = new Date().getTime();
  //       if (
  //         startTime &&
  //         ThresholdTime &&
  //         currentTime - startTime > ThresholdTime
  //       ) {
  //         // Stop if over threshold
  //         return;
  //       }
  //       strapi.services.transaction.processDeposit(tx);
  //     }
  //   } catch (err) {
  //     strapi.log.fatal(err);
  //   }
  // }
};

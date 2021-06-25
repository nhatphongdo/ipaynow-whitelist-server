const _ = require('lodash');

const Eth = require('../../services/eth');
const eth = Eth();

module.exports = strapi => {
  const hook = {
    /**
     * Default options
     */

    defaults: {
      // config object
    },

    /**
     * Initialize the hook
     */

    lastBlockNumber: 0,
    minFailedBlockNumber: 2 ** 63,

    initialize: async () => {
      // Get last processed block number
      let lastBlock = (await strapi.services.setting.getSetting(strapi.models.setting.LastProcessBlockSetting)) || '1';
      lastBlock = parseInt(lastBlock);
      if (isNaN(lastBlock)) {
        lastBlock = 1;
      }

      // Get central wallet address
      let centralWallet = (await strapi.services.setting.getSetting(strapi.models.setting.CentralWalletSetting)) || '';
      let escrowWallet = (await strapi.services.setting.getSetting(strapi.models.setting.ExchangeEscrowWalletSetting)) || '';
      let storeWallet = (await strapi.services.setting.getSetting(strapi.models.setting.StoreWalletSetting)) || '';

      eth.watchEthTransfer(lastBlock, [centralWallet, escrowWallet, storeWallet], hook.processEthTransaction, hook.updateBlock);
      eth.watchTokenTransfers(lastBlock, hook.processTokenTransaction);
    },

    updateBlock: async block => {
      if (block > hook.lastBlockNumber) {
        // If success, keep the latest block
        hook.lastBlockNumber = block;
      }

      // Save the min one
      await strapi.services.setting.updateSetting(
        strapi.models.setting.LastProcessBlockSetting,
        Math.min(hook.minFailedBlockNumber, hook.lastBlockNumber)
      );
    },

    processEthTransaction: async tx => {
      // Get transaction receipt
      const txReceipt = await eth.getTransactionReceipt(tx.hash);
      let amount = eth.fromWei(tx.value);
      let result;
      if (tx.to.toLowerCase() === eth.TOKEN_CONTRACT_ADDRESS.toLowerCase()) {
        // This is contract call
        let fromAddress = tx.from;
        let toAddress = '';
        if (txReceipt && txReceipt.logs && txReceipt.logs.length > 0) {
          // Complete
          const func = txReceipt.logs[0].topics[0];
          if (func === eth.TRANSFER_TOPIC) {
            fromAddress = eth.hexToAddress(txReceipt.logs[0].topics[1]);
            toAddress = eth.hexToAddress(txReceipt.logs[0].topics[2]);
            amount = eth.fromWei(eth.hexToNumberString(txReceipt.logs[0].data));
          }
        }
        result = await strapi.services.transaction.updateBlockchainTransaction(
          fromAddress,
          toAddress,
          tx.hash,
          amount,
          false,
          txReceipt ? txReceipt.status : null,
          txReceipt
        );
      } else {
        // This is normal transfer
        result = await strapi.services.transaction.updateBlockchainTransaction(
          tx.from,
          tx.to,
          tx.hash,
          amount,
          true,
          txReceipt ? txReceipt.status : null,
          txReceipt
        );
      }

      if (!result && tx.blockNumber && tx.blockNumber < hook.minFailedBlockNumber) {
        // If failed then keep the minimum block number
        hook.minFailedBlockNumber = tx.blockNumber;
      } else if (result && tx.blockNumber && tx.blockNumber > hook.lastBlockNumber) {
        // If success, keep the latest block
        hook.lastBlockNumber = tx.blockNumber;
      }

      // Save the min one
      await strapi.services.setting.updateSetting(
        strapi.models.setting.LastProcessBlockSetting,
        Math.min(hook.minFailedBlockNumber, hook.lastBlockNumber)
      );
    },

    processTokenTransaction: async txEvent => {
      // Get transaction receipt
      const txReceipt = await eth.getTransactionReceipt(txEvent.transactionHash);
      const result = await strapi.services.transaction.updateBlockchainTransaction(
        txEvent.returnValues.from,
        txEvent.returnValues.to,
        txEvent.transactionHash,
        eth.fromWei(txEvent.returnValues.value.toString()),
        false,
        txReceipt ? txReceipt.status : null,
        txReceipt
      );

      if (!result && txEvent.blockNumber && txEvent.blockNumber < hook.minFailedBlockNumber) {
        // If failed then keep the minimum block number
        hook.minFailedBlockNumber = txEvent.blockNumber;
      } else if (result && txEvent.blockNumber && txEvent.blockNumber > hook.lastBlockNumber) {
        // If success, keep the latest block
        hook.lastBlockNumber = txEvent.blockNumber;
      }

      // Save the min one
      await strapi.services.setting.updateSetting(
        strapi.models.setting.LastProcessBlockSetting,
        Math.min(hook.minFailedBlockNumber, hook.lastBlockNumber)
      );
    }
  };

  return hook;
};

const _ = require("lodash");

var Tx = require("ethereumjs-tx");
var Web3 = require("web3");

const TOKEN_ABI = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "spender",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "DECIMALS",
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "INITIAL_SUPPLY",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "isReceiver",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "spender",
        type: "address",
      },
      {
        name: "addedValue",
        type: "uint256",
      },
    ],
    name: "increaseAllowance",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    name: "mint",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "amount",
        type: "uint256",
      },
    ],
    name: "burn",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "removeDistributor",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [],
    name: "renounceDistributor",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "removeReceiver",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "addReceiver",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "addDistributor",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    name: "burnFrom",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "owner",
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "isDistributor",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "isOwner",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "addMinter",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [],
    name: "renounceMinter",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "NAME",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "spender",
        type: "address",
      },
      {
        name: "subtractedValue",
        type: "uint256",
      },
    ],
    name: "decreaseAllowance",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    name: "isMinter",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "owner",
        type: "address",
      },
      {
        name: "spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [],
    name: "renounceReceiver",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "SYMBOL",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    payable: false,
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address",
      },
    ],
    name: "ReceiverAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address",
      },
    ],
    name: "ReceiverRemoved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address",
      },
    ],
    name: "DistributorAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address",
      },
    ],
    name: "DistributorRemoved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address",
      },
    ],
    name: "MinterAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address",
      },
    ],
    name: "MinterRemoved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    constant: false,
    inputs: [
      {
        name: "amount",
        type: "uint256",
      },
    ],
    name: "issue",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "getSplitRate",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "rate",
        type: "uint256",
      },
    ],
    name: "setSplitRate",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "recipient",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "sender",
        type: "address",
      },
      {
        name: "recipient",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
];

const TestNet = process.env.TEST_NET === 'false' ? false : true;
const RetryPeriod = 15000; // 15 seconds

const TOKEN_CONTRACT_ADDRESS = TestNet
  ? "0x168Ff259978c68b4C1C003259E6eFEC991bE2369"
  : "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOKEN_DECIMAL_DIGITS = 8;

const InfuraProjectId = "db45d8a58336480a8f37e0b7151a4b1e";
const InfuraProjectSecret = "da101c0b4cfe4b109d7624c507b8fc59";
const RpcProviderSocket = TestNet
  ? `wss://ropsten.infura.io/ws/v3/${InfuraProjectId}`
  : `wss://mainnet.infura.io/ws/v3/${InfuraProjectId}`;
const RpcProviderHttp = TestNet
  ? `https://ropsten.infura.io/v3/${InfuraProjectId}`
  : `https://mainnet.infura.io/v3/${InfuraProjectId}`;

const web3Socket = new Web3(
  new Web3.providers.WebsocketProvider(RpcProviderSocket),
  null,
  {
    transactionConfirmationBlocks: 5,
  }
);
const web3Http = new Web3(RpcProviderHttp, null, {
  transactionConfirmationBlocks: 5,
});

module.exports = () => {
  const eth = {
    TOKEN_CONTRACT_ADDRESS,
    TRANSFER_TOPIC,

    BN: web3Socket.utils.BN,
    toBN: web3Socket.utils.toBN,
    toHex: web3Socket.utils.toHex,
    hexToNumberString: web3Socket.utils.hexToNumberString,
    hexToNumber: web3Socket.utils.hexToNumber,
    numberToHex: web3Socket.utils.numberToHex,
    hexToUtf8: web3Socket.utils.hexToUtf8,
    hexToAscii: web3Socket.utils.hexToAscii,
    asciiToHex: web3Socket.utils.asciiToHex,
    toWei: web3Socket.utils.toWei,
    fromWei: web3Socket.utils.fromWei,
    unitMap: web3Socket.utils.unitMap,
    toChecksumAddress: web3Socket.utils.toChecksumAddress,
    hexToAddress: (hex) => {
      let array = web3Socket.utils.hexToBytes(hex);
      // Get last 20 bytes
      array = _.takeRight(array, 20);
      return web3Socket.utils.bytesToHex(array);
    },

    TestNet,

    web3Socket,
    web3Http,

    retries: [],
    retryTask: null,

    accounts: {},
    lastCount: 0,

    // Instantiate subscription object
    subscription: null,

    // Instantiate token contract object with JSON ABI and address
    tokenContract: new web3Socket.eth.Contract(
      TOKEN_ABI,
      TOKEN_CONTRACT_ADDRESS,
      (error, result) => {
        if (error) {
          if (strapi) {
            strapi.log.fatal(error);
          } else {
            console.log(error);
          }
        }
      }
    ),

    getBlockNumber: async () => {
      return await web3Http.eth.getBlockNumber();
    },

    getTransaction: async (txHash) => {
      return await web3Http.eth.getTransaction(txHash);
    },

    getTransactionReceipt: async (txHash) => {
      return await web3Http.eth.getTransactionReceipt(txHash);
    },

    getConfirmations: async (txHash) => {
      try {
        // Get transaction details
        const trx = await eth.getTransaction(txHash);

        // Get current block number
        const currentBlock = await eth.getBlockNumber();

        // When transaction is unconfirmed, its block number is null.
        // In this case we return 0 as number of confirmations
        return !trx || trx.blockNumber === null
          ? 0
          : currentBlock - trx.blockNumber;
      } catch (error) {
        if (strapi) {
          strapi.log.fatal(error);
        } else {
          console.log(error);
        }
      }
    },

    getBlock: async (blockNumber, getTransactionsDetail) => {
      return await web3Http.eth.getBlock(blockNumber, getTransactionsDetail);
    },

    validateEthTransaction: (tx, addresses) => {
      if (!tx) {
        return false;
      }
      for (let i = 0; i < addresses.length; i++) {
        if (tx.from && tx.from.toLowerCase() === addresses[i].toLowerCase()) {
          return true;
        }
        if (tx.to && tx.to.toLowerCase() === addresses[i].toLowerCase()) {
          return true;
        }
      }
      return false;
    },

    validateTokenTransaction: (tx, addresses) => {
      if (!tx) {
        return false;
      }
      if (!addresses) {
        return true;
      }
      for (let i = 0; i < addresses.length; i++) {
        if (
          tx.returnValues.from &&
          tx.returnValues.from.toLowerCase() === addresses[i].toLowerCase()
        ) {
          return true;
        }
        if (
          tx.returnValues.to &&
          tx.returnValues.to.toLowerCase() === addresses[i].toLowerCase()
        ) {
          return true;
        }
      }
      return false;
    },

    retryHandler: async (addresses, callback) => {
      const copy = _.clone(eth.retries);
      for (var i = 0; i < copy.length; i++) {
        if (_.indexOf(eth.retries, copy[i]) < 0) {
          // Already removed and processing
          continue;
        }
        _.pull(eth.retries, copy[i]);

        const tx = await eth.getTransaction(copy[i]);
        if (!tx) {
          // Add to retry list
          eth.retries.push(copy[i]);
          continue;
        }

        if (!eth.validateEthTransaction(tx, addresses)) {
          continue;
        }

        console.log("Received ETH ", tx);
        if (callback) {
          callback(tx);
        }
      }
    },

    watchEthTransfer: async (
      fromBlock,
      addresses,
      callback,
      updateBlockCallback
    ) => {
      try {
        // Try to remove old subscription
        web3Socket.eth.clearSubscriptions();
      } catch (e) {}

      // Subscribe to pending transactions
      eth.subscription = web3Socket.eth
        .subscribe("newBlockHeaders", (error, result) => {
          if (error) {
            if (strapi) {
              strapi.log.fatal(error);
            } else {
              console.log(error);
            }
          } else {
            console.log("Listen for pending transactions ETH", result.number);
          }
        })
        .on("data", async (data) => {
          try {
            if (!data.number || data.number < 6) {
              return;
            }
            var block = await eth.getBlock(data.number - 5, true);
            if (block !== null && block.transactions !== null) {
              block.transactions.forEach((tx) => {
                if (!eth.validateEthTransaction(tx, addresses)) {
                  return;
                }

                if (callback) {
                  callback(tx);
                }
              });
            }

            // // Get transaction details
            // const tx = await eth.getTransaction(txHash);
            // if (!tx) {
            //   // Add to retry list
            //   eth.retries.push(txHash);
            //   return;
            // }
            // if (!eth.validateEthTransaction(tx, address)) {
            //   return;
            // }

            // console.log('Received ETH ', tx);
            // if (callback) {
            //   callback(tx);
            // }
          } catch (error) {
            if (strapi) {
              strapi.log.fatal(error);
            } else {
              console.log(error);
            }
          }
        });

      const endBlock = await eth.getBlockNumber();
      console.log(
        "Load transactions from block: " + fromBlock + " to block: " + endBlock
      );
      for (var i = fromBlock; i <= endBlock; i++) {
        var block = await eth.getBlock(i, true);
        var found = false;
        if (block !== null && block.transactions !== null) {
          block.transactions.forEach((tx) => {
            if (!eth.validateEthTransaction(tx, addresses)) {
              return;
            }

            found = true;

            if (callback) {
              callback(tx);
            }
          });
        }

        if (updateBlockCallback) {
          updateBlockCallback(i);
        }
      }

      // Start retry job
      if (eth.retryTask) {
        clearInterval(eth.retryTask);
      }
      eth.retryTask = setInterval(
        () => eth.retryHandler(addresses, callback),
        RetryPeriod
      );
    },

    watchTokenTransfers: (fromBlock, addresses, callback) => {
      // Subscribe to Transfer events matching filter criteria
      eth.tokenContract.events.Transfer(
        {
          fromBlock: "latest",
        },
        async (error, event) => {
          if (error) {
            if (strapi) {
              strapi.log.fatal(error);
            } else {
              console.log(error);
            }
            return;
          }

          if (!eth.validateTokenTransaction(event, addresses)) {
            return;
          }
          if (callback) {
            callback(event);
          }
        }
      );

      // Get past event from last processed block
      eth.tokenContract.getPastEvents(
        "Transfer",
        {
          fromBlock,
        },
        async (error, logs) => {
          if (error) {
            if (strapi) {
              strapi.log.fatal(error);
            } else {
              console.log(error);
            }
          }

          if (logs) {
            logs.forEach((event) => {
              if (!eth.validateTokenTransaction(event, addresses)) {
                return;
              }
              if (callback) {
                callback(event);
              }
            });
          }
        }
      );
    },

    unwatch: () => {
      if (eth.subscription) {
        eth.subscription.unsubscribe();
      }
      if (eth.retyrTask) {
        clearInterval(eth.retryTask);
        eth.retryTask = null;
      }
    },

    recover: async (message, signature) => {
      return await web3Socket.eth.accounts.recover(message, signature);
    },

    getAccount: (privateKey) => {
      if (eth.accounts[privateKey]) {
        return eth.accounts[privateKey];
      } else {
        eth.accounts[privateKey] =
          web3Socket.eth.accounts.wallet.add(privateKey);
        return eth.accounts[privateKey];
      }
    },

    sendToken: async (
      account,
      toAddress,
      amount,
      transactionCallback,
      receiptCallback,
      confirmationCallback,
      errorCallback
    ) => {
      amount = eth.toWei(amount.toString(), "gwei");
      amount = amount.substr(0, amount.length - 1);
      const gas = await eth.tokenContract.methods
        .transfer(toAddress, amount)
        .estimateGas({
          from: account.address,
        });
      const gasPrice = await web3Http.eth.getGasPrice();
      let count = await web3Http.eth.getTransactionCount(account.address);
      // if (eth.lastCount === count) {
      //   count += 1;
      // } else {
      //   eth.lastCount = count;
      // }
      const data = eth.tokenContract.methods
        .transfer(toAddress, amount)
        .encodeABI();
      var transaction = new Tx({
        from: account.address,
        to: TOKEN_CONTRACT_ADDRESS,
        value: "0x0",
        gasPrice: web3Socket.utils.toHex(gasPrice),
        gasLimit: gas,
        data: data,
        nonce: web3Socket.utils.toHex(count),
        chainId: TestNet ? 0x03 : 0x01,
      });
      var privateKey = Buffer.from(
        web3Socket.utils.hexToBytes(account.privateKey)
      );
      transaction.sign(privateKey);

      await web3Socket.eth
        .sendSignedTransaction("0x" + transaction.serialize().toString("hex"))
        .on("transactionHash", (hash) => {
          if (transactionCallback) {
            transactionCallback(hash);
          }
        })
        .on("receipt", (receipt) => {
          if (receiptCallback) {
            receiptCallback(receipt);
          }
        })
        .on("confirmation", (confirmationNumber, receipt) => {
          if (confirmationCallback) {
            confirmationCallback(confirmationNumber, receipt);
          }
        })
        .on("error", (error, receipt) => {
          if (strapi) {
            strapi.log.fatal(error);
          } else {
            console.log(error);
          }
          if (errorCallback) {
            errorCallback(error, receipt);
          }
        });
    },

    getTokenBalance: async (address) => {
      const result = await eth.tokenContract.methods.balanceOf(address).call();
      return eth.fromWei(eth.toBN(result));
    },
  };

  return eth;
};

"use strict";

const _ = require("lodash");
const numeral = require("numeral");
const moment = require("moment");
const { Cache } = require("../../../services/cache");
// const DevstoreApi = require("../../../client/DevstoreApi");

/**
 * A set of functions called "actions" for `Account`
 */

/* eslint-disable no-useless-escape */
const emailRegExp =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

module.exports = {
  profile: async (ctx) => {
    try {
      const result = ctx.state.user.toJSON
        ? ctx.state.user.toJSON()
        : ctx.state.user;
      if (
        result.email &&
        result.email.toLowerCase().startsWith("--do-not-use--") &&
        result.email.toLowerCase().endsWith("@fake.ripple.io")
      ) {
        result.email = "";
      }

      ctx.send(_.omit(result, ["password", "resetPasswordToken"]));
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  addReferral: async (ctx) => {
    try {
      const params = ctx.request.body;

      if (!params.id) {
        return ctx.badRequest(null, "Missing `id` parameter.");
      }

      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }
      if (message.id !== params.id) {
        return ctx.badRequest(null, "Invalid signature");
      }

      if (ctx.state.user.father) {
        return ctx.badRequest(null, "You already added referral.");
      }

      if (params.id === ctx.state.user.accountNumber) {
        return ctx.badRequest(null, "Cannot add yourself as referral.");
      }

      // Find father
      const father = await strapi
        .query("user", "users-permissions")
        .findOne({ accountNumber: params.id }, []);
      if (!father) {
        return ctx.badRequest(
          null,
          "Cannot find the specific user corresponding with this ID."
        );
      }
      if (father.father === ctx.state.user.id) {
        return ctx.badRequest(
          null,
          "Cannot add your network member as referral."
        );
      }

      const user = await strapi.query("user", "users-permissions").update(
        {
          id: ctx.state.user.id,
        },
        {
          father: father.id,
          grandFather: father.father,
        }
      );

      await strapi.services.log.info(
        `User ${ctx.state.user.accountNumber} has added user ${params.id} as referral.`,
        ctx.state.user
      );

      ctx.send(_.pick(user, ["father", "grandFather"]));
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  referralInfo: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      // Find sons
      const sons = await strapi
        .query("user", "users-permissions")
        .model.query()
        .where({
          father: ctx.state.user.id,
        })
        .select("accountNumber");
      const grandSons = await strapi
        .query("user", "users-permissions")
        .model.query()
        .where({
          grandFather: ctx.state.user.id,
        })
        .select("accountNumber");
      const referralReward =
        _.head(
          await strapi.models.reward
            .query()
            .where({
              user: ctx.state.user.id,
              type: strapi.models.reward.REFERRAL_BONUS,
            })
            .sum({ balance: "amount" })
            .select()
        ).balance || 0;
      let ratio1 =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.ReferralLevel1BonusSetting
        )) || "0.05";
      ratio1 = parseFloat(ratio1);
      if (isNaN(ratio1)) {
        ratio1 = 0.05;
      }
      let ratio2 =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.ReferralLevel2BonusSetting
        )) || "0.02";
      ratio2 = parseFloat(ratio2);
      if (isNaN(ratio2)) {
        ratio2 = 0.02;
      }

      ctx.send({
        bonus: referralReward,
        level1: _.map(sons, "accountNumber"),
        level1Bonus: ratio1,
        level2: _.map(grandSons, "accountNumber"),
        level2Bonus: ratio2,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  history: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const lastTime = moment.utc(message.latestUpdated || 0).toDate();
      const address = ctx.state.user.walletAddress.toLowerCase();

      const now = moment().utc().valueOf();

      // Get transaction logs
      let transactions = await strapi.models.transaction
        .query()
        .where("updated_at", ">=", lastTime)
        .andWhere(function () {
          this.where("fromAddress", address).orWhere("toAddress", address);
        })
        .select(
          "fromAddress",
          "toAddress",
          "transactionHash",
          "amount",
          "unit",
          "status",
          "type",
          "exchange",
          "created_at"
        );

      // Get reward logs
      const rewards = await strapi.models.reward
        .query()
        .where("user", ctx.state.user.id)
        .andWhere("updated_at", ">=", lastTime)
        .select("id", "amount", "type", "note", "created_at");

      // Get interest logs
      const interests = await strapi.models.interest
        .query()
        .where("user", ctx.state.user.id)
        .andWhere("updated_at", ">=", lastTime)
        .select("id", "amount", "created_at");

      // Summarize
      let result = [];
      transactions = _.groupBy(transactions, _.iteratee("transactionHash"));
      const keys = Object.keys(transactions);
      await Promise.all(
        keys.map(async (key) => {
          const txs = transactions[key];
          let total = _.sumBy(txs, (tx) => numeral(tx.amount).value());
          let otherAddress = "";
          let type = "";
          if (txs.length === 1) {
            otherAddress =
              txs[0].fromAddress === address
                ? txs[0].toAddress
                : txs[0].fromAddress;
            total = txs[0].fromAddress === address ? -total : total;
            type = txs[0].type;
          } else {
            const transfer = _.find(txs, {
              type: strapi.models.transaction.TRANSFER,
            });
            if (transfer) {
              otherAddress =
                transfer.fromAddress === address
                  ? transfer.toAddress
                  : transfer.fromAddress;
              total = transfer.fromAddress === address ? -total : total;
            }
            type = strapi.models.transaction.TRANSFER;
          }

          if (type === strapi.models.transaction.TRANSFER) {
            const otherUser = await strapi
              .query("user", "users-permissions")
              .findOne({ walletAddress: otherAddress.toLowerCase() }, []);
            if (total < 0) {
              type = otherUser ? `Sent to ${otherUser.accountNumber}` : "Sent";
            } else {
              type = otherUser
                ? `Received from ${otherUser.accountNumber}`
                : "Received";
            }
          }

          if (type === strapi.models.transaction.EXCHANGE_SELL_RELEASE) {
            if (txs[0].exchange) {
              const exchange = await strapi.services.exchange.findOne(
                {
                  id: txs[0].exchange,
                },
                []
              );
              if (
                exchange &&
                exchange.type === strapi.models.exchange.SELL &&
                exchange.user === ctx.state.user.id
              ) {
                type = strapi.models.transaction.EXCHANGE_SELL_WITHDRAW;
              }
            }
          }

          result.push({
            toAddress: otherAddress,
            amount: total,
            unit: txs[0].unit,
            type: type,
            status: txs[0].status,
            txHash: key,
            createdOn: txs[0].created_at,
          });
        })
      );
      _.forEach(rewards, (item) => {
        if (item.type === strapi.models.reward.NEW_USER) {
          item.type = "New User Bonus";
        } else if (item.type === strapi.models.reward.RECEIVE) {
          item.type = "Received split";
        }

        result.push({
          amount: item.amount,
          unit: "REWARD",
          type: item.type,
          txHash: "Reward_" + item.id.toString(),
          description: item.note,
          createdOn: item.created_at,
        });
      });
      _.forEach(interests, (item) => {
        result.push({
          amount: item.amount,
          unit: "USDT",
          type: "Daily Interest",
          txHash: "Interest_" + item.id.toString(),
          createdOn: item.created_at,
        });
      });

      _.orderBy(result, "createdOn");

      ctx.send({
        updatedTime: now,
        items: result,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  update: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      // Check if the provided email is valid or not.
      const isEmail = emailRegExp.test(message.email);
      let user = await strapi.query("user", "users-permissions").update(
        {
          id: ctx.state.user.id,
        },
        {
          fullName: message.fullName,
          email: isEmail ? message.email : ctx.state.user.email,
          availability: message.availability || "Private",
          contactNumber: message.contactNumber,
          paymentInfo: message.paymentInfo,
          language: message.language,
        }
      );
      user = user.toJSON ? user.toJSON() : user;

      if (
        user.email &&
        user.email.toLowerCase().startsWith("--do-not-use--") &&
        user.email.toLowerCase().endsWith("@fake.ripple.io")
      ) {
        user.email = "";
      }

      ctx.send(
        _.pick(user, [
          "fullName",
          "email",
          "availability",
          "contactNumber",
          "paymentInfo",
          "language",
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

  upload: async (ctx) => {
    const uploadService = strapi.plugins.upload.services.upload;

    // Retrieve provider configuration.
    const config = await strapi
      .store({
        environment: strapi.config.environment,
        type: "plugin",
        name: "upload",
      })
      .get({ key: "provider" });

    // Verify if the file upload is enable.
    if (config.enabled === false) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Upload.status.disabled" }] }]
          : "File upload is disabled"
      );
    }

    // Extract optional relational data.
    const { refId, ref, source, field, path } = ctx.request.body || {};
    const { files = {} } = ctx.request.files || {};

    // Check user
    if (ref === "user" && refId && refId !== ctx.state.user.id.toString()) {
      return ctx.forbidden(null, "You can upload images to your account only");
    }

    if (_.isEmpty(files)) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Upload.status.empty" }] }]
          : "Files are empty"
      );
    }

    // Transform stream files to buffer
    const buffers = await uploadService.bufferize(files);

    const enhancedFiles = buffers.map((file) => {
      if (file.size > config.sizeLimit) {
        return ctx.badRequest(null, [
          {
            messages: [
              {
                id: "Upload.status.sizeLimit",
                message: `${file.name} file is bigger than limit size!`,
                values: { file: file.name },
              },
            ],
          },
        ]);
      }

      // Add details to the file to be able to create the relationships.
      if (refId && ref && field) {
        Object.assign(file, {
          related: [
            {
              refId,
              ref,
              source,
              field,
            },
          ],
        });
      }

      // Update uploading folder path for the file.
      if (path) {
        Object.assign(file, {
          path,
        });
      }

      return file;
    });

    // Something is wrong (size limit)...
    if (ctx.status === 400) {
      return;
    }

    const uploadedFiles = await uploadService.upload(enhancedFiles, config);

    // Send 200 `ok`
    ctx.send(
      uploadedFiles.map((file) => {
        // If is local server upload, add backend host as prefix
        if (file.url && file.url[0] === "/") {
          // file.url = strapi.config.url + file.url;
        }

        if (_.isArray(file.related)) {
          file.related = file.related.map((obj) => obj.ref || obj);
        }

        return file;
      })
    );
  },

  updateMerchant: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const params = ctx.request.body;

      // Check image and remove if needed
      let user = await strapi
        .query("user", "users-permissions")
        .findOne({ id: ctx.state.user.id }, ["vendorLogo", "vendorImages"]);

      const config = await strapi
        .store({
          environment: strapi.config.environment,
          type: "plugin",
          name: "upload",
        })
        .get({ key: "provider" });

      if (
        params.oldLogo &&
        (!params.logo ||
          params.logo.toLowerCase() !== params.oldLogo.toLowerCase())
      ) {
        let removedIds = [];
        for (let i = 0; i < user.vendorLogo.length; i++) {
          if (
            user.vendorLogo[i] &&
            user.vendorLogo[i].url &&
            user.vendorLogo[i].url.toLowerCase() ===
              params.oldLogo.toLowerCase()
          ) {
            removedIds.push(user.vendorLogo[i].id);
            user.vendorLogo.splice(i, 1);
          }
        }
        if (removedIds.length > 0) {
          await strapi.plugins["content-manager"].services.contentmanager.edit(
            {
              id: user.id,
            },
            {
              vendorLogo: user.vendorLogo,
            },
            {
              model: "plugins::users-permissions.user",
            }
          );
        }
        for (let i = 0; i < removedIds.length; i++) {
          await strapi.plugins.upload.services.upload.remove(
            { id: removedIds[i] },
            config
          );
        }
      }
      if (params.images && params.oldImages) {
        let removedIds = [];
        for (let i = 0; i < user.vendorImages.length; i++) {
          if (
            user.vendorImages[i] &&
            user.vendorImages[i].url &&
            !_.some(
              params.images,
              (item) =>
                item &&
                item.toLowerCase() === user.vendorImages[i].url.toLowerCase()
            )
          ) {
            removedIds.push(user.vendorImages[i].id);
            user.vendorImages.splice(i, 1);
          }
        }
        if (removedIds.length > 0) {
          await strapi.plugins["content-manager"].services.contentmanager.edit(
            {
              id: user.id,
            },
            {
              vendorImages: user.vendorImages,
            },
            {
              model: "plugins::users-permissions.user",
            }
          );
        }
        for (let i = 0; i < removedIds.length; i++) {
          await strapi.plugins.upload.services.upload.remove(
            { id: removedIds[i] },
            config
          );
        }
      }

      // if (!user.vendorEmail) {
      //   DevstoreApi.tokens.create({
      //     password: params.password,
      //     scopes: ["admin"],
      //     email: params.email,
      //     expiration: 72,
      //     name: 'Merchant'
      //   }).then(result => {
      //     if (result && result.status === 200){
      //       strapi.query("user", "users-permissions").update(
      //         {
      //           id: ctx.state.user.id
      //         },
      //         {
      //           vendorEmail: params.email,
      //           vendorId: result.json.id
      //         }
      //       );
      //     }
      //   })
      // }

      user = await strapi.query("user", "users-permissions").update(
        {
          id: ctx.state.user.id,
        },
        {
          isMerchant: true,
          applyMerchantTime: user.applyMerchantTime
            ? user.applyMerchantTime
            : new Date(),
          vendorName: params.name,
          vendorAddress: params.address,
          vendorCountry: (params.country || "").toLowerCase(),
          vendorAddressLocation: params.addressLocation,
          vendorContactNumber: params.contactNumber,
          vendorService: params.service,
          vendorDescription: params.description,
          vendorCategory: params.category,
        }
      );

      user = user.toJSON ? user.toJSON() : user;
      user.vendorLogo = params.logo || "";
      user.vendorImages = params.images || [];

      ctx.send(
        _.pick(user, [
          "id",
          "isMerchant",
          "applyMerchantTime",
          "vendorName",
          "vendorCountry",
          "vendorAddressLocation",
          "vendorContactNumber",
          "vendorService",
          "vendorAddress",
          "vendorDescription",
          "vendorCategory",
          "vendorLogo",
          "vendorImages",
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

  cancelMerchant: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      await strapi.query("user", "users-permissions").update(
        {
          id: ctx.state.user.id,
        },
        {
          isMerchant: false,
        }
      );

      ctx.send({
        isMerchant: false,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  merchants: async (ctx) => {
    try {
      const search = ctx.request.query.search || "";
      const country = (ctx.request.query.country || "").toLowerCase();
      const category = ctx.request.query.category || "";

      let merchants = await Cache.get(
        strapi.query("user", "users-permissions").model.MerchantsCache +
          search +
          "-" +
          country +
          "-" +
          category
      );
      if (!merchants) {
        merchants = (
          await strapi
            .query("user", "users-permissions")
            .model.query(function (qb) {
              qb.where("confirmed", true)
                .andWhere(function () {
                  this.where("blocked", false).orWhereNull("blocked");
                })
                .andWhere("isMerchant", true);
              if (search && search !== "") {
                qb.andWhere(function () {
                  this.whereRaw('lower("vendorName") like ?', [
                    `%${search.toLowerCase()}%`,
                  ])
                    .orWhereRaw('lower("vendorAddress") like ?', [
                      `%${search.toLowerCase()}%`,
                    ])
                    .orWhereRaw('lower("vendorService") like ?', [
                      `%${search.toLowerCase()}%`,
                    ]);
                });
              }
              if (country && country !== "") {
                qb.andWhere("vendorCountry", country);
              }
              if (category && category !== "") {
                qb.andWhere("vendorCategory", category);
              }
            })
            .fetchAll({ withRelated: ["vendorLogo", "vendorImages"] })
        ).toJSON();

        merchants = _.map(merchants, (item) =>
          _.pick(item, [
            "id",
            "vendorName",
            "vendorAddress",
            "vendorService",
            "vendorLogo",
            "vendorImages",
          ])
        );

        _.map(merchants, (item) => {
          item.vendorLogo =
            item.vendorLogo &&
            item.vendorLogo.length > 0 &&
            item.vendorLogo[0].url;
          item.vendorImages =
            item.vendorImages &&
            item.vendorImages.length > 0 &&
            item.vendorImages[0].url;
        });

        await Cache.set(
          strapi.query("user", "users-permissions").model.MerchantsCache +
            search +
            "-" +
            country +
            "-" +
            category,
          merchants
        );
      }

      ctx.send(merchants);
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  merchant: async (ctx) => {
    try {
      const id = ctx.params.id;

      const merchants = (
        await strapi
          .query("user", "users-permissions")
          .model.query(function (qb) {
            qb.where("id", id)
              .andWhere("confirmed", true)
              .andWhere(function () {
                this.where("blocked", false).orWhereNull("blocked");
              })
              .andWhere("isMerchant", true);
          })
          .fetchAll({
            withRelated: ["vendorLogo", "vendorImages", "merchantReviews"],
          })
      ).toJSON();

      if (merchants.length === 0) {
        return ctx.notFound(null, "Cannot find merchant");
      }

      const merchant = merchants[0];

      if (merchant.vendorLogo && merchant.vendorLogo.length > 0) {
        merchant.vendorLogo = merchant.vendorLogo[0].url;
      }
      if (merchant.vendorImages && merchant.vendorImages.length > 0) {
        merchant.vendorImages = _.map(
          merchant.vendorImages,
          (item) => item.url
        );
      }
      if (merchant.merchantReviews) {
        merchant.merchantReviews = await Promise.all(
          _.orderBy(
            _.map(
              _.filter(merchant.merchantReviews, (item) => item.approved),
              async (item) => {
                const reviewer = await strapi
                  .query("user", "users-permissions")
                  .findOne({ id: item.reviewer });
                return {
                  title: item.title,
                  content: item.content,
                  rate: item.rate,
                  time: item.created_at,
                  reviewer: reviewer ? reviewer.accountNumber : "",
                  reviewerWalletAddress: reviewer ? reviewer.walletAddress : "",
                };
              }
            ),
            ["time"],
            ["desc"]
          )
        );
      }

      ctx.send(
        _.omit(merchant, [
          "username",
          "password",
          "resetPasswordToken",
          "father",
          "grandFather",
          "membership",
          "created_at",
          "updated_at",
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

  merchantReview: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const id = ctx.params.id;

      if (id === ctx.state.user.id.toString()) {
        // Cannot review yourself
        return ctx.badRequest(null, "You cannot review yourself");
      }

      const merchants = (
        await strapi
          .query("user", "users-permissions")
          .model.query(function (qb) {
            qb.where("id", id)
              .andWhere("confirmed", true)
              .andWhere(function () {
                this.where("blocked", false).orWhereNull("blocked");
              })
              .andWhere("isMerchant", true);
          })
          .fetchAll({ withRelated: ["merchantReviews"] })
      ).toJSON();

      if (merchants.length === 0) {
        return ctx.notFound(null, "Cannot find merchant");
      }

      const merchant = merchants[0];

      // Get review if any
      let review = await strapi.services.review.find({
        merchant: merchant.id,
        reviewer: ctx.state.user.id,
      });
      if (review.length > 0) {
        // Existed
        return ctx.badRequest(null, "You already reviewed for this merchant");
      }

      // Add review if not exist
      review = await strapi.query("review").create({
        title: message.title,
        content: message.content,
        rate: message.rates,
        approved: true,
        merchant: merchant.id,
        reviewer: ctx.state.user.id,
      });

      ctx.send({
        title: review.title,
        content: review.content,
        rate: review.rate,
        time: review.created_at,
        reviewer: ctx.state.user.accountNumber,
        reviewerWalletAddress: ctx.state.user.walletAddress,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  updatePushToken: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      let tokens = (ctx.state.user.pushNotificationTokens || "")
        .split("\n")
        .filter((item) => item !== "");
      if (tokens.indexOf(message.token) < 0) {
        tokens.push(message.token);
      }
      let user = await strapi.query("user", "users-permissions").update(
        {
          id: ctx.state.user.id,
        },
        {
          pushNotificationTokens: tokens.join("\n"),
        }
      );
      user = user.toJSON ? user.toJSON() : user;

      ctx.send({});
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  contacts: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const lastTime = moment.utc(message.latestUpdated || 0).toDate();

      const now = moment().utc().valueOf();

      // Get updated contacts
      let contacts = (
        await strapi
          .query("contact-book")
          .model.query((qb) =>
            qb
              .where("contact_books.updated_at", ">=", lastTime)
              .andWhere("contact_books.owner", ctx.state.user.id)
              .leftJoin("users-permissions_user", function () {
                this.on("users-permissions_user.id", "=", "contact_books.user");
              })
              .select(
                "contact_books.name",
                "contact_books.walletAddress",
                "users-permissions_user.accountNumber"
              )
          )
          .fetchAll({ withRelated: [] })
      ).toJSON();

      ctx.send({
        updatedTime: now,
        items: contacts,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  updateContact: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const walletAddress = ctx.request.body.walletAddress;
      const name = message.name;

      if (!walletAddress) {
        return ctx.badRequest(null, "Missing 'walletAddress' parameter");
      }
      if (!name) {
        return ctx.badRequest(null, "Missing 'name' parameter");
      }

      // Find related user
      const existingUser = await strapi
        .query("user", "users-permissions")
        .findOne({ walletAddress: walletAddress.toLowerCase() }, []);

      let contact = await strapi.services["contact-book"].findOne(
        {
          walletAddress: walletAddress.toLowerCase(),
          owner: ctx.state.user.id,
        },
        []
      );
      if (contact) {
        // Update old one with new name
        contact = await strapi.services["contact-book"].update(
          { id: contact.id },
          { name: name, user: existingUser ? existingUser.id : undefined }
        );
      } else {
        // Add new one
        contact = await strapi.services["contact-book"].create({
          owner: ctx.state.user.id,
          user: existingUser ? existingUser.id : undefined,
          name: name,
          walletAddress: walletAddress.toLowerCase(),
        });
      }

      ctx.send({
        id: contact.id,
        name: contact.name,
        walletAddress: contact.walletAddress,
        contactId: contact.user ? contact.user.accountNumber : null,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  deleteContact: async (ctx) => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      const walletAddress = ctx.request.body.walletAddress;

      if (!walletAddress) {
        return ctx.badRequest(null, "Missing 'walletAddress' parameter");
      }

      let contact = await strapi.services["contact-book"].delete({
        walletAddress: walletAddress.toLowerCase(),
        owner: ctx.state.user.id,
      });

      ctx.send({
        id: contact.id,
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = err.message;
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },
};

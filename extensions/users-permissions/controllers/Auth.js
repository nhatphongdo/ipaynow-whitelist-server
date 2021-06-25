"use strict";
const _ = require("lodash");

const { generateKeyPairSync } = require("crypto");
// const DevstoreApi = require('../../../client/DevstoreApi')
const Eth = require("../../../services/eth");
const eth = Eth();

/* eslint-disable no-useless-escape */
const emailRegExp =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * A set of functions called "actions" for `Auth`
 */

module.exports = {
  register: async (ctx) => {
    const pluginStore = await strapi.store({
      environment: "",
      type: "plugin",
      name: "users-permissions",
    });

    const settings = await pluginStore.get({
      key: "advanced",
    });

    if (!settings.allow_register) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.advanced.allow_register" }] }]
          : "Register action is currently disabled."
      );
    }

    const params = _.assign(ctx.request.body, {
      provider: "local",
    });

    // Password is required.
    if (!params.password) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.password.provide" }] }]
          : "Please provide your password."
      );
    }

    // Throw an error if the password selected by the user
    // contains more than two times the symbol '$'.
    if (
      strapi.plugins["users-permissions"].services.user.isHashed(
        params.password
      )
    ) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.password.format" }] }]
          : "Your password cannot contain more than three times the symbol `$`."
      );
    }

    const role = await strapi
      .query("role", "users-permissions")
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.role.notFound" }] }]
          : "Impossible to find the default role."
      );
    }

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    } else {
      // Fake email
      params.email = "--do-not-use--" + params.username + "@fake.haladinar.io";
    }

    params.role = role._id || role.id;
    params.password = await strapi.plugins[
      "users-permissions"
    ].services.user.hashPassword(params);

    if (isEmail) {
      const user = await strapi.query("user", "users-permissions").findOne(
        {
          email: params.email,
        },
        []
      );

      if (user && user.provider === params.provider) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.email.taken" }] }]
            : "Email is already taken."
        );
      }

      if (user && user.provider !== params.provider && settings.unique_email) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.email.taken" }] }]
            : "Email is already taken."
        );
      }
    }

    // Validate signature
    if (!params.publicKey) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.publicKey.notFound" }] }]
          : "Missing `publicKey` parameter."
      );
    }
    if (!params.nonce) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.signature.notFound" }] }]
          : "Missing `nonce` parameter."
      );
    }
    if (!params.signature) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.signature.notFound" }] }]
          : "Missing `signature` parameter."
      );
    }
    const recoverWallet = await eth.recover(
      JSON.stringify({
        nonce: params.nonce,
        publicKey: params.publicKey,
      }),
      params.signature
    );
    if (recoverWallet !== params.walletAddress) {
      return ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.wallet.added" }] }]
          : "Invalid `signature`."
      );
    }

    // Validate wallet address
    if (params.walletAddress) {
      params.walletAddress = params.walletAddress.toLowerCase();
      const userByWalletAddress = await strapi
        .query("user", "users-permissions")
        .findOne(
          {
            walletAddress: params.walletAddress,
          },
          ["vendorLogo", "vendorImages"]
        );

      if (userByWalletAddress) {
        if (userByWalletAddress.blocked === true) {
          return ctx.badRequest(
            null,
            ctx.request.admin
              ? [{ messages: [{ id: "Auth.form.error.blocked" }] }]
              : "Your account has been blocked by the administrator."
          );
        }

        // Not create new user, just create new token
        try {
          // Generate server key pair
          const { publicKey, privateKey } = generateKeyPairSync("rsa", {
            modulusLength: 4096,
            publicKeyEncoding: {
              type: "spki",
              format: "pem",
            },
            privateKeyEncoding: {
              type: "pkcs8",
              format: "pem",
            },
          });

          await strapi.query("token").create({
            user: userByWalletAddress,
            clientPublicKey: params.publicKey,
            serverPrivateKey: privateKey,
            serverPublicKey: publicKey,
            enabled: true,
          });

          const serverKey = publicKey;

          const jwt = strapi.plugins["users-permissions"].services.jwt.issue(
            _.pick(userByWalletAddress, ["_id", "id"])
          );

          if (
            userByWalletAddress.email &&
            userByWalletAddress.email
              .toLowerCase()
              .startsWith("--do-not-use--") &&
            userByWalletAddress.email
              .toLowerCase()
              .endsWith("@fake.haladinar.io")
          ) {
            userByWalletAddress.email = "";
          }
          const membership = await strapi.services.membership.findOne({
            id: userByWalletAddress.membership,
          });
          if (membership) {
            userByWalletAddress.membership = membership.name;
          }

          if (userByWalletAddress.vendorLogo) {
            userByWalletAddress.vendorLogo = _.find(
              userByWalletAddress.vendorLogo,
              (item) => item !== null
            );
            if (userByWalletAddress.vendorLogo) {
              userByWalletAddress.vendorLogo =
                userByWalletAddress.vendorLogo.url;
            } else {
              userByWalletAddress.vendorLogo = null;
            }
          } else {
            userByWalletAddress.vendorLogo = null;
          }
          if (userByWalletAddress.vendorImages) {
            userByWalletAddress.vendorImages = _.map(
              userByWalletAddress.vendorImages,
              (item) => item.url
            );
          }

          return ctx.send({
            jwt,
            serverPublicKey: serverKey,
            user: _.omit(userByWalletAddress, [
              "password",
              "resetPasswordToken",
              "tokens",
            ]),
          });
        } catch (err) {
          const adminError = "Auth.form.error.tokens.failed";

          return ctx.badRequest(
            null,
            ctx.request.admin
              ? [{ messages: [{ id: adminError }] }]
              : err.message
          );
        }
      }
    }

    // Get current valid account number
    let accountNumber = await strapi.services.setting.getAccountNumber();
    do {
      const userByAccountNumber = await strapi
        .query("user", "users-permissions")
        .findOne({ accountNumber: accountNumber }, []);
      if (!userByAccountNumber) {
        break;
      }
      accountNumber = await strapi.services.setting.getAccountNumber();
    } while (true);

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      params.username = accountNumber;
      params.accountNumber = accountNumber;
      params.isMerchant = false;
      // Default membership
      const membership = await strapi.services.membership.find({
        default: true,
      });
      if (membership.length > 0) {
        params.membership = membership[0].id;
      }

      const user = await strapi
        .query("user", "users-permissions")
        .create(params);
      // DevstoreApi.userApi.register
      //   .registerAccount({
      //     email: user.email,
      //     password: "fakeMasterPassword",
      //     rubyUserId: user.id,
      //   })
      //   .then((result) => {
      //     strapi.query("user", "users-permissions").update(
      //       {
      //         id: user.id,
      //       },
      //       {
      //         storeId: result.json.data.id,
      //       }
      //     );
      //   });
      // Generate server key pair
      let serverKey = "";
      try {
        const { publicKey, privateKey } = generateKeyPairSync("rsa", {
          modulusLength: 4096,
          publicKeyEncoding: {
            type: "spki",
            format: "pem",
          },
          privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
          },
        });

        await strapi.query("token").create({
          user: user,
          clientPublicKey: params.publicKey,
          serverPrivateKey: privateKey,
          serverPublicKey: publicKey,
          enabled: true,
        });

        serverKey = publicKey;
      } catch (err) {
        const adminError = "Auth.form.error.tokens.failed";

        ctx.badRequest(
          null,
          ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
        );
      }

      const jwt = strapi.plugins["users-permissions"].services.jwt.issue(
        _.pick(user.toJSON ? user.toJSON() : user, ["_id", "id"])
      );

      if (settings.email_confirmation) {
        const storeEmail =
          (await pluginStore.get({
            key: "email",
          })) || {};

        const settings = storeEmail["email_confirmation"]
          ? storeEmail["email_confirmation"].options
          : {};

        settings.message = await strapi.plugins[
          "users-permissions"
        ].services.userspermissions.template(settings.message, {
          URL: new URL(
            "/auth/email-confirmation",
            strapi.config.url
          ).toString(),
          USER: _.omit(user.toJSON ? user.toJSON() : user, [
            "password",
            "resetPasswordToken",
            "role",
            "provider",
          ]),
          CODE: jwt,
        });

        settings.object = await strapi.plugins[
          "users-permissions"
        ].services.userspermissions.template(settings.object, {
          USER: _.omit(user.toJSON ? user.toJSON() : user, [
            "password",
            "resetPasswordToken",
            "role",
            "provider",
          ]),
        });

        try {
          // Send an email to the user.
          await strapi.plugins["email"].services.email.send({
            to: (user.toJSON ? user.toJSON() : user).email,
            from:
              settings.from.email && settings.from.name
                ? `"${settings.from.name}" <${settings.from.email}>`
                : undefined,
            replyTo: settings.response_email,
            subject: settings.object,
            text: settings.message,
            html: settings.message,
          });
        } catch (err) {
          return ctx.badRequest(null, err);
        }
      }

      const result = user.toJSON ? user.toJSON() : user;
      if (
        result.email &&
        result.email.toLowerCase().startsWith("--do-not-use--") &&
        result.email.toLowerCase().endsWith("@fake.haladinar.io")
      ) {
        result.email = "";
      }
      result.membership = membership.length > 0 ? membership[0].name : null;

      // Add new user reward
      let newUserReward =
        (await strapi.services.setting.getSetting(
          strapi.models.setting.NewUserRewardSetting
        )) || "0";
      newUserReward = parseFloat(newUserReward);
      if (isNaN(newUserReward)) {
        newUserReward = 0;
      }
      if (newUserReward > 0) {
        await strapi.services.reward.create({
          amount: newUserReward,
          type: strapi.models.reward.NEW_USER,
          user: user.id,
        });
        await strapi.services.log.info(
          `User ${accountNumber} receives ${newUserReward} Reward as New Registration bonus.`,
          user
        );
      }

      ctx.send({
        jwt,
        serverPublicKey: serverKey,
        user: _.omit(result, ["password", "resetPasswordToken"]),
      });
    } catch (err) {
      const adminError = _.includes(err.message, "username")
        ? "Auth.form.error.username.taken"
        : "Auth.form.error.email.taken";

      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  callback: async (ctx) => {
    const provider = ctx.params.provider || "local";
    const params = ctx.request.body;
    const store = await strapi.store({
      environment: "",
      type: "plugin",
      name: "users-permissions",
    });

    if (provider === "local") {
      if (
        !_.get(await store.get({ key: "grant" }), "email.enabled") &&
        !ctx.request.admin
      ) {
        return ctx.badRequest(null, "This provider is disabled.");
      }

      // The identifier is required.
      if (!params.identifier) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.email.provide" }] }]
            : "Please provide your username or your e-mail."
        );
      }

      // The password is required.
      if (!params.password) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.password.provide" }] }]
            : "Please provide your password."
        );
      }

      const query = {};

      // Check if the provided identifier is an email or not.
      const isEmail = emailRegExp.test(params.identifier);

      // Set the identifier to the appropriate query field.
      if (isEmail) {
        query.email = params.identifier.toLowerCase();
      } else {
        query.walletAddress = params.identifier.toLowerCase();
      }

      // Check if the user exists.
      const user = await strapi
        .query("user", "users-permissions")
        .findOne(query, ["role", "tokens", "vendorLogo", "vendorImages"]);

      if (!user) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.invalid" }] }]
            : "Identifier or password invalid."
        );
      }

      if (
        _.get(await store.get({ key: "advanced" }), "email_confirmation") &&
        user.confirmed !== true
      ) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.confirmed" }] }]
            : "Your account email is not confirmed."
        );
      }

      if (user.blocked === true) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.blocked" }] }]
            : "Your account has been blocked by the administrator."
        );
      }

      // The user never authenticated with the `local` provider.
      if (!user.password) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.password.local" }] }]
            : "This user never set a local password, please login thanks to the provider used during account creation."
        );
      }

      const validPassword = strapi.plugins[
        "users-permissions"
      ].services.user.validatePassword(params.password, user.password);

      if (!validPassword) {
        return ctx.badRequest(
          null,
          ctx.request.admin
            ? [{ messages: [{ id: "Auth.form.error.invalid" }] }]
            : "Identifier or password invalid."
        );
      } else {
        // Check the signature
        const message = await strapi.services.token.verifyRequest(ctx, user);
        if (!message) {
          return;
        }

        const result = user.toJSON ? user.toJSON() : user;
        if (
          result.email &&
          result.email.toLowerCase().startsWith("--do-not-use--") &&
          result.email.toLowerCase().endsWith("@fake.haladinar.io")
        ) {
          result.email = "";
        }

        const membership = await strapi.services.membership.findOne({
          id: user.membership,
        });
        if (membership) {
          result.membership = membership.name;
        }

        if (result.vendorLogo) {
          result.vendorLogo = _.find(
            result.vendorLogo,
            (item) => item !== null
          );
          if (result.vendorLogo) {
            result.vendorLogo = result.vendorLogo.url;
          } else {
            result.vendorLogo = null;
          }
        } else {
          result.vendorLogo = null;
        }
        if (result.vendorImages) {
          result.vendorImages = _.map(result.vendorImages, (item) => item.url);
        }
        // const devstoreToken = await DevstoreApi.customers.auth(result.storeId);
        ctx.send({
          jwt: strapi.plugins["users-permissions"].services.jwt.issue(
            _.pick(user.toJSON ? user.toJSON() : user, ["_id", "id"])
          ),
          user: _.omit(result, ["password", "resetPasswordToken", "tokens"]),
          // devstoreToken:
          //   devstoreToken && devstoreToken.json && devstoreToken.json.token,
          // customer:
          //   devstoreToken && devstoreToken.json && devstoreToken.json.customer,
        });
      }
    } else {
      if (!_.get(await store.get({ key: "grant" }), [provider, "enabled"])) {
        return ctx.badRequest(null, "This provider is disabled.");
      }

      // Connect the user thanks to the third-party provider.
      let user, error;
      try {
        [user, error] = await strapi.plugins[
          "users-permissions"
        ].services.providers.connect(provider, ctx.query);
      } catch ([user, error]) {
        return ctx.badRequest(
          null,
          error === "array" ? (ctx.request.admin ? error[0] : error[1]) : error
        );
      }

      if (!user) {
        return ctx.badRequest(
          null,
          error === "array" ? (ctx.request.admin ? error[0] : error[1]) : error
        );
      }

      ctx.send({
        jwt: strapi.plugins["users-permissions"].services.jwt.issue(
          _.pick(user, ["_id", "id"])
        ),
        user: _.omit(user.toJSON ? user.toJSON() : user, [
          "password",
          "resetPasswordToken",
        ]),
      });
    }
  },
};

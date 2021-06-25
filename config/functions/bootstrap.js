"use strict";

const _ = require("lodash");
const Crypt = require("../../services/crypt");

const crypt = Crypt();

/**
 * An asynchronous bootstrap function that runs before
 * your application gets started.
 *
 * This gives you an opportunity to set up your data model,
 * run jobs, or perform some special logic.
 *
 * See more details here: https://strapi.io/documentation/3.0.0-beta.x/concepts/configurations.html#bootstrap
 */

module.exports = async () => {
  var io = require("socket.io")(strapi.server);
  var users = [];

  io.on("connection", socket => {
    users.push(socket); // save the socket to use it later

    socket.on("disconnect", () => {
      users.forEach((user, i) => {
        // delete saved user when they disconnect
        if (user.user_id === socket.user_id) users.splice(i, 1);
      });
    });

    socket.on("identify", async (walletAddress, nonce, signature, fn) => {
      if (!walletAddress || !nonce || !signature) {
        return fn({ error: "Missing parameters" });
      }

      // Get user by wallet
      const user = await strapi.query("user", "users-permissions").findOne(
        {
          walletAddress: walletAddress.toLowerCase()
        },
        ["tokens"]
      );
      if (!user) {
        return fn({ error: "Cannot find user" });
      }

      // Get related keys
      const tokens = _.filter(user.tokens, { enabled: true });
      if (!tokens.length === 0) {
        return fn({
          error:
            "Cannot find related pair token between client and server. You need to register again."
        });
      }

      try {
        for (let i = 0; i < tokens.length; i++) {
          const message = crypt.verifyMessage(
            tokens[i].serverPrivateKey,
            tokens[i].clientPublicKey,
            signature
          );
          if (!message) {
            continue;
          }

          const json = JSON.parse(message);
          if (json.nonce !== nonce) {
            return fn({ error: "Invalid signature." });
          }
          if (
            json.walletAddress &&
            json.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
          ) {
            return fn({ error: "Invalid signature." });
          }

          socket.user_id = user.id;
          socket.token_id = tokens[i].id;
          return fn({ error: null });
        }

        return fn({ error: "Invalid signature." });
      } catch (err) {
        strapi.log.fatal(err);
        return fn({ error: "Invalid signature." });
      }
    });

    socket.on("roll_dice", async (nonce, signature, fn) => {
      if (!socket.user_id) {
        return fn({ error: "Invalid user" });
      }
      if (!socket.token_id) {
        return fn({ error: "Invalid authentication" });
      }

      // Get token
      let token = await strapi.query("token").findOne({ id: socket.token_id });
      if (!token) {
        return fn({ error: "Invalid authentication" });
      }
      const message = crypt.verifyMessage(
        token.serverPrivateKey,
        token.clientPublicKey,
        signature
      );
      if (!message) {
        return fn({ error: "Invalid signature" });
      }
      const json = JSON.parse(message);
      if (json.nonce !== nonce) {
        return fn({ error: "Invalid signature" });
      }

      const result = await strapi.services.game.playRollingDice(
        socket.user_id,
        json.session,
        json.numbers
      );
      if (result.error) {
        return fn({ error: result.error });
      }

      return fn({ result: result.result });
    });
  });

  strapi.io = io;

  strapi.socket = {
    emitToUser: (id, event, ...args) => {
      // Find corresponding user
      users.forEach((user, i) => {
        if (user.user_id === id) {
          user.emit(event, args);
        }
      });
    }
  };

  // Start service
  strapi.services.game.startGameService();
};

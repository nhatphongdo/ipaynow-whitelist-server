"use strict";

const _ = require("lodash");

const Crypt = require("../../../services/crypt");

const crypt = Crypt();

module.exports = {
  verifyRequest: async (ctx, user) => {
    if (!ctx) {
      return null;
    }

    if (!user) {
      user = ctx.state.user;
    }

    if (!user) {
      ctx.badRequest(null, "Invalid user");
      return null;
    }

    // Get related keys
    const tokens = await strapi
      .query("token")
      .find({ user: user.id, enabled: true }, []);
    if (tokens.length === 0) {
      ctx.badRequest(
        null,
        ctx.request.admin
          ? [{ messages: [{ id: "Auth.form.error.invalid" }] }]
          : "Cannot find related pair token between client and server. You need to register again."
      );
      return null;
    }

    const params = ctx.request.body;
    if (!params.nonce || !params.signature) {
      ctx.badRequest(null, "Missing `nonce` or `signature` parameter.");
      return null;
    }

    try {
      for (let i = 0; i < tokens.length; i++) {
        const message = crypt.verifyMessage(
          tokens[i].serverPrivateKey,
          tokens[i].clientPublicKey,
          params.signature
        );
        if (!message) {
          continue;
        }

        const json = JSON.parse(message);
        if (json.nonce !== params.nonce) {
          return ctx.badRequest(null, "Invalid signature.");
        }

        return json;
      }

      ctx.badRequest(null, "Invalid signature.");
      return null;
    } catch (err) {
      strapi.log.fatal(err);
      ctx.badRequest(null, "Invalid signature.");
      return null;
    }
  }
};

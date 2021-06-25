"use strict";

const _ = require("lodash");
const moment = require("moment");

module.exports = {
  processMembership: async () => {
    try {
      // Default membership
      const membership = await strapi.services.membership.find({
        default: true
      });
      let defaultMembership = membership.length > 0 ? membership[0].id : null;
      const users = (
        await strapi
          .query("user", "users-permissions")
          .model.query(function(qb) {
            qb.where(function() {
              this.whereNull("membership").orWhereNot({
                membership: defaultMembership
              });
            }).andWhere(
              "membershipExpiredTime",
              "<=",
              moment()
                .utc()
                .toDate()
            );
          })
          .fetchAll({ withRelated: [] })
      ).toJSON();

      _.forEach(users, async item => {
        await strapi.query("user", "users-permissions").update(
          {
            id: item.id
          },
          {
            membership: defaultMembership,
            membershipExpiredTime: null
          }
        );
      });
    } catch (err) {
      strapi.log.fatal(err);
    }
  }
};

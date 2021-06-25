"use strict";

module.exports = {
  validateAccountNumber: (accountNumber, formats) => {
    const number = accountNumber.toString();
    let valid = true;
    for (let i = 0; i < formats.length; i++) {
      if (formats[i].validation === strapi.models.format.RANGE) {
        const parts = formats[i].format.split("-");
        let min = parseInt(parts.length > 0 ? parts[0] : "0");
        if (isNaN(min)) min = 0;
        let max = parseInt(parts.length > 1 ? parts[1] : min.toString());
        if (isNaN(max)) max = 2 ** 63;
        if (min <= accountNumber && accountNumber <= max) {
          valid = false;
          break;
        }
      } else if (formats[i].validation === strapi.models.format.PATTERN) {
        if (formats[i].format.length !== number.length) {
          continue;
        }

        let match = true;
        let variables = {};
        for (let ci = 0; ci < formats[i].format.length; ci++) {
          const char = formats[i].format.charAt(ci);
          if (char === "*") {
            // Any character
            continue;
          }
          if (variables.hasOwnProperty(char)) {
            // Already have
            if (number.charAt(ci) !== variables[char]) {
              match = false;
              break;
            }
          } else {
            // Not have yet
            // Must be different from others
            const keys = Object.keys(variables);
            for (let j = 0; j < keys.length; j++) {
              if (variables[keys[j]] === number.charAt(ci)) {
                match = false;
                break;
              }
            }
            if (!match) {
              break;
            }
            variables[char] = number.charAt(ci);
          }
        }
        if (match) {
          valid = false;
          break;
        }
      } else if (formats[i].validation === strapi.models.format.REGEX) {
        let re = new RegExp(formats[i].format);
        if (re.test(number)) {
          valid = false;
          break;
        }
      } else {
        if (formats[i].format === number) {
          // This is special format
          valid = false;
          break;
        }
      }
    }
    return valid;
  },

  accountNumberIsUsed: async accountNumber => {
    const userByAccountNumber = await strapi
      .query("user", "users-permissions")
      .findOne({ accountNumber: accountNumber }, []);
    const purchases = (
      await strapi.models.purchase
        .query(qb => {
          qb.where("enabled", true)
            .andWhereNot("status", strapi.models.purchase.COMPLETED)
            .andWhere(
              "data",
              "@>",
              '{"newValue": "' + accountNumber.toString() + '"}'
            );
        })
        .fetchAll()
    ).toJSON();
    return userByAccountNumber !== null || purchases.length > 0;
  },

  getValidAccountNumbers: async (format, count) => {
    const MaxId = 10 ** 9;
    const result = [];
    if (format.validation === strapi.models.format.RANGE) {
      const parts = format.format.split("-");
      let min = parseInt(parts.length > 0 ? parts[0] : "0");
      if (isNaN(min)) min = 0;
      let max = parseInt(parts.length > 1 ? parts[1] : min.toString());
      if (isNaN(max)) max = MaxId;
      for (let i = min; i <= max; i++) {
        if (count <= 0) {
          return result;
        }
        const used = await strapi.services.format.accountNumberIsUsed(i);
        if (used) {
          continue;
        }
        result.push(i);
        --count;
      }
    } else if (format.validation === strapi.models.format.PATTERN) {
      let ignore = 0;
      for (let ci = 0; ci < format.format.length; ci++) {
        const char = format.format.charAt(ci);
        if (char === "*") {
          // Any character
          ++ignore;
          continue;
        }
        break;
      }

      let i = Math.max(1, 10 ** (format.format.length - ignore - 1));
      if (i >= 1) {
        while (true) {
          if (
            count <= 0 ||
            i > MaxId ||
            format.format.length < i.toString().length
          ) {
            return result;
          }
          if (strapi.services.format.validateAccountNumber(i, [format])) {
            ++i;
            continue;
          }
          const used = await strapi.services.format.accountNumberIsUsed(i);
          if (used) {
            ++i;
            continue;
          }
          result.push(i);
          --count;
          ++i;
        }
      }
    } else if (format.validation === strapi.models.format.REGEX) {
      let re = new RegExp(format.format);
      let i = 1;
      while (true) {
        if (count <= 0) {
          return result;
        }
        if (!re.test(i)) {
          ++i;
          continue;
        }
        const used = await strapi.services.format.accountNumberIsUsed(i);
        if (used) {
          ++i;
          continue;
        }
        result.push(i);
        --count;
        ++i;
      }
    } else {
      const used = await strapi.services.format.accountNumberIsUsed(
        format.format
      );
      if (!used) {
        // This is special format
        result.push(format.format);
      }
    }

    return result;
  }
};

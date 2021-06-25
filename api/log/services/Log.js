'use strict';

module.exports = {
  info: (message, user) => {
    return strapi.services.log.create({
      user: user ? user.id : null,
      message: message,
      type: 'Information'
    });
  },

  error: (message, user, exception) => {
    return strapi.services.log.create({
      user: user ? user.id : null,
      message: message,
      exception: exception,
      type: 'Error'
    });
  }
};

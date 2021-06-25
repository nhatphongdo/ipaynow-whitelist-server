const cron = require('node-schedule');
const _ = require('lodash');

var _games = {};

module.exports = {
  registerGame: (id, userId, time, task, ...args) => {
    if (!_.has(_games, id.toString())) {
      // Not registered yet
      _games[id.toString()] = {
        time,
        users: [],
        task,
        job: cron.scheduleJob(
          time,
          function(params) {
            task && typeof task === 'function' && task(...params);
          }.bind(null, args)
        )
      };
    }

    // Add to user id list
    _games[id.toString()].users = _.union(_games[id.toString()].users, [userId]);

    return _games[id.toString()];
  },

  removeGame: id => {
    if (_.has(_games, id.toString())) {
      _games[id.toString()].job.cancel();
      _games = _.omit(_games, id.toString());
    }
  },

  getGame: id => {
    if (_.has(_games, id.toString())) {
      return _games[id.toString()];
    }
    return null;
  }
};

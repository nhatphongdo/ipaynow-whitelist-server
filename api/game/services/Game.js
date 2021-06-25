"use strict";

const { Cache } = require("../../../services/cache");
const Games = require("../../../services/games");

const _ = require("lodash");
const moment = require("moment");

const units = ["m", "h", "d", "w", "M", "Q", "y"];
const daysOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec"
];

module.exports = {
  getNextRepeat: (currentTime, game) => {
    const startTime = moment.utc(game.startTime);
    const endTime = moment.utc(game.endTime);
    const duration = endTime.diff(startTime);

    let time = moment.utc(currentTime);
    if (!time.isValid()) {
      time = moment.utc();
    }
    let options = [];
    if (!game.repeat) {
      // No repeat then repeat every day with set hours
      options.push("1d");
    } else if (game.repeat.indexOf(",")) {
      // List of options
      options = game.repeat.split(",");
    } else {
      options.push(game.repeat);
    }

    const now = moment.utc();
    const next = _.map(options, item => {
      let start = time.clone();
      let amount = parseInt(item);
      let unit = "";
      if (isNaN(amount)) {
        // No amount
        amount = 1;
        unit = item;
      } else {
        unit = item
          .substring(amount.toString().length)
          .replace(/[^A-Za-z]/gi, "");
      }

      if (
        units.indexOf(unit) < 0 &&
        daysOfWeek.indexOf(unit.toLowerCase()) < 0 &&
        months.indexOf(unit.toLowerCase()) < 0
      ) {
        // Invalid unit
        return null;
      }

      let repeatAmount = amount;
      let count = 0;
      do {
        // Validate
        if (daysOfWeek.indexOf(unit.toLowerCase()) === start.days()) {
          // Matched
          --repeatAmount;
          if (repeatAmount === 0) {
            if (
              (start <= now && start.clone().add(duration) > now) ||
              start >= now
            ) {
              break;
            } else {
              repeatAmount = amount;
            }
          }
        } else if (
          months.indexOf(unit.toLowerCase()) === start.month() &&
          amount === start.date() &&
          ((start <= now && start.clone().add(duration) > now) || start >= now)
        ) {
          break;
        } else if (
          units.indexOf(unit) >= 0 &&
          ((start <= now && start.clone().add(duration) > now) || start >= now)
        ) {
          break;
        }

        if (
          daysOfWeek.indexOf(unit.toLowerCase()) >= 0 ||
          months.indexOf(unit.toLowerCase()) >= 0
        ) {
          // For day of week and month repeat, only increase by day
          start.add(1, "d");
        } else {
          start.add(amount, unit);
        }

        if (start >= now) {
          ++count;
        }

        if (count > 100) {
          // Too many tries after now but no match
          break;
        }
      } while (true);

      return start;
    }).filter(item => item !== null);

    if (!_.min(next)) {
      return null;
    }

    return {
      startTime: _.min(next)
        .clone()
        .hour(startTime.hour())
        .minute(startTime.minute())
        .second(startTime.second()),
      endTime: _.min(next)
        .clone()
        .hour(startTime.hour())
        .minute(startTime.minute())
        .second(startTime.second())
        .add(duration)
    };
  },

  playRollingDice: async (userId, sessionId, numbers) => {
    try {
      // Get user
      const user = await strapi
        .query("user", "users-permissions")
        .findOne({ id: userId }, []);
      if (!user) {
        return { error: "Cannot find user" };
      }

      // Try to get valid games
      let game = await Cache.get(
        strapi.models.gamesession.GameSessionByIdCache + sessionId
      );
      if (!game) {
        game = _.head(
          await strapi.query("gamesession").find(
            {
              id: sessionId
            },
            ["game"]
          )
        );
        await Cache.set(
          strapi.models.gamesession.GameSessionByIdCache + sessionId,
          game
        );
      }

      if (!game) {
        return { error: "This game is not available for this moment" };
      }

      // Validate
      const now = moment.utc();
      if (moment.utc(game.startTime) > now || moment.utc(game.endTime) < now) {
        return { error: "This game is not available for this moment" };
      }
      if (game.result) {
        return { error: "This game is completed" };
      }

      let gameRecord = null;
      if (game.unit === strapi.models.game.REWARD) {
        let balance = await strapi.services.reward.getRewardBalanceByUser(
          user.id
        );
        if (!balance || game.cost > balance) {
          return { error: "Insufficient balance to play" };
        }

        // Create game record
        gameRecord = await strapi.query("gamerecord").create({
          user: user.id,
          data: { numbers },
          status: strapi.models.game.PLAYING,
          gameSession: game.id
        });

        // Deduct reward
        await strapi.services.reward.create({
          amount: -game.cost,
          type: strapi.models.reward.GAME_SPENT,
          user: user.id,
          gameRecord: gameRecord.id
        });
      }

      if (!gameRecord) {
        return { error: "You cannot join this game for this moment" };
      }

      // Log
      await strapi.services.log.info(
        `User ${user.accountNumber} has played game ${game.game.name} using ${game.cost} ${game.unit}`,
        user
      );

      // Generate result
      let random = [];
      for (let i = 0; i < numbers.length; i++) {
        random.push(Math.floor(Math.random() * 6) + 1);
      }

      numbers = _.sortBy(numbers);
      let sortedRandom = _.sortBy(random);
      let equal = true;
      for (let i = 0; i < numbers.length; i++) {
        if (numbers[i] !== sortedRandom[i]) {
          equal = false;
          break;
        }
      }

      // Update game record
      await strapi.query("gamerecord").update(
        {
          id: gameRecord.id
        },
        {
          result: { result: random },
          status: equal ? strapi.models.game.WIN : strapi.models.game.LOSE
        }
      );

      if (equal) {
        // Issue reward
        await strapi.services.reward.create({
          amount: game.prize,
          type: strapi.models.reward.GAME_PRIZE,
          user: user.id,
          gameRecord: gameRecord.id
        });

        await strapi.services.log.info(
          `User ${user.accountNumber} has won game ${game.game.name} and receive ${game.prize} ${game.prizeUnit}`,
          user
        );
      }

      return {
        result: {
          result: random,
          win: equal,
          prize: game.prize,
          prizeUnit: game.prizeUnit
        }
      };
    } catch (err) {
      strapi.log.fatal(err);
      return { error: err };
    }
  },

  playLuckyDraw: async sessionId => {
    const gameService = Games.getGame(sessionId);
    try {
      let game = await Cache.get(
        strapi.models.gamesession.GameSessionByIdCache + sessionId
      );
      if (!game) {
        game = await strapi.query("gamesession").findOne(
          {
            id: sessionId
          },
          ["game"]
        );
        await Cache.set(
          strapi.models.gamesession.GameSessionByIdCache + sessionId,
          game
        );
      }

      if (!game) {
        if (gameService) {
          _.forEach(gameService.users, user => {
            strapi.socket.emitToUser(user, "game_unavailable", sessionId);
          });
        }
        return;
      }

      // Validate
      const now = moment.utc();
      if (moment.utc(game.startTime) > now) {
        if (gameService) {
          _.forEach(gameService.users, user => {
            strapi.socket.emitToUser(user, "game_unavailable", sessionId);
          });
        }
        return;
      }
      if (game.result) {
        if (gameService) {
          _.forEach(gameService.users, user => {
            strapi.socket.emitToUser(user, "game_completed", sessionId);
          });
        }
        return;
      }

      // Get list of lucky numbers
      let luckyNumbers = await strapi.query("gamerecord").find(
        {
          gameSession: game.id
        },
        []
      );

      // Get total cost and prize
      const totalCost = luckyNumbers.length * game.cost;
      let prize = game.prize;
      if (game.prizeUnit === strapi.models.game.PERCENT_OF_TOTAL_COST) {
        // Part of total
        prize = (totalCost * prize) / 100;
      }

      // Generate winning result
      const numbers = _.union(luckyNumbers.map(item => item.data.number));
      const randomIndex = Math.floor(Math.random() * numbers.length);
      const winningNumber = numbers[randomIndex];

      // Update to game and find winners
      const winners = [];
      let winnersCount = 0;
      const numbersByUser = _.groupBy(luckyNumbers, "user");
      _.forOwn(numbersByUser, (value, key) => {
        let count = 0;
        let winRecord = 0;
        for (let i = 0; i < value.length; i++) {
          if (value[i].data.number === winningNumber) {
            ++count;
            winRecord = i;
          }
        }
        if (count > 0) {
          winnersCount += count;
          winners.push({
            user: key,
            count,
            gameRecord: value[winRecord].id
          });
        }
      });

      await strapi.query("gamesession").update(
        {
          id: game.id
        },
        {
          result: { winningNumber, winners }
        }
      );

      // Update to all game records bases on result
      for (let i = 0; i < luckyNumbers.length; i++) {
        await strapi.query("gamerecord").update(
          {
            id: luckyNumbers[i].id
          },
          {
            result: { winningNumber },
            status:
              luckyNumbers[i].data.number === winningNumber
                ? strapi.models.game.WIN
                : strapi.models.game.LOSE
          }
        );
      }

      // Issue rewards
      for (let i = 0; i < winners.length; i++) {
        const user = await strapi
          .query("user", "users-permissions")
          .findOne({ id: winners[i].user }, []);
        if (!user) {
          continue;
        }

        await strapi.services.reward.create({
          amount: (prize * winners[i].count) / winnersCount,
          type: strapi.models.reward.GAME_PRIZE,
          user: winners[i].user,
          gameRecord: winners[i].gameRecord
        });

        await strapi.services.log.info(
          `User ${user.accountNumber} has won game ${
            game.game.name
          } and receive ${(prize * winners[i].count) / winnersCount} ${
            game.unit
          }`,
          user
        );
      }

      if (gameService) {
        _.forEach(gameService.users, user => {
          if (_.some(winners, { user: user.toString() })) {
            strapi.socket.emitToUser(user, "game_win", sessionId, {
              winningNumber
            });
          } else {
            strapi.socket.emitToUser(user, "game_lose", sessionId, {
              winningNumber
            });
          }
        });
      }

      Games.removeGame(sessionId);
    } catch (err) {
      strapi.log.fatal(err);
      if (gameService) {
        _.forEach(gameService.users, user => {
          strapi.socket.emitToUser(user, "game_error", sessionId, err);
        });
      }
    }
  },

  startGameService: async () => {
    try {
      let gameSessions = (
        await strapi.models.gamesession
          .query(qb => {
            qb.where("endTime", ">=", moment.utc().toDate()).andWhere(
              "startTime",
              "<=",
              moment.utc().toDate()
            );
          })
          .fetchAll({ withRelated: ["game"] })
      ).toJSON();
      if (gameSessions.length === 0) {
        return;
      }

      // Start for all games not completed
      for (let i = 0; i < gameSessions.length; i++) {
        if (gameSessions[i].game.type !== "Lucky Draw") {
          continue;
        }

        // Get all users joined this game
        let gameRecords = (
          await strapi.models.gamerecord
            .query(qb => {
              qb.where("gameSession", "=", gameSessions[i].id);
            })
            .fetchAll({ withRelated: [] })
        ).toJSON();

        _.forEach(gameRecords, item =>
          Games.registerGame(
            gameSessions[i].id,
            item.user,
            moment.utc(gameSessions[i].endTime).toDate(),
            strapi.services.game.playLuckyDraw,
            gameSessions[i].id
          )
        );
      }
    } catch (err) {
      strapi.log.fatal(err);
      return { error: err };
    }
  }
};

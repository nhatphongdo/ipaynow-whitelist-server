"use strict";

const _ = require("lodash");
const { Cache } = require("../../../services/cache");
const moment = require("moment");
const Games = require("../../../services/games");

module.exports = {
  find: async ctx => {
    try {
      // Try to get all valid games
      let games = await Cache.get(strapi.models.game.AllGamesCache);
      if (!games) {
        games = await strapi.query("game").find({
          enabled: true
        });
        await Cache.set(strapi.models.game.AllGamesCache, games);
      }

      const result = [];
      const now = moment().utc();
      for (let i = 0; i < games.length; i++) {
        let lastSession = _.head(
          _.orderBy(
            _.filter(
              games[i].gameSessions,
              item =>
                moment.utc(item.startTime) <= now &&
                moment.utc(item.endTime) > now
            ),
            ["endTime"],
            ["desc"]
          )
        );
        if (lastSession) {
          lastSession.game = _.pick(games[i], ["id", "name", "type"]);
          result.push(_.omit(lastSession, ["created_at", "updated_at"]));
          continue;
        }

        lastSession = _.head(
          _.orderBy(games[i].gameSessions, ["endTime"], ["desc"])
        );
        if (lastSession && moment.utc(lastSession.startTime) >= now) {
          lastSession.game = _.pick(games[i], ["id", "name", "type"]);
          result.push(_.omit(lastSession, ["created_at", "updated_at"]));
          continue;
        }

        // Check time
        let gameTime = strapi.services.game.getNextRepeat(
          lastSession ? lastSession.endTime : games[i].repeatFrom || new Date(),
          games[i]
        );

        if (!gameTime) {
          // This game is not available
          continue;
        }

        // If this gameTime is already exists
        lastSession = _.find(
          games[i].gameSessions,
          item =>
            moment.utc(item.startTime).isSame(gameTime.startTime) &&
            moment.utc(item.endTime).isSame(gameTime.endTime)
        );

        if (!lastSession) {
          const joinDuration = games[i].endJoinTime
            ? moment
                .utc(games[i].endJoinTime)
                .diff(moment.utc(games[i].startTime))
            : null;
          // Create game session
          lastSession = await strapi.query("gamesession").create({
            startTime: gameTime.startTime.toDate(),
            endTime: gameTime.endTime.toDate(),
            endJoinTime: joinDuration
              ? gameTime.startTime
                  .clone()
                  .add(joinDuration)
                  .toDate()
              : null,
            game: games[i].id,
            cost: games[i].cost,
            unit: games[i].unit,
            prize: games[i].prize,
            prizeUnit: games[i].prizeUnit
          });
          lastSession.game = _.pick(lastSession.game, ["id", "name", "type"]);
        } else {
          lastSession.game = _.pick(games[i], ["id", "name", "type"]);
        }
        result.push(_.omit(lastSession, ["created_at", "updated_at"]));
      }

      // Check state
      _.forEach(result, (item, index) => {
        if (item.startTime > now.toDate()) {
          item.state = -1;
        } else if (
          item.startTime <= now.toDate() &&
          item.endTime > now.toDate()
        ) {
          item.state = 0;
        } else {
          item.state = 1;
        }
      });

      ctx.send(result);
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Games.error.load";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  findOne: async ctx => {
    try {
      const id = ctx.params.id;

      // Try to get valid games
      let game = await Cache.get(
        strapi.models.gamesession.GameSessionByIdCache + id
      );
      if (!game) {
        game = await strapi.query("gamesession").findOne(
          {
            id: id
          },
          ["game"]
        );
        await Cache.set(
          strapi.models.gamesession.GameSessionByIdCache + id,
          game
        );
      }

      if (!game) {
        return ctx.notFound(null, "Game is not found");
      }

      // Load info
      if (game.game.type === strapi.models.game.LUCKY_DRAW) {
        const records = await strapi.models.gamerecord
          .query(qb => {
            qb.where("gameSession", game.id);
          })
          .count();
        let prize = game.prize;
        if (game.prizeUnit === strapi.models.game.PERCENT_OF_TOTAL_COST) {
          // Part of total
          prize = (records * game.cost * prize) / 100;
        }
        game.totalCost = prize;
      }

      // Check state
      const now = moment.utc();
      if (moment.utc(game.startTime) > now) {
        game.state = -1;
      } else if (
        moment.utc(game.startTime) <= now &&
        moment.utc(game.endTime) > now
      ) {
        game.state = 0;
      } else {
        game.state = 1;
      }

      ctx.send(_.omit(game, ["created_at", "updated_at", "game"]));
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Games.error.load";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  luckyNumbers: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.gameId) {
        return ctx.badRequest(null, "Missing `gameId` parameter.");
      }

      // Try to get valid games
      let game = await Cache.get(
        strapi.models.gamesession.GameSessionByIdCache + message.gameId
      );
      if (!game) {
        game = _.head(
          await strapi.query("gamesession").find(
            {
              id: message.gameId
            },
            ["game"]
          )
        );
        await Cache.set(
          strapi.models.gamesession.GameSessionByIdCache + message.gameId,
          game
        );
      }

      if (!game) {
        return ctx.notFound(null, "Game is not found");
      }

      let luckyNumbers = await strapi.query("gamerecord").find(
        {
          user: ctx.state.user.id,
          gameSession: game.id
        },
        []
      );
      luckyNumbers = luckyNumbers.map(item => ({
        number: item.data.number,
        status: item.status
      }));

      ctx.send(luckyNumbers);
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Earns.error.load";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  buyLuckyNumber: async ctx => {
    try {
      // Check the signature
      const message = await strapi.services.token.verifyRequest(ctx);
      if (!message) {
        return;
      }

      if (!message.gameId) {
        return ctx.badRequest(null, "Missing `gameId` parameter.");
      }
      if (!message.number) {
        return ctx.badRequest(null, "Missing `number` parameter.");
      }

      // Try to get valid games
      let game = await Cache.get(
        strapi.models.gamesession.GameSessionByIdCache + message.gameId
      );
      if (!game) {
        game = _.head(
          await strapi.query("gamesession").find(
            {
              id: message.gameId
            },
            ["game"]
          )
        );
        await Cache.set(
          strapi.models.gamesession.GameSessionByIdCache + message.gameId,
          game
        );
      }

      if (!game) {
        return ctx.badRequest(
          null,
          "This game is not available for this moment"
        );
      }

      // Validate
      const now = moment.utc();
      if (
        moment.utc(game.startTime) > now ||
        moment.utc(game.endJoinTime || game.endTime) < now
      ) {
        return ctx.badRequest(
          null,
          "This game is not available for this moment"
        );
      }
      if (game.result) {
        return ctx.badRequest(null, "This game is completed");
      }

      let gameRecord = null;
      if (game.unit === strapi.models.game.REWARD) {
        let balance = await strapi.services.reward.getRewardBalanceByUser(
          ctx.state.user.id
        );
        if (!balance || game.cost > balance) {
          return ctx.badRequest(null, "Insufficient balance to play");
        }

        // Create game record
        gameRecord = await strapi.query("gamerecord").create({
          user: ctx.state.user.id,
          data: { number: message.number },
          status: strapi.models.game.PLAYING,
          gameSession: game.id
        });

        // Deduct reward
        await strapi.services.reward.create({
          amount: -game.cost,
          type: strapi.models.reward.GAME_SPENT,
          user: ctx.state.user.id,
          gameRecord: gameRecord.id
        });
      }

      if (!gameRecord) {
        return ctx.badRequest(
          null,
          "You cannot join this game for this moment"
        );
      }

      // Log
      await strapi.services.log.info(
        `User ${ctx.state.user.accountNumber} has played game ${game.game.name} using ${game.cost} ${game.unit}`,
        ctx.state.user
      );

      // Start game job
      Games.registerGame(
        game.id,
        ctx.state.user.id,
        moment.utc(game.endTime).toDate(),
        strapi.services.game.playLuckyDraw,
        game.id
      );

      ctx.send({
        number: message.number,
        status: gameRecord.status
      });
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Games.error.buyLuckyNumber";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  },

  leaderboards: async ctx => {
    try {
      const id = ctx.params.id;
      let date = moment(ctx.request.body.date || "");
      if (!date.isValid()) {
        date = moment();
      }

      // Try to get valid games session
      let gameSessions = (
        await strapi.models.gamesession
          .query(qb => {
            qb.where("game", id)
              .andWhere("endTime", ">=", date.local().startOf("day").toDate())
              .andWhere("endTime", "<=", date.local().endOf("day").toDate());
          })
          .fetchAll({ withRelated: ["game"] })
      ).toJSON();

      if (gameSessions.length === 0) {
        return ctx.notFound(null, "There is no leaderboard yet");
      }

      // Set leaderboard info
      let leaderboard = {
        type: gameSessions[0].game.type
      };

      // Add winner info based on game
      if (leaderboard.type === strapi.models.game.ROLLING_DICE) {
        // Get all my records
        leaderboard.records = [];
        for (let i = 0; i < gameSessions.length; i++) {
          const records = (
            await strapi.models.gamerecord
              .query(qb => {
                qb.where("user", ctx.state.user.id).andWhere(
                  "gameSession",
                  gameSessions[i].id
                );
              })
              .fetchAll()
          ).toJSON();
          for (let j = 0; j < records.length; j++) {
            leaderboard.records.push({
              numbers: records[j].data.numbers,
              result: records[j].result.result,
              win: records[j].status === strapi.models.game.WIN,
              prize:
                records[j].status === strapi.models.game.WIN
                  ? gameSessions[i].prize
                  : 0
            });
          }
        }
      } else if (leaderboard.type === strapi.models.game.LUCKY_DRAW) {
        if (!gameSessions[0].result) {
          return ctx.notFound(null, "There is no leaderboard yet");
        }

        // Get winners
        leaderboard.winningNumber = gameSessions[0].result.winningNumber;
        leaderboard.records = [];

        const records = await strapi.models.gamerecord
          .query(qb => {
            qb.where("gameSession", gameSessions[0].id);
          })
          .count();
        const totalCost = records * gameSessions[0].cost;
        let prize = gameSessions[0].prize;
        if (
          gameSessions[0].prizeUnit === strapi.models.game.PERCENT_OF_TOTAL_COST
        ) {
          // Part of total
          prize = (totalCost * prize) / 100;
        }

        const winnersCount = _.sumBy(gameSessions[0].result.winners, "count");
        for (let i = 0; i < gameSessions[0].result.winners.length; i++) {
          const user = await strapi
            .query("user", "users-permissions")
            .findOne({ id: gameSessions[0].result.winners[i].user }, []);

          leaderboard.records.push({
            wallet: user ? user.walletAddress : "",
            user: user ? user.accountNumber : "",
            count: gameSessions[0].result.winners[i].count,
            prize:
              (prize * gameSessions[0].result.winners[i].count) / winnersCount
          });
        }
      }

      ctx.send(leaderboard);
    } catch (err) {
      strapi.log.fatal(err);

      const adminError = "Leaderboard.error.load";
      ctx.badRequest(
        null,
        ctx.request.admin ? [{ messages: [{ id: adminError }] }] : err.message
      );
    }
  }
};

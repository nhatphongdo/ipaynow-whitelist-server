var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');

const DefaultTtl = 3600; // in seconds
const ShortTtl = 60;

var memoryCache = cacheManager.caching({ store: 'memory', max: 10000, ttl: DefaultTtl /*seconds*/ });

var redisCache = cacheManager.caching({
  store: redisStore,
  host: 'localhost', // default value
  port: 6379, // default value
  auth_pass: '',
  db: 0,
  ttl: DefaultTtl
});

module.exports = {
  DefaultTtl,
  ShortTtl,

  Cache: cacheManager.multiCaching([memoryCache])
};

const DevstoreClient = require("devstore-client").default;

const DevstoreApi = new DevstoreClient({
  apiBaseUrl: "https://mallapi.haladinar.io/api/v1",
  ajaxBaseUrl: "https://mallapi.haladinar.io/ajax",
  userApiBaseUrl: "https://mallapi.haladinar.io/userApi",

  // apiBaseUrl: "http://localhost:3001/api/v1",
  // ajaxBaseUrl: "http://localhost:3001/ajax",
  // userApiBaseUrl: "http://192.168.1.196:3001/userApi",
  apiToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Imx1dWR1Y2hpZXVoYXJyeUBnbWFpbC5jb20iLCJzY29wZXMiOlsiYWRtaW4iXSwiaWF0IjoxNTgxMjE5Mzc3fQ.zTDJHhoFA2zfreL_HUgpX0JWaBxckMtRtK7wb66APgk",
});

module.exports = DevstoreApi;

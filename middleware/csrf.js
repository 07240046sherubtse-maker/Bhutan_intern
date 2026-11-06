const { csrfSync } = require("csrf-sync");

const csrf = csrfSync({
  getTokenFromRequest: (req) => req.body?._csrf || req.headers["x-csrf-token"],
});

module.exports = csrf;

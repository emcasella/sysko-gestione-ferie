"use strict";

const cds = require("@sap/cds");

/**
 * Bootstrap CAP server con autenticazione XSUAA via JWT (Passport.js).
 * Attivo solo in produzione — in locale CAP usa basic auth (package.json).
 */
cds.on("bootstrap", (app) => {
  if (process.env.NODE_ENV === "production") {
    const xsenv = require("@sap/xsenv");
    const xssec = require("@sap/xssec");
    const passport = require("passport");

    // Recupera le credenziali XSUAA dal binding BTP (VCAP_SERVICES)
    const { uaa } = xsenv.getServices({ uaa: { tag: "xsuaa" } });

    // Strategia JWT: valida la firma del token XSUAA ad ogni request
    passport.use("JWT", new xssec.JWTStrategy(uaa));

    app.use(passport.initialize());
    app.use(passport.authenticate("JWT", { session: false }));

    console.log("[server.js] XSUAA JWT strategy attiva");
  } else {
    console.log("[server.js] Modalità sviluppo — basic auth attiva (package.json)");
  }
});

module.exports = cds.server;

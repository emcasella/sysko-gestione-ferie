sap.ui.define(["sap/ui/core/UIComponent", "sap/m/MessageBox"],
function (UIComponent, MessageBox) {
  "use strict";

  return UIComponent.extend("sysko.ferie.employee", {
    metadata: { manifest: "json" },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      /* ── Auth: leggi utente scelto nel launchpad ── */
      var oUser = _getUser();
      if (!oUser) {
        MessageBox.error(
          "Sessione non trovata.\nTorna alla schermata principale e seleziona un profilo.",
          { onClose: function () { window.location.href = "/"; } }
        );
        return;
      }

      /* Inietta Authorization su tutti i model OData della app */
      _applyAuth(this);

      this.getRouter().initialize();
    }
  });

  /* ───── helpers ───── */

  function _getUser() {
    try {
      return JSON.parse(sessionStorage.getItem("sysko_user") || "null");
    } catch (e) { return null; }
  }

  function _applyAuth(oComponent) {
    // FIX: leggi il token salvato al login — nessuna password hardcoded nel Component
    var oUser  = _getUser();
    var sToken = oUser && oUser.token ? oUser.token : null;
    if (!sToken) return;

    var mHeaders = { Authorization: "Basic " + sToken };
    /* Il modello "" è quello OData principale definito nel manifest */
    var oModel = oComponent.getModel();
    if (oModel && typeof oModel.changeHttpHeaders === "function") {
      oModel.changeHttpHeaders(mHeaders);
    }
  }
});

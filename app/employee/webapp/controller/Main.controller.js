sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "../formatter"
], function (Controller, Filter, FilterOperator, JSONModel, MessageBox, MessageToast, formatter) {
  "use strict";

  return Controller.extend("sysko.ferie.employee.controller.Main", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({ isFittizio: false }), "dialog");
      this._loadSaldo();
      this.getOwnerComponent().getRouter()
        .getRoute("main")
        .attachPatternMatched(this._onRouteMatched, this);
    },

    onGoHome: function () {
      window.location.href = "/index.html";
    },

    onCalendario: function () {
      this.getOwnerComponent().getRouter().navTo("calendario");
    },

    _onRouteMatched: function () {
      this._refreshTable();
      this._loadSaldo();
    },

    // ── Saldo ────────────────────────────────────────────────

    _loadSaldo: function () {
      const oModel = this.getOwnerComponent().getModel();
      const anno   = new Date().getFullYear();

      oModel.bindList("/MioSaldo", null, null,
        [new Filter("anno", FilterOperator.EQ, anno)]
      ).requestContexts(0, 1).then(aCtx => {
        const data = aCtx.length ? aCtx[0].getObject() : {
          giorniTotali: 30, giorniUsati: 0, giorniResidui: 30,
          giorniPermesso: 8, giorniPermessoUsati: 0,
          giorniRolUsati: 0, giorniMalattiaUsati: 0,
          giorniLuttoUsati: 0, giorniMatrimonioUsati: 0
        };
        this.getView().setModel(new JSONModel(data), "saldo");
      }).catch(() => {
        this.getView().setModel(new JSONModel({
          giorniTotali: "--", giorniUsati: "--", giorniResidui: "--",
          giorniPermesso: "--", giorniPermessoUsati: "--",
          giorniRolUsati: "--", giorniMalattiaUsati: "--",
          giorniLuttoUsati: "--", giorniMatrimonioUsati: "--"
        }), "saldo");
      });
    },

    // ── Nuova richiesta ──────────────────────────────────────

    onNuovaRichiesta: function () {
      this.getView().getModel("dialog").setProperty("/isFittizio", false);
      if (!this._pDialog) {
        this._pDialog = this.loadFragment({
          name: "sysko.ferie.employee.fragment.NuovaRichiesta"
        });
      }
      this._pDialog.then(d => d.open());
    },

    onTipoChange: function (oEvent) {
      const sKey = oEvent.getSource().getSelectedKey();
      this.getView().getModel("dialog").setProperty("/isFittizio", sKey === "FERIE_FITTIZIE");
    },

    onSubmitRichiesta: async function () {
      const oView      = this.getView();
      const tipoCode   = oView.byId("selTipo").getSelectedKey();
      const dataInizio = oView.byId("dpInizio").getValue();
      const dataFine   = oView.byId("dpFine").getValue();
      const note       = oView.byId("taNota").getValue();
      const beneCeduto = oView.byId("taBeneCeduto").getValue();

      if (!tipoCode || !dataInizio || !dataFine) {
        MessageBox.error("Tipo, data inizio e data fine sono obbligatori.");
        return;
      }
      if (dataFine < dataInizio) {
        MessageBox.error("La data fine deve essere uguale o successiva alla data inizio.");
        return;
      }
      if (tipoCode === "FERIE_FITTIZIE" && !beneCeduto.trim()) {
        MessageBox.error("Il campo \"Bene Ceduto\" è obbligatorio per le Ferie Fittizie.");
        return;
      }

      try {
        // FIX: leggi il token salvato al login — nessuna password hardcoded nel controller
        const oUser  = JSON.parse(sessionStorage.getItem("sysko_user") || "null");
        const sAuth  = oUser?.token ? ("Basic " + oUser.token) : "";

        const tokenResp = await fetch("/employee/", {
          headers: { "X-CSRF-Token": "Fetch", "Authorization": sAuth }
        });
        const csrfToken = tokenResp.headers.get("X-CSRF-Token") || "";

        const payload = { tipoAssenza_code: tipoCode, dataInizio, dataFine, note: note || undefined };
        if (tipoCode === "FERIE_FITTIZIE") payload.beneCeduto = beneCeduto;

        const resp = await fetch("/employee/MieRichieste", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": sAuth,
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          if (resp.status === 409) {
            MessageBox.error("Hai già una richiesta per le date selezionate.\n\nVerifica le richieste esistenti prima di procedere.");
          } else {
            MessageBox.error(errBody.error?.message || `Errore HTTP ${resp.status}`);
          }
          return;
        }

        MessageToast.show("Richiesta inviata.");
        this._closeDialog();
        this._refreshTable();
        this._loadSaldo();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onCancelDialog: function () {
      this._closeDialog();
    },

    _closeDialog: function () {
      if (this._pDialog) this._pDialog.then(d => d.close());
    },

    // ── Visibilità bottoni azioni (aggiornata dopo ogni load) ─

    onTableUpdateFinished: function () {},

    // ── Filtro ───────────────────────────────────────────────

    onFilterChange: function () {
      const oView    = this.getView();
      const stato    = oView.byId("filterStato").getSelectedKey();
      const dal      = oView.byId("dpDal").getValue();
      const al       = oView.byId("dpAl").getValue();
      const aFilter  = [];

      if (stato) aFilter.push(new Filter("stato",      FilterOperator.EQ, stato));
      if (dal)   aFilter.push(new Filter("dataInizio", FilterOperator.GE, dal));
      if (al)    aFilter.push(new Filter("dataFine",   FilterOperator.LE, al));

      oView.byId("richiesteTable").getBinding("items").filter(
        aFilter.length ? [new Filter({ filters: aFilter, and: true })] : []
      );
    },

    onClearFilters: function () {
      const oView = this.getView();
      oView.byId("filterStato").setSelectedKey("");
      oView.byId("dpDal").setValue("");
      oView.byId("dpAl").setValue("");
      oView.byId("richiesteTable").getBinding("items").filter([]);
    },

    // ── Navigazione al dettaglio ─────────────────────────────

    onSelectRichiesta: function (oEvent) {
      const sId = oEvent.getSource().getBindingContext().getProperty("ID");
      this.getOwnerComponent().getRouter().navTo("detail", {
        id: encodeURIComponent(sId)
      });
    },

    // ── Helpers ──────────────────────────────────────────────

    _refreshTable: function () {
      this.getView().byId("richiesteTable").getBinding("items").refresh();
    }
  });
});

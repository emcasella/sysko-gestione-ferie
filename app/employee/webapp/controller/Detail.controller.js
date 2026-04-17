sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "../formatter"
], function (Controller, History, JSONModel, MessageBox, MessageToast, formatter) {
  "use strict";

  return Controller.extend("sysko.ferie.employee.controller.Detail", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({
        canAnnulla:    false,
        canModifica:   false,
        isRejected:    false,
        isBeneCeduto:  false
      }), "ui");

      this.getOwnerComponent().getRouter()
        .getRoute("detail")
        .attachPatternMatched(this._onRoute, this);
    },

    _onRoute: function (oEvent) {
      const sId = decodeURIComponent(oEvent.getParameter("arguments").id);
      this.getView().bindElement({
        path: "/MieRichieste('" + sId + "')",
        parameters: {
          $$updateGroupId: "auto",
          $select: "ID,anno,beneCeduto,dataDecisione,dataFine,dataInizio,dataInvio,giorniRichiesti,invii,note,noteManager,stato,tipoAssenzaLabel,tipoAssenza_code"
        },
        events: {
          change:       this._updateUIState.bind(this),
          dataReceived: this._updateUIState.bind(this)
        }
      });
    },

    // ── Navigazione indietro ─────────────────────────────────

    onNavBack: function () {
      const sPrev = History.getInstance().getPreviousHash();
      if (sPrev !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("main", {}, true);
      }
    },

    // ── Annulla ──────────────────────────────────────────────

    onAnnulla: function () {
      MessageBox.confirm("Sei sicuro di voler annullare la richiesta?", {
        title: "Conferma annullamento",
        onClose: async action => {
          if (action !== MessageBox.Action.OK) return;
          try {
            const oCtx = this.getView().getBindingContext();
            const oOp  = oCtx.getModel().bindContext(
              "EmployeeService.annulla(...)", oCtx
            );
            await oOp.execute();
            MessageToast.show("Richiesta annullata.");
            oCtx.refresh();
          } catch (e) {
            MessageBox.error(e.message || String(e));
          }
        }
      });
    },

    // ── Modifica (BOZZA, PENDING, REJECTED) ──────────────────

    onModifica: function () {
      const oCtx   = this.getView().getBindingContext();
      const tipo   = oCtx.getProperty("tipoAssenza_code");
      const editModel = new JSONModel({
        dataInizio:       oCtx.getProperty("dataInizio"),
        dataFine:         oCtx.getProperty("dataFine"),
        note:             oCtx.getProperty("note") || "",
        tipoAssenza_code: tipo,
        beneCeduto:       oCtx.getProperty("beneCeduto") || "",
        isFittizio:       tipo === "FERIE_FITTIZIE"
      });
      this.getView().setModel(editModel, "edit");

      if (!this._pModificaDialog) {
        this._pModificaDialog = this.loadFragment({
          name: "sysko.ferie.employee.fragment.Modifica"
        });
      }
      this._pModificaDialog.then(d => {
        const oSelect = this.byId("selModTipo");
        if (oSelect) oSelect.setSelectedKey(tipo);
        d.open();
      });
    },

    onModTipoChange: function (oEvent) {
      const sKey = oEvent.getSource().getSelectedKey();
      this.getView().getModel("edit").setProperty("/isFittizio", sKey === "FERIE_FITTIZIE");
    },

    onSubmitModifica: async function () {
      const oView      = this.getView();
      const dataInizio = oView.byId("dpModInizio").getValue();
      const dataFine   = oView.byId("dpModFine").getValue();
      const note       = oView.byId("taModNota").getValue();
      const tipoCode   = oView.byId("selModTipo").getSelectedKey();

      if (!dataInizio || !dataFine) {
        MessageBox.error("Data inizio e data fine sono obbligatorie.");
        return;
      }

      const beneCeduto = oView.byId("taModBeneCeduto").getValue();
      if (tipoCode === "FERIE_FITTIZIE" && !beneCeduto.trim()) {
        MessageBox.error("Il campo \"Bene Ceduto\" è obbligatorio per le Ferie Fittizie.");
        return;
      }

      try {
        const oCtx = oView.getBindingContext();
        const sId  = oCtx.getProperty("ID");

        // Leggi credenziali dallo stesso sessionStorage usato dal Component
        // FIX: leggi il token salvato al login — nessuna password hardcoded nel controller
        const oUser = JSON.parse(sessionStorage.getItem("sysko_user") || "null");
        const sAuth = oUser?.token ? ("Basic " + oUser.token) : "";

        // Fetch CSRF token
        const tokenResp = await fetch("/employee/", {
          headers: { "X-CSRF-Token": "Fetch", "Authorization": sAuth }
        });
        const csrfToken = tokenResp.headers.get("X-CSRF-Token") || "";

        const payload = { dataInizio, dataFine, note, tipoAssenza_code: tipoCode };
        if (tipoCode === "FERIE_FITTIZIE") payload.beneCeduto = beneCeduto;

        const resp = await fetch(`/employee/MieRichieste('${sId}')`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": sAuth,
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody.error?.message || `Errore HTTP ${resp.status}`);
        }

        MessageToast.show("Richiesta aggiornata.");
        this._pModificaDialog.then(d => d.close());
        oCtx.refresh();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onCancelModifica: function () {
      if (this._pModificaDialog) this._pModificaDialog.then(d => d.close());
    },

    // ── Aggiornamento stato pulsanti ─────────────────────────

    _updateUIState: function () {
      const oCtx     = this.getView().getBindingContext();
      const oUiModel = this.getView().getModel("ui");
      if (!oUiModel) return;

      if (!oCtx || oCtx.getProperty("stato") === undefined) {
        oUiModel.setProperty("/canAnnulla",  false);
        oUiModel.setProperty("/canModifica", false);
        oUiModel.setProperty("/isRejected",  false);
        return;
      }

      const sStato = oCtx.getProperty("stato");

      oUiModel.setProperty("/canAnnulla",   sStato === "PENDING");
      oUiModel.setProperty("/canModifica",  sStato === "PENDING");
      oUiModel.setProperty("/isRejected",   sStato === "REJECTED");
      oUiModel.setProperty("/isBeneCeduto", oCtx.getProperty("tipoAssenza_code") === "FERIE_FITTIZIE");
    }
  });
});

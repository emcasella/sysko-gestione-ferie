sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "../formatter"
], function (Controller, History, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, formatter) {
  "use strict";

  return Controller.extend("sysko.ferie.manager.controller.Detail", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({ canApprove: false }), "ui");
      this.getView().setModel(new JSONModel({ richieste: [], saldi: [] }), "storico");

      this.getOwnerComponent().getRouter()
        .getRoute("detail")
        .attachPatternMatched(this._onRoute, this);
    },

    _onRoute: function (oEvent) {
      const sId = decodeURIComponent(oEvent.getParameter("arguments").id);
      // Reset storico ad ogni navigazione
      this.getView().getModel("storico").setData({ richieste: [], saldi: [] });
      this.getView().bindElement({
        path: "/RichiesteFerie('" + sId + "')",
        parameters: { $$updateGroupId: "auto" },
        events: {
          change: this._updateUIState.bind(this),
          dataReceived: this._updateUIState.bind(this)
        }
      });
    },

    _updateUIState: function () {
      const oCtx = this.getView().getBindingContext();
      const oUiModel = this.getView().getModel("ui");
      if (!oUiModel) return;

      if (!oCtx || oCtx.getProperty("stato") === undefined) {
        oUiModel.setProperty("/canApprove", false);
        return;
      }

      const sStato        = oCtx.getProperty("stato");
      const sDipendenteID = oCtx.getProperty("dipendente_ID");
      const nAnno         = oCtx.getProperty("anno");

      // Manager può approvare/rifiutare solo se la richiesta è PENDING
      oUiModel.setProperty("/canApprove", sStato === "PENDING");

      // Carica lo storico assenze del dipendente
      const sCurrentId = oCtx.getProperty("ID");
      if (sDipendenteID && nAnno) {
        this._loadStoricoAssenze(sDipendenteID, nAnno, sCurrentId);
      }
    },

    _loadStoricoAssenze: function (sDipendenteID, nAnnoCorrente, sCurrentId) {
      const oModel       = this.getView().getModel();
      const oStoricoModel = this.getView().getModel("storico");

      // ── Richieste approvate anno corrente e precedenti ──────
      const aFilters = [
        new Filter("dipendente_ID", FilterOperator.EQ, sDipendenteID),
        new Filter("stato",          FilterOperator.EQ, "APPROVED"),
        new Filter("anno",           FilterOperator.LE, nAnnoCorrente)
      ];
      if (sCurrentId) {
        aFilters.push(new Filter("ID", FilterOperator.NE, sCurrentId));
      }
      const oRichiesteBinding = oModel.bindList("/RichiesteFerie",
        null,
        [new Sorter("anno", true), new Sorter("dataInizio", true)],
        aFilters
      );
      oRichiesteBinding.requestContexts(0, 100).then(function (aContexts) {
        oStoricoModel.setProperty("/richieste", aContexts.map(function (ctx) {
          return ctx.getObject();
        }));
      }).catch(function (e) {
        console.warn("Errore caricamento storico richieste:", e.message || e);
      });

      // ── Saldi annuali (tutti gli anni) ──────────────────────
      const oSaldiBinding = oModel.bindList("/SaldoAnnuale",
        null,
        [new Sorter("anno", true)],
        [new Filter("dipendente_ID", FilterOperator.EQ, sDipendenteID)]
      );
      oSaldiBinding.requestContexts(0, 20).then(function (aContexts) {
        oStoricoModel.setProperty("/saldi", aContexts.map(function (ctx) {
          return ctx.getObject();
        }));
      }).catch(function (e) {
        console.warn("Errore caricamento saldi:", e.message || e);
      });
    },

    onNavBack: function () {
      const sPrev = History.getInstance().getPreviousHash();
      if (sPrev !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("dashboard", {}, true);
      }
    },

    // ── Approva ──────────────────────────────────────────────

    onApprova: function () {
      MessageBox.confirm("Approvare questa richiesta?", {
        title: "Conferma approvazione",
        onClose: async action => {
          if (action !== MessageBox.Action.OK) return;
          try {
            const oCtx = this.getView().getBindingContext();
            const oOp  = oCtx.getModel().bindContext(
              "ManagerService.approva(...)", oCtx
            );
            await oOp.execute();
            MessageToast.show("Richiesta approvata.");
            oCtx.refresh();
          } catch (e) {
            MessageBox.error(e.message || String(e));
          }
        }
      });
    },

    // ── Rifiuta ──────────────────────────────────────────────

    onRifiuta: function () {
      this.getView().setModel(new JSONModel({ note: "" }), "rifiuta");
      if (!this._pRifiutaDialog) {
        this._pRifiutaDialog = this.loadFragment({
          name: "sysko.ferie.manager.fragment.Rifiuta"
        });
      }
      this._pRifiutaDialog.then(d => d.open());
    },

    onSubmitRifiuta: async function () {
      const note = this.getView().byId("taRifiutaNota").getValue();
      if (!note.trim()) {
        MessageBox.error("Il commento è obbligatorio per il rifiuto.");
        return;
      }
      try {
        const oCtx = this.getView().getBindingContext();
        const oOp  = oCtx.getModel().bindContext(
          "ManagerService.rifiuta(...)", oCtx
        );
        oOp.setParameter("note", note);
        await oOp.execute();
        MessageToast.show("Richiesta rifiutata.");
        this._pRifiutaDialog.then(d => d.close());
        oCtx.refresh();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onCancelRifiuta: function () {
      if (this._pRifiutaDialog) this._pRifiutaDialog.then(d => d.close());
    }
  });
});

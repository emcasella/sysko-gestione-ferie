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

  return Controller.extend("sysko.ferie.manager.controller.Dashboard", {

    formatter: formatter,

    onInit: function () {
      this.getOwnerComponent().getRouter()
        .getRoute("dashboard")
        .attachPatternMatched(this._onRoute, this);
    },

    onAfterRendering: function () {
      const KPI_MAP = [
        { id: "kpiCardPending",  stato: "PENDING"  },
        { id: "kpiCardApproved", stato: "APPROVED" },
        { id: "kpiCardRejected", stato: "REJECTED" }
      ];
      KPI_MAP.forEach(({ id, stato }) => {
        const dom = this.byId(id) && this.byId(id).getDomRef();
        if (dom) dom.addEventListener("click", () => this._applyKpiFilter(stato));
      });

      const domOverlap = this.byId("kpiCardOverlap") && this.byId("kpiCardOverlap").getDomRef();
      if (domOverlap) {
        domOverlap.addEventListener("click", () => {
          this.getOwnerComponent().getRouter().navTo("sovrapposizioni");
        });
      }
    },

    _applyKpiFilter: function (stato) {
      const oView   = this.getView();
      const oSelect = oView.byId("filterStato");
      const next    = oSelect.getSelectedKey() === stato ? "" : stato;

      oSelect.setSelectedKey(next);
      oView.byId("dpDal").setValue("");
      oView.byId("dpAl").setValue("");
      this.onFilterChange();

      const stateMap = {
        PENDING:  "kpiCardPending",
        APPROVED: "kpiCardApproved",
        REJECTED: "kpiCardRejected"
      };
      Object.entries(stateMap).forEach(([s, id]) => {
        const dom = this.byId(id) && this.byId(id).getDomRef();
        if (dom) dom.classList.toggle("sk-kpi-card--active", s === next);
      });
    },

    _onRoute: function () {
      this._loadKpi();
      const oTable = this.getView().byId("requestsTable");
      if (oTable && oTable.getBinding("items")) {
        oTable.getBinding("items").refresh();
      }
      // Default overlap window: today → +30 days
      var oToday  = new Date();
      var oFuture = new Date();
      oFuture.setDate(oFuture.getDate() + 30);
      var fnFmt = function (d) {
        return d.getFullYear() + "-" +
          String(d.getMonth() + 1).padStart(2, "0") + "-" +
          String(d.getDate()).padStart(2, "0");
      };
      this._loadOverlap(fnFmt(oToday), fnFmt(oFuture));
    },

    // ── KPI ──────────────────────────────────────────────────

    _loadKpi: function () {
      const oModel = this.getOwnerComponent().getModel();
      const now    = new Date();
      const y      = now.getFullYear();
      const m      = String(now.getMonth() + 1).padStart(2, "0");
      
      // Per OData V4 DateTimeOffset servono i timestamp completi
      const meseDal = y + "-" + m + "-01T00:00:00Z";
      const meseAl  = y + "-" + m + "-31T23:59:59Z";
      const oggi    = now.toISOString().slice(0, 10);

      const kpi = { pending: 0, approved: 0, rejected: 0, overlap: 0 };
      const oKpiModel = new JSONModel(kpi);
      this.getView().setModel(oKpiModel, "kpi");

      // pending
      oModel.bindList("/RichiesteFerie", null, null,
        [new Filter("stato", FilterOperator.EQ, "PENDING")]
      ).requestContexts(0, 9999).then(a => {
        oKpiModel.setProperty("/pending", a.length);
      });

      // approved this month
      oModel.bindList("/RichiesteFerie", null, null, [
        new Filter("stato",        FilterOperator.EQ, "APPROVED"),
        new Filter("dataDecisione",FilterOperator.GE, meseDal),
        new Filter("dataDecisione",FilterOperator.LE, meseAl)
      ]).requestContexts(0, 9999).then(a => {
        oKpiModel.setProperty("/approved", a.length);
      });

      // rejected this month
      oModel.bindList("/RichiesteFerie", null, null, [
        new Filter("stato",        FilterOperator.EQ, "REJECTED"),
        new Filter("dataDecisione",FilterOperator.GE, meseDal),
        new Filter("dataDecisione",FilterOperator.LE, meseAl)
      ]).requestContexts(0, 9999).then(a => {
        oKpiModel.setProperty("/rejected", a.length);
      });

      // overlaps today
      oModel.bindList("/RichiesteFerie", null, null, [
        new Filter({ filters: [
          new Filter("stato", FilterOperator.EQ, "PENDING"),
          new Filter("stato", FilterOperator.EQ, "APPROVED")
        ], and: false }),
        new Filter("dataInizio", FilterOperator.LE, oggi),
        new Filter("dataFine",   FilterOperator.GE, oggi)
      ]).requestContexts(0, 9999).then(a => {
        oKpiModel.setProperty("/overlap", a.length);
      });
    },

    // ── Sovrapposizioni ──────────────────────────────────────

    _detectPairs: function (aRequests) {
      var aPairs = [];
      for (var i = 0; i < aRequests.length; i++) {
        for (var j = i + 1; j < aRequests.length; j++) {
          var a = aRequests[i];
          var b = aRequests[j];
          if (a.dipendente_ID === b.dipendente_ID) { continue; }
          var overlapStart = a.dataInizio > b.dataInizio ? a.dataInizio : b.dataInizio;
          var overlapEnd   = a.dataFine   < b.dataFine   ? a.dataFine   : b.dataFine;
          if (overlapStart <= overlapEnd) {
            var days = Math.round(
              (new Date(overlapEnd) - new Date(overlapStart)) / 86400000
            ) + 1;
            aPairs.push({
              nomeA: ((a.dipendanteCognome || "") + " " + (a.dipendanteNome || "")).trim(),
              nomeB: ((b.dipendanteCognome || "") + " " + (b.dipendanteNome || "")).trim(),
              statoA: a.stato,
              statoB: b.stato,
              statoLabelA: { PENDING: "In attesa", APPROVED: "Approvata" }[a.stato] || a.stato,
              statoLabelB: { PENDING: "In attesa", APPROVED: "Approvata" }[b.stato] || b.stato,
              overlapDal: overlapStart,
              overlapAl:  overlapEnd,
              giorniSovrapposti: days,
              severity: (a.stato === "APPROVED" || b.stato === "APPROVED") ? "approved" : "pending"
            });
          }
        }
      }
      return aPairs;
    },

    _loadOverlap: function (sDataInizio, sDataFine) {
      var oView  = this.getView();
      var oModel = this.getOwnerComponent().getModel();

      // Initialise empty model immediately so the panel can bind
      var oOverlapModel = oView.getModel("overlap");
      if (!oOverlapModel) {
        oOverlapModel = new JSONModel({ hasPairs: false, pairCount: 0, pairs: [] });
        oView.setModel(oOverlapModel, "overlap");
      }

      // Set default values on date pickers if not yet set
      var oDal = oView.byId("dpOverlapDal");
      var oAl  = oView.byId("dpOverlapAl");
      if (oDal && !oDal.getValue()) { oDal.setValue(sDataInizio); }
      if (oAl  && !oAl.getValue())  { oAl.setValue(sDataFine); }

      oModel.bindList(
        "/richiesteOverlap(dataInizio=" + sDataInizio + ",dataFine=" + sDataFine + ")"
      ).requestContexts(0, 9999).then(function (aCtx) {
        var aRequests = aCtx.map(function (c) { return c.getObject(); });
        var aPairs    = this._detectPairs(aRequests);
        oOverlapModel.setData({
          hasPairs:  aPairs.length > 0,
          pairCount: aPairs.length,
          pairs:     aPairs
        });
      }.bind(this)).catch(function (oErr) {
        console.error("richiesteOverlap error:", oErr);
      });
    },

    onCercaOverlap: function () {
      var oView = this.getView();
      var sDal  = oView.byId("dpOverlapDal").getValue();
      var sAl   = oView.byId("dpOverlapAl").getValue();
      if (!sDal || !sAl) { return; }
      // Convert yyyy-MM-dd (valueFormat) → pass directly to OData
      this._loadOverlap(sDal, sAl);
    },

    // ── Filtri ───────────────────────────────────────────────

    onFilterChange: function () {
      const oView   = this.getView();
      const stato   = oView.byId("filterStato").getSelectedKey();
      const dal     = oView.byId("dpDal").getValue();
      const al      = oView.byId("dpAl").getValue();
      const aFilter = [];

      if (stato) aFilter.push(new Filter("stato", FilterOperator.EQ, stato));
      if (dal)   aFilter.push(new Filter("dataInizio", FilterOperator.GE, dal));
      if (al)    aFilter.push(new Filter("dataFine",   FilterOperator.LE, al));

      oView.byId("requestsTable").getBinding("items").filter(
        aFilter.length ? [new Filter({ filters: aFilter, and: true })] : []
      );
    },

    onClearFilters: function () {
      const oView = this.getView();
      oView.byId("filterStato").setSelectedKey("");
      oView.byId("dpDal").setValue("");
      oView.byId("dpAl").setValue("");
      oView.byId("requestsTable").getBinding("items").filter([]);
      ["kpiCardPending", "kpiCardApproved", "kpiCardRejected"].forEach(id => {
        const dom = this.byId(id) && this.byId(id).getDomRef();
        if (dom) dom.classList.remove("sk-kpi-card--active");
      });
    },

    // ── Navigazione ─────────────────────────────────────────

    onSelectRichiesta: function (oEvent) {
      const sId = oEvent.getSource().getBindingContext().getProperty("ID");
      this.getOwnerComponent().getRouter().navTo("detail", {
        id: encodeURIComponent(sId)
      });
    },

    onGoHome: function () {
      window.location.href = "/index.html";
    },

    onGoCalendario: function () {
      this.getOwnerComponent().getRouter().navTo("calendario");
    },

    onGoMatrice: function () {
      this.getOwnerComponent().getRouter().navTo("matrice");
    },

    onGoSovrapposizioni: function () {
      this.getOwnerComponent().getRouter().navTo("sovrapposizioni");
    },

    // ── Azioni inline (dal table row) ───────────────────────

    onApprovaInline: function (oEvent) {
      const oCtx = oEvent.getSource().getParent().getParent().getBindingContext();
      this._eseguiApprova(oCtx, "");
    },

    onRifiutaInline: function (oEvent) {
      const oCtx = oEvent.getSource().getParent().getParent().getBindingContext();
      this._openRifiutaDialog(oCtx);
    },

    // ── Shared helpers ───────────────────────────────────────

    _eseguiApprova: async function (oCtx, note) {
      try {
        const oOp = oCtx.getModel().bindContext("ManagerService.approva(...)", oCtx);
        if (note) oOp.setParameter("note", note);
        await oOp.execute();
        MessageToast.show("Richiesta approvata.");
        this.getView().byId("requestsTable").getBinding("items").refresh();
        this._loadKpi();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    _openRifiutaDialog: function (oCtx) {
      this._pendingCtx = oCtx;
      if (!this._pRifiutaDialog) {
        this._pRifiutaDialog = this.loadFragment({
          name: "sysko.ferie.manager.fragment.Rifiuta"
        });
      }
      this._pRifiutaDialog.then(d => {
        this.getView().setModel(
          new JSONModel({ note: "" }), "rifiuta"
        );
        d.open();
      });
    },

    onSubmitRifiuta: async function () {
      const note = this.getView().byId("taRifiutaNota").getValue();
      if (!note.trim()) {
        MessageBox.error("Il commento è obbligatorio per il rifiuto.");
        return;
      }
      try {
        const oCtx = this._pendingCtx;
        const oOp  = oCtx.getModel().bindContext("ManagerService.rifiuta(...)", oCtx);
        oOp.setParameter("note", note);
        await oOp.execute();
        MessageToast.show("Richiesta rifiutata.");
        this._pRifiutaDialog.then(d => d.close());
        this.getView().byId("requestsTable").getBinding("items").refresh();
        this._loadKpi();
      } catch (e) {
        MessageBox.error(e.message || String(e));
      }
    },

    onCancelRifiuta: function () {
      if (this._pRifiutaDialog) this._pRifiutaDialog.then(d => d.close());
    }
  });
});

sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/m/Popover",
  "sap/m/VBox",
  "sap/m/Text",
  "sap/m/Title",
  "../formatter"
], function (Controller, History, Popover, VBox, Text, Title, formatter) {
  "use strict";

  // Nomi dei giorni della settimana (lun-dom)
  const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  // Calcola la data di Pasqua (algoritmo di Gauss/anonimo gregoriano)
  function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day   = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function getHolidaySet(year) {
    const easter    = easterDate(year);
    const pasquetta = new Date(easter);
    pasquetta.setDate(pasquetta.getDate() + 1);
    const pad = function (n) { return String(n).padStart(2, "0"); };
    const y = String(year);
    const toStr = function (dt) {
      return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
    };
    const fixed = [
      y + "-01-01", y + "-01-06", y + "-04-25", y + "-05-01",
      y + "-06-02", y + "-08-15", y + "-11-01", y + "-12-08",
      y + "-12-25", y + "-12-26"
    ];
    const s = new Set(fixed);
    s.add(toStr(easter));
    s.add(toStr(pasquetta));
    return s;
  }

  const _holCache = {};
  function isHolidayStr(dateStr) {
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (!_holCache[year]) _holCache[year] = getHolidaySet(year);
    return _holCache[year].has(dateStr);
  }

  return Controller.extend("sysko.ferie.manager.controller.Calendario", {

    formatter: formatter,

    onInit: function () {
      const now = new Date();
      this._anno = now.getFullYear();
      this._mese = now.getMonth(); // 0-based

      this.getOwnerComponent().getRouter()
        .getRoute("calendario")
        .attachPatternMatched(this._onRoute, this);

      // Bridge per i click sulle celle del calendario HTML
      window.syskoCalClick = this._onDayClick.bind(this);
    },

    _onRoute: function () {
      this._render();
    },

    // ── Navigazione mese ─────────────────────────────────────

    onNavBack: function () {
      const sPrev = History.getInstance().getPreviousHash();
      if (sPrev !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("dashboard", {}, true);
      }
    },

    onPrevMonth: function () {
      this._mese--;
      if (this._mese < 0) { this._mese = 11; this._anno--; }
      this._render();
    },

    onNextMonth: function () {
      this._mese++;
      if (this._mese > 11) { this._mese = 0; this._anno++; }
      this._render();
    },

    // ── Caricamento dati e rendering ─────────────────────────

    _render: function () {
      const anno = this._anno;
      const mese = this._mese;

      // Aggiorna titolo
      const nomiMesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                        "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
      const oTitle = this.byId("calTitle");
      if (oTitle) oTitle.setText(nomiMesi[mese] + " " + anno);

      // Calcola range del mese
      const dalStr = anno + "-" + String(mese + 1).padStart(2, "0") + "-01";
      const lastDay = new Date(anno, mese + 1, 0).getDate();
      const alStr  = anno + "-" + String(mese + 1).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");

      // Carica APPROVED e PENDING che si sovrappongono al mese
      const oModel = this.getOwnerComponent().getModel();
      const sap_ui = sap.ui.require("sap/ui/model/Filter");
      const FilterOperator = sap.ui.require("sap/ui/model/FilterOperator") ||
                             { GE: "GE", LE: "LE", EQ: "EQ", NE: "NE" };

      // Usa OData con filtro dataInizio <= fine mese AND dataFine >= inizio mese
      const sSelect = "$select=ID,dipendente_ID,dipendanteNome,dipendanteCognome,dataInizio,dataFine,stato"
                    + "&$filter=stato eq 'APPROVED' or stato eq 'PENDING'";

      // Fetch via OData model
      const oListBinding = oModel.bindList("/RichiesteFerie", null, null, null, {
        $select: "ID,dipendente_ID,dipendanteNome,dipendanteCognome,dataInizio,dataFine,stato,tipoAssenza_code"
      });

      oListBinding.requestContexts(0, 9999).then(aContexts => {
        const aAll = aContexts.map(c => c.getObject());
        // Filtra solo APPROVED e PENDING che si sovrappongono al mese
        const dalDate = new Date(dalStr);
        const alDate  = new Date(alStr);
        const aRel = aAll.filter(r => {
          if (r.stato !== "APPROVED" && r.stato !== "PENDING") return false;
          return r.dataFine >= dalStr && r.dataInizio <= alStr;
        });
        this._richieste = aRel;
        this._renderHtml(anno, mese, aRel);
      }).catch(err => {
        console.error("[Calendario] Errore caricamento:", err);
      });
    },

    _renderHtml: function (anno, mese, aRichieste) {
      const lastDay = new Date(anno, mese + 1, 0).getDate();

      // Costruisce mappa giorno → { approved: [...nomi], pending: [...nomi] }
      const dayMap = {};
      for (let d = 1; d <= lastDay; d++) {
        dayMap[d] = { approved: [], pending: [], fittizio: [] };
      }

      aRichieste.forEach(r => {
        const nome  = (r.dipendanteCognome || "") + " " + (r.dipendanteNome || "");
        for (let d = 1; d <= lastDay; d++) {
          const curStr = anno + "-" + String(mese + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
          if (curStr >= r.dataInizio && curStr <= r.dataFine) {
            if (r.tipoAssenza_code === "FERIE_FITTIZIE" && r.stato === "APPROVED")
              dayMap[d].fittizio.push(nome.trim());
            else if (r.stato === "APPROVED") dayMap[d].approved.push(nome.trim());
            else                             dayMap[d].pending.push(nome.trim());
          }
        }
      });

      // Costruisce la griglia HTML
      // Prima riga: intestazioni giorni
      let html = '<table style="width:100%;border-collapse:collapse;font-size:15px">';
      html += "<thead><tr>";
      GIORNI.forEach(g => {
        html += `<th style="padding:6px 4px;text-align:center;background:#f5f5f5;border:1px solid #ddd;font-weight:600">${g}</th>`;
      });
      html += "</tr></thead><tbody>";

      // Giorno della settimana del 1° del mese (0=domenica → converti a lun=0)
      const firstDow = new Date(anno, mese, 1).getDay(); // 0=Dom
      const startCol = (firstDow + 6) % 7; // 0=Lun
      let col = 0;
      html += "<tr>";
      // Celle vuote prima del primo giorno
      for (let i = 0; i < startCol; i++) {
        html += '<td style="border:1px solid #eee"></td>';
        col++;
      }

      for (let d = 1; d <= lastDay; d++) {
        const curStr = anno + "-" + String(mese + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        const dow    = new Date(anno, mese, d).getDay(); // 0=Dom
        const isSS   = dow === 0 || dow === 6;
        const isFe   = !isSS && isHolidayStr(curStr);

        const nApp = dayMap[d].approved.length;
        const nPen = dayMap[d].pending.length;
        const nFit = dayMap[d].fittizio.length;

        // Festività: cella rossa, nessuna interazione
        if (isFe) {
          html += `<td style="border:1px solid #ef9a9a;padding:8px 4px;text-align:center;background:#ffebee">`;
          html += `<div style="font-size:16px;font-weight:600;color:#c62828">${d}</div>`;
          html += `<div style="font-size:11px;color:#c62828">festivo</div>`;
          html += "</td>";
          col++;
          if (col % 7 === 0 && d < lastDay) html += "</tr><tr>";
          continue;
        }

        // Weekend: grigio
        if (isSS) {
          html += `<td style="border:1px solid #eee;padding:8px 4px;text-align:center;background:#f5f5f5">`;
          html += `<div style="font-size:16px;color:#bdbdbd">${d}</div>`;
          html += "</td>";
          col++;
          if (col % 7 === 0 && d < lastDay) html += "</tr><tr>";
          continue;
        }

        let bg = "transparent";
        if (nApp >= 5) bg = "#ffcdd2";
        else if (nApp >= 3) bg = "#fff9c4";
        else if (nApp >= 1) bg = "#c8e6c9";

        const dot = nPen > 0
          ? `<span style="display:inline-block;width:8px;height:8px;background:#ff9800;border-radius:50%;margin-left:3px;vertical-align:middle"></span>`
          : "";
        const dotFit = nFit > 0
          ? `<span style="display:inline-block;width:8px;height:8px;background:#8e24aa;border-radius:50%;margin-left:3px;vertical-align:middle"></span>`
          : "";

        const hasData = nApp > 0 || nPen > 0 || nFit > 0;
        const cursor  = hasData ? "pointer" : "default";
        const onclick = hasData
          ? `onclick="window.syskoCalClick(${d}, ${anno}, ${mese})"`
          : "";

        html += `<td style="border:1px solid #ddd;padding:8px 4px;text-align:center;background:${bg};cursor:${cursor}" ${onclick}>`;
        html += `<div style="font-size:16px;font-weight:${hasData ? '600' : '400'}">${d}${dot}${dotFit}</div>`;
        if (nApp > 0) html += `<div style="font-size:12px;color:#388e3c">${nApp} app.</div>`;
        if (nPen > 0) html += `<div style="font-size:12px;color:#f57c00">${nPen} att.</div>`;
        if (nFit > 0) html += `<div style="font-size:12px;color:#8e24aa">${nFit} fitt.</div>`;
        html += "</td>";

        col++;
        if (col % 7 === 0 && d < lastDay) {
          html += "</tr><tr>";
        }
      }
      // Celle vuote alla fine
      const remaining = (7 - (col % 7)) % 7;
      for (let i = 0; i < remaining; i++) {
        html += '<td style="border:1px solid #eee"></td>';
      }
      html += "</tr></tbody></table>";

      const oHtml = this.byId("calHtml");
      if (oHtml) oHtml.setContent(html);
    },

    // ── Click su un giorno ───────────────────────────────────

    _onDayClick: function (giorno, anno, mese) {
      if (!this._richieste) return;
      const cur = new Date(anno, mese, giorno);
      const aOgg = this._richieste.filter(r => {
        return new Date(r.dataInizio) <= cur && new Date(r.dataFine) >= cur;
      });
      if (!aOgg.length) return;

      if (!this._oPopover) {
        this._oPopover = new Popover({
          title: "Ferie del giorno",
          placement: "Auto",
          content: []
        }).addStyleClass("sapUiContentPadding");
      }

      const oContent = new VBox({ items: [] });
      aOgg.forEach(r => {
        const nome      = (r.dipendanteCognome || "") + " " + (r.dipendanteNome || "");
        const isFittizio = r.tipoAssenza_code === "FERIE_FITTIZIE";
        const stato  = r.stato === "APPROVED" ? (isFittizio ? "Ferie Fittizie" : "Approvata") : "In attesa";
        const colore = r.stato === "APPROVED" ? (isFittizio ? "#8e24aa" : "#388e3c") : "#f57c00";
        const item   = new sap.m.HBox({
          alignItems: "Center",
          items: [
            new Text({ text: nome.trim(), width: "160px" }),
            new Text({ text: stato, wrapping: false,
              renderWhitespace: false })
              .addStyleClass("sapUiTinyMarginBegin")
          ]
        });
        oContent.addItem(item);
      });

      this._oPopover.destroyContent();
      this._oPopover.addContent(oContent);

      // Apri il popover vicino al body (non c'è un elemento UI5 target)
      const oDomRef = this.byId("calHtml").getDomRef();
      if (oDomRef) {
        this._oPopover.openBy(oDomRef);
      }
    }
  });
});

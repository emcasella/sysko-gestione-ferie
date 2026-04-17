sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "../formatter"
], function (Controller, History, formatter) {
  "use strict";

  // Calcola la data di Pasqua (algoritmo gregoriano)
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
    const pad = n => String(n).padStart(2, "0");
    const y   = String(year);
    const toStr = dt => dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
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

  // FIX: escape HTML per prevenire XSS nei nomi dipendenti
  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return Controller.extend("sysko.ferie.employee.controller.Calendario", {

    formatter: formatter,

    onInit: function () {
      const now = new Date();
      this._anno = now.getFullYear();
      this._mese = now.getMonth(); // 0-based

      this.getOwnerComponent().getRouter()
        .getRoute("calendario")
        .attachPatternMatched(this._onRoute, this);
    },

    _onRoute: function () {
      this._render();
    },

    // ── Navigazione ──────────────────────────────────────────

    onNavBack: function () {
      const sPrev = History.getInstance().getPreviousHash();
      if (sPrev !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("main", {}, true);
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

    // ── Caricamento dati ─────────────────────────────────────

    _render: function () {
      const anno = this._anno;
      const mese = this._mese;

      const nomiMesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                        "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
      const oTitle = this.byId("calTitle");
      if (oTitle) oTitle.setText(nomiMesi[mese] + " " + anno);

      const pad    = n => String(n).padStart(2, "0");
      const dalStr = anno + "-" + pad(mese + 1) + "-01";
      const lastDay = new Date(anno, mese + 1, 0).getDate();
      const alStr  = anno + "-" + pad(mese + 1) + "-" + pad(lastDay);

      const oModel = this.getOwnerComponent().getModel();
      oModel.bindList("/FerieColleghi", null, null, null, {
        $select: "ID,tipoAssenza_code,dipendanteNome,dipendanteCognome,dataInizio,dataFine"
      }).requestContexts(0, 9999).then(aContexts => {
        const aAll = aContexts.map(c => c.getObject());
        const aRel = aAll.filter(r =>
          r.dataFine >= dalStr && r.dataInizio <= alStr
        );
        this._renderMatrix(anno, mese, aRel);
      }).catch(err => {
        console.error("[Matrice Assenze] Errore caricamento:", err);
      });
    },

    // ── Rendering matrice ────────────────────────────────────

    _renderMatrix: function (anno, mese, aRichieste) {
      const lastDay = new Date(anno, mese + 1, 0).getDate();
      const pad = n => String(n).padStart(2, "0");
      const dateStr = d => anno + "-" + pad(mese + 1) + "-" + pad(d);

      // Costruisce mappa dipendente → giorni assenti (Map: date → tipoAssenza_code)
      const empMap = new Map();
      aRichieste.forEach(r => {
        const key = (r.dipendanteCognome || "") + "\x00" + (r.dipendanteNome || "");
        if (!empMap.has(key)) {
          empMap.set(key, {
            display: ((r.dipendanteCognome || "") + " " + (r.dipendanteNome || "")).trim(),
            days: new Map()
          });
        }
        const emp = empMap.get(key);
        for (let d = 1; d <= lastDay; d++) {
          const cur = dateStr(d);
          if (cur >= r.dataInizio && cur <= r.dataFine) emp.days.set(cur, r.tipoAssenza_code || "");
        }
      });

      // Ordina per cognome+nome
      const employees = [...empMap.values()].sort((a, b) =>
        a.display.localeCompare(b.display, "it")
      );

      const oHtml = this.byId("calHtml");
      if (!oHtml) return;

      if (employees.length === 0) {
        oHtml.setContent(
          '<p style="padding:24px;color:#757575;text-align:center">Nessuna assenza approvata questo mese.</p>'
        );
        return;
      }

      const DOW_ABBR = ["D","L","M","M","G","V","S"];

      let html = '<div style="overflow-x:auto;width:100%">';
      html += '<table style="border-collapse:collapse;font-size:14px;width:100%">';

      // ── Intestazione giorni ───────────────────────────────
      html += '<thead><tr>';
      html += '<th style="position:sticky;left:0;z-index:3;background:#f5f5f5;'
            + 'border:1px solid #ddd;padding:6px 10px;text-align:left;'
            + 'min-width:150px;white-space:nowrap">Dipendente</th>';

      for (let d = 1; d <= lastDay; d++) {
        const cur = dateStr(d);
        const dow = new Date(anno, mese, d).getDay();
        const isSS = dow === 0 || dow === 6;
        const isFe = !isSS && isHolidayStr(cur);
        let thBg = "#f5f5f5", thColor = "#424242";
        if (isFe)      { thBg = "#ffebee"; thColor = "#c62828"; }
        else if (isSS) { thBg = "#eeeeee"; thColor = "#9e9e9e"; }
        html += `<th style="border:1px solid #ddd;padding:4px 3px;text-align:center;`
              + `background:${thBg};color:${thColor};min-width:30px;width:30px">`;
        html += `<div style="font-size:13px;font-weight:700">${d}</div>`;
        html += `<div style="font-size:11px;font-weight:400">${DOW_ABBR[dow]}</div>`;
        html += '</th>';
      }
      html += '</tr></thead><tbody>';

      // ── Righe dipendenti ─────────────────────────────────
      employees.forEach((emp, idx) => {
        const rowBg = idx % 2 === 0 ? "#ffffff" : "#fafafa";
        html += '<tr>';
        // FIX: escHtml previene XSS se il nome contiene caratteri HTML
        html += `<td style="position:sticky;left:0;z-index:2;background:${rowBg};`
              + `border:1px solid #ddd;padding:5px 10px;white-space:nowrap;">${escHtml(emp.display)}</td>`;

        for (let d = 1; d <= lastDay; d++) {
          const cur    = dateStr(d);
          const dow    = new Date(anno, mese, d).getDay();
          const isSS   = dow === 0 || dow === 6;
          const isFe      = !isSS && isHolidayStr(cur);
          const absent    = emp.days.has(cur);
          const absentType = absent ? emp.days.get(cur) : null;

          let tdBg = rowBg;
          if (isFe)                                  tdBg = "#ffebee";
          else if (isSS)                             tdBg = "#eeeeee";
          else if (absentType === "FERIE_FITTIZIE")  tdBg = "#ffe0b2";
          else if (absent)                           tdBg = "#a5d6a7";

          html += `<td style="border:1px solid #e0e0e0;padding:0;text-align:center;`
                + `background:${tdBg};height:28px"></td>`;
        }
        html += '</tr>';
      });

      html += '</tbody></table></div>';
      oHtml.setContent(html);
    }
  });
});

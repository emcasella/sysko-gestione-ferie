sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History"
], function (Controller, History) {
  "use strict";

  const MESI_FULL = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                     "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const DOW_FULL  = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];

  // ── Pasqua (Gauss) ──────────────────────────────────────────
  function easterDate(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day   = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function toDateStr(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  const _holCache = {};
  function getHolSet(year) {
    const easter    = easterDate(year);
    const pasquetta = new Date(easter); pasquetta.setDate(pasquetta.getDate() + 1);
    const y = String(year);
    const s = new Set([
      y+"-01-01", y+"-01-06", y+"-04-25", y+"-05-01",
      y+"-06-02", y+"-08-15", y+"-11-01", y+"-12-08",
      y+"-12-25", y+"-12-26",
      toDateStr(easter), toDateStr(pasquetta)
    ]);
    return s;
  }
  function isHoliday(d) {
    const y = d.getFullYear();
    if (!_holCache[y]) _holCache[y] = getHolSet(y);
    return _holCache[y].has(toDateStr(d));
  }
  function isWorkday(d) {
    const dow = d.getDay();
    return dow !== 0 && dow !== 6 && !isHoliday(d);
  }

  // ─────────────────────────────────────────────────────────────

  // FIX: escape HTML per prevenire XSS nei nomi dipendenti
  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return Controller.extend("sysko.ferie.manager.controller.Sovrapposizioni", {

    onInit: function () {
      const now = new Date();
      this._month = new Date(now.getFullYear(), now.getMonth(), 1);
      this.getOwnerComponent().getRouter()
        .getRoute("sovrapposizioni")
        .attachPatternMatched(this._onRoute, this);
    },

    _onRoute: function () { this._render(); },

    onNavBack: function () {
      const sPrev = History.getInstance().getPreviousHash();
      if (sPrev !== undefined) { window.history.go(-1); }
      else { this.getOwnerComponent().getRouter().navTo("dashboard", {}, true); }
    },

    onPrevMonth: function () {
      this._month = new Date(this._month.getFullYear(), this._month.getMonth() - 1, 1);
      this._render();
    },

    onNextMonth: function () {
      this._month = new Date(this._month.getFullYear(), this._month.getMonth() + 1, 1);
      this._render();
    },

    onToday: function () {
      const now = new Date();
      this._month = new Date(now.getFullYear(), now.getMonth(), 1);
      this._render();
    },

    _render: function () {
      const monthStart = this._month;
      const monthEnd   = new Date(this._month.getFullYear(), this._month.getMonth() + 1, 0);
      const startStr   = toDateStr(monthStart);
      const endStr     = toDateStr(monthEnd);

      const oTitle = this.byId("sovTitle");
      if (oTitle) oTitle.setText(MESI_FULL[monthStart.getMonth()] + " " + monthStart.getFullYear());

      const oModel = this.getOwnerComponent().getModel();

      const oDipB = oModel.bindList("/Dipendenti", null, null, null, {
        $select: "ID,nome,cognome,esterno"
      });
      const oRichB = oModel.bindList("/RichiesteFerie", null, null, null, {
        $select: "ID,dipendente_ID,dataInizio,dataFine,stato",
        $filter: "stato eq 'APPROVED' or stato eq 'PENDING'"
      });

      Promise.all([
        oDipB.requestContexts(0, 9999),
        oRichB.requestContexts(0, 9999)
      ]).then(([aDipCtx, aRichCtx]) => {
        const aDip  = aDipCtx.map(c => c.getObject());
        const dipMap = {};
        aDip.forEach(d => { dipMap[d.ID] = d; });

        const aRich = aRichCtx.map(c => c.getObject()).filter(r =>
          r.dataFine >= startStr && r.dataInizio <= endStr
        );

        // Per ogni giorno lavorativo del mese, trova chi è in ferie
        const overlaps = [];
        let cur = new Date(monthStart);
        while (cur <= monthEnd) {
          if (isWorkday(cur)) {
            const ds = toDateStr(cur);
            const approved = [], pending = [];

            aRich.forEach(r => {
              if (ds >= r.dataInizio && ds <= r.dataFine) {
                const dip = dipMap[r.dipendente_ID];
                const name = dip ? (dip.cognome + " " + dip.nome) : r.dipendente_ID;
                const ext  = dip ? dip.esterno : false;
                if (r.stato === "APPROVED") approved.push({ name, ext });
                else                        pending.push({ name, ext });
              }
            });

            const total = approved.length + pending.length;
            if (total >= 2) {
              overlaps.push({ date: new Date(cur), ds, approved, pending, total });
            }
          }
          cur.setDate(cur.getDate() + 1);
        }

        this._renderHtml(overlaps, monthStart);
      }).catch(err => {
        console.error("[Sovrapposizioni] Errore:", err);
      });
    },

    _renderHtml: function (overlaps, monthStart) {
      const todayStr = toDateStr(new Date());

      if (overlaps.length === 0) {
        const oHtml = this.byId("sovHtml");
        if (oHtml) oHtml.setContent(
          "<div style='font-family:Arial,sans-serif;padding:24px;color:#546e7a;font-size:14px'>" +
          "✅ Nessuna sovrapposizione di ferie nel mese di <b>" +
          MESI_FULL[monthStart.getMonth()] + " " + monthStart.getFullYear() +
          "</b>.</div>"
        );
        return;
      }

      let html = '<div style="font-family:Arial,sans-serif;font-size:13px;overflow-x:auto">';
      html += '<table style="border-collapse:collapse;width:100%;min-width:600px">';

      // Intestazione
      html += "<thead><tr>";
      html += `<th style="background:#37474f;color:#fff;padding:8px 12px;text-align:left;border:1px solid #546e7a;width:130px">Data</th>`;
      html += `<th style="background:#37474f;color:#fff;padding:8px 12px;text-align:center;border:1px solid #546e7a;width:80px">Approvate</th>`;
      html += `<th style="background:#37474f;color:#fff;padding:8px 12px;text-align:center;border:1px solid #546e7a;width:80px">In attesa</th>`;
      html += `<th style="background:#37474f;color:#fff;padding:8px 12px;text-align:center;border:1px solid #546e7a;width:70px">Totale</th>`;
      html += `<th style="background:#37474f;color:#fff;padding:8px 12px;text-align:left;border:1px solid #546e7a">Dipendenti</th>`;
      html += "</tr></thead><tbody>";

      overlaps.forEach((row, idx) => {
        const isToday = row.ds === todayStr;
        const rowBg   = isToday ? "#e3f2fd" : (idx % 2 === 0 ? "#ffffff" : "#f5f5f5");
        const border  = isToday ? "2px solid #1565c0" : "1px solid #e0e0e0";

        const dayLabel = DOW_FULL[row.date.getDay()] + " " +
                         String(row.date.getDate()).padStart(2,"0") + "/" +
                         String(row.date.getMonth()+1).padStart(2,"0");

        // Intensità colore in base al numero di sovrapposizioni
        let totBg = "#fff9c4", totCol = "#e65100";
        if (row.total >= 4)      { totBg = "#ffcdd2"; totCol = "#b71c1c"; }
        else if (row.total >= 3) { totBg = "#ffe0b2"; totCol = "#bf360c"; }

        // Nomi dipendenti con badge
        // FIX: escHtml previene XSS se il nome contiene caratteri HTML
        const dipHtml = [
          ...row.approved.map(d =>
            `<span style="display:inline-block;background:${d.ext?"#c8e6c9":"#e8f5e9"};border:1px solid #81c784;` +
            `border-radius:12px;padding:2px 8px;margin:2px;font-size:12px">` +
            `<span style="color:#2e7d32">●</span> ${escHtml(d.name)}</span>`
          ),
          ...row.pending.map(d =>
            `<span style="display:inline-block;background:#fff3e0;border:1px solid #ffa726;` +
            `border-radius:12px;padding:2px 8px;margin:2px;font-size:12px">` +
            `<span style="color:#e65100">◌</span> ${escHtml(d.name)}</span>`
          )
        ].join(" ");

        html += `<tr style="background:${rowBg}">`;
        html += `<td style="padding:8px 12px;border:${border};font-weight:${isToday?"700":"400"};white-space:nowrap">${dayLabel}</td>`;
        html += `<td style="padding:8px 12px;border:${border};text-align:center;color:#2e7d32;font-weight:700">${row.approved.length > 0 ? row.approved.length : "–"}</td>`;
        html += `<td style="padding:8px 12px;border:${border};text-align:center;color:#e65100;font-weight:700">${row.pending.length > 0 ? row.pending.length : "–"}</td>`;
        html += `<td style="padding:8px 12px;border:${border};text-align:center;background:${totBg};color:${totCol};font-weight:700">${row.total}</td>`;
        html += `<td style="padding:8px 12px;border:${border}">${dipHtml}</td>`;
        html += "</tr>";
      });

      // Riga di riepilogo
      const totGiorni = overlaps.length;
      const maxPeak   = Math.max(...overlaps.map(r => r.total));
      html += `<tr style="background:#eceff1;border-top:2px solid #546e7a;font-weight:700">`;
      html += `<td style="padding:8px 12px;border:1px solid #cfd8dc;color:#37474f">Riepilogo mese</td>`;
      html += `<td colspan="3" style="padding:8px 12px;border:1px solid #cfd8dc;text-align:center;color:#37474f">${totGiorni} gg con sovrapposizioni · picco ${maxPeak} persone</td>`;
      html += `<td style="padding:8px 12px;border:1px solid #cfd8dc;color:#546e7a;font-size:12px">● approvato &nbsp; ◌ in attesa</td>`;
      html += "</tr>";

      html += "</tbody></table></div>";

      const oHtml = this.byId("sovHtml");
      if (oHtml) oHtml.setContent(html);
    }
  });
});

sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "../formatter"
], function (Controller, History, formatter) {
  "use strict";

  const DOW_SHORT = ["D","L","M","M","G","V","S"]; // 0=Dom
  const MESI = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

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

  // Restituisce un Set di stringhe "YYYY-MM-DD" per le festività italiane dell'anno
  function getHolidays(year) {
    const easter    = easterDate(year);
    const pasquetta = new Date(easter);
    pasquetta.setDate(pasquetta.getDate() + 1);

    const y = String(year);
    const mm = function (m) { return String(m).padStart(2, "0"); };

    const fixed = [
      y + "-01-01", // Capodanno
      y + "-01-06", // Epifania
      y + "-04-25", // Festa della Liberazione
      y + "-05-01", // Festa dei Lavoratori
      y + "-06-02", // Festa della Repubblica
      y + "-08-15", // Ferragosto
      y + "-11-01", // Ognissanti
      y + "-12-08", // Immacolata Concezione
      y + "-12-25", // Natale
      y + "-12-26"  // Santo Stefano
    ];

    const s = new Set(fixed);
    s.add(toDateStr(easter));    // Pasqua (variabile)
    s.add(toDateStr(pasquetta)); // Pasquetta (variabile)
    return s;
  }

  // Cache festività per anno
  const _holidayCache = {};
  function isHoliday(date) {
    const y = date.getFullYear();
    if (!_holidayCache[y]) _holidayCache[y] = getHolidays(y);
    return _holidayCache[y].has(toDateStr(date));
  }

  function isWorkday(date) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false; // sab/dom
    return !isHoliday(date);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function toDateStr(date) {
    return date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function formatShort(date) {
    return String(date.getDate()).padStart(2, "0") + "/" +
           String(date.getMonth() + 1).padStart(2, "0");
  }

  return Controller.extend("sysko.ferie.manager.controller.Matrice", {

    formatter: formatter,

    onInit: function () {
      const now = new Date();
      // Parti sempre dal 1° del mese corrente
      this._month = new Date(now.getFullYear(), now.getMonth(), 1);

      this.getOwnerComponent().getRouter()
        .getRoute("matrice")
        .attachPatternMatched(this._onRoute, this);
    },

    _onRoute: function () { this._render(); },

    onNavBack: function () {
      const sPrev = History.getInstance().getPreviousHash();
      if (sPrev !== undefined) {
        window.history.go(-1);
      } else {
        this.getOwnerComponent().getRouter().navTo("dashboard", {}, true);
      }
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
      // Primo e ultimo giorno del mese corrente
      const windowStart = this._month;
      const windowEnd   = new Date(this._month.getFullYear(), this._month.getMonth() + 1, 0);

      const oTitle = this.byId("matTitle");
      if (oTitle) oTitle.setText(MESI[windowStart.getMonth()] + " " + windowStart.getFullYear());

      const oModel = this.getOwnerComponent().getModel();
      const windowStartStr = toDateStr(windowStart);
      const windowEndStr   = toDateStr(windowEnd);

      const oDipBinding = oModel.bindList("/Dipendenti", null, null, null, {
        $select: "ID,nome,cognome,esterno"
      });
      const oRichBinding = oModel.bindList("/RichiesteFerie", null, null, null, {
        $select: "ID,dipendente_ID,dataInizio,dataFine,stato,tipoAssenza_code,note",
        $filter: "stato eq 'APPROVED' or stato eq 'PENDING'"
      });

      Promise.all([
        oDipBinding.requestContexts(0, 9999),
        oRichBinding.requestContexts(0, 9999)
      ]).then(([aDipCtx, aRichCtx]) => {
        const aDip  = aDipCtx.map(c => c.getObject());
        const aRich = aRichCtx.map(c => c.getObject()).filter(r =>
          r.dataFine >= windowStartStr && r.dataInizio <= windowEndStr
        );

        // Costruisce array di tutti i giorni del mese (inclusi weekend)
        const days = [];
        let cur = new Date(windowStart);
        while (cur <= windowEnd) {
          days.push(new Date(cur));
          cur = addDays(cur, 1);
        }

        this._lastDip  = aDip;
        this._lastRich = aRich;
        this._lastDays = days;
        this._renderHtml(aDip, aRich, days);
      }).catch(err => {
        console.error("[Matrice] Errore caricamento:", err);
      });
    },

    _renderHtml: function (aDip, aRich, days) {
      const todayStr = toDateStr(new Date());

      // ── Raggruppa per mese, ogni mese porta i propri giorni ───
      const monthGroups = [];
      let curGroup = null;
      days.forEach(d => {
        const key = d.getFullYear() + "-" + d.getMonth();
        if (!curGroup || curGroup.key !== key) {
          curGroup = { key, label: MESI[d.getMonth()] + " " + d.getFullYear(), days: [] };
          monthGroups.push(curGroup);
        }
        curGroup.days.push(d);
      });

      const DAY_W  = 26;
      const NAME_W = 160;
      const TOT_W  = 40; // colonna totale mensile (gialla)

      let html = '<div style="overflow-x:auto;width:100%;font-family:Arial,sans-serif;font-size:13px">';
      html += '<table style="border-collapse:collapse;table-layout:fixed;width:100%">';

      // ── RIGA 1: raggruppamento mesi ───────────────────────────
      html += "<thead>";
      html += "<tr>";
      html += `<th style="width:${NAME_W}px;min-width:${NAME_W}px;background:#37474f;color:#fff;border:1px solid #546e7a;padding:5px 8px;text-align:left;vertical-align:middle" rowspan="3">Dipendente</th>`;
      monthGroups.forEach(mg => {
        // colspan = giorni del mese + 1 colonna totale mensile
        html += `<th colspan="${mg.days.length + 1}" style="background:#455a64;color:#fff;border:1px solid #546e7a;padding:4px 2px;text-align:center;font-size:13px;letter-spacing:0.5px">${mg.label}</th>`;
      });
      html += `<th style="width:${TOT_W}px;background:#263238;color:#fff;border:1px solid #546e7a;padding:4px 2px;text-align:center;font-size:13px" rowspan="3">TOT</th>`;
      html += "</tr>";

      // ── RIGA 2: giorno del mese ───────────────────────────────
      html += "<tr>";
      monthGroups.forEach(mg => {
        mg.days.forEach(d => {
          const ds  = toDateStr(d);
          const isT = ds === todayStr;
          const isNW = d.getDay() === 0 || d.getDay() === 6 || isHoliday(d);
          let bg, col, fw = isT ? "700" : "400";
          if (isT)       { bg = "#1565c0"; col = "#fff"; }
          else if (isNW) { bg = "#b0bec5"; col = "#546e7a"; }
          else           { bg = "#546e7a"; col = "#fff"; }
          html += `<th style="width:${DAY_W}px;min-width:${DAY_W}px;background:${bg};color:${col};border:1px solid #78909c;padding:3px 0;text-align:center;font-size:13px;font-weight:${fw}">${d.getDate()}</th>`;
        });
        // intestazione colonna totale mensile
        html += `<th style="width:${TOT_W}px;background:#f9a825;color:#3e2723;border:1px solid #78909c;padding:3px 0;text-align:center;font-size:13px;font-weight:700">Σ</th>`;
      });
      html += "</tr>";

      // ── RIGA 3: lettera giorno ────────────────────────────────
      html += "<tr>";
      monthGroups.forEach(mg => {
        mg.days.forEach(d => {
          const ds  = toDateStr(d);
          const isT = ds === todayStr;
          const isNW = d.getDay() === 0 || d.getDay() === 6 || isHoliday(d);
          let bg, col;
          if (isT)       { bg = "#1976d2"; col = "#fff"; }
          else if (isNW) { bg = "#cfd8dc"; col = "#546e7a"; }
          else           { bg = "#607d8b"; col = "#fff"; }
          html += `<th style="width:${DAY_W}px;background:${bg};color:${col};border:1px solid #90a4ae;padding:2px 0;text-align:center;font-size:12px">${DOW_SHORT[d.getDay()]}</th>`;
        });
        html += `<th style="width:${TOT_W}px;background:#fbc02d;color:#3e2723;border:1px solid #90a4ae;padding:2px 0;text-align:center;font-size:12px">gg</th>`;
      });
      html += "</tr>";
      html += "</thead><tbody>";

      // ── RIGHE DIPENDENTI ──────────────────────────────────────
      aDip.forEach((dip, idx) => {
        // Verde chiaro = interno, verde scuro = esterno
        const rowBg  = dip.esterno
          ? (idx % 2 === 0 ? "#c8e6c9" : "#b2dfb0")   // esterno: verde medio/scuro
          : (idx % 2 === 0 ? "#f1f8e9" : "#e8f5e9");   // interno: verde molto chiaro
        const grayBg = dip.esterno
          ? (idx % 2 === 0 ? "#a5d6a7" : "#94cf97")    // weekend/festivi esterno
          : (idx % 2 === 0 ? "#dcedc8" : "#d0ebd3");   // weekend/festivi interno
        let totalApp = 0;
        const aMyRich = aRich.filter(r => r.dipendente_ID === dip.ID);

        html += `<tr style="background:${rowBg}">`;
        const dipLabel = (dip.esterno ? "🔹 " : "") + `<b>${dip.cognome || ""}</b> ${dip.nome || ""}`;
        html += `<td style="padding:4px 8px;border:1px solid #c5e1a5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${NAME_W}px;background:${rowBg}">${dipLabel}</td>`;

        monthGroups.forEach(mg => {
          let monthTotal = 0;

          mg.days.forEach(d => {
            const ds  = toDateStr(d);
            const isT = ds === todayStr;
            const isNW = d.getDay() === 0 || d.getDay() === 6 || isHoliday(d);

            if (isNW) {
              html += `<td style="width:${DAY_W}px;background:${grayBg};border:1px solid #cfd8dc"></td>`;
              return;
            }

            let bg = "transparent", label = "", color = "#000", fw = "400", tooltip = "";

            aMyRich.forEach(r => {
              if (ds >= r.dataInizio && ds <= r.dataFine) {
                if (r.stato === "APPROVED" && r.tipoAssenza_code === "FERIE_FITTIZIE") {
                  bg = "#8e24aa"; color = "#fff"; label = "F"; fw = "700";
                  monthTotal++;
                  totalApp++;
                  if (r.note) tooltip = r.note;
                } else if (r.stato === "APPROVED" && label !== "F") {
                  bg = "#43a047"; color = "#fff"; label = "1"; fw = "700";
                  monthTotal++;
                  totalApp++;
                  if (r.note) tooltip = r.note;
                } else if (r.stato === "PENDING" && label !== "1" && label !== "F") {
                  bg = "#ffa726"; color = "#fff"; label = "1"; fw = "700";
                  if (r.note) tooltip = r.note;
                }
              }
            });

            const todayBorder = isT ? "outline:2px solid #1565c0;outline-offset:-2px;" : "";
            const tooltipAttr = tooltip ? ` data-tooltip="${tooltip.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}"` : "";
            html += `<td${tooltipAttr} style="width:${DAY_W}px;border:1px solid #e0e0e0;${todayBorder}text-align:center;background:${bg};color:${color};font-weight:${fw};padding:3px 0">${label}</td>`;
          });

          // Totale mensile (giallo)
          const mLabel = monthTotal > 0 ? String(monthTotal) : "";
          const mBg    = monthTotal > 0 ? "#fff9c4" : "#fffde7";
          const mCol   = monthTotal > 0 ? "#3e2723" : "#bdbdbd";
          html += `<td style="width:${TOT_W}px;border:1px solid #f9a825;text-align:center;background:${mBg};color:${mCol};font-weight:700;padding:3px 0">${mLabel}</td>`;
        });

        // Totale complessivo
        const totBg  = totalApp > 0 ? "#e8f5e9" : "transparent";
        const totCol = totalApp > 0 ? "#2e7d32" : "#9e9e9e";
        html += `<td style="text-align:center;border:1px solid #e0e0e0;background:${totBg};color:${totCol};font-weight:700;padding:3px 0">${totalApp > 0 ? totalApp : ""}</td>`;
        html += "</tr>";
      });

      // ── RIGA TOTALE TEAM ──────────────────────────────────────
      html += '<tr style="background:#e8eaf6;border-top:2px solid #5c6bc0">';
      html += `<td style="padding:4px 8px;border:1px solid #c5cae9;font-weight:700;color:#283593">Totale team</td>`;

      let grandTotal = 0;
      monthGroups.forEach(mg => {
        let monthTeamTotal = 0;

        mg.days.forEach(d => {
          const ds = toDateStr(d);
          if (!isWorkday(d)) {
            html += `<td style="width:${DAY_W}px;background:#dde0f0;border:1px solid #c5cae9"></td>`;
            return;
          }
          let appCount = 0, penCount = 0;
          aDip.forEach(dip => {
            aRich.filter(r => r.dipendente_ID === dip.ID).forEach(r => {
              if (ds >= r.dataInizio && ds <= r.dataFine) {
                if (r.stato === "APPROVED") appCount++;
                else if (r.stato === "PENDING") penCount++;
              }
            });
          });

          grandTotal      += appCount;
          monthTeamTotal  += appCount;

          let bg = "transparent", label = "", color = "#283593", fw = "700";
          if (appCount > 0) {
            const ratio = appCount / Math.max(aDip.length, 1);
            if (ratio >= 0.5)      { bg = "#c62828"; color = "#fff"; }
            else if (ratio >= 0.3) { bg = "#ef6c00"; color = "#fff"; }
            else                   { bg = "#5c6bc0"; color = "#fff"; }
            label = String(appCount);
          } else if (penCount > 0) {
            bg = "#ffe0b2"; color = "#e65100"; label = penCount + "*";
          }

          const isT = ds === todayStr;
          const todayBorder = isT ? "outline:2px solid #1565c0;outline-offset:-2px;" : "";
          html += `<td style="width:${DAY_W}px;border:1px solid #c5cae9;${todayBorder}text-align:center;background:${bg};color:${color};font-weight:${fw};padding:3px 0">${label}</td>`;
        });

        // Totale mensile team (giallo)
        const mLabel = monthTeamTotal > 0 ? String(monthTeamTotal) : "";
        html += `<td style="width:${TOT_W}px;border:1px solid #f9a825;text-align:center;background:#fff9c4;color:#3e2723;font-weight:700;padding:3px 0">${mLabel}</td>`;
      });

      html += `<td style="text-align:center;border:1px solid #c5cae9;background:#3949ab;color:#fff;font-weight:700">${grandTotal > 0 ? grandTotal : ""}</td>`;
      html += "</tr>";

      html += "</tbody></table></div>";

      const oHtml = this.byId("matHtml");
      if (oHtml) {
        oHtml.setContent(html);
        setTimeout(() => {
          const domRef = oHtml.getDomRef();
          if (!domRef) return;
          const table = domRef.querySelector("table");
          if (!table) return;

          let tip = document.getElementById("sk-mat-tip");
          if (!tip) {
            tip = document.createElement("div");
            tip.id = "sk-mat-tip";
            document.body.appendChild(tip);
          }

          table.addEventListener("mouseover", function (e) {
            const td = e.target.closest("td[data-tooltip]");
            if (td) {
              tip.textContent = td.dataset.tooltip;
              tip.style.display = "block";
            } else {
              tip.style.display = "none";
            }
          });
          table.addEventListener("mousemove", function (e) {
            if (tip.style.display !== "none") {
              tip.style.left = (e.clientX + 14) + "px";
              tip.style.top  = (e.clientY - 42) + "px";
            }
          });
          table.addEventListener("mouseleave", function () {
            tip.style.display = "none";
          });
        }, 0);
      }
    },

    onExportCsv: function () {
      const aDip  = this._lastDip;
      const aRich = this._lastRich;
      const days  = this._lastDays;
      if (!aDip || !days) { return; }

      const rows = [];

      // Header: Dipendente + ogni giorno (dd/mm) + Totale
      const header = ["Dipendente"].concat(days.map(formatShort)).concat(["Totale"]);
      rows.push(header.map(v => '"' + v + '"').join(";"));

      // Righe dipendenti
      aDip.forEach(dip => {
        const aMyRich = aRich.filter(r => r.dipendente_ID === dip.ID);
        let total = 0;
        const cells = ['"' + (dip.cognome || "") + " " + (dip.nome || "") + '"'];
        days.forEach(d => {
          const ds  = toDateStr(d);
          const isNW = d.getDay() === 0 || d.getDay() === 6 || isHoliday(d);
          if (isNW) { cells.push('"-"'); return; }
          let label = "";
          aMyRich.forEach(r => {
            if (ds >= r.dataInizio && ds <= r.dataFine) {
              if (r.stato === "APPROVED" && r.tipoAssenza_code === "FERIE_FITTIZIE") {
                label = "F"; total++;
              } else if (r.stato === "APPROVED" && label !== "F") {
                label = "1"; total++;
              } else if (r.stato === "PENDING" && !label) {
                label = "P";
              }
            }
          });
          cells.push('"' + label + '"');
        });
        cells.push('"' + total + '"');
        rows.push(cells.join(";"));
      });

      // Riga totale team
      const teamCells = ['"Totale team"'];
      let grandTotal = 0;
      days.forEach(d => {
        if (!isWorkday(d)) { teamCells.push('"-"'); return; }
        const ds = toDateStr(d);
        let cnt = 0;
        aDip.forEach(dip => {
          aRich.filter(r => r.dipendente_ID === dip.ID).forEach(r => {
            if (r.stato === "APPROVED" && ds >= r.dataInizio && ds <= r.dataFine) cnt++;
          });
        });
        grandTotal += cnt;
        teamCells.push('"' + (cnt || "") + '"');
      });
      teamCells.push('"' + grandTotal + '"');
      rows.push(teamCells.join(";"));

      // Costruzione e download file
      const mese = MESI[this._month.getMonth()] + "_" + this._month.getFullYear();
      const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "Matrice_Ferie_" + mese + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });
});

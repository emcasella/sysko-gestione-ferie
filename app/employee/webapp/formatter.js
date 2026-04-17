sap.ui.define([], function () {
  "use strict";
  return {
    statusState: function (stato) {
      return { APPROVED: "Success", REJECTED: "Error", PENDING: "Warning",
               BOZZA: "None", CANCELLED: "None" }[stato] || "None";
    },
    statusText: function (stato) {
      return { APPROVED: "Approvata", REJECTED: "Rifiutata", PENDING: "In attesa",
               BOZZA: "Bozza", CANCELLED: "Annullata" }[stato] || stato || "";
    },
    formatDate: function (sDate) {
      if (!sDate) return "";
      if (sDate instanceof Date) {
        return sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" }).format(sDate);
      }
      if (typeof sDate === "string" && sDate.includes("-")) {
        const [y, m, d] = sDate.split("-");
        return d + "/" + m + "/" + y;
      }
      return sDate;
    },
    showAnnulla: function (stato) {
      return stato === "PENDING" || stato === "BOZZA";
    },
    showReInvia: function (stato) {
      return stato === "REJECTED";
    },
    formatAnno: function (anno) {
      if (anno === null || anno === undefined) return "";
      return String(anno);
    },
    formatGiorni: function (giorni) {
      if (giorni === null || giorni === undefined) return "";
      var n = Number(giorni);
      if (isNaN(n)) return String(giorni);
      return n % 1 === 0 ? String(Math.round(n)) : n.toString();
    }
  };
});

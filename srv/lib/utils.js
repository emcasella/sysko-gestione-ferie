// Gauss algorithm for Easter date
function _easterDate(year) {
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
  return new Date(Date.UTC(year, month - 1, day));
}

function _toDateStr(d) {
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

const _holidayCache = {};
function _getItalianHolidays(year) {
  if (_holidayCache[year]) return _holidayCache[year];
  const y = String(year);
  const fixed = [
    y + '-01-01', y + '-01-06', y + '-04-25', y + '-05-01',
    y + '-06-02', y + '-08-15', y + '-11-01', y + '-12-08',
    y + '-12-25', y + '-12-26'
  ];
  const easter    = _easterDate(year);
  const pasquetta = new Date(Date.UTC(easter.getUTCFullYear(), easter.getUTCMonth(), easter.getUTCDate() + 1));
  const s = new Set(fixed);
  s.add(_toDateStr(easter));
  s.add(_toDateStr(pasquetta));
  _holidayCache[year] = s;
  return s;
}

/**
 * Conta i giorni lavorativi (lun–ven, esclusi festivi italiani) tra due date inclusive.
 * @param {string} dataInizio  YYYY-MM-DD
 * @param {string} dataFine    YYYY-MM-DD
 * @returns {number}
 */
function calcolaGiorniLavorativi(dataInizio, dataFine) {
  let count = 0;
  const cur = new Date(dataInizio + 'T00:00:00Z');
  const end = new Date(dataFine   + 'T00:00:00Z');
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const holidays = _getItalianHolidays(cur.getUTCFullYear());
      if (!holidays.has(_toDateStr(cur))) count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * Ritorna l'anno da una stringa data YYYY-MM-DD.
 * @param {string} data
 * @returns {number}
 */
function annoFromDate(data) {
  return parseInt(data.slice(0, 4), 10);
}

module.exports = { calcolaGiorniLavorativi, annoFromDate };

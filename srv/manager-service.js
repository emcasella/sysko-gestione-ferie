const cds = require('@sap/cds');

module.exports = class ManagerService extends cds.ApplicationService {

  async init() {
    const { RichiesteFerie } = this.entities;
    const { RichiesteFerie: RF, SaldoAnnuale, Dipendenti } = cds.entities('sysko.ferie');

    // ── Global Handlers ─────────────────────────────────────────

    this.before('*', async (req) => {
      // Sviluppo locale: mappiamo l'utente sul Manager Luca Verdi
      const genericIDs = ['privileged', 'authenticated', 'anonymous', 'alice'];
      if (genericIDs.includes(req.user.id)) {
        req.user.id = 'luca.verdi@sysko.it';
      }
    });

    // ── Action: approva ───────────────────────────────────────

    this.on('approva', RichiesteFerie, async (req) => {
      let ID = req.params[0]?.ID || req.params[0];
      if (typeof ID === 'object' && ID !== null) ID = Object.values(ID)[0];
      
      const { note } = req.data;
      const richiesta = await SELECT.one.from(RF).where({ ID });

      if (!richiesta)               return req.error(404, 'Richiesta non trovata');
      if (richiesta.stato !== 'PENDING')
        return req.error(400, `Impossibile approvare: stato "${richiesta.stato}"`);

      const mgr = await SELECT.one.from(Dipendenti).where({ email: req.user.id });

      await UPDATE(RF, ID).with({
        stato: 'APPROVED', noteManager: note || null,
        manager_ID: mgr?.ID, dataDecisione: new Date().toISOString()
      });

      await _aggiornaSaldo(richiesta, SaldoAnnuale, RF);
      await _notificaDipendente(richiesta, 'APPROVED', note, Dipendenti);
      return SELECT.one.from(RF, ID);
    });

    // ── Action: rifiuta ───────────────────────────────────────

    this.on('rifiuta', RichiesteFerie, async (req) => {
      let ID = req.params[0]?.ID || req.params[0];
      if (typeof ID === 'object' && ID !== null) ID = Object.values(ID)[0];

      const { note } = req.data;
      const richiesta = await SELECT.one.from(RF).where({ ID });

      if (!richiesta)               return req.error(404, 'Richiesta non trovata');
      if (richiesta.stato !== 'PENDING')
        return req.error(400, `Impossibile rifiutare: stato "${richiesta.stato}"`);
      if (!note?.trim())
        return req.error(400, 'Il commento è obbligatorio per il rifiuto');

      const mgr = await SELECT.one.from(Dipendenti).where({ email: req.user.id });

      await UPDATE(RF, ID).with({
        stato: 'REJECTED', noteManager: note,
        manager_ID: mgr?.ID, dataDecisione: new Date().toISOString()
      });

      await _notificaDipendente(richiesta, 'REJECTED', note, Dipendenti);
      return SELECT.one.from(RF, ID);
    });

    // ── Action: ricalcolaSaldi ────────────────────────────────

    this.on('ricalcolaSaldi', async (req) => {
      const { anno } = req.data;

      const tutteApprovate = await SELECT.from(RF).where({ stato: 'APPROVED', anno });
      const tuttiSaldi     = await SELECT.from(SaldoAnnuale).where({ anno });

      let aggiornati = 0;
      for (const saldo of tuttiSaldi) {
        const richiesteDip = tutteApprovate.filter(r => r.dipendente_ID === saldo.dipendente_ID);

        const sum = (code) => richiesteDip
          .filter(r => r.tipoAssenza_code === code)
          .reduce((acc, r) => acc + Number(r.giorniRichiesti || 0), 0);

        const giorniUsati           = sum('FERIE') + sum('FERIE_FITTIZIE');
        const giorniPermessoUsati   = sum('PERMESSO');
        const giorniRolUsati        = sum('ROL');
        const giorniMalattiaUsati   = sum('MALATTIA');
        const giorniLuttoUsati      = sum('LUTTO');
        const giorniMatrimonioUsati = sum('MATRIMONIO');

        await UPDATE(SaldoAnnuale, saldo.ID).with({
          giorniUsati,
          giorniResidui: Math.max(0, saldo.giorniTotali - giorniUsati),
          giorniPermessoUsati,
          giorniRolUsati,
          giorniMalattiaUsati,
          giorniLuttoUsati,
          giorniMatrimonioUsati
        });
        aggiornati++;
      }

      return `Saldi ${anno} ricalcolati per ${aggiornati} dipendenti.`;
    });

    // ── Function: richiesteOverlap ─────────────────────────────

    this.on('richiesteOverlap', async (req) => {
      const { dataInizio, dataFine } = req.data;
      if (!dataInizio || !dataFine)
        return req.error(400, 'Parametri data obbligatori');

      // FIX: usare query object invece di string concatenation (prevenzione SQL injection)
      return SELECT.from(RF)
        .where({
          stato:      { in: ['PENDING', 'APPROVED'] },
          dataInizio: { '<=': dataFine },
          dataFine:   { '>=': dataInizio }
        })
        .orderBy('dataInizio');
    });

    return super.init();
  }
};

// ── Helpers ───────────────────────────────────────────────

async function _aggiornaSaldo(richiesta, SaldoAnnuale, RF) {
  const { dipendente_ID, anno } = richiesta;

  const saldo = await SELECT.one.from(SaldoAnnuale).where({ dipendente_ID, anno });
  if (!saldo) return;

  // Recupera tutte le richieste approvate e somma in JS (più affidabile di sum() in CDS)
  const approvate = await SELECT.from(RF)
    .where({ dipendente_ID, anno, stato: 'APPROVED' });

  const sum = (code) => approvate
    .filter(r => r.tipoAssenza_code === code)
    .reduce((acc, r) => acc + Number(r.giorniRichiesti || 0), 0);

  const giorniUsati         = sum('FERIE') + sum('FERIE_FITTIZIE');
  const giorniPermessoUsati = sum('PERMESSO');
  const giorniRolUsati      = sum('ROL');
  const giorniMalattiaUsati = sum('MALATTIA');
  const giorniLuttoUsati    = sum('LUTTO');
  const giorniMatrimonioUsati = sum('MATRIMONIO');

  await UPDATE(SaldoAnnuale, saldo.ID).with({
    giorniUsati,
    giorniResidui: Math.max(0, saldo.giorniTotali - giorniUsati),
    giorniPermessoUsati,
    giorniRolUsati,
    giorniMalattiaUsati,
    giorniLuttoUsati,
    giorniMatrimonioUsati
  });
}

async function _notificaDipendente(richiesta, stato, noteManager, Dipendenti) {
  try {
    const dip = await SELECT.one.from(Dipendenti, richiesta.dipendente_ID)
      .columns('email', 'nome', 'cognome');
    if (!dip) return;

    const label   = stato === 'APPROVED' ? 'APPROVATA' : 'RIFIUTATA';
    let   body    = `La tua richiesta dal ${richiesta.dataInizio} al ${richiesta.dataFine} è stata ${label}.`;
    if (stato === 'REJECTED' && noteManager) body += `\n\nMotivo: ${noteManager}`;
    if (stato === 'REJECTED') body += '\n\nPuoi modificarla e re-inviarla dalla tua area.';

    const { sendNotification } = require('./lib/email');
    await sendNotification({
      to: dip.email,
      subject: `[SYSKO Ferie] La tua richiesta è stata ${label}`,
      body
    });
  } catch (e) {
    console.warn('Email non inviata:', e.message);
  }
}

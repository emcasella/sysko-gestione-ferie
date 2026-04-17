const cds = require('@sap/cds');
const { sendNotification } = require('./lib/email');
const { calcolaGiorniLavorativi, annoFromDate } = require('./lib/utils');

module.exports = class EmployeeService extends cds.ApplicationService {

  async init() {
    const { MieRichieste } = this.entities;

    // le entità db vengono lette dal modello compilato, non dalla connessione
    const { RichiesteFerie, SaldoAnnuale, Dipendenti } = cds.entities('sysko.ferie');

    // ── Global Handlers ─────────────────────────────────────────

    this.before('*', async (req) => {
      // Sviluppo locale: se l'utente non è loggato correttamente (fallback per privileged/alice)
      // Questo blocco è attivo SOLO in sviluppo (NODE_ENV !== 'production')
      if (process.env.NODE_ENV !== 'production') {
        const genericIDs = ['privileged', 'authenticated', 'anonymous', 'alice'];
        if (genericIDs.includes(req.user.id)) {
          req.user.id = 'mario.rossi@sysko.it';
        }
      }
    });

    // ── Before CREATE ────────────────────────────────────────

    this.before('CREATE', MieRichieste, async (req) => {
      req.data.ID = cds.utils.uuid();
      const { dataInizio, dataFine } = req.data;

      if (!dataInizio || !dataFine)
        return req.error(400, 'dataInizio e dataFine sono obbligatorie');
      if (new Date(dataFine) < new Date(dataInizio))
        return req.error(400, 'dataFine deve essere uguale o successiva a dataInizio');
      // FIX: blocca richieste retroattive
      const today = new Date().toISOString().slice(0, 10);
      if (dataInizio < today)
        return req.error(400, 'Non è possibile richiedere assenze con data di inizio nel passato');

      req.data.giorniRichiesti = calcolaGiorniLavorativi(dataInizio, dataFine);
      req.data.anno            = annoFromDate(dataInizio);
      req.data.stato           = 'PENDING';
      req.data.dataInvio       = new Date().toISOString();
      req.data.invii           = 1;

      if (req.data.tipoAssenza_code === 'FERIE_FITTIZIE' && !req.data.beneCeduto?.trim())
        return req.error(400, 'Il campo "Bene Ceduto" è obbligatorio per le Ferie Fittizie');

      const dip = await SELECT.one.from(Dipendenti).where({ email: req.user.id });
      if (!dip) return req.error(403, `Dipendente non trovato per l'email: ${req.user.id}`);
      req.data.dipendente_ID = dip.ID;

      await _verificaSovrapposizione(req, RichiesteFerie, dip.ID, dataInizio, dataFine, null);
      await _verificaSaldo(req, dip, req.data, SaldoAnnuale);
    });

    // ── Before UPDATE ────────────────────────────────────────

    this.before('UPDATE', MieRichieste, async (req) => {
      const richiesta = await SELECT.one.from(RichiesteFerie, req.data.ID);
      if (!richiesta) return req.error(404, 'Richiesta non trovata');
      if (!['BOZZA', 'REJECTED', 'PENDING'].includes(richiesta.stato))
        return req.error(400, `Non modificabile: stato "${richiesta.stato}"`);

      const inizio = req.data.dataInizio || richiesta.dataInizio;
      const fine   = req.data.dataFine   || richiesta.dataFine;

      await _verificaSovrapposizione(req, RichiesteFerie, richiesta.dipendente_ID, inizio, fine, richiesta.ID);
      if (req.data.dataInizio || req.data.dataFine) {
        req.data.giorniRichiesti = calcolaGiorniLavorativi(inizio, fine);
        req.data.anno            = annoFromDate(inizio);
      }

      const tipoCode = req.data.tipoAssenza_code || richiesta.tipoAssenza_code;
      const giorni   = req.data.giorniRichiesti  ?? richiesta.giorniRichiesti;
      const anno     = req.data.anno             ?? richiesta.anno;
      const dip      = await SELECT.one.from(Dipendenti).where({ email: req.user.id });

      if (tipoCode === 'FERIE_FITTIZIE') {
        const beneCeduto = req.data.beneCeduto ?? richiesta.beneCeduto;
        if (!beneCeduto?.trim())
          return req.error(400, 'Il campo "Bene Ceduto" è obbligatorio per le Ferie Fittizie');
      }

      await _verificaSaldo(req, dip, { tipoAssenza_code: tipoCode, anno, giorniRichiesti: giorni }, SaldoAnnuale);
    });

    // ── Action: invia ─────────────────────────────────────────

    this.on('invia', MieRichieste, async (req) => {
      const { ID } = req.params[0];
      const richiesta = await SELECT.one.from(RichiesteFerie, ID);
      if (!richiesta) return req.error(404, 'Richiesta non trovata');

      // FIX: ownership check — verifica che la richiesta appartenga al dipendente loggato
      const dip = await SELECT.one.from(Dipendenti).where({ email: req.user.id });
      if (!dip || richiesta.dipendente_ID !== dip.ID)
        return req.error(403, 'Non sei autorizzato ad operare su questa richiesta');

      if (richiesta.stato !== 'BOZZA')
        return req.error(400, `Impossibile inviare: stato "${richiesta.stato}"`);

      await _verificaSaldo(req, dip, richiesta, SaldoAnnuale);

      // FIX: re-verifica sovrapposizione al momento dell'invio (previene race condition)
      await _verificaSovrapposizione(req, RichiesteFerie, dip.ID, richiesta.dataInizio, richiesta.dataFine, richiesta.ID);

      await UPDATE(RichiesteFerie, ID).with({
        stato: 'PENDING', dataInvio: new Date().toISOString(),
        invii: (richiesta.invii || 0) + 1
      });
      await _notificaManager(richiesta, dip, 'inviata', Dipendenti);
      return SELECT.one.from(RichiesteFerie, ID);
    });

    // ── Action: annulla ───────────────────────────────────────

    this.on('annulla', MieRichieste, async (req) => {
      let ID = req.params[0]?.ID || req.params[0];
      if (typeof ID === 'object' && ID !== null) ID = Object.values(ID)[0];

      const richiesta = await SELECT.one.from(RichiesteFerie).where({ ID });

      if (!richiesta)
        return req.error(404, `Richiesta ${ID} non trovata nel sistema`);

      // FIX: ownership check
      const dip = await SELECT.one.from(Dipendenti).where({ email: req.user.id });
      if (!dip || richiesta.dipendente_ID !== dip.ID)
        return req.error(403, 'Non sei autorizzato ad operare su questa richiesta');

      if (!['BOZZA', 'PENDING'].includes(richiesta.stato))
        return req.error(400, `Impossibile annullare: lo stato attuale è "${richiesta.stato}"`);

      await UPDATE(RichiesteFerie, ID).with({ stato: 'CANCELLED' });
      return SELECT.one.from(RichiesteFerie, ID);
    });

    return super.init();
  }
};

// ── Helpers ───────────────────────────────────────────────

async function _verificaSaldo(req, dip, richiesta, SaldoAnnuale) {
  if (!dip) return;
  const { tipoAssenza_code, anno, giorniRichiesti } = richiesta;
  if (!['FERIE', 'FERIE_FITTIZIE', 'PERMESSO', 'LUTTO', 'MATRIMONIO'].includes(tipoAssenza_code)) return;

  let saldo = await SELECT.one.from(SaldoAnnuale)
    .where({ dipendente_ID: dip.ID, anno });

  if (!saldo) {
    await INSERT.into(SaldoAnnuale).entries({
      ID: cds.utils.uuid(), dipendente_ID: dip.ID, anno,
      giorniTotali: 30, giorniUsati: 0, giorniResidui: 30,
      giorniPermesso: 8, giorniPermessoUsati: 0,
      giorniRolUsati: 0, giorniMalattiaUsati: 0,
      giorniLuttoTotali: 3, giorniLuttoUsati: 0,
      giorniMatrimonioTotali: 15, giorniMatrimonioUsati: 0
    });
    saldo = {
      giorniTotali: 30, giorniUsati: 0, giorniResidui: 30,
      giorniPermesso: 8, giorniPermessoUsati: 0,
      giorniLuttoTotali: 3, giorniLuttoUsati: 0,
      giorniMatrimonioTotali: 15, giorniMatrimonioUsati: 0
    };
  }

  if (tipoAssenza_code === 'FERIE' || tipoAssenza_code === 'FERIE_FITTIZIE') {
    const residui = saldo.giorniResidui ?? (saldo.giorniTotali - saldo.giorniUsati);
    if (giorniRichiesti > residui)
      req.error(400, `Ferie insufficienti: richiesti ${giorniRichiesti}, disponibili ${residui}`);
  } else if (tipoAssenza_code === 'PERMESSO') {
    const residui = saldo.giorniPermesso - saldo.giorniPermessoUsati;
    if (giorniRichiesti > residui)
      req.error(400, `Permessi insufficienti: richiesti ${giorniRichiesti}, disponibili ${residui}`);
  } else if (tipoAssenza_code === 'LUTTO') {
    const residui = (saldo.giorniLuttoTotali || 3) - (saldo.giorniLuttoUsati || 0);
    if (giorniRichiesti > residui)
      req.error(400, `Congedo lutto insufficiente: richiesti ${giorniRichiesti}, disponibili ${residui}`);
  } else if (tipoAssenza_code === 'MATRIMONIO') {
    const residui = (saldo.giorniMatrimonioTotali || 15) - (saldo.giorniMatrimonioUsati || 0);
    if (giorniRichiesti > residui)
      req.error(400, `Congedo matrimoniale insufficiente: richiesti ${giorniRichiesti}, disponibili ${residui}`);
  }
}

async function _verificaSovrapposizione(req, RichiesteFerie, dipendente_ID, dataInizio, dataFine, excludeID) {
  const statiAttivi = ['PENDING', 'APPROVED'];
  const esistente = await SELECT.one.from(RichiesteFerie).where({
    dipendente_ID,
    stato: { in: statiAttivi },
    dataInizio: { '<=': dataFine },
    dataFine:   { '>=': dataInizio }
  }).and(excludeID ? { ID: { '!=': excludeID } } : {});

  if (esistente) {
    req.error(409, `Esiste già una richiesta ${esistente.stato === 'APPROVED' ? 'approvata' : 'in attesa'} dal ${esistente.dataInizio} al ${esistente.dataFine} che si sovrappone alle date selezionate.`);
  }
}

async function _notificaManager(richiesta, dip, evento, Dipendenti) {
  if (!dip?.manager_ID) return;
  try {
    const mgr = await SELECT.one.from(Dipendenti, dip.manager_ID)
      .columns('email', 'nome', 'cognome');
    if (mgr) {
      const { sendNotification } = require('./lib/email');
      await sendNotification({
        to:      mgr.email,
        subject: `[SYSKO Ferie] Richiesta ${evento} da ${dip.cognome} ${dip.nome}`,
        body:    `${dip.nome} ${dip.cognome} ha ${evento} una richiesta ferie `
               + `dal ${richiesta.dataInizio} al ${richiesta.dataFine}.`
      });
    }
  } catch (e) {
    console.warn('Email non inviata:', e.message);
  }
}

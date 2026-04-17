namespace sysko.ferie;

using { managed, cuid, sap.common.CodeList } from '@sap/cds/common';

// ──────────────────────────────────────────────────────────
// Enum types
// ──────────────────────────────────────────────────────────

type RuoloDipendente : String(20) enum {
  EMPLOYEE;
  MANAGER;
  ADMIN;
}

type StatoRichiesta : String(20) enum {
  BOZZA;      // draft locale, non ancora inviata
  PENDING;    // in attesa di approvazione
  APPROVED;   // approvata
  REJECTED;   // rifiutata (ritrasmettibile)
  CANCELLED;  // annullata dal dipendente
}

// ──────────────────────────────────────────────────────────
// Code lists
// ──────────────────────────────────────────────────────────

/** Tipi di assenza: Ferie, Permesso, Malattia … */
entity TipiAssenza : CodeList {
  key code              : String(20);
  giorniMassimiAnnui   : Integer default 0;   // 0 = illimitati
  richiedeApprovazione : Boolean default true;
}

/** Reparti aziendali */
entity Reparti {
  key ID : String(36);
  nome   : String(100) not null;
}

// ──────────────────────────────────────────────────────────
// Dipendenti  (Employee + Manager)
// ──────────────────────────────────────────────────────────

@assert.unique: { byMatricola: [ matricola ], byEmail: [ email ] }
entity Dipendenti : managed {
  key ID        : String(36);
  matricola     : String(20)  not null;
  nome          : String(100) not null;
  cognome       : String(100) not null;
  email         : String(255) not null;
  ruolo         : RuoloDipendente default 'EMPLOYEE' @assert.range;
  esterno       : Boolean default false;        // true = risorsa esterna/consulente
  reparto       : Association to Reparti;
  manager       : Association to Dipendenti;   // gerarchia

  saldi         : Composition of many SaldoAnnuale  on saldi.dipendente = $self;
  richieste     : Composition of many RichiesteFerie on richieste.dipendente = $self;
}

// ──────────────────────────────────────────────────────────
// Saldo annuale ferie per dipendente
// ──────────────────────────────────────────────────────────

entity SaldoAnnuale : managed {
  key ID                : String(36);
  dipendente            : Association to Dipendenti;
  anno                  : Integer not null;
  giorniTotali          : Decimal(5,2) default 30;
  giorniUsati           : Decimal(5,2) default 0;
  giorniResidui         : Decimal(5,2) default 30;
  giorniPermesso        : Decimal(5,2) default 8;
  giorniPermessoUsati   : Decimal(5,2) default 0;
  giorniRolUsati        : Decimal(5,2) default 0;
  giorniMalattiaUsati   : Decimal(5,2) default 0;
  giorniLuttoTotali     : Decimal(5,2) default 3;
  giorniLuttoUsati      : Decimal(5,2) default 0;
  giorniMatrimonioTotali: Decimal(5,2) default 15;
  giorniMatrimonioUsati : Decimal(5,2) default 0;
}

// ──────────────────────────────────────────────────────────
// Richieste ferie / permessi
// ──────────────────────────────────────────────────────────

entity RichiesteFerie : managed {
  key ID            : String(36);
  dipendente        : Association to Dipendenti;
  tipoAssenza       : Association to TipiAssenza;
  anno              : Integer not null;
  dataInizio        : Date not null;
  dataFine          : Date not null;
  giorniRichiesti   : Decimal(5,2);
  note              : String(500);
  beneCeduto        : String(500);   // Bene aziendale ceduto (solo FERIE_FITTIZIE)
  stato             : StatoRichiesta default 'PENDING' @assert.range;
  noteManager       : String(500);
  manager           : Association to Dipendenti;
  dataDecisione     : DateTime;
  dataInvio         : DateTime;
  invii             : Integer default 0;
}

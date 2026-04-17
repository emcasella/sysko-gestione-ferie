using { sysko.ferie as db } from '../db/schema';

/**
 * Servizio per il manager.
 * Accesso completo a tutte le richieste e ai dipendenti del proprio team.
 */
@path: '/manager'
service ManagerService @(requires: 'Manager') {

  // ── Richieste (tutte) ────────────────────────────────────

  entity RichiesteFerie as projection on db.RichiesteFerie {
    *,
    dipendente.nome     as dipendanteNome,
    dipendente.cognome  as dipendanteCognome,
    dipendente.email    as dipendanteEmail,
    dipendente.reparto.nome as repartoNome,
    tipoAssenza.name    as tipoAssenzaLabel,
    manager.nome        as managerNome,
    manager.cognome     as managerCognome
  }
  actions {
    /** Approva la richiesta */
    action approva(note: String) returns RichiesteFerie;
    /** Rifiuta la richiesta con commento */
    action rifiuta(note: String not null) returns RichiesteFerie;
  };

  // ── Dipendenti (read-only) ───────────────────────────────

  @readonly
  entity Dipendenti as projection on db.Dipendenti {
    ID, matricola, nome, cognome, email, ruolo, esterno, reparto
  };

  // ── Saldi (read-only) ────────────────────────────────────

  @readonly
  entity SaldoAnnuale as projection on db.SaldoAnnuale {
    *,
    dipendente.nome    as dipendanteNome,
    dipendente.cognome as dipendanteCognome
  };

  // ── Tipi assenza ─────────────────────────────────────────

  @readonly
  entity TipiAssenza as projection on db.TipiAssenza;

  // ── Funzione: overlap richieste ──────────────────────────

  /** Restituisce coppie di richieste sovrapposte nello stesso periodo */
  @readonly
  function richiesteOverlap(
    dataInizio : Date,
    dataFine   : Date
  ) returns array of RichiesteFerie;

  // ── Action: ricalcola saldi ───────────────────────────────

  /** Ricalcola i saldi di tutti i dipendenti per un anno dalla somma reale delle richieste approvate */
  action ricalcolaSaldi(anno: Integer not null) returns String;
}

// ──────────────────────────────────────────────────────────
// Annotazioni UI — Manager
// ──────────────────────────────────────────────────────────

annotate ManagerService.RichiesteFerie with @(
  UI.HeaderInfo: {
    TypeName      : 'Richiesta',
    TypeNamePlural: 'Tutte le Richieste',
    Title         : { Value: dipendanteCognome },
    Description   : { Value: tipoAssenzaLabel }
  },
  UI.SelectionFields: [
    stato, anno, dipendente_ID, tipoAssenza_code,
    dataInizio, dataFine, repartoNome
  ],
  UI.LineItem: [
    { Value: dipendanteCognome,   Label: 'Cognome'     },
    { Value: dipendanteNome,      Label: 'Nome'        },
    { Value: repartoNome,         Label: 'Reparto'     },
    { Value: tipoAssenzaLabel,    Label: 'Tipo'        },
    { Value: dataInizio,          Label: 'Dal'         },
    { Value: dataFine,            Label: 'Al'          },
    { Value: giorniRichiesti,     Label: 'Giorni'      },
    { Value: stato,               Label: 'Stato',
      Criticality: ![ stato ]
    },
    { Value: invii,               Label: 'Invii'       }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Dettaglio Richiesta', Target: '@UI.FieldGroup#Dettaglio'   },
    { $Type: 'UI.ReferenceFacet', Label: 'Decisione Manager',   Target: '@UI.FieldGroup#Decisione'   },
    { $Type: 'UI.ReferenceFacet', Label: 'Dipendente',          Target: '@UI.FieldGroup#Dipendente'  }
  ],
  UI.FieldGroup#Dettaglio: { Data: [
    { Value: tipoAssenza_code  },
    { Value: dataInizio        },
    { Value: dataFine          },
    { Value: giorniRichiesti   },
    { Value: anno              },
    { Value: note              },
    { Value: dataInvio         },
    { Value: invii             }
  ]},
  UI.FieldGroup#Decisione: { Data: [
    { Value: stato             },
    { Value: noteManager       },
    { Value: managerCognome,   Label: 'Gestita da (Cognome)' },
    { Value: managerNome,      Label: 'Gestita da (Nome)'    },
    { Value: dataDecisione     }
  ]},
  UI.FieldGroup#Dipendente: { Data: [
    { Value: dipendante_ID     },
    { Value: dipendanteCognome },
    { Value: dipendanteNome    },
    { Value: dipendanteEmail   },
    { Value: repartoNome       }
  ]}
);

annotate ManagerService.SaldoAnnuale with @(
  UI.LineItem: [
    { Value: dipendanteCognome,    Label: 'Cognome'          },
    { Value: dipendanteNome,       Label: 'Nome'             },
    { Value: anno,                 Label: 'Anno'             },
    { Value: giorniTotali,         Label: 'Totale'           },
    { Value: giorniUsati,          Label: 'Usati'            },
    { Value: giorniResidui,        Label: 'Residui'          },
    { Value: giorniPermesso,       Label: 'Permessi'         },
    { Value: giorniPermessoUsati,  Label: 'Permessi Usati'   }
  ]
);

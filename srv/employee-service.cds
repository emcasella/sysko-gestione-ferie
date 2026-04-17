using { sysko.ferie as db } from '../db/schema';

/**
 * Servizio per il dipendente.
 * Ogni utente vede SOLO i propri dati (filtro @restrict).
 */
@path: '/employee'
service EmployeeService @(requires: 'Employee') {

  // ── Profilo del dipendente loggato ──────────────────────

  @readonly
  entity MioProfilo as projection on db.Dipendenti
    excluding { manager, richieste, saldi };

  // ── Saldo ferie (tutti gli anni) ─────────────────────────

  @readonly
  entity MioSaldo as projection on db.SaldoAnnuale {
    *,
    dipendente.nome    as nomeDipendente,
    dipendente.cognome as cognomeDipendente
  }
  where dipendente.email = $user.id;   // filtro per utente loggato

  // ── Richieste ferie ──────────────────────────────────────

  entity MieRichieste as projection on db.RichiesteFerie {
    *,
    tipoAssenza.name   as tipoAssenzaLabel,
    manager.cognome    as managerCognome,
    manager.nome       as managerNome
  }
  where dipendente.email = $user.id
  actions {
    /** Invia la richiesta (BOZZA → PENDING) */
    action invia() returns MieRichieste;

    /** Annulla (solo BOZZA o PENDING) */
    action annulla() returns MieRichieste;
  };

  // ── Tipi assenza (lookup) ────────────────────────────────

  @readonly
  entity TipiAssenza as projection on db.TipiAssenza;

  // ── Ferie colleghi (visibili a tutti i dipendenti) ──────
  @readonly
  entity FerieColleghi as projection on db.RichiesteFerie {
    ID,
    tipoAssenza.code   as tipoAssenza_code,
    dipendente.nome    as dipendanteNome,
    dipendente.cognome as dipendanteCognome,
    dataInizio,
    dataFine
  }
  where stato = 'APPROVED' and tipoAssenza.code != 'FERIE_FITTIZIE';
}

// ──────────────────────────────────────────────────────────
// Annotazioni UI — Employee
// ──────────────────────────────────────────────────────────

annotate EmployeeService.MieRichieste with @(
  UI.HeaderInfo: {
    TypeName      : 'Richiesta',
    TypeNamePlural: 'Le Mie Richieste',
    Title         : { Value: tipoAssenzaLabel },
    Description   : { Value: stato }
  },
  UI.SelectionFields: [ stato, anno, tipoAssenza_code ],
  UI.LineItem: [
    { Value: tipoAssenzaLabel,   Label: 'Tipo'       },
    { Value: dataInizio,         Label: 'Dal'        },
    { Value: dataFine,           Label: 'Al'         },
    { Value: giorniRichiesti,    Label: 'Giorni'     },
    { Value: stato,              Label: 'Stato',
      Criticality: ![ stato ] },
    { Value: noteManager,        Label: 'Note Manager' },
    { Value: anno,               Label: 'Anno'       }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Dettaglio',  Target: '@UI.FieldGroup#Dettaglio'  },
    { $Type: 'UI.ReferenceFacet', Label: 'Risposta',   Target: '@UI.FieldGroup#Risposta'   }
  ],
  UI.FieldGroup#Dettaglio: { Data: [
    { Value: tipoAssenza_code },
    { Value: dataInizio       },
    { Value: dataFine         },
    { Value: giorniRichiesti  },
    { Value: note             },
    { Value: anno             },
    { Value: invii,  Label: 'Invii'  }
  ]},
  UI.FieldGroup#Risposta: { Data: [
    { Value: stato            },
    { Value: noteManager      },
    { Value: managerCognome   },
    { Value: dataDecisione    }
  ]}
);

annotate EmployeeService.MioSaldo with @(
  UI.HeaderInfo: {
    TypeName      : 'Saldo',
    TypeNamePlural: 'Saldo Ferie'
  },
  UI.LineItem: [
    { Value: anno,                  Label: 'Anno'            },
    { Value: giorniTotali,          Label: 'Totale (gg)'     },
    { Value: giorniUsati,           Label: 'Usati (gg)'      },
    { Value: giorniResidui,         Label: 'Residui (gg)'    },
    { Value: giorniPermesso,        Label: 'Permessi (gg)'   },
    { Value: giorniPermessoUsati,   Label: 'Permessi Usati'  }
  ]
);

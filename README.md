# SYSKO - Gestione Ferie e Permessi

Applicazione Enterprise Cloud-Native basata su **SAP Cloud Application Programming Model (CAP)**.

Digitalizza e automatizza il flusso delle richieste di assenza (Ferie, Permessi, ROL, Malattia, Lutto, Matrimonio), calcola i giorni lavorativi escludendo sabato, domenica e i **festivi italiani**, e gestisce l'intero ciclo approvativo tramite notifiche email automatiche.

---

## Struttura del progetto

```
sysko-gestione-ferie/
├── app/
│   ├── employee/webapp/        # App SAPUI5 per il dipendente
│   │   ├── view/               #   Viste XML (App, Main, Detail, Calendario)
│   │   ├── controller/         #   Controller JS
│   │   └── fragment/           #   Dialoghi (NuovaRichiesta, Modifica)
│   └── manager/webapp/         # App SAPUI5 per il manager
│       ├── view/               #   Viste XML (App, Dashboard, Detail, Matrice, Sovrapposizioni, Calendario)
│       ├── controller/         #   Controller JS
│       └── fragment/           #   Dialogo (Rifiuta)
├── db/
│   ├── schema.cds              # Modello dati (entità, tipi, enum)
│   └── data/                   # Dati iniziali CSV (seed automatico)
├── srv/
│   ├── employee-service.cds    # Definizione OData EmployeeService (/employee)
│   ├── employee-service.js     # Logica business Employee
│   ├── manager-service.cds     # Definizione OData ManagerService (/manager)
│   ├── manager-service.js      # Logica business Manager
│   ├── server.js               # Bootstrap server XSUAA / JWT (produzione)
│   └── lib/
│       ├── email.js            # Notifiche email (mock in dev, BTP Destination in prod)
│       └── utils.js            # Calcolo giorni lavorativi + festivi italiani
├── mta.yaml                    # Build MTA e configurazione servizi BTP
├── .cdsrc.json                 # Config build CAP
└── package.json                # Dipendenze + configurazione CDS (auth, db, odata)
```

---

## Sviluppo in locale

L'ambiente locale simula l'ambiente Cloud con **SQLite in-memory** e mock automatici per autenticazione ed email.

### Pre-requisiti

| Tool | Versione minima | Verifica |
|---|---|---|
| Node.js | 20.x | `node -v` |
| npm | 9.x | `npm -v` |
| @sap/cds-dk | 7.x | `cds --version` |

### Avvio rapido

```bash
# 1. Installa le dipendenze
npm install

# 2. Avvia con hot-reload (crea il DB SQLite e fa il seed automatico dai CSV)
npm run dev
```

Il server risponde su **http://localhost:4004**.

| URL | Descrizione |
|---|---|
| http://localhost:4004 | Index con tutti i servizi esposti |
| http://localhost:4004/employee | EmployeeService (OData v4) |
| http://localhost:4004/manager | ManagerService (OData v4) |
| http://localhost:4004/employee/webapp/ | App dipendente (SAPUI5) |
| http://localhost:4004/manager/webapp/ | App manager (SAPUI5) |

### Utenti demo

La configurazione Basic Auth per lo sviluppo locale è definita in `package.json` (`cds.requires.auth`).

| Email | Password | Ruolo | Note |
|---|---|---|---|
| mario.rossi@sysko.it | demo | Employee | Dipendente interno |
| giulia.bianchi@sysko.it | demo | Employee | Risorsa esterna |
| sara.neri@sysko.it | demo | Employee | Risorsa esterna |
| luca.verdi@sysko.it | demo | Manager | Manager reparto R1 |
| paolo.ferrari@sysko.it | demo | Manager | Manager reparto R3 |

### Email in locale

In modalità sviluppo (`NODE_ENV != production`) nessun SMTP è necessario: il contenuto delle email viene stampato su `stdout` dal mock in `srv/lib/email.js`.

---

## Deployment in produzione (SAP BTP)

L'intera orchestrazione è definita in `mta.yaml`. Il deploy crea automaticamente tutti i servizi BTP necessari.

### Servizi BTP creati da mta.yaml

| Servizio | Tipo | Scopo |
|---|---|---|
| sysko-gestione-ferie-uaa | XSUAA (application) | Autenticazione JWT e Role Collections |
| sysko-gestione-ferie-hdi-container | HDI Container | Database SAP HANA Cloud |
| sysko-gestione-ferie-destination | Destination (lite) | Servizio email via MailService_Sysko |
| sysko-gestione-ferie-logs | Application Logs (lite) | Centralizzazione log applicativi |
| sysko-gestione-ferie-autoscaler | Autoscaler (standard) | Scaling automatico (CPU >60%, memoria >70%) |
| sysko-gestione-ferie-jobscheduler | Job Scheduler (standard) | Ricalcoli schedulati (es. saldi di fine anno) |

### Build e deploy

```bash
# Prerequisiti: CF CLI 8.x e MBT installati
# npm install -g mbt

# Build pacchetto MTA
mbt build

# Deploy su Cloud Foundry
cf deploy mta_archives/sysko-gestione-ferie_1.0.0.mtar
```

### Configurazione post-deploy (BTP Cockpit)

Dopo il primo deploy completare la seguente checklist nel BTP Cockpit:

#### 1. Destination Service — Email

Nella sezione **Connectivity > Destinations** creare una nuova destinazione con i parametri seguenti:

| Campo | Valore |
|---|---|
| Name | `MailService_Sysko` (obbligatorio — corrisponde alla proprietà in mta.yaml) |
| Type | `MAIL` |
| ProxyType | `Internet` |
| Proprietà aggiuntive | Host SMTP, porta, credenziali e tlsType forniti dall'amministratore di sistema |

#### 2. Ruoli e accessi (XSUAA)

In **Security > Users** assegnare agli utenti reali una delle Role Collections generate dal deploy:

| Role Collection | Accesso |
|---|---|
| `Ferie_Employee` | App dipendente — visualizza e inserisce richieste |
| `Ferie_Manager` | App manager — dashboard, approvazioni, calendario team (include scope Employee) |

#### 3. Autoscaler

L'applicazione scala automaticamente fino a **5 istanze** al superamento delle soglie configurate in `mta.yaml` (CPU >60% o memoria >70% per 60 secondi). Accedere al pannello Autoscaler nel BTP Cockpit per aggiustare le soglie in prossimità di picchi prevedibili (ponti, fine anno).

#### 4. Job Scheduler

L'infrastruttura per i job schedulati è pronta. Abilitare e configurare i trigger temporali nel pannello **Job Scheduler** per attivare ricalcoli massivi dei saldi (es. `ricalcolaSaldi` a fine anno o primo gennaio).

---

## Architettura di riferimento

```
Utente
  └── Browser (SAPUI5 / Fiori)
        └──[OData v4 / HTTPS]──► CAP Application (Node.js)
                                    ├── EmployeeService  (/employee)
                                    ├── ManagerService   (/manager)
                                    └── server.js        (JWT bootstrap)
                                          ├──► XSUAA Service      (autenticazione)
                                          ├──► SAP HANA Cloud     (HDI Container)
                                          └──► Destination Service (MailService_Sysko)
                                                    └──► SMTP Server (esterno)

  Locale (dev):  SQLite in-memory · Basic Auth · Console mock (email)
```

Per il diagramma completo vedere `docs/ARCHITETTURA-STYLED-v2.docx`.

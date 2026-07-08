# Lotteria Privata — Backend con PayPal reale + email di conferma

Backend Node.js/Express che gestisce davvero i pagamenti (PayPal, verificati lato server)
e invia email di conferma automatiche (Gmail) quando un biglietto viene pagato.

## Come funziona il pagamento (in breve)

1. L'utente sceglie il pacchetto e i numeri → il server li "congela" per 10 minuti (`/api/reservations`).
2. Il pulsante PayPal crea un vero ordine tramite il server (`/api/orders/create`).
3. Dopo l'approvazione dell'utente, il server **cattura davvero il pagamento** tramite le API di PayPal
   e controlla che l'importo sia corretto (`/api/orders/capture`), **prima** di confermare il biglietto.
4. Solo a pagamento verificato: il biglietto risulta venduto e parte l'email di conferma.

Questo evita il problema del prototipo precedente ("clicco conferma senza pagare davvero").

## 1. Crea le credenziali PayPal

1. Vai su [developer.paypal.com/dashboard/applications](https://developer.paypal.com/dashboard/applications)
2. Crea una **App** (di tipo REST)
3. Copia **Client ID** e **Secret**
4. Per testare senza soldi veri, usa le credenziali dell'ambiente **Sandbox** (di default). Per l'evento reale, passa a **Live**.

## 2. Crea la password per le app Gmail

1. Attiva la verifica in due passaggi sul tuo account Google (se non già attiva)
2. Vai su [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Genera una password per l'app "Mail" — è una stringa di 16 caratteri, **non** la tua password normale

## 3. Configura le variabili d'ambiente

Copia `.env.example` in `.env` e compila tutti i valori:

```bash
cp .env.example .env
```

| Variabile | Cosa mettere |
|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | dalla dashboard PayPal |
| `PAYPAL_MODE` | `sandbox` per i test, `live` per l'evento reale |
| `GMAIL_USER` | il tuo indirizzo Gmail |
| `GMAIL_APP_PASSWORD` | la password per le app generata sopra |
| `ADMIN_SECRET` | una password lunga a tua scelta, serve per estrarre il vincitore |
| `EVENT_NAME`, `TOTAL_TICKETS`, `PRICE_SINGLE`, `PRICE_TRIPLE` | personalizza a piacere |

## 4. Prova in locale (facoltativo ma consigliato)

```bash
npm install
npm start
```

Apri `http://localhost:3000`. Con `PAYPAL_MODE=sandbox` puoi pagare con un account PayPal
di test (li trovi in developer.paypal.com → Sandbox → Accounts) senza spendere soldi veri.

## 5. Pubblica online: Render (consigliata)

Render è la scelta più semplice per questo progetto: piano gratuito disponibile,
supporto nativo per Node.js, nessuna configurazione server da gestire.

1. Carica questa cartella in una repository su GitHub (anche privata)
2. Vai su [render.com](https://render.com) → **New** → **Web Service**
3. Collega la repository
4. Imposta:
   - **Build command**: `npm install`
   - **Start command**: `npm start`
5. In **Environment**, aggiungi tutte le variabili di `.env` (Render non legge il file `.env`,
   vanno inserite manualmente nel pannello)
6. Deploy. Render ti darà un URL pubblico tipo `https://tuolotteria.onrender.com`

**Nota importante sui dati**: questo progetto salva i biglietti in un file `data.json` sul disco
del server. Il piano gratuito di Render **non garantisce che il disco sia permanente**: se il
servizio viene riavviato (es. dopo inattività prolungata), il file potrebbe azzerarsi. Per un
evento breve (qualche giorno) va bene, ma se ti preoccupa:
- attiva un **Persistent Disk** su Render (piano a pagamento, pochi euro/mese), oppure
- fammi sapere e ti preparo una versione che usa un vero database (es. Postgres, gratuito anche su Render).

## 6. Passa da test a evento reale

Quando sei pronto per i soldi veri:
1. Cambia `PAYPAL_MODE=sandbox` → `PAYPAL_MODE=live`
2. Sostituisci Client ID/Secret sandbox con quelli dell'app PayPal in modalità Live
3. Fai un acquisto di prova con un importo piccolo per verificare che tutto funzioni

## Sicurezza

- `ADMIN_SECRET` protegge solo l'estrazione e il reset dei dati: non condividerlo.
- Il `PAYPAL_CLIENT_SECRET` e le credenziali Gmail **non vanno mai** inseriti nel frontend
  (file in `public/`) — restano solo nelle variabili d'ambiente del server, che è come è
  strutturato questo progetto.

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { withDb, readDb } from './db.js';
import { createOrder, captureOrder } from './paypal.js';
import { sendConfirmationEmail } from './mailer.js';
import { packInfo, computeSold, computePending, expireStale } from './tickets.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const TOTAL_TICKETS = Number(process.env.TOTAL_TICKETS || 500);
const EVENT_NAME = process.env.EVENT_NAME || 'Lotteria Privata';

function requireAdmin(req, res, next) {
  const secret = req.header('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Codice organizzatore non valido.' });
  }
  next();
}

// Configurazione pubblica per il frontend (client id PayPal è pubblico, non il secret)
app.get('/api/config', (req, res) => {
  if (!process.env.PAYPAL_CLIENT_ID) {
    return res.status(500).json({ error: 'PAYPAL_CLIENT_ID non configurato sul server.' });
  }
  res.json({
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    eventName: EVENT_NAME,
    totalTickets: TOTAL_TICKETS,
    prices: { single: packInfo('single').price, triple: packInfo('triple').price }
  });
});

// Stato pubblico: biglietti venduti, incasso, eventuale vincitore
app.get('/api/state', async (req, res) => {
  try {
    const result = await withDb(async (data) => {
      expireStale(data);
      const sold = [...computeSold(data)];
      const revenue = Object.values(data.reservations)
        .filter((r) => r.status === 'paid')
        .reduce((sum, r) => sum + r.amount, 0);
      return { soldNumbers: sold, revenue, winner: data.winner };
    });
    res.json({ ...result, totalTickets: TOTAL_TICKETS });
  } catch (err) {
    res.status(500).json({ error: 'Errore nel recupero dello stato.' });
  }
});

// Passo 1: prenota temporaneamente i numeri scelti (10 minuti) prima del pagamento
app.post('/api/reservations', async (req, res) => {
  const { packType, mode, numbers, buyerName, buyerContact } = req.body || {};

  if (!buyerName || !buyerContact) {
    return res.status(400).json({ error: 'Nome e contatto sono obbligatori.' });
  }

  const pack = packInfo(packType);

  try {
    const reservation = await withDb(async (data) => {
      expireStale(data);
      const sold = computeSold(data);
      const pending = computePending(data);
      const taken = new Set([...sold, ...pending]);

      let chosen;
      if (mode === 'manual') {
        if (!Array.isArray(numbers) || numbers.length !== pack.count) {
          throw new HttpError(400, `Seleziona esattamente ${pack.count} numero${pack.count > 1 ? 'i' : ''}.`);
        }
        if (numbers.some((n) => taken.has(n) || n < 1 || n > TOTAL_TICKETS)) {
          throw new HttpError(409, 'Uno dei numeri scelti non è più disponibile.');
        }
        chosen = numbers;
      } else {
        chosen = [];
        for (let i = 1; i <= TOTAL_TICKETS && chosen.length < pack.count; i += 1) {
          if (!taken.has(i)) chosen.push(i);
        }
        if (chosen.length < pack.count) {
          throw new HttpError(409, 'Biglietti esauriti.');
        }
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const reservation = {
        id,
        numbers: chosen,
        packType: pack.key,
        buyerName,
        buyerContact,
        amount: pack.price,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
      data.reservations[id] = reservation;
      return reservation;
    });

    res.json(reservation);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Errore interno.' });
  }
});

// Passo 2: crea un vero ordine PayPal per l'importo della prenotazione
app.post('/api/orders/create', async (req, res) => {
  const { reservationId } = req.body || {};

  try {
    const reservation = await withDb(async (data) => {
      expireStale(data);
      const r = data.reservations[reservationId];
      if (!r) throw new HttpError(404, 'Prenotazione non trovata.');
      if (r.status !== 'pending') throw new HttpError(409, 'Prenotazione scaduta, ricomincia la selezione.');
      return r;
    });

    const order = await createOrder({ amount: reservation.amount, referenceId: reservationId });

    await withDb(async (data) => {
      if (data.reservations[reservationId]) {
        data.reservations[reservationId].paypalOrderId = order.id;
      }
    });

    res.json({ orderID: order.id });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Errore nella creazione ordine PayPal.' });
  }
});

// Passo 3: dopo l'approvazione dell'utente, cattura DAVVERO il pagamento e verifica l'esito
app.post('/api/orders/capture', async (req, res) => {
  const { reservationId, orderID } = req.body || {};

  try {
    const reservation = await withDb(async (data) => {
      const r = data.reservations[reservationId];
      if (!r) throw new HttpError(404, 'Prenotazione non trovata.');
      if (r.paypalOrderId !== orderID) throw new HttpError(400, 'Ordine non corrispondente alla prenotazione.');
      return { ...r };
    });

    const capture = await captureOrder(orderID);
    const captureStatus = capture.status;
    const paidAmount = Number(
      capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0
    );

    if (captureStatus !== 'COMPLETED' || Math.abs(paidAmount - reservation.amount) > 0.01) {
      throw new HttpError(402, 'Il pagamento non risulta completato correttamente.');
    }

    await withDb(async (data) => {
      const r = data.reservations[reservationId];
      if (r) {
        r.status = 'paid';
        r.paidAt = new Date().toISOString();
      }
    });

    // L'email è un "best effort": se fallisse, l'acquisto resta comunque valido.
    sendConfirmationEmail({
      to: reservation.buyerContact,
      buyerName: reservation.buyerName,
      numbers: reservation.numbers,
      eventName: EVENT_NAME
    }).catch((err) => console.error('Invio email fallito:', err.message));

    res.json({ success: true, numbers: reservation.numbers, buyerName: reservation.buyerName });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Errore nella verifica del pagamento.' });
  }
});

// L'utente ha annullato o l'ordine è fallito: libera subito il numero invece di aspettare i 10 minuti
app.post('/api/reservations/:id/cancel', async (req, res) => {
  await withDb(async (data) => {
    const r = data.reservations[req.params.id];
    if (r && r.status === 'pending') r.status = 'expired';
  });
  res.json({ ok: true });
});

// --- Area organizzatore ---

app.get('/api/admin/purchases', requireAdmin, async (req, res) => {
  const data = await readDb();
  const purchases = Object.values(data.reservations).filter((r) => r.status === 'paid');
  res.json({ purchases });
});

app.post('/api/admin/draw', requireAdmin, async (req, res) => {
  try {
    const winner = await withDb(async (data) => {
      const sold = [...computeSold(data)];
      if (sold.length === 0) throw new HttpError(400, 'Nessun biglietto venduto ancora.');
      const number = sold[Math.floor(Math.random() * sold.length)];
      const purchase = Object.values(data.reservations)
        .find((r) => r.status === 'paid' && r.numbers.includes(number));
      const winner = {
        number,
        buyerName: purchase?.buyerName || null,
        contact: purchase?.buyerContact || null,
        drawnAt: new Date().toISOString()
      };
      data.winner = winner;
      return winner;
    });
    res.json({ winner });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Errore durante l\'estrazione.' });
  }
});

app.post('/api/admin/reset', requireAdmin, async (req, res) => {
  await withDb(async (data) => {
    data.reservations = {};
    data.winner = null;
  });
  res.json({ ok: true });
});

// Pulizia periodica delle prenotazioni scadute e non pagate
setInterval(() => {
  withDb(async (data) => { expireStale(data); }).catch(() => {});
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server avviato sulla porta ${PORT}`));

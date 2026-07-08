export function packInfo(packType) {
  const single = { key: 'single', count: 1, price: Number(process.env.PRICE_SINGLE || 15) };
  const double = { key: 'double', count: 2, price: Number(process.env.PRICE_DOUBLE || 25) };
  return packType === 'double' ? double : single;
}

export function computeSold(data) {
  const sold = new Set();
  for (const r of Object.values(data.reservations)) {
    if (r.status === 'paid') r.numbers.forEach((n) => sold.add(n));
  }
  return sold;
}

// Numeri "congelati" da prenotazioni in corso di pagamento, non ancora confermate.
export function computePending(data) {
  const now = Date.now();
  const pending = new Set();
  for (const r of Object.values(data.reservations)) {
    if (r.status === 'pending' && new Date(r.expiresAt).getTime() > now) {
      r.numbers.forEach((n) => pending.add(n));
    }
  }
  return pending;
}

// Le prenotazioni non pagate entro il termine liberano il numero per altri acquirenti.
export function expireStale(data) {
  const now = Date.now();
  for (const r of Object.values(data.reservations)) {
    if (r.status === 'pending' && new Date(r.expiresAt).getTime() <= now) {
      r.status = 'expired';
    }
  }
}

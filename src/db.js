import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.json');

// Le richieste concorrenti passano tutte da questa coda: si eseguono in sequenza,
// così due acquisti nello stesso istante non si sovrascrivono a vicenda.
let writeQueue = Promise.resolve();

async function readRaw() {
  try {
    const text = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initial = { reservations: {}, winner: null };
      await fs.writeFile(DB_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    throw err;
  }
}

async function writeRaw(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Esegue una lettura-modifica-scrittura atomica (rispetto alle altre chiamate a withDb).
 * Se `mutator` lancia un errore, i dati non vengono salvati.
 */
export function withDb(mutator) {
  const task = writeQueue.then(async () => {
    const data = await readRaw();
    const result = await mutator(data);
    await writeRaw(data);
    return result;
  });
  // La coda prosegue anche se questo task fallisce, altrimenti tutte le richieste successive si bloccherebbero.
  writeQueue = task.catch(() => {});
  return task;
}

export async function readDb() {
  return readRaw();
}

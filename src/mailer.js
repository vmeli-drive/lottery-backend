import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      },
      connectionTimeout: 15000
    });
  }
  return transporter;
}

export async function sendConfirmationEmail({ to, buyerName, numbers, eventName }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('Email non inviata: GMAIL_USER o GMAIL_APP_PASSWORD mancanti nelle variabili d\'ambiente.');
    return;
  }

  const numbersText = numbers.map((n) => String(n).padStart(4, '0')).join(', ');

  await getTransporter().sendMail({
    from: `"${eventName}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Conferma biglietto - ${eventName}`,
    text: `Ciao ${buyerName},\n\nIl tuo pagamento è confermato. Il tuo numero di biglietto è: ${numbersText}.\n\nConservalo: ti servirà per ritirare il premio in caso di vincita.\n\nBuona fortuna!`,
    html: `
      <p>Ciao ${buyerName},</p>
      <p>Il tuo pagamento è confermato. Il tuo numero di biglietto è: <b>${numbersText}</b>.</p>
      <p>Conservalo: ti servirà per ritirare il premio in caso di vincita.</p>
      <p>Buona fortuna!</p>
    `
  });
}

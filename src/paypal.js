const BASE_URL = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  const auth = Buffer
    .from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`)
    .toString('base64');

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) throw new Error('Autenticazione con PayPal fallita: controlla client id/secret.');
  const data = await res.json();
  return data.access_token;
}

export async function createOrder({ amount, currency = 'EUR', referenceId }) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: referenceId,
        amount: { currency_code: currency, value: amount.toFixed(2) }
      }]
    })
  });

  if (!res.ok) throw new Error('Creazione ordine PayPal fallita.');
  return res.json();
}

export async function captureOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error('Cattura del pagamento PayPal fallita.');
    err.details = data;
    throw err;
  }
  return data;
}

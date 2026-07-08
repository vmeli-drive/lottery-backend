#!/bin/bash
cd "$(dirname "$0")"
echo "Incolla il PAYPAL_CLIENT_ID e premi Invio:"
read -r CLIENT_ID
echo "Incolla il PAYPAL_CLIENT_SECRET e premi Invio:"
read -r CLIENT_SECRET
echo "Scrivi il tuo indirizzo Gmail e premi Invio:"
read -r GMAIL
echo "Incolla la App Password Gmail, senza spazi, e premi Invio:"
read -r APPPASS
cat > .env << ENVEOF
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=$CLIENT_ID
PAYPAL_CLIENT_SECRET=$CLIENT_SECRET
GMAIL_USER=$GMAIL
GMAIL_APP_PASSWORD=$APPPASS
ADMIN_SECRET=dev-admin-local-2026
EVENT_NAME="Lotteria Evento Privato - iPhone"
TOTAL_TICKETS=1000
PRICE_SINGLE=5
PRICE_TRIPLE=12
PORT=3000
ENVEOF
echo "Fatto! Ecco il file .env aggiornato:"
cat .env

#!/bin/bash
cd "$(dirname "$0")"
echo "Scrivi il tuo indirizzo Gmail e premi Invio:"
read -r GMAIL
echo "Incolla la App Password Gmail e premi Invio (va bene anche con gli spazi, li tolgo io):"
read -r APPPASS
APPPASS=$(echo "$APPPASS" | tr -cd 'a-zA-Z0-9')
sed -i '' "s#^GMAIL_USER=.*#GMAIL_USER=$GMAIL#" .env
sed -i '' "s#^GMAIL_APP_PASSWORD=.*#GMAIL_APP_PASSWORD=$APPPASS#" .env
echo "Fatto! Ecco il file .env aggiornato:"
cat .env

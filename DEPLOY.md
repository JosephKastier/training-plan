# Deployment-Anleitung: Hetzner VPS + Ionos Domain

## 1. Hetzner VPS bestellen

1. Gehe zu [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Erstelle ein Projekt, dann einen Server:
   - **Standort:** Falkenstein oder Nürnberg
   - **Image:** Ubuntu 24.04
   - **Typ:** CX22 (2 vCPU, 4GB RAM) – 4,51€/Monat
   - **SSH Key:** Füge deinen Public Key hinzu (`cat ~/.ssh/id_rsa.pub`)
3. Server erstellen → notiere die **IP-Adresse**

## 2. Domain bei Ionos konfigurieren

1. Logge dich bei Ionos ein → **Domains & SSL**
2. Wähle deine Domain → **DNS**
3. Erstelle einen neuen **A-Record**:
   - **Hostname:** `training` (für `training.deine-domain.de`)
   - **Zeigt auf:** Die IP deines Hetzner Servers
   - **TTL:** 3600
4. Warte 5–10 Minuten bis der DNS propagiert ist

## 3. Server einrichten

SSH auf den Server:

```bash
ssh root@DEINE-SERVER-IP
```

Docker installieren:

```bash
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
```

Projekt klonen (oder per scp hochladen):

```bash
cd /opt
git clone https://github.com/DEIN-USER/training-plan.git
cd training-plan
```

Oder per scp:

```bash
# Von deinem Mac:
scp -r /Users/josephkastier/Development/training-plan root@DEINE-SERVER-IP:/opt/training-plan
```

## 4. Konfiguration

```bash
cd /opt/training-plan
cp .env.example .env
nano .env
```

Setze deine Werte:
- `AUTH_PASSWORD` – Dein Passwort für die Web-App
- `TELEGRAM_BOT_TOKEN` – Von @BotFather
- `GROQ_API_KEY` – Von console.groq.com
- `DOMAIN` – z.B. `training.deine-domain.de`
- `TELEGRAM_CHAT_ID` – Optional, deine Chat-ID (bekommst du via @userinfobot auf Telegram)

Passe die `nginx.conf` an (ersetze `${DOMAIN}` mit deiner echten Domain):

```bash
sed -i 's/${DOMAIN}/training.deine-domain.de/g' nginx.conf
```

## 5. SSL-Zertifikat holen

Beim ersten Start brauchen wir erst ein Zertifikat. Temporär ohne SSL starten:

```bash
# Temporäre nginx config für certbot
cat > nginx-temp.conf << 'EOF'
server {
    listen 80;
    server_name training.deine-domain.de;
    
    location /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
    }
    
    location / {
        proxy_pass http://app:3000;
    }
}
EOF

# Starte nur app + nginx mit temp config
docker compose up -d app
docker compose run --rm nginx sh -c "cp /etc/nginx/conf.d/default.conf /tmp/bak && cat /dev/stdin > /etc/nginx/conf.d/default.conf" < nginx-temp.conf

# Zertifikat holen
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/lib/letsencrypt \
  -d training.deine-domain.de \
  --email deine@email.de \
  --agree-tos --no-eff-email

# Jetzt mit vollem Setup starten
docker compose down
rm nginx-temp.conf
```

## 6. Starten

```bash
docker compose up -d
```

Datenbank seeden (einmalig):

```bash
docker compose exec app node seed.js
```

## 7. Prüfen

- Öffne `https://training.deine-domain.de` im Browser
- Telegram: Schreibe deinem Bot `/start`

## 8. Updates deployen

```bash
cd /opt/training-plan
git pull  # oder scp
docker compose build
docker compose up -d
```

## 9. iOS Homescreen

1. Öffne `https://training.deine-domain.de` in Safari auf dem iPhone
2. Tippe auf das Teilen-Symbol (Quadrat mit Pfeil nach oben)
3. Wähle "Zum Home-Bildschirm"
4. Fertig – die App öffnet sich ohne Browser-UI

## Telegram Bot einrichten

1. Öffne Telegram, suche @BotFather
2. Schicke `/newbot`
3. Gib einen Namen und Username ein
4. Kopiere den Token in deine `.env`
5. Optional: Schicke @userinfobot eine Nachricht um deine Chat-ID zu bekommen

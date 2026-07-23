# Houvast Maaltijden

Een simpele maaltijd-randomizer voor contact binnen de kerkgemeenschap.

## Wat zit erin

- Intakeformulier zonder account
- Persoonlijke link om voorkeuren te wijzigen of te pauzeren
- Maandelijkse matchrondes
- Random matching met capaciteit, frequentie en eerdere koppelingen
- Host kiest mogelijke dagen
- Eter kiest daarna de definitieve dag
- Fallback-mail na 3 dagen stilte
- Adminscherm voor rondes, matches en mailstatus

## Simpele flow

1. Deelnemer vult het formulier op `/aanmelden` in.
2. Admin of automatische job maakt een maandronde.
3. Host krijgt een mail met een unieke link.
4. Host kiest mogelijke dagen en kan invullen wat hij ongeveer kookt.
5. Eter krijgt een mail met adres, mogelijke dagen en contactgegevens.
6. Eter kiest een definitieve dag.
7. Beide personen krijgen een bevestigingsmail.
8. Als iemand 3 dagen niet reageert, krijgen beiden een fallback-mail.

## Lokaal draaien

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

Voor lokaal testen heb je een PostgreSQL database nodig in `DATABASE_URL`.

Met Docker kun je lokaal snel een demo-database starten:

```bash
docker compose up -d
npm run db:push
npm run seed:demo
npm run dev
```

Gebruik dan:

```text
DATABASE_URL="postgresql://houvast:houvast@localhost:5437/houvast?schema=public"
ADMIN_TOKEN="dev-admin"
CRON_SECRET="dev-cron"
APP_URL="http://127.0.0.1:3000"
```

## Railway

Koppel de GitHub-repo aan Railway en voeg een PostgreSQL database toe. Deze repo bevat `railway.json`, dus Railway krijgt automatisch:

- build command: `npm ci && npm run build`
- pre-deploy command: `node scripts/migrate-deploy-optional.mjs`
- start command: `node scripts/start.mjs`
- healthcheck: `/api/health`

Zet daarna deze variabelen op de app-service:

- `DATABASE_URL`
- `APP_URL`
- `ADMIN_TOKEN`
- `ADMIN_EMAIL`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `AUTO_GENERATE_ROUNDS`
- `AUTO_SEND_ROUNDS`
- optioneel: `FAIL_DEPLOY_ON_MIGRATION_ERROR`

Gebruik de `DATABASE_URL` van Railway PostgreSQL. `APP_URL` moet de publieke Railway URL van de app zijn, bijvoorbeeld `https://kokers-eters-production.up.railway.app`. Als je per ongeluk alleen `kokers-eters-production.up.railway.app` invult, zet de app er zelf `https://` voor.
`ADMIN_EMAIL` krijgt meldingen over nieuwe of gewijzigde aanmeldingen en reminders om nieuwe rondes klaar te zetten.

### Poort (belangrijk, dit veroorzaakt 502)

Railway injecteert zelf een `PORT` in de container (standaard `8080`). Het startscript luistert op `0.0.0.0:$PORT`, dus de app volgt automatisch de door Railway gegeven poort. **Zet `PORT` daarom niet handmatig**, tenzij je precies weet wat je doet.

De publieke domain in Railway heeft een apart **"target port"** veld (Settings → Networking → Public Networking). Dit veld moet gelijk zijn aan de poort waarop de app luistert. De regel is simpel:

> De target port van de domain === de poort in de deploy-log `"[start] Starting Next.js on 0.0.0.0:<poort>"`.

Twee geldige configuraties:

1. **Aanbevolen:** zet géén `PORT` variable, laat Railway `8080` injecteren, en zet de domain target port op `8080`.
2. Of zet service variable `PORT=8081` én de domain target port op `8081`.

Als deze twee getallen niet gelijk zijn, geeft de publieke URL `502` terwijl de deploy en healthcheck groen zijn (de healthcheck test op de door Railway geïnjecteerde poort, de publieke URL op de domain target port).

De database-migraties draaien in Railway via de pre-deploy stap als `DATABASE_URL` goed staat. Als de database nog niet bereikbaar is, blokkeert dat normaal niet de deployment. Zet alleen `FAIL_DEPLOY_ON_MIGRATION_ERROR=true` als een deploy juist moet falen wanneer migraties niet lukken.

### 502 op de publieke URL oplossen

1. Open de deploy-logs en zoek de regel `"[start] Starting Next.js on 0.0.0.0:<poort>"`.
2. Open Settings → Networking → Public Networking en kijk naar de target port achter de domain (het `→ Port ...` label).
3. Zorg dat beide getallen gelijk zijn. Pas het target-port veld aan (direct effect, geen redeploy nodig) óf zet de `PORT` variable gelijk aan de target port (redeploy nodig).

## Testdata seeden (20 deelnemers)

Er zitten 20 test-deelnemers in `lib/seed.ts` (mix van hosts, eters en allebei). De seed maakt ook een concept-ronde voor volgende maand aan met matches in verschillende statussen, zodat je de hele flow kunt testen. Alle test-accounts gebruiken een `@houvast.local` e-mailadres; de seed verwijdert alleen die accounts opnieuw, plus bestaande rondes/matches/mails.

### Op Railway (aanbevolen)

De Railway-database (`postgres.railway.internal`) is alleen binnen Railway bereikbaar, dus seed je via een endpoint die ín de container draait:

1. Zet op de app-service de variable `ALLOW_DEMO_SEED=true` (en zorg dat `CRON_SECRET` gezet is).
2. Open na de redeploy in de browser:

   ```text
   https://jouw-app/api/seed?secret=CRON_SECRET
   ```

   Vervang `CRON_SECRET` door de waarde van je `CRON_SECRET`. Je krijgt JSON terug met het aantal deelnemers en matches.
3. Zet daarna `ALLOW_DEMO_SEED=false` (of verwijder de variable) zodat de seed-endpoint weer uit staat.

De endpoint geeft `403` als `ALLOW_DEMO_SEED` niet op `true` staat en `401` bij een verkeerd secret.

### Lokaal

```bash
docker compose up -d
npm run db:push
npm run seed:demo
```

Of lokaal tegen de Railway-database: kopieer in Railway de **publieke** connectiestring van de Postgres-service (host `...proxy.rlwy.net`, niet `...railway.internal`), zet die als `DATABASE_URL` en draai `npm run seed:demo`.

## Automatische jobs

Laat Railway periodiek deze URL aanroepen:

```text
https://jouw-app/api/jobs/run?secret=CRON_SECRET
```

De job doet drie dingen:

- 3 dagen voor een nieuwe maand een voorkeurscheck sturen
- automatisch een maandronde genereren als `AUTO_GENERATE_ROUNDS=true`
- fallback-mails sturen als host of eter 3 dagen niet reageert

Als `AUTO_SEND_ROUNDS=true` verstuurt de job ook automatisch host-mails voor nieuwe conceptmatches. Zet dit op `false` als de admin eerst wil controleren.

## Admin

Open:

```text
/
```

Gebruik de waarde van `ADMIN_TOKEN`.

De publieke aanmeldpagina staat op:

```text
/aanmelden
```

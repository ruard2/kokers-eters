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

1. Deelnemer vult het formulier op `/` in.
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

Koppel de GitHub-repo aan Railway en voeg een PostgreSQL database toe. Zet daarna deze variabelen:

- `DATABASE_URL`
- `APP_URL`
- `ADMIN_TOKEN`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `AUTO_GENERATE_ROUNDS`
- `AUTO_SEND_ROUNDS`

Build command:

```bash
npm run build
```

Start command:

```bash
npm start
```

`npm start` draait eerst Prisma migrations en start daarna Next.js.

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
/admin
```

Gebruik de waarde van `ADMIN_TOKEN`.

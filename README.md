# MiCasa Winter Watch

Team app and public QR pages for the Winter Watch mailing and storm-alert program.

- **Team app** at `watch.micasastays.com/app`. Covers households from PropStream, mailings with QR codes, responses, pipeline, storm alerts and settings. Sign-in is an email link and only works for team members.
- **Public pages**: `watch.micasastays.com/WW-XXXX` is where each letter's QR code lands. A scan is logged against the household and the mailing, and the visitor can book a walkthrough or opt in to storm alerts.
- **Texting** goes through Sendblue. Replies are handled automatically:
  - STOP unsubscribes
  - STORM subscribes
  - CHECK creates a storm-check request
  - HELP replies with help text
- **Weather**: every 30 minutes the app checks National Weather Service warnings for Sanilac, Huron and St. Clair counties. For each new warning it drafts an alert and texts the team phone. Nothing goes to subscribers until a person reviews the alert and types SEND.

Stack: Next.js on Vercel, Postgres on Supabase (everything lives in the private `ww` schema), Supabase Auth for team sign-in.

---

## One-time setup

Do these in order. Each step says what to copy where. Secrets go only into Vercel's environment variables, never into chat or email.

### 1. GitHub
Create a GitHub account (or use yours) and a **private** repository named `winter-watch`. Send Claude the username so the code can be pushed there.

### 2. Supabase (database + sign-in)
1. Create a project at supabase.com. Pick region **East US** and save the database password in your password manager.
2. **SQL Editor → New query**: paste all of `db/schema.sql` and click **Run**. You should see "Success. No rows returned."
3. **Project Settings → Database → Connection string → Transaction pooler** (port 6543). Copy it and put your password in place of `[YOUR-PASSWORD]`. This value becomes `DATABASE_URL`.
4. **Project Settings → API**. Copy the Project URL (`NEXT_PUBLIC_SUPABASE_URL`) and the `anon` public key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). The app does not need the `service_role` key, so leave it in Supabase.
5. **Authentication → URL Configuration**:
   - Site URL: `https://watch.micasastays.com`
   - Redirect URLs: add `https://watch.micasastays.com/auth/callback`
6. **Authentication → Sign In / Providers → Email**: keep it enabled. Optional: under **Emails → SMTP** use your own email sender, because Supabase's built-in sender is limited to a few emails per hour.

### 3. Vercel (hosting)
1. Sign up at vercel.com with GitHub and choose the **Pro** plan ($20/mo). The free plan does not allow business use.
2. **Add New → Project**, import the `winter-watch` repo and keep the default settings.
3. Before the first deploy, open **Environment Variables** and add these:

| Name | Value |
|---|---|
| `DATABASE_URL` | from Supabase step 3 |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase step 4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase step 4 |
| `NEXT_PUBLIC_SITE_URL` | `https://watch.micasastays.com` |
| `OWNER_EMAILS` | `will@micasastays.com,info@micasastays.com` |
| `CRON_SECRET` | a long random string (use a password generator, 40+ characters) |
| `SENDBLUE_WEBHOOK_TOKEN` | another long random string |
| `SENDBLUE_API_KEY_ID` | leave out until Sendblue is set up |
| `SENDBLUE_API_SECRET` | leave out until Sendblue is set up |
| `SENDBLUE_FROM_NUMBER` | your Sendblue number, like `+18105551234` |

Never add `DEV_LOGIN_EMAIL` in Vercel; it is for local testing only. The app also ignores it in production.

4. Click **Deploy**.

### 4. GoDaddy (the web address)
1. Vercel: **Project → Settings → Domains → Add** `watch.micasastays.com`. Vercel then shows a CNAME value, usually `cname.vercel-dns.com`.
2. GoDaddy: **My Products → micasastays.com → DNS → Add record**:
   - Type **CNAME**
   - Name `watch`
   - Value: the one Vercel showed
   - TTL 1 hour
3. Wait 5 to 30 minutes until Vercel shows "Valid Configuration". This does not touch your main website or email.

### 5. First sign-in
1. Go to `https://watch.micasastays.com/login`, enter your email and click the link it sends you.
2. **Settings**:
   - Check prices, the mail cost per piece and the code prefix.
   - Set **Team phone for weather drafts** (the cell that gets "storm drafted" texts).
   - Add team members by email.

### 6. Sendblue (texting)
1. Get the plan and number from Sendblue. Outbound alerts need a plan that allows sending first, not only replies.
2. Sendblue dashboard → API keys. Put the key ID and secret into Vercel as `SENDBLUE_API_KEY_ID` / `SENDBLUE_API_SECRET`, plus `SENDBLUE_FROM_NUMBER`, then **Redeploy**.
3. Sendblue → Webhooks → **Receive** webhook:
   `https://watch.micasastays.com/api/sendblue/webhook?token=YOUR_SENDBLUE_WEBHOOK_TOKEN`
4. In the app, **Storm alerts → Send a test text** to your own phone. Reply HELP and confirm you get an answer.
5. **Settings → check "Allow storm alerts to be sent to subscribers"**. Until that's on, the app sends nothing except STOP confirmations.

### 7. Weather check
Nothing to do. `vercel.json` schedules `/api/cron/weather` every 30 minutes, and Vercel signs those calls with `CRON_SECRET`. You can confirm it under **Vercel → Project → Cron Jobs**.

---

## Moving over from the pilot CRM
1. In the pilot CRM, click **Export all**.
2. In the new app go to **Households → Import**, choose that file and match its **code** column to "Existing code". Codes already printed on letters keep working, and new households get new codes.
3. Mailings and logged responses do not move over automatically. If any have been logged in the pilot by then, ask Claude for a one-time migration.

## Running a mailing
1. **Households → Import** your PropStream CSV. MiCasa-owned addresses are excluded automatically using the list in Settings, and duplicates are skipped.
2. **Mailings → Create mailing**: choose the towns and the audience (everyone, never mailed, or no response yet).
3. **Download print file**, which is a CSV with the name, address, code and QR link for each letter. Send it to the printer.
4. When the letters go out, click **Mark as mailed**. From then on, responses are credited to that mailing.

## Local development
```bash
npm install
cp .env.example .env.local   # point DATABASE_URL at a local Postgres with db/schema.sql loaded
# set DEV_LOGIN_EMAIL=you@… in .env.local to skip email sign-in locally
npm run dev
npm test        # unit tests
npm run typecheck
```

## Safety notes
- All data lives in the `ww` schema, which Supabase's public API does not expose. Row-level security is on with no policies, so the anon key cannot read any of it. Only the server talks to the database.
- Every team action checks the signed-in team member on the server.
- The Sendblue webhook requires the secret token, and the weather job requires the cron secret.
- Each subscriber row stores the exact consent wording, the method, the time and the IP. STOP always works and is always confirmed.

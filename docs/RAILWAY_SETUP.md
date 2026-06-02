# Xpansion 60 — Railway Setup (Step-by-Step)

This is the operator runbook for Step 1 of the build plan: getting the app onto Railway with the domain wired up.

**Reminder of the goal:** by the end of this document, `https://www.xpansion60.com` loads the existing Xpansion app (with the BI features still visible — that's fine, we strip them later), you can log in as admin, emails send from `coaching@xpansion60.com`, and the staging environment is ready for future work.

You can pause between phases. Each phase is self-contained.

---

## Phase A — Railway Project Setup

1. Open https://railway.com and log in. (Confirm you're on the workspace where your **Pro** subscription lives — top-left workspace switcher.)
2. Click **+ New Project** → choose **Empty Project** (do *not* deploy from a template).
3. Name the project **`xpansion60`**. Click **Create**.
4. You should see an empty canvas titled "xpansion60". Leave it open — we'll add things to it.

## Phase B — Add Postgres (production)

5. On the project canvas, click **+ Create** → **Database** → **Add PostgreSQL**.
6. Wait ~30 seconds for the database to provision. You'll see a "Postgres" card appear.
7. Click the Postgres card → **Variables** tab. Confirm `DATABASE_URL` exists (it will be auto-injected into other services in the same project — you don't need to copy it anywhere).

## Phase C — Add the App Service (production)

> **Important:** Do this step *after* the working branch contains the latest code. If you connect the repo to an older branch, the first deploy may fail. You can skip ahead to Phase D / E / F while you wait — those don't depend on the deploy succeeding.

8. On the project canvas, click **+ Create** → **GitHub Repo**.
9. If Railway hasn't been authorized for your GitHub account yet, follow the prompt to install the Railway GitHub app. Grant it access to `jrn2525/Xpansion_60`.
10. Select the repo `jrn2525/Xpansion_60` from the list.
11. Once the service is created, click it → **Settings** tab:
    - **Source** → **Branch:** change to `claude/coaching-app-planning-Sg4RF` (this is our working branch; we'll switch to `main` later when v1 is ready to ship)
    - **Build** → **Build Command:** leave as auto-detected (`npm install && npm run build`)
    - **Deploy** → **Start Command:** `npm start`
    - **Networking** → **Generate Domain:** click it to get a temporary `*.up.railway.app` URL for testing before DNS is ready. Save this URL.

## Phase D — Production Environment Variables

12. Still inside the app service → **Variables** tab → **+ New Variable** for each of the following.

| Name | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `SESSION_SECRET` | Generated random string | See generation note below |
| `APP_URL` | `https://www.xpansion60.com` | Hard-coded to the real domain from day 1 |
| `ADMIN_EMAIL` | `john@xpansioncode.com` | First admin user seeded on boot |
| `ADMIN_PASSWORD` | A strong password you'll change on first login | Use a password manager |
| `RESEND_API_KEY` | (leave blank for now) | Fill in after Phase F |
| `EMAIL_FROM` | `coaching@xpansion60.com` | Default sender; editable later in admin Settings |

**Generating `SESSION_SECRET`:** in a local terminal run `openssl rand -hex 32` (works on Mac/Linux). On Windows, paste this in your browser address bar: `javascript:document.write(Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join(''))` — copy the resulting hex string. Should be 64 characters.

13. Railway should automatically add `DATABASE_URL` (linked from Postgres) and `PORT`. Confirm both appear in the Variables list. You don't add them manually.

14. Click **Deploy** (top-right). If code prep has been pushed, the deploy should succeed in 2-4 minutes. If not, expect a crash loop — that's fine, we'll resolve when code prep is done.

## Phase E — Custom Domain in Railway

You can do this even before the first successful deploy.

15. App service → **Settings** → **Networking** → **+ Custom Domain**.
16. Enter `www.xpansion60.com` → **Add Domain**.
17. Railway will display a **CNAME target** that looks like `xxxxxx.up.railway.app`. **Copy this value** — you need it for GoDaddy.
18. Don't close this Railway tab; keep it open until step 23 confirms it.

## Phase F — DNS in GoDaddy

19. In a new tab, log in to https://godaddy.com → **My Products** → find `xpansion60.com` → **DNS**.
20. **Add the www CNAME:**
    - Click **Add New Record**.
    - **Type:** `CNAME`
    - **Name:** `www`
    - **Value:** (paste the CNAME target from Railway, step 17)
    - **TTL:** `1 Hour` (default is fine)
    - **Save.**
21. **Set up apex (root) forwarding:**
    - GoDaddy doesn't support CNAME on the root domain. Instead, scroll to the **Forwarding** section on the DNS page.
    - Click **Add** under "Domain" forwarding.
    - **Forward to:** `https://www.xpansion60.com`
    - **Forward type:** Permanent (301)
    - **Settings:** Forward only (not "Forward with masking")
    - **Update DNS:** check the box (GoDaddy will set up the A record for the forwarding to work)
    - **Save.**
22. DNS propagation typically takes 15 minutes to a few hours. You can check progress with `dig www.xpansion60.com CNAME` from a terminal, or use https://dnschecker.org → enter `www.xpansion60.com` and choose CNAME.
23. Once Railway shows a green checkmark next to `www.xpansion60.com` (the Railway tab from step 17), the domain is wired up. TLS certificate is provisioned automatically.

## Phase G — Resend Domain + API Key

24. Log in to https://resend.com.
25. **Domains** (left nav) → **+ Add Domain** → enter `xpansion60.com` → **Add**.
26. Resend will display ~4 DNS records to add: typically 1 TXT for SPF, 2-3 CNAMEs for DKIM, and optionally 1 TXT for DMARC. **Leave this tab open** — you'll need to copy values from it.
27. Switch to your GoDaddy DNS tab. For **each** record Resend showed:
    - **+ Add New Record** in GoDaddy
    - Match the **Type** (TXT or CNAME)
    - **Name:** copy the host from Resend exactly (it'll be something like `resend._domainkey` — GoDaddy may auto-strip the trailing `.xpansion60.com`, which is correct)
    - **Value:** copy the value from Resend exactly
    - **TTL:** 1 Hour
    - **Save**
28. Back in Resend, click **Verify DNS Records**. May take 15 min to a few hours to propagate. The status will flip from yellow to green.
29. Once verified, go to Resend **API Keys** → **+ Create API Key** → name it `xpansion60 production` → **Permission:** Full access → **Create**.
30. **Copy the key immediately** — Resend only shows it once.
31. Back in Railway → app service → **Variables** → edit `RESEND_API_KEY` → paste the key → **Save**. Railway will re-deploy automatically.

## Phase H — Staging Environment

For safer iteration on the schema migration and the cron emails later.

32. In your Railway project (top center), click the environment dropdown (currently shows `production`) → **+ New Environment** → name it `staging` → **Create**. Choose **Fork from production** if asked — that copies the service config.
33. Switch to the `staging` environment.
34. Add a separate Postgres for staging: **+ Create** → **Database** → **Add PostgreSQL**. This is a *different* database from production.
35. In the staging app service → **Variables**:
    - `APP_URL` = the Railway-generated staging URL (something like `https://xpansion60-staging-production.up.railway.app` — Railway will show it under Networking)
    - `RESEND_API_KEY` = (optional for now — staging doesn't have to send real emails). If you want emails on staging, create a separate Resend API key named `xpansion60 staging`.
    - All other env vars: copy values from production but with their own `SESSION_SECRET` and `ADMIN_PASSWORD`.
36. Staging branch: leave it pointed at `claude/coaching-app-planning-Sg4RF` for now. Once we cut a `main` for production, staging tracks the working branch and production tracks `main`.

## Verification Checklist (after Phase G is fully done)

Tell me when all of these are true and we can mark Step 1 done:

- [ ] `https://www.xpansion60.com` loads the app (login screen)
- [ ] You can log in as `john@xpansioncode.com` with your `ADMIN_PASSWORD`
- [ ] Apex `https://xpansion60.com` redirects to `https://www.xpansion60.com`
- [ ] In Resend, `xpansion60.com` shows green (verified)
- [ ] In Railway, `staging` environment exists with its own Postgres
- [ ] App deploys cleanly with `drizzle-kit push --force` running on start

## If something goes wrong

- **Deploy fails with "DATABASE_URL is undefined":** confirm Postgres and the app service are in the *same* environment. Variables don't cross environments.
- **Deploy crashes on boot with a missing-env-var error:** confirm `APP_URL`, `SESSION_SECRET`, `DATABASE_URL` are all set in the service Variables tab.
- **DNS not resolving after a few hours:** double-check the CNAME value in GoDaddy matches Railway exactly. No trailing dot. No typos.
- **Resend can't verify:** sometimes GoDaddy auto-appends the domain to record names. If Resend wants `resend._domainkey` and GoDaddy now shows `resend._domainkey.xpansion60.com`, that's usually fine — the record value is what matters.
- **Anything else:** screenshot it, send it over, we'll fix it.

---

When you're done with whatever phases you can do without the code-prep deploy succeeding (D, E, F, G can mostly proceed in parallel), let me know. Once code prep is pushed, you'll do step 14 (Deploy) and we'll verify everything end-to-end.

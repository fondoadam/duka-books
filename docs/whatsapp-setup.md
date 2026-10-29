# Connecting WhatsApp to Duka Books

A step-by-step guide to getting a free WhatsApp test number, letting it message your phone, and pointing it at
our Convex deployment. It takes about 15 minutes. You don't need a credit card or the Meta model API key.

Meta renames buttons often. If a label below doesn't match exactly, look for the one that does the same thing.

**What you'll end up with** (keep these in a password manager, not in chat or git):

| Value | Where it comes from | Where it goes |
| --- | --- | --- |
| Temporary access token | WhatsApp > API Setup | Convex `WHATSAPP_TOKEN` (replace with a permanent token in Part 6) |
| Phone number ID | WhatsApp > API Setup, under the test number | Convex `WHATSAPP_PHONE_NUMBER_ID` |
| App secret | App settings > Basic | Convex **and** `.env.local`: `WHATSAPP_APP_SECRET` |
| Verify token | Already in our `.env.local` | Pasted into Meta's webhook form |

---

## Part 1: Get a Meta developer account

1. Open https://developers.facebook.com and log in with your personal Facebook account.
2. If it's your first time, click **Get Started** (top right) and follow the steps: accept the terms, verify your
   phone number by SMS, confirm your email, and pick "Developer" as your role.
3. When it's done you land on the **My Apps** page.

> If Facebook asks you to verify your identity or your account is new, finish that first. Brand-new or
> restricted accounts sometimes can't create apps.

## Part 2: Create the app

1. On **My Apps**, click **Create App**.
2. **App details:** name it `Duka Books`, and use your email as the contact email. Click **Next**.
3. **Use cases:** pick **Connect with customers through WhatsApp** (you may need the "Business messaging"
   filter on the left). Click **Next**.
4. **Business:** pick a business portfolio. If you don't have one, create one here: name it `Duka Books`, with
   your name and email. Meta may ask you to confirm the email. A portfolio with no verified business is fine
   for the test number.
5. **Requirements / Overview:** click **Next**, then **Go to dashboard** (or **Create app**). Enter your
   Facebook password if asked.

You're now on the app dashboard. Leave the app in **Development** mode. The test number works in Development
mode and you don't need App Review.

## Part 3: Open API Setup and get the test number

1. In the left sidebar, open **Use cases**, then click **Customize** next to "Connect with customers through
   WhatsApp". (On older dashboards: **WhatsApp > API Setup** in the sidebar.)
2. Open **API Setup** (it may be called **Quickstart > API Setup**). Meta creates a free **test business number**
   for you (a US number) and a WhatsApp Business Account to hold it.
3. On this page you'll see:
   - **Temporary access token**, with a **Generate access token** button. Click it, approve the permissions
     popup (keep everything ticked, especially `whatsapp_business_messaging` and `whatsapp_business_management`),
     then copy the token. **It expires after 24 hours.**
   - **From:** the test number. Under it, copy the **Phone number ID** (a long number, not the phone number
     itself). You can ignore the WhatsApp Business Account ID for now.

## Part 4: Add your own number as a recipient

While the app is in Development mode, the test number can only message phone numbers you add here (up to 5).

1. On the same **API Setup** page, find step 1 or 2, **Send messages with the API**, and open the **To** dropdown.
2. Click **Manage phone number list**, then **Add phone number**.
3. Pick **Kenya (+254)** and type your WhatsApp number **without the leading 0**: `712 345 678`, not `0712 345 678`.
4. Meta sends a 6-digit code **to your WhatsApp** (not SMS). Enter it and click **Verify**.
5. Your number now appears in the **To** dropdown. Select it.
6. Click **Send message**. Meta sends the `hello_world` template, and within a few seconds you should see a
   "Hello World" message from the test number on your phone. **This proves sending works.**
7. On your phone, **reply to that message with anything** (e.g. "Habari"). That opens WhatsApp's 24-hour window,
   during which our bot may send normal (non-template) messages to you. Do this again any time the bot hasn't
   heard from you for a day.
8. Save the test number as a contact, e.g. "Duka Books".

## Part 5: Connect it to our Convex deployment

### 5a. Copy the app secret

1. Sidebar: **App settings > Basic**.
2. Next to **App secret**, click **Show**, enter your Facebook password, and copy it.
   Meta uses this secret to sign every webhook. Our code refuses any request without a valid signature.

### 5b. Set the Convex env vars

From the repo folder, paste your real values:

```bash
npx convex env set WHATSAPP_TOKEN "<temporary access token>"
npx convex env set WHATSAPP_PHONE_NUMBER_ID "<phone number ID>"
npx convex env set WHATSAPP_APP_SECRET "<app secret>"
npx convex env remove WHATSAPP_DRY_RUN     # replies now really go to WhatsApp
```

Leave `EXTRACT_STUB=1` set until the Meta model key works: photos get sample entries, and M-Pesa SMS are read
exactly by our parser either way.

Then open `.env.local` and replace the `WHATSAPP_APP_SECRET=` line with the same app secret, so `pnpm simulate`
keeps signing its fake webhooks correctly.

### 5c. Register the webhook

1. Print the verify token (you'll paste it into Meta):
   ```bash
   grep WHATSAPP_VERIFY_TOKEN .env.local
   ```
2. In the app dashboard, go to **WhatsApp > Configuration** (or **Use cases > Customize > Configuration**).
3. Under **Webhook**, click **Edit** and fill in:
   - **Callback URL:** `https://calm-warbler-133.convex.site/whatsapp`
     (it must be `.convex.site`, not `.convex.cloud`)
   - **Verify token:** the value from step 1, without quotes
4. Click **Verify and save**. Meta calls our `GET /whatsapp`, which echoes the challenge back. If it saves, the
   link works.
5. Under **Webhook fields**, click **Manage** and **Subscribe** to **messages**. Nothing else is needed.
   Without this, Meta never sends us anything.

### 5d. Publish the app

**Needed since 2026.** An unpublished app only receives the dashboard's **Test** webhooks. Real messages,
even from the app's own admin, are not delivered until the app is published.

1. Sidebar: **App settings > Basic**. Fill in:
   - **Privacy policy URL** and **User data deletion > Data deletion instructions URL**:
     `https://calm-warbler-133.convex.site/privacy`
   - **Category:** Business and pages (or the closest match). Add an app icon if asked.
   - Save changes.
2. Sidebar: **Publish** (or the **Development / Live** switch at the top). Publish the app.
3. If Meta asks for Business Verification or App Review before publishing, stop and note what it asks for;
   the test number doesn't need advanced access.

## Part 6: Test it on your phone

Send these to the test number, in order:

| You send | Bot should reply |
| --- | --- |
| A real M-Pesa SMS (long-press, Forward) | "Nimepata rekodi 1: …" with **Sawa, andika** / **Si sahihi** buttons |
| Tap **Sawa, andika** | "✅ Nimeandika rekodi 1 kwenye vitabu." |
| The same SMS again | "Rekodi 1 tayari ziko kwenye vitabu, nimeziruka." |
| Any photo | "Nimepata rekodi 2: Unga 2kg … Sukari 1kg …" (sample entries while `EXTRACT_STUB=1`) |

You should also see blue ticks and "typing…" while the bot works.

If something goes wrong, check `npx convex logs` and the `inbound` table in the Convex dashboard
(https://dashboard.convex.dev): a failed message has `status: failed` and an `error`.

## Part 7: Permanent token (do this before the demo)

The temporary token dies after 24 hours, probably in the middle of something. A System User token doesn't expire.

1. Go to https://business.facebook.com/settings and pick the **Duka Books** portfolio.
2. **Users > System users > Add**: name it `duka-books-bot`, role **Admin**. Click **Create system user**.
3. With the system user selected, click **Assign assets**:
   - **Apps > Duka Books**: turn on **Full control** (Manage app).
   - **WhatsApp accounts > your test WhatsApp Business Account**: turn on **Full control**.
   Save.
4. Click **Generate new token**: app **Duka Books**, expiry **Never**, permissions
   `whatsapp_business_messaging` and `whatsapp_business_management`. Generate, then copy the token. It's only
   shown once.
5. Replace the temporary one:
   ```bash
   npx convex env set WHATSAPP_TOKEN "<system user token>"
   ```
6. Send the bot a message to check it still replies.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Verify and save" fails | Wrong URL (`.convex.cloud`), or the verify token doesn't match | Use `https://calm-warbler-133.convex.site/whatsapp`; re-copy the token with no spaces or quotes |
| Nothing happens when you message the bot | Not subscribed to the **messages** field | Configuration > Webhook fields > subscribe to `messages` |
| Logs show `401 Bad signature` | Convex `WHATSAPP_APP_SECRET` isn't Meta's app secret | Set it again from App settings > Basic |
| Bot receives but never replies; logs show `131030` | Your number isn't in the recipient list | Part 4: add and verify it |
| Logs show `131047` (re-engagement) | More than 24 h since you last messaged the bot | Send the bot any message first |
| Logs show `190` / "Session has expired" | Temporary token expired | Generate a new one, or do Part 7 |
| Replies appear only in the `outbox` table | `WHATSAPP_DRY_RUN` is still set | `npx convex env remove WHATSAPP_DRY_RUN` |
| `pnpm simulate` gets `401` | `.env.local` still has the old secret | Put Meta's app secret in `.env.local` too |
| You can't add your number | It's already registered as a WhatsApp Business API number elsewhere | Use another personal WhatsApp number |

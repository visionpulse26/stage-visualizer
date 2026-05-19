# Feedback Notifications

Client feedback notifications are delivered by a Supabase Database Webhook that calls the `notify-feedback` Edge Function. The function validates a shared secret, formats the inserted `client_feedback_items` row, and posts a Discord embed.

## Required Secrets

Set these in Supabase Dashboard > Project Settings > Edge Functions > Secrets, or with the Supabase CLI:

```bash
npx supabase secrets set DISCORD_FEEDBACK_WEBHOOK_URL="https://discord.com/api/webhooks/..."
npx supabase secrets set FEEDBACK_WEBHOOK_SECRET="use-a-long-random-value"
npx supabase secrets set ADMIN_BASE_URL="https://your-production-domain.com"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available to hosted Edge Functions by default. The service role key is only used inside the Edge Function to read the project name for a nicer Discord message.

## Deploy Function

```bash
npx supabase functions deploy notify-feedback --no-verify-jwt
```

The repo also includes `supabase/config.toml` with `verify_jwt = false` for this function. The function still checks `x-feedback-secret`, so do not expose that secret.

## Create Discord Webhook

1. Open Discord channel settings.
2. Go to Integrations > Webhooks.
3. Create a webhook named `Stage Visualizer`.
4. Copy the webhook URL into `DISCORD_FEEDBACK_WEBHOOK_URL`.

## Create Supabase Database Webhook

In Supabase Dashboard:

1. Go to Database > Webhooks.
2. Create a new webhook.
3. Table: `public.client_feedback_items`.
4. Events: `Insert`.
5. Type: HTTP Request.
6. Method: `POST`.
7. URL: `https://<project-ref>.supabase.co/functions/v1/notify-feedback`.
8. Headers:
   - `Content-Type: application/json`
   - `x-feedback-secret: <same value as FEEDBACK_WEBHOOK_SECRET>`
9. Save and enable the webhook.

## Test

Submit feedback from the client review page. Discord should receive a message with the feedback comment as the embed heading, plus project, resolved clip title when available, reviewer name, clip timestamp, and an admin review link:

```text
https://your-production-domain.com/admin/<projectId>/feedback
```

If Discord does not receive a message, check:

1. Supabase Edge Function logs for `notify-feedback`.
2. Whether the database webhook is enabled.
3. Whether `x-feedback-secret` exactly matches `FEEDBACK_WEBHOOK_SECRET`.
4. Whether `DISCORD_FEEDBACK_WEBHOOK_URL` is the full Discord webhook URL.

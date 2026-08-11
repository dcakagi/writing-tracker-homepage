# Optional Supabase Sync

Supabase is optional. The homepage works immediately with browser-local storage, and the sync/sign-in interface stays hidden until you explicitly enable it.

If you want the same tracker data on multiple browsers or devices, you may
request an invitation from the owner of a shared deployment or create **your
own** Supabase project by following this guide. Never reuse another project's
settings without its owner's explicit invitation. Every project owner is
responsible for users, quotas, email delivery, security, and billing.

## Before you begin

You need:

- A free or paid [Supabase](https://supabase.com/) account
- A Supabase project dedicated to your copy of the homepage
- Access to edit [`js/app-config.js`](./js/app-config.js)

The browser configuration uses a Supabase **publishable key** (`sb_publishable_...`). Publishable keys are designed to appear in browser code; your Row Level Security policies are what protect user data. Never put a secret key, legacy `service_role` key, database password, or access token in this repository.

## 1. Create the database table

1. Create a project in the Supabase Dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy all of [`supabase/user_state.sql`](./supabase/user_state.sql) into the editor.
4. Run the query.

The script is safe to run again when updating an existing template installation. It:

- Stores one state row per Supabase Auth user
- Stores no duplicate email address in the state table
- Enables and forces Row Level Security (RLS)
- Gives the `anon` role no table access
- Allows an authenticated user to select, insert, update, or delete only their own row
- Rejects non-object or unexpectedly large JSON payloads
- Updates `updated_at` automatically

Supabase's SQL Editor runs with administrative privileges, so it does not reproduce the restrictions of a browser request. Use the browser test in step 6 to confirm the end-to-end setup.

## 2. Configure email one-time codes

The homepage asks for a six-digit email code rather than opening a magic link.

1. In **Authentication → Email Templates**, open the **Magic Link / OTP** template.
2. Make sure its body displays `{{ .Token }}`. For example:

   ```html
   <h2>Your homepage sign-in code</h2>
   <p>Enter this code in the homepage:</p>
   <p><strong>{{ .Token }}</strong></p>
   ```

3. Save the template.

Supabase sends a magic link when the template uses `{{ .ConfirmationURL }}` and sends a code when it uses `{{ .Token }}`. See the official [email template documentation](https://supabase.com/docs/guides/auth/auth-email-templates).

## 3. Add allowed users

First, disable public account creation at the project boundary:

1. Open the project's **Authentication** settings.
2. Find **Allow new users to sign up** and turn it off.
3. Confirm anonymous sign-ins are also disabled.

This server-side setting is the security boundary. The template also calls
Supabase Auth with `shouldCreateUser: false`, but that client-side option alone
cannot prevent someone from calling the public Auth API directly.

Add each person who should be allowed to sync from **Authentication → Users** in the Dashboard. For a personal homepage, add only yourself. After the user exists, they can request a code from the homepage sign-in panel.

Keeping user creation invite-only is recommended. If you later add public registration, you are also taking responsibility for signup abuse, authentication emails, and project usage.

## 4. Copy the public project settings

Find the project URL in the project's **Connect** dialog or Data API settings. Find a publishable key in **Settings → API Keys**.

Update the `supabase` section in [`js/app-config.js`](./js/app-config.js):

```js
supabase: {
  enabled: true,
  url: "https://your-project-ref.supabase.co",
  publishableKey: "sb_publishable_your_key"
}
```

All three values are required. With `enabled: false`, a blank URL, or a blank
key, the site remains local-only and makes no Supabase API calls. The **Sync
and Backup** panel remains available by clicking the background of the Export /
Import pill, so visitors can see how to request access or follow the
bring-your-own-Supabase guide. The sign-in form stays hidden.

Older projects may offer a legacy `anon` key. It has client-side privileges similar to a publishable key, but new projects should use the current publishable key. Supabase documents both in [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys).

### Optional: identify who handles access requests

For an invite-only shared deployment, configure the name visitors should
contact. Add an email only if you want the page to provide a clickable link:

```js
accessRequest: {
  enabled: true,
  ownerName: "Your Name",
  email: "public-contact@example.com",
  subject: "Homepage sync access request"
}
```

Signed-out visitors will see both the named access-request path and **Set up
your own Supabase project**. A configured address is intentionally visible in
the page source. Receiving a request does not grant access; review it and send
approved invitations from **Authentication → Users**.

To display your name without publishing an email address, leave `email` blank.
The page will show **Email Your Name to request access** as plain text. Visitors
must already know how to contact you. Setting a valid `email` turns that text
into a clickable email link.

## 5. Open the homepage and sign in

Refresh the homepage. The Export / Import pill should become the Sync/status
control. Open it to find sign-in, Export, and Import together.

1. Enter the email address you added in Supabase Auth.
2. Request a code.
3. Enter the six-digit code from the email.
4. On the first sign-in, choose whether to import data already stored in that browser.

Later edits are saved locally first and sent to Supabase while signed in. If sync is unavailable, the local copy remains usable.

## 6. Verify isolation

At minimum, test these cases before relying on sync:

- Set `enabled: false`; confirm the sync interface disappears and tracking still persists after a refresh.
- Re-enable sync and sign in; make a change, then confirm it appears in `public.user_state` in the Dashboard.
- Open a private/incognito window without signing in; confirm no state data is available through the app.
- If you have two test users, save visibly different data for each and confirm neither browser loads the other user's state.
- In **Database → Advisors** (or Security Advisor), review and resolve unexpected RLS or privilege warnings.

The migration defines the intended policies explicitly. You can inspect them in **Database → Tables → user_state → Policies**.

## Security and abuse notes

RLS protects rows; it does not make a public project abuse-proof. Anyone can copy a publishable key from a browser, and hostile traffic can still consume API, Auth, email, database, or egress quotas.

For a small private installation:

- Keep **Allow new users to sign up** disabled. The included client also refuses to create unknown users, as a second layer rather than the primary boundary.
- Keep RLS enabled and do not add policies for `anon`.
- Never expose a secret or `service_role` key. Those credentials can bypass RLS.
- Review Auth and API logs, Security Advisor findings, usage, and billing controls periodically.
- Configure conservative limits under **Authentication → Rate Limits**. Be careful not to lock out your own normal sign-in flow.
- Use custom SMTP if you depend on reliable delivery or exceed the hosted project's trial email allowance.

Supabase supports CAPTCHA on signup, sign-in, and password-reset endpoints. The included sign-in form does **not** render a CAPTCHA or submit a CAPTCHA token, so do not enable CAPTCHA without also integrating a supported CAPTCHA widget into the client. If you add public signup, implement CAPTCHA and test it before publishing. See Supabase's [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) and [Auth rate-limit documentation](https://supabase.com/docs/guides/auth/rate-limits).

## Returning to local-only mode

Set:

```js
supabase: {
  enabled: false,
  url: "",
  publishableKey: ""
}
```

Refresh the page. Local tracking continues without signing in. Disabling sync does not delete the remote row; delete it from Supabase separately if you no longer want it retained.

## Troubleshooting

**The sync control does not appear**

Confirm `enabled` is exactly `true` and both `url` and `publishableKey` are non-empty. Also confirm `js/app-config.js` loads before `js/app-state.js`.

**The email contains a link instead of a code**

Replace `{{ .ConfirmationURL }}` with `{{ .Token }}` in the Magic Link / OTP email template.

**No code arrives**

Confirm the email already exists under Authentication users. Then check Auth logs, email rate limits, and the project's email delivery settings.

**A request reports an RLS or permission error**

Run [`supabase/user_state.sql`](./supabase/user_state.sql) again, sign out and back in, then inspect the `user_state` grants and policies. Never work around the error by adding public or `anon` access.

**Local data did not automatically replace cloud data**

The first-sign-in prompt avoids silently overwriting either copy. Sign out, clear the migration marker for that user in browser storage only if you intentionally want to repeat the choice, and sign back in.

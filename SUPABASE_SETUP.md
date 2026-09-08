# Optional Supabase Sync

Supabase is optional. The homepage works immediately with browser-local
storage. Until you explicitly enable Supabase, the header stays focused on
Export and Import and the sign-in form remains hidden inside the optional
dropdown.

This template supports email-and-password sign-in for cloud sync. It does not
send invitations, magic links, one-time codes, or password-reset messages, so
normal sign-in does not require an SMTP provider or an authentication redirect
URL. It works from GitHub Pages, another static host, or a locally opened
`file://` copy.

The same `user_state` row stores writing history and goals, papers read, habit
state, to-do items, bookmark counters, and browser customization. Customization
and writing goals use the bounded `preferences` column. To-do items and papers
use the `todo_data` and `paper_data` columns added by the current
`supabase/user_state.sql`. If your project predates either tracker, see
[Update an existing project](#update-an-existing-project) below.

There are two valid deployment models:

- **One shared project:** the site owner completes this setup once and puts the
  project URL and publishable key in the homepage configuration. All visitors
  use that public client configuration, but only manually created Auth users can
  sign in. Row Level Security isolates each user's state row.
- **Bring your own project:** keep the template defaults disabled. Each person
  who wants sync creates a separate project and adds their own public settings
  to their copy.

## Before you begin

You need:

- A [Supabase](https://supabase.com/) account
- A Supabase project dedicated to this homepage
- Access to edit [`js/app-config.js`](./js/app-config.js)

The browser configuration uses a Supabase **publishable key**
(`sb_publishable_...`). Publishable keys are designed to appear in browser
code; authentication and Row Level Security protect user data. Never put a
secret key, legacy `service_role` key, database password, access token, or SMTP
credential in this repository.

## 1. Create the database table

1. Create a project in the Supabase Dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy all of [`supabase/user_state.sql`](./supabase/user_state.sql) into the
   editor.
4. Run the query.

The rerunnable migration:

- Stores one state row per Supabase Auth user
- Stores no duplicate email address in the state table
- Enables and forces Row Level Security
- Gives the unauthenticated `anon` role no table access
- Lets an authenticated user access only their own row
- Rejects non-object or unexpectedly large JSON payloads
- Updates `updated_at` automatically

### Update an existing project

The migration is rerunnable and additive, so an existing project is brought
forward by pasting the current `supabase/user_state.sql` into the SQL Editor
and running it again. No data is dropped.

Do this before deploying a version of the page that includes the to-do list or
paper tracker. If the page loads first, data for a missing newer column stays in
the browser while the older fields continue syncing. Applying the SQL and
reloading clears the warning and uploads the items already saved locally.

The SQL Editor runs with administrative privileges, so use the browser tests in
step 5 to verify the restrictions end to end.

## 2. Lock down authentication

1. Open the project's **Authentication** settings.
2. Keep the email provider enabled so email/password authentication is
   available.
3. Turn off **Allow new users to sign up**.
4. Confirm anonymous sign-ins are disabled.
5. Configure a strong minimum password policy.

The template never calls `signUp`; only the owner creates accounts. No SMTP or
redirect configuration is needed for normal password sign-in.

Without SMTP, automated password recovery is unavailable. If someone forgets
their password, the owner must assign a new strong password through a trusted
admin operation and communicate it privately. Supabase documents this through
the server-only Admin API; never put its secret key in this static page.

## 3. Copy the public project settings

Find the project URL in the project's **Connect** dialog or Data API settings.
Find a publishable key under **Settings → API Keys**.

Update [`js/app-config.js`](./js/app-config.js):

```js
supabase: {
  enabled: true,
  url: "https://your-project-ref.supabase.co",
  publishableKey: "sb_publishable_your_key"
}
```

All three values are required. With `enabled: false`, a blank URL, or a blank
key, the site remains local-only and makes no Supabase API calls. The **Sync and
Backup** information remains available by clicking the background of the Export
/ Import pill, but the sign-in form stays hidden.

Older projects may offer a legacy `anon` key. It has client-side privileges
similar to a publishable key, but new projects should use a publishable key.

### Optional: identify who handles access requests

```js
accessRequest: {
  enabled: true,
  ownerName: "Your Name",
  email: "",
  subject: "Homepage sync access request"
}
```

With a blank `email`, visitors see **Email Your Name to request access** as
plain text. Set `email` only if you want a clickable mail link; the configured
address will be public in the page source. A request does not create an account.

## 4. Create an approved user

1. Open **Authentication → Users**.
2. Choose **Add user → Create new user**, not **Send invitation**.
3. Enter the approved user's email address.
4. Generate a unique, strong password. Never reuse one password across users.
5. Enable **Auto Confirm User** so the account can sign in without an email
   confirmation.
6. Create the user and communicate the initial password privately.

The Supabase organization members who administer the project and the Auth users
who use the homepage are separate concepts. Do not add homepage users as
organization members, and never put an Admin or secret key in this static page.

## 5. Test sign-in and isolation

Refresh the homepage. The Export / Import pill should become the Sync/status
control. Open it to find email, password, Export, and Import together.

1. Sign in with the manually created email and password.
2. On first sign-in, choose whether to import data already stored in that
   browser.
3. Make a visible change and confirm a row appears in `public.user_state`.
4. Open **Customize**, change the title or widget order, and save. Confirm the
   `preferences` column contains a `customization` object.
5. Refresh and confirm the state and customization remain.
6. Open a private window without signing in and confirm it cannot load the
   signed-in user's data.
7. Create a second test user, save different data and customization, and
   confirm the accounts do not load each other's state.
8. Sign out and confirm the page returns to its public defaults.
9. Review **Database → Advisors** and the policies on `public.user_state`.

Later edits are saved locally first and sent to Supabase while signed in. If
sync is temporarily unavailable, the local copy remains usable.

## Security and abuse notes

- Keep public signup and anonymous sign-in disabled.
- Use a different generated password for every user and share it privately.
- Never expose a secret or legacy `service_role` key; those bypass RLS.
- Review Auth/API logs, usage, Security Advisor findings, and billing controls.
- Deleting an Auth user revokes future sign-in and removes that user's state row
  through the database foreign key. An already issued access token may remain
  usable until it expires.
- Add SMTP later only if you want self-service confirmation, invitations, or
  password recovery.

## Returning to local-only mode

Set:

```js
supabase: {
  enabled: false,
  url: "",
  publishableKey: ""
}
```

Refresh the page. Local tracking continues without signing in. Disabling sync
does not delete remote rows.

## Troubleshooting

**The Sync control does not replace the Export / Import pill**

Confirm `enabled` is exactly `true`, the URL and publishable key are non-empty,
and `js/app-config.js` loads before `js/app-state.js`.

**Invalid login credentials**

Confirm the email matches the Auth user, the password is correct, and the user
was created with **Auto Confirm User** enabled. Use a trusted admin process to
assign a new password if necessary.

**An RLS or permission error appears**

Run [`supabase/user_state.sql`](./supabase/user_state.sql) again, sign out and
back in, and inspect the `user_state` grants and policies. Never fix this by
granting public or `anon` table access.

**Local data did not automatically replace cloud data**

The first-sign-in prompt avoids silently overwriting either copy. Repeat the
migration decision only when you intentionally want to replace one copy.

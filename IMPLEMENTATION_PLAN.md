# Homepage Template Implementation Plan

This file records the agreed scope for the public `homepage-template` repository.

## Product goals

- Work immediately in local-only mode with no account or cloud setup.
- Let people configure content and layout from one approachable JavaScript file.
- Keep Supabase sync optional: people may request access to an invite-only
  shared project or configure a project they control.
- Contain no credentials, private document URLs, or Notion integration.
- Use Provo weather and the original homepage quote collection as intentional
  public defaults.
- Preserve the lightweight static-site architecture and direct `file://` use.

## Implementation scope

1. Port the generic dashboard, writing tracker, habit tracker, weather, bookmark tracking, styles, and reusable assets.
2. Add configuration for page metadata, section order, dashboard widget order, feature visibility, bookmarks, quotes, timer, and weather.
3. Generate personalized content from configuration and reorder sections/widgets at startup.
4. Keep local storage as the default and retain JSON import/export backups.
5. Add optional bring-your-own-Supabase sync with a hardened, idempotent SQL migration.
6. Write local quick-start, customization, and optional Supabase setup documentation.
7. Verify local mode, configurable ordering, persistence, import/export, responsive layout, and Supabase isolation.
8. Audit the working tree and Git history for secrets and personal information before publication.
9. Add a configurable email-based access-request option to shared Supabase
   deployments without creating a public signup or unauthenticated database
   write path.
10. Keep the bring-your-own-Supabase instructions available beside the shared
    access option.
11. Set Provo as the default forecast location, move the lower gradient upward,
    add a second bottom-right gradient, and restore the original quote set.
12. Consolidate backup and sync into one header pill: show only Export and
    Import in local mode, and use the original homepage's Sync/status dropdown
    with Export and Import inside it once Supabase is configured.

## Explicit non-goals

- No automatic public signup or automatic approval for a shared Supabase
  project; the owner reviews requests and sends invitations manually.
- No access-request records stored in Supabase. Requests go through a public
  contact email configured by the site owner.
- No Notion research widget, Notion Edge Function, or Notion schema mapping.
- No service-role or secret credentials in browser code.
- No build system or framework migration.
- No deployment or hosting automation in the initial port.
- No upstream relationship with the private homepage repository.

## Completion criteria

- A fresh clone works locally without editing configuration.
- Personalization requires editing only `js/app-config.js` for normal use.
- Supabase remains dormant until explicitly enabled.
- An unauthenticated database client cannot read or write state.
- Each authenticated user can access only their own state row.
- A shared deployment clearly offers both "request access" and "set up your
  own Supabase" paths.
- The shared project keeps server-side signup and anonymous sign-in disabled;
  the browser's `shouldCreateUser: false` setting is only a second layer.
- Documentation contains only relative repository links and safe example values.
- Automated scans find no unintended private source URLs, credentials, or
  personal identifiers. The BYU defaults and named quote attributions are
  intentional public content.

## Shared Supabase experiment

### Visitor experience

1. Local storage remains the default and requires no account.
2. On a deployment whose owner has enabled Supabase, an existing invited user
   can request a one-time sign-in code.
3. Someone without an account can see the owner's configured public name and
   email the owner using contact information they already have. The owner may
   optionally configure a public `mailto:` link.
4. Someone who prefers to control their own data can follow
   `SUPABASE_SETUP.md` and use their own Supabase project instead.

### Owner setup checklist

- [ ] Create a dedicated Supabase project for the shared deployment.
- [ ] Run `supabase/user_state.sql`.
- [ ] Disable **Allow new users to sign up** in Supabase Auth.
- [ ] Confirm anonymous sign-ins are disabled.
- [ ] Configure the email OTP template to display `{{ .Token }}`.
- [ ] Set conservative Auth rate limits and monitor usage.
- [ ] Add the project URL and publishable key to `js/app-config.js` and enable
      Supabase.
- [ ] Enable `accessRequest` and add the public owner name visitors should see.
- [ ] Optionally add a public contact email for a clickable `mailto:` link. The
      address will be visible in the deployed page source.
- [ ] Review each request; an institutional address is an eligibility signal,
      not proof that the user is harmless.
- [ ] Send approved invitations from **Authentication → Users**.
- [ ] Delete a user's Auth record to revoke access; the database foreign key
      removes that user's state row.
- [ ] Test isolation with two invited accounts before wider sharing.

### Security boundaries

- The publishable key is public and never grants administrative access.
- RLS and explicit table grants isolate each authenticated user's row.
- JSON shape and size checks limit accidental or malicious row growth.
- The request-access email link does not grant access; only a Supabase Auth
  invitation does.
- The owner remains responsible for invitations, authentication email, quotas,
  monitoring, revocation, and any applicable data-handling obligations.

## Current follow-up tasks

- [x] Implement and document the configurable email access-request UI.
- [x] Keep bring-your-own-Supabase instructions visible from the sync panel.
- [x] Set Provo as the default weather forecast location.
- [x] Move the lower gradient upward.
- [x] Add a second bottom-right gradient.
- [x] Replace the generic quotes with the original homepage quote set.
- [x] Keep the named access-request and self-setup paths available inside the
      local backup pill's optional dropdown.
- [x] Move the second bottom-right gradient farther up the page.
- [x] Consolidate backup and sync into the local-first/original-style pill.
- [x] Re-run syntax, DOM-ID, local-mode, feature-gating, and privacy checks.
- [ ] Perform connected-browser visual and interaction QA when available.
- [ ] Test a live Supabase project with two invited users.

## Validation status

Completed on August 11, 2026:

- All JavaScript files pass syntax parsing.
- Configuration-driven section order, widget order, bookmarks, title, timer,
  gradients, and feature gating pass an isolated runtime harness.
- Local-only mode creates no Supabase client, shows Export and Import in one
  pill, hides sign-in, exposes the named request-access and self-setup paths in
  the pill's dropdown, and persists an empty initial state locally.
- Configured mode changes that pill to the original Sync/status presentation
  and moves the same Export and Import controls into its dropdown.
- Enabling complete Supabase settings creates the client and reveals sign-in.
- `writing.reminderInterval` is read as a day count with a seven-day fallback.
- Every local page asset returns successfully from a temporary static server.
- HTML has no duplicate IDs, and every static JavaScript DOM ID exists.
- Automated scans found no private source URLs, credentials, Notion research
  code, or old Git history.
- The shared-access panel passes configured-email and missing-email runtime
  tests. In local mode, the missing-email path displays the configured owner
  name while continuing to link to the bring-your-own-Supabase guide.
- Provo coordinates and all nine original homepage quotes are present in the
  evaluated default configuration.

Still requires a connected browser or external service:

- Visual and responsive review at desktop and mobile widths.
- Click-through testing of writing, habit, bookmark, import, and export flows.
- Live Supabase isolation testing with two invited users.

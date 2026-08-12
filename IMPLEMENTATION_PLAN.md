# Homepage Template Implementation Plan

This file records the agreed scope for the public `homepage-template` repository.

## Product goals

- Work immediately in local-only mode with no account or cloud setup.
- Let people configure content and layout either in the browser or from one
  approachable JavaScript file.
- Keep Supabase sync optional: people may request access to an approved-user
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
13. Match the original 24-hour forecast's explicit temperature-axis bounds and
    document the shared-Supabase owner setup before live authentication tests.
14. Use manually provisioned email/password accounts so local `file://` copies
    can sign in without redirect URLs, Auth emails, or SMTP.
15. Deploy the shared instance as a no-build GitHub Pages project site from
    `main`.
16. Add a per-browser customization panel for site metadata, layout, feature
    visibility, timer, writing reminders, weather, quotes, and bookmarks.
    Browser overrides take precedence over `js/app-config.js`; resetting the
    panel returns to that checked-in configuration.
17. Store browser customization locally by default. When a user is signed in,
    include the same bounded customization object in `user_state.preferences`
    so it follows that account across browsers. Do not expose Supabase project
    settings or shared-access owner settings in the visitor customization UI.
18. Explain the three independent choices without listing every combination:
    where the page runs (shared site, local clone, or personal fork), how it is
    customized (browser panel or `app-config.js`), and where personal state is
    stored (this browser or an approved/self-hosted Supabase project).

## Explicit non-goals

- No automatic public signup or automatic approval for a shared Supabase
  project; the owner reviews requests and manually creates confirmed Auth users.
- No access-request records stored in Supabase. Requests go through a public
  contact email configured by the site owner.
- No Notion research widget, Notion Edge Function, or Notion schema mapping.
- No service-role or secret credentials in browser code.
- No build system or framework migration.
- No server-rendered application or build-system dependency for deployment.
- No upstream relationship with the private homepage repository.

## Completion criteria

- A fresh clone works locally without editing configuration.
- Personalization works from the browser panel without editing files, while
  `js/app-config.js` remains the durable default for a clone or fork.
- Tracker use never requires signing in. A deployment can leave Supabase
  disabled, use the approved-user shared project, or configure a project its
  owner controls.
- An unauthenticated database client cannot read or write state.
- Each authenticated user can access only their own state row.
- A shared deployment clearly offers both "request access" and "set up your
  own Supabase" paths.
- The shared project keeps server-side signup and anonymous sign-in disabled;
  the static client exposes no signup or administrative user-creation path.
- Documentation contains only relative repository links and safe example values.
- Automated scans find no unintended private source URLs, credentials, or
  personal identifiers. The BYU defaults and named quote attributions are
  intentional public content.

## Shared Supabase experiment

### Visitor experience

1. Local storage remains the default and requires no account.
2. On a deployment whose owner has enabled Supabase, an approved user can sign
   in with the email and unique password supplied by the owner.
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
- [ ] Keep email/password authentication enabled and configure a strong password
      policy.
- [ ] Set conservative Auth rate limits and monitor usage.
- [ ] Add the project URL and publishable key to `js/app-config.js` and enable
      Supabase.
- [ ] Enable `accessRequest` and add the public owner name visitors should see.
- [ ] Optionally add a public contact email for a clickable `mailto:` link. The
      address will be visible in the deployed page source.
- [ ] Review each request; an institutional address is an eligibility signal,
      not proof that the user is harmless.
- [ ] Create approved, auto-confirmed users with unique generated passwords from
      **Authentication → Users**.
- [ ] Delete a user's Auth record to revoke access; the database foreign key
      removes that user's state row.
- [ ] Test isolation with two approved accounts before wider sharing.

### Security boundaries

- The publishable key is public and never grants administrative access.
- RLS and explicit table grants isolate each authenticated user's row.
- JSON shape and size checks limit accidental or malicious row growth.
- The request-access email link does not grant access; only manual creation of
  a confirmed Supabase Auth user does.
- The owner remains responsible for approvals, authentication email, quotas,
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
- [x] Restore explicit 24-hour temperature bounds instead of suggested bounds.
- [x] Replace OTP with manually provisioned email/password authentication.
- [x] Document that normal sign-in needs neither SMTP nor redirect URLs.
- [x] Create and configure the owner's dedicated shared Supabase project.
- [x] Test password sign-in as the owner.
- [ ] Test password sign-in as a separate approved user.
- [x] Add the GitHub Pages deployment workflow and hosting instructions.
- [x] Publish the GitHub Pages site and enforce HTTPS at the Cloudflare edge.
- [x] Add the browser customization panel and sync its sanitized preferences.
- [ ] Consider inline editing for suitable fields such as the countdown timer
      only after the panel workflow is stable.
- [x] Reorganize the usage docs around hosting, customization, and storage as
      independent decisions.
- [x] Expand Export and Import to cover writing, habit state, bookmark counts,
      and browser customization while retaining writing-only import support.
- [x] Re-run syntax, DOM-ID, local-mode, feature-gating, and privacy checks.
- [x] Perform connected-browser visual and interaction QA at desktop and phone
      widths, including customization save, reload, and reset.
- [ ] Test a live Supabase project with two approved users.

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
- The public HTTP URL permanently redirects to HTTPS through Cloudflare; the
  HTTPS page returns successfully with a valid certificate.
- The customization panel passes desktop and 390-by-844 phone visual review.
  Local save/reload/reset works from a temporary HTTP origin, and the page plus
  panel load successfully from a direct `file://` path.
- Direct-file testing confirmed Safari can reuse local-storage keys across
  local HTML files; README and CUSTOMIZATION now warn users who need isolated
  copies to use distinct HTTP or hosted origins.
- Full dashboard backups use an explicit format and version, preserve all four
  persisted state areas, sanitize imported customization, and still recognize
  the earlier date-keyed writing-only format. Runtime harnesses cover full and
  legacy format detection plus full-state restoration.

Still requires an external account or service:

- Live customization sync testing across two browsers for one account.
- Password sign-in and row-isolation testing with a second approved user.

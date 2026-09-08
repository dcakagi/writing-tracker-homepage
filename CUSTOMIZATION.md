# Customization Guide

The homepage has two configuration layers:

1. `js/app-config.js` supplies the site's durable defaults.
2. **Customize** saves a personal override in the current browser. If that user
   is signed in, the override is also stored under `user_state.preferences` in
   Supabase.

A browser override wins over the file. Use **Reset to site defaults** in the
panel to remove it; tracker history is not deleted. This distinction matters
when you edit `app-config.js` but an older browser customization is still
active.

## Customize in the browser

Select **Customize** in the page header. The panel can edit:

- Site title and favicon
- Section and dashboard-widget visibility and order, including the to-do list
- Timer label and date
- Dashboard-backup reminder interval
- Weather location, coordinates, and units
- Quotes
- Bookmarks and their order

Select **Save and reload** to apply the changes. With no signed-in account, the
settings stay only in this browser profile and at this exact page origin. With
an active Supabase session, they are included in that account's next sync.

The panel does not edit `supabase` or `accessRequest`. Those are deployment
owner settings and remain in `app-config.js`.

Browser customization is included in the full dashboard backup. For public or
shared durable defaults in a clone or fork, make the same settings in
`js/app-config.js` and commit that file.

## Customize the source file

`js/app-config.js` is a regular JavaScript file so the site can still be opened
directly from disk without a build step or YAML parser. After making a change,
save the file and refresh `index.html` in your browser. If an older browser
override hides the change, reset the Customize panel.

If a value is invalid or an item name is misspelled, check the browser console
and compare your configuration with the example below.

## Configuration example

Use the configuration already included in the repository as your starting
point. Its overall shape is:

```js
window.APP_CONFIG = {
  site: {
    title: "My Homepage",
    favicon: "https://emojiapi.dev/api/v1/rocket/64.png",
  },

  sectionOrder: ["writing", "reading", "bookmarks", "dashboard"],

  dashboardWidgetOrder: [
    "timer",
    "weekly-weather",
    "quote",
    "hourly-weather",
    "habit",
    "todo",
  ],

  features: {
    dashboard: true,
    writing: true,
    reading: true,
    bookmarks: true,
    timer: true,
    weeklyWeather: true,
    quote: true,
    hourlyWeather: true,
    habit: true,
    todo: true,
  },

  timer: {
    label: "Time since I started",
    start: "2026-01-01T09:00:00",
  },

  writing: {
    reminderInterval: 7,
  },

  weather: {
    name: "Provo",
    latitude: 40.2335,
    longitude: -111.667,
    temperatureUnit: "fahrenheit",
    windspeedUnit: "mph",
  },

  quotes: [
    { text: "Make time for the work that matters.", author: "" },
    { text: "Small steps still move you forward.", author: "Unknown" },
  ],

  bookmarks: [
    {
      id: "mail",
      label: "Email",
      url: "https://mail.google.com/",
      icon: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
    },
    {
      id: "calendar",
      label: "Calendar",
      url: "https://calendar.google.com/",
      icon: "https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico",
    },
  ],

  accessRequest: {
    enabled: true,
    ownerName: "Your Name",
    email: "",
    subject: "Homepage sync access request",
  },

  supabase: {
    enabled: false,
    url: "",
    publishableKey: "",
  },
};
```

The checked-in file defines the public defaults if its exact property names
differ from this overview after the project evolves.

## Site metadata

Use `site.title` for the browser-tab title and `site.favicon` for the favicon.
The favicon can be a URL or a path to an image committed to the repository.

Do not use a private image URL that contains an access token or signed query
string.

## Reorder the main sections

`sectionOrder` controls the page's top-level groups:

```js
sectionOrder: ["writing", "reading", "bookmarks", "dashboard"],
```

Move an identifier earlier or later in the array to move that section. Keep
each enabled section no more than once. To hide a section, set its matching
option in `features` to `false` instead of deleting its configuration.

## Reorder dashboard widgets

`dashboardWidgetOrder` works the same way for the widgets inside the dashboard
group:

```js
dashboardWidgetOrder: [
  "quote",
  "timer",
  "todo",
  "habit",
  "weekly-weather",
  "hourly-weather",
],
```

Use the widget identifiers from the included configuration. A typo will not
create a new widget.

## Enable or hide features

Set a value in `features` to `true` to show that feature or `false` to hide it:

```js
features: {
  dashboard: true,
  writing: true,
  reading: true,
  bookmarks: true,
  timer: false,
  weeklyWeather: true,
  quote: true,
  hourlyWeather: false,
  habit: true,
  todo: true,
},
```

Hiding a feature does not necessarily erase data that it previously saved in
local storage. Cloud sync is controlled separately by `supabase.enabled`.

## The to-do list widget

The to-do widget is a dashboard widget with the identifier `todo` and the
feature flag `todo`. Its contents are personal data rather than configuration,
so items are edited on the page instead of in `js/app-config.js`.

Each item has:

- A title and an optional target date. A target date in the past is labelled
  **Overdue** until the item is finished.
- A status of **Not started**, **In progress**, or **Finished**. Choosing
  **Finished** stamps the completion date and opens the item so a closing note
  can be written straight away.
- **Working notes** for where the item stands, and **post-completion notes** for
  the outcome. Select an item's title, or the chevron, to show or hide both.

The arrows reorder items, the filter chips narrow the list by status, and
**Clear finished** removes every finished item at once. Removing an item also
removes its notes, so both actions ask for confirmation first.

The list holds up to 100 items. Titles are capped at 200 characters and each
note field at 2000 characters.

To-do items are saved with the rest of your tracker data: in this browser by
default, and in `user_state.todo_data` when you are signed in for cloud sync.
An existing Supabase project needs `supabase/user_state.sql` reapplied to add
the `todo_data` column. Until it is applied, the rest of your data keeps
syncing and the sync panel explains that the to-do list is staying local.

## Set the timer

Give the timer a label and an ISO-style date/time:

```js
timer: {
  label: "Time since the project began",
  start: "2026-01-01T09:00:00-07:00",
},
```

Including a timezone offset (such as `-07:00` or `Z`) makes the result
consistent across devices. Without one, browsers interpret the value in their
local timezone.

## Choose the backup reminder interval

`writing.reminderInterval` is the number of days between local dashboard-backup
reminders. The property keeps its original `writing` location for compatibility:

```js
writing: {
  reminderInterval: 14,
},
```

Use a positive number. Missing, zero, negative, or invalid values fall back to
seven days.

## Choose a weather location

Weather lookup uses coordinates rather than the display name:

```js
weather: {
  name: "Provo",
  latitude: 40.2335,
  longitude: -111.667,
  temperatureUnit: "fahrenheit",
  windspeedUnit: "mph",
},
```

`name` is the label shown on the page. Use `fahrenheit` or `celsius` for
`temperatureUnit`, and a unit accepted by the included weather service for
`windspeedUnit` (the default is `mph`). Coordinates reveal an approximate
location, so use a nearby city rather than your home address if the repository
or hosted page will be public.

## Add quotes

Quotes are objects with `text` and `author` fields:

```js
quotes: [
  { text: "Make time for the work that matters.", author: "" },
  { text: "Make the next small thing easier.", author: "" },
],
```

Keep quotation marks outside the `text` value unless they are part of the
quote. Use an empty author if you do not want attribution displayed. Verify the
wording and attribution before sharing quotations publicly.

## Add bookmarks

Each bookmark needs a stable, unique `id`, a display `label`, and a `url`. The
`icon` is optional if the included configuration permits an empty value.

```js
bookmarks: [
  {
    id: "docs",
    label: "Docs",
    url: "https://example.com/docs",
    icon: "assets/docs-icon.png",
  },
],
```

Use short IDs containing letters, numbers, dashes, or underscores. Do not
change an ID casually: bookmark counters may use it to associate saved data
with that bookmark.

Any bookmark included in a public repository is public. Avoid private document
URLs, invitation links, signed URLs, or URLs containing tokens. A normal link
to a service's sign-in page is safer than a link to a private document.

For local icons, add the file to the repository and use a relative path such as
`assets/docs-icon.png`. Remote icons tell the icon host that the page was
loaded.

## Data, backup, and reset expectations

With sync disabled or while signed out, tracker data and browser customization
are stored only in the current browser profile. They are not written into
`js/app-config.js` and are not committed to Git.

- Use **Export** to download a versioned JSON backup of writing history and
  session notes, writing goals, papers and their notes, habit data, to-do items
  and their notes, bookmark counters, and browser
  customization.
- Use **Import** to replace those saved areas from a full backup. The page asks
  for confirmation first and reloads after a successful import.
- Older writing-only exports remain supported and replace only writing history.
- Keep a recent export before clearing browsing data or moving computers.
- Treat exports as private: they can contain tracker history, quotes, and
  bookmark URLs.
- Import only a backup you trust. Importing may replace current tracker data.
- Copy settings into `js/app-config.js` when you need a durable configuration
  shared as the default for every visitor to a clone or fork.

Backups do not include passwords, Auth sessions, deployment-owner Supabase or
access-request settings, or a writing timer that is actively running.

Different browsers and browser profiles have separate local storage. Hosted
origins normally do as well. Local `file://` storage is browser-specific;
Safari can reuse storage keys across different local HTML files. If you keep
multiple homepage copies and need strict isolation, use different hosted or
local HTTP origins instead of assuming each file gets a separate store.

## Optional Supabase sync

Supabase is disabled until all of the following are true:

1. You create a Supabase project that you control.
2. You apply the provided database migration and row-level security policies.
3. You enable the configured authentication flow.
4. You add that project's URL and **publishable** key to the configuration.
5. You set `supabase.enabled` to `true`.

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the full walkthrough. The
publishable key is designed for frontend use, but it does not make a project
abuse-proof; authentication settings, row-level security, rate limits, and
project usage remain the project owner's responsibility.

Never add a secret key, service-role key, database password, access token, or
email-provider credential to this repository.

### Offer approved-user access to a shared project

A shared deployment can show an email link for people who need access:

```js
accessRequest: {
  enabled: true,
  ownerName: "Your Name",
  email: "public-contact@example.com",
  subject: "Homepage sync access request",
},
```

In local-only mode, the header shows only the **Export** and **Import** actions.
Clicking the surrounding pill opens the optional sync information, including
the request-access path and a link to `SUPABASE_SETUP.md` for people who prefer
their own project. Clicking Export or Import performs that action without
opening the dropdown.

After Supabase is configured, the header pill changes to the Sync/status
control used by the original homepage. Export and Import move into that
control's dropdown alongside the sign-in or account controls. Once signed in,
browser customization is stored inside the existing bounded `preferences`
object; no additional database migration is required.

If `email` is blank or invalid, the page displays `ownerName` as plain text,
for example, **Email Your Name to request access**. This is useful when people
already know how to contact you and you do not want to publish an address. If
`email` is valid, the same message becomes a clickable email link.

Both `ownerName` and any configured email address are public in the deployed
source and repository if committed. The email link does not create an account;
the owner must review the request and manually create a confirmed Auth user.
Keep server-side public signup disabled.

The included client signs in with email and password. Create each user with a
different generated password and **Auto Confirm User** enabled. Normal sign-in
does not require SMTP or a redirect URL; without SMTP, the owner must handle
forgotten passwords through a trusted server-side admin process.

## Before publishing

Review the entire repository, not just the configuration file. In particular,
check for:

- Names and email addresses
- Private bookmarks or document IDs
- Precise home or workplace coordinates
- API keys other than an intentionally public Supabase publishable key
- Passwords, tokens, signed URLs, and service-role keys
- Personal data inside exported JSON files

Commit only settings you are comfortable making public.

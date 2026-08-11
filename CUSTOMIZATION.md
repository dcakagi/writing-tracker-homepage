# Customization Guide

The homepage is configured in `js/app-config.js`. It is a regular JavaScript
file so the site can still be opened directly from disk without a build step or
YAML parser.

After making a change, save the file and refresh `index.html` in your browser.
If a value is invalid or an item name is misspelled, check the browser console
for an error and compare your configuration with the example below.

## Configuration example

Use the configuration already included in the repository as your starting
point. Its overall shape is:

```js
window.APP_CONFIG = {
  site: {
    title: "My Homepage",
    favicon: "https://emojiapi.dev/api/v1/rocket/64.png",
  },

  sectionOrder: ["writing", "bookmarks", "dashboard"],

  dashboardWidgetOrder: [
    "timer",
    "weekly-weather",
    "quote",
    "hourly-weather",
    "habit",
  ],

  features: {
    dashboard: true,
    writing: true,
    bookmarks: true,
    timer: true,
    weeklyWeather: true,
    quote: true,
    hourlyWeather: true,
    habit: true,
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

The checked-in file is the source of truth if its exact property names differ
from this overview after the project evolves.

## Site metadata

Use `site.title` for the browser-tab title and `site.favicon` for the favicon.
The favicon can be a URL or a path to an image committed to the repository.

Do not use a private image URL that contains an access token or signed query
string.

## Reorder the main sections

`sectionOrder` controls the page's top-level groups:

```js
sectionOrder: ["writing", "bookmarks", "dashboard"],
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
  bookmarks: true,
  timer: false,
  weeklyWeather: true,
  quote: true,
  hourlyWeather: false,
  habit: true,
},
```

Hiding a feature does not necessarily erase data that it previously saved in
local storage. Cloud sync is controlled separately by `supabase.enabled`.

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

`writing.reminderInterval` is the number of days between local writing-data
backup reminders:

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

With sync disabled, tracker data is stored only in the current browser profile.
It is not written into `js/app-config.js` and is not committed to Git. The
current export/import controls cover writing history; other widget data stored
locally is not included in that file.

- Use **Export backup** to download a JSON backup of writing history.
- Use **Import** to restore a previously exported file.
- Keep a recent export before clearing browsing data or moving computers.
- Treat exports as private: they can contain your tracker history.
- Import only a backup you trust. Importing may replace current tracker data.

Different browsers and browser profiles have separate local storage. Depending
on browser behavior, opening different copies or URLs of the page can also
create separate storage contexts.

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

### Offer invite-only access to a shared project

A shared deployment can show an email link for people who need an invitation:

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
control's dropdown alongside the sign-in or account controls.

If `email` is blank or invalid, the page displays `ownerName` as plain text,
for example, **Email Your Name to request access**. This is useful when people
already know how to contact you and you do not want to publish an address. If
`email` is valid, the same message becomes a clickable email link.

Both `ownerName` and any configured email address are public in the deployed
source and repository if committed. The email link does not create an account;
the owner must review the request and send an invitation from Supabase Auth.
Keep server-side public signup disabled.

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

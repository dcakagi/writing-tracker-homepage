# Personal Writing Tracker Homepage

A configurable, no-build dashboard for bookmarks, writing progress, habits,
weather, quotes, and a personal countdown/count-up timer. It works locally by
default: no account, database, or deployment is required.

## Quick start

1. Download or clone this repository.
2. Open `index.html` in a browser (double-click it or put the full file path in your browser).
3. Edit `js/app-config.js` to make the page yours, then refresh the browser.

I recommend setting the file location as your browser homepage. That way you
see it whenever you open a new browser window or tab. You can alternatively host it somewhere (see section Sharing your version).

> [!NOTE]  
> On Safari you are only allowed to set a file as your homepage for new tabs

Your tracker data is saved in that browser's local storage. The page does not
need Supabase unless you choose to enable cloud sync.

> [!IMPORTANT]
> Local storage is not a durable backup. Clearing site data, changing browsers,
> switching devices, or some browser cleanup tools can remove it. Use **Export
> backup** regularly for your writing history, and keep the downloaded JSON file
> somewhere safe. Use **Import** to restore it. Other locally stored widget data
> is not currently included in that export.

## Customize it

Most changes belong in `js/app-config.js`. It controls:

- Site title and favicon
- The order of the main sections
- The order of widgets in the dashboard group
- Which features are visible
- Timer text and date
- Writing backup reminder interval
- Weather location and units
- Quotes
- Bookmarks
- Optional Supabase settings

See [CUSTOMIZATION.md](CUSTOMIZATION.md) for the complete configuration guide
and examples.

## Optional cloud sync

Local-only mode is the default and is the right choice for most people. If you
want your tracker data to follow you across browsers or devices, you have two
options:

- Click the background of the **Export / Import** pill to open the optional
  sync information, email the named owner, and wait for them to approve and add
  your address. The
  owner may intentionally list only a name, so you may need to use contact
  information you already have.
- Create a Supabase project you control and follow
  [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

Use only a Supabase project you control or a shared project whose owner has
explicitly approved you. Never put a Supabase secret or service-role key in
frontend code.

Owners who offer shared sync must keep public signup disabled, review requests,
create approved Auth users manually, and monitor usage. `accessRequest.ownerName` can
show a name without publishing an address; setting `accessRequest.email` adds a
clickable mail link and makes that address visible in the page source.

When Supabase is not configured, the header stays focused on **Export** and
**Import**. Once it is configured, that pill becomes the Sync/status control;
Export and Import remain available inside its dropdown.

## Privacy and security

- Configuration in `js/app-config.js` is public to anyone who can view the
  deployed page or repository. Do not put passwords, access tokens, private
  document links, or other secrets there.
- In local-only mode, tracker data stays in the current browser's local storage.
- The page still loads third-party browser resources and weather data over the
  internet. Those services can receive ordinary request information such as
  your IP address.
- Supabase sync is opt-in. Its security depends on correctly configuring Auth
  and row-level security using the supplied setup guide and SQL migration.
- Only use a public/publishable Supabase key in the browser. Secret and
  service-role keys belong on a trusted server and are not needed by this
  template.

Before publishing your customized version, search the repository for private
names, email addresses, URLs, coordinates, credentials, and identifiers.

## Project structure

```text
.
├── index.html             # Page structure
├── css/
│   └── styles.css         # Page styling
├── js/
│   ├── app-config.js      # Your main configuration file
│   └── ...                # Widgets, storage, and page behavior
├── supabase/
│   └── user_state.sql     # Optional cloud-sync database setup
├── CUSTOMIZATION.md       # Configuration reference
└── SUPABASE_SETUP.md      # Optional Supabase walkthrough
```

## Sharing your version

You can publish the static files with any static host. Keep Supabase disabled
unless you have configured your own project. Before committing, review
`js/app-config.js` and replace anything you would not want visible in a public
repository.

## Feature requests and issues

Feel free to open pull requests for changes or upgrades you have made. If you come across an issue,
you can also submit it as a Github issue. Feel free to also request features or share ideas with me!

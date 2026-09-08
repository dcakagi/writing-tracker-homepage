/*
 * Homepage configuration
 *
 * This is the only file most people need to edit. Everything works locally
 * with the defaults below. See CUSTOMIZATION.md for examples and valid IDs.
 */
window.APP_CONFIG = {
  site: {
    title: "My Homepage",
    favicon: "https://emojiapi.dev/api/v1/rocket/64.png"
  },

  sectionOrder: ["writing", "reading", "bookmarks", "dashboard"],
  dashboardWidgetOrder: [
    "timer",
    "weekly-weather",
    "quote",
    "hourly-weather",
    "habit",
    "todo"
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
    todo: true
  },

  timer: {
    // Can be used as a count down or count up timer. If you want a count up timer, set the start date to a date in the past.
    start: "2025-07-01T00:00:00",
    label: "July 1, 2025"
  },

  writing: {
    // Number of days between local backup reminders.
    reminderInterval: 14
  },

  analytics: {
    // Optional GA4 measurement ID (example: G-ABC123DEF4).
    // During GitHub Pages deploy, this placeholder is replaced by vars.PUBLIC_GA_ID.
    // Leave as-is in git so forks do not inherit your analytics property.
    measurementId: "__PUBLIC_GA_ID__"
  },

  weather: {
    name: "Provo",
    latitude: 40.2335,
    longitude: -111.667,
    temperatureUnit: "fahrenheit",
    windspeedUnit: "mph",
    timezone: 'auto'
  },

  quotes: [
    {
      text: "The only way to do great work is to love what you do.",
      author: "Steve Jobs"
    },
    {
      text: "The future belongs to those who believe in the beauty of their dreams.",
      author: "Eleanor Roosevelt"
    },
    {
      text: "But, above all, BYU is and ever has been built of dreams and ideals. Our house of learning is also a house of dreams.",
      author: "John S. Tanner"
    },
    {
      text: "What would you do if you weren't afraid?",
      author: "Sheryl Sandberg"
    },
    {
      text: "Am I doing the uncomfortable?",
      author: ""
    },
    {
      text: "Have I done any good in the world today?",
      author: ""
    },
    {
      text: "All my life has been spent in service for others and I am not sorry for it, for after all we get the most pleasure in doing good.",
      author: "Henry Moon"
    }
  ],

  // Optional owner name shown to people who need sync access.
  // Add email only if you want to publish a clickable contact address.
  accessRequest: {
    enabled: false,
    ownerName: "David Akagi",
    email: "",
    subject: "Homepage sync access request"
  },

  bookmarks: [
    {
      id: "email",
      label: "Email",
      url: "https://mail.google.com",
      icon: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico"
    },
    {
      id: "calendar",
      label: "Calendar",
      url: "https://calendar.google.com",
      icon: "https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico"
    },
    {
      id: "drive",
      label: "Drive",
      url: "https://drive.google.com",
      icon: "https://ssl.gstatic.com/docs/doclist/images/infinite_arrow_favicon_5.ico"
    },
    {
      id: "github",
      label: "GitHub",
      url: "https://github.com",
      icon: "https://github.com/favicon.ico"
    },
    {
      id: "notion",
      label: "Notion",
      url: "https://www.notion.so",
      icon: "https://www.notion.so/images/favicon.ico"
    },
    {
      id: "byu",
      label: "My BYU",
      url: "https://my.byu.edu",
      icon: "https://byu.edu/favicon.ico"
    },
    {
      id: "byu-class",
      label: "BYU Class",
      url: "https://y.byu.edu/ry/ae/prod/class_schedule/cgi/instructorSchedule.cgi",
      icon: "https://byu.edu/favicon.ico"
    }
  ],

  // Optional cloud sync. Leave disabled for a completely local homepage.
  // Use your own Supabase project; see SUPABASE_SETUP.md.
  supabase: {
    enabled: true,
    url: "https://gqcpjooezdnekczguwxa.supabase.co",
    publishableKey: "sb_publishable_v1LFuC2QY_Iij-B0_UMveg_pg8hKhFZ"
  }
};

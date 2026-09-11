#!/usr/bin/env python3
"""Capture github.com/trending into a static JSON file for the homepage.

GitHub publishes no trending API and github.com/trending sends no CORS header,
so the page cannot read it directly. The Pages workflow runs this at deploy
time and the browser reads the result from our own origin instead.

Writes data/github-trending.json. A scrape failure is reported as a warning
and leaves the affected period empty; it never fails the deploy, because a
markup change on GitHub's side should not block publishing the site.
"""

import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

PERIODS = ("daily", "weekly", "monthly")
OUTPUT = os.path.join("data", "github-trending.json")
LIMIT = 25
TIMEOUT = 30
USER_AGENT = "writing-tracker-homepage trending fetcher (+https://github.com)"


def warn(message):
    # Surfaces in the Actions log without failing the job.
    print(f"::warning::{message}" if os.environ.get("GITHUB_ACTIONS") else f"warning: {message}",
          file=sys.stderr)


def fetch(period):
    request = urllib.request.Request(
        f"https://github.com/trending?since={period}",
        headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", "replace")


def strip_tags(fragment):
    return html.unescape(re.sub(r"<[^>]+>", " ", fragment))


def collapse(value):
    return " ".join(value.split())


def count_after(article, kind):
    """Read the number inside the stargazers/forks link.

    The count follows an inline SVG, and GitHub rotates the utility classes on
    these elements, so match the link by href and read its text.
    """
    match = re.search(r'href="/[^"]+/' + kind + r'"[^>]*>(.*?)</a>', article, re.S)
    if not match:
        return 0
    numbers = re.findall(r"[\d,]+", strip_tags(match.group(1)))
    numbers = [value for value in numbers if value.strip(",")]
    return int(numbers[-1].replace(",", "")) if numbers else 0


def parse(page):
    repositories = []
    for article in re.findall(r'<article class="Box-row">(.*?)</article>', page, re.S):
        heading = re.search(r'<h2[^>]*>\s*<a[^>]*href="/([^"]+)"', article)
        if not heading:
            continue
        full_name = heading.group(1).strip("/")
        if full_name.count("/") != 1:
            continue

        description = re.search(
            r'<p class="col-9 color-fg-muted my-1[^"]*">(.*?)</p>', article, re.S)
        language = re.search(r'<span itemprop="programmingLanguage">([^<]+)</span>', article)
        delta = re.search(r"([\d,]+)\s+stars\s+(?:today|this week|this month)", strip_tags(article))

        repositories.append({
            "fullName": full_name,
            "description": collapse(strip_tags(description.group(1)))[:300] if description else "",
            "language": collapse(language.group(1))[:40] if language else "",
            "stars": count_after(article, "stargazers"),
            "forks": count_after(article, "forks"),
            "delta": int(delta.group(1).replace(",", "")) if delta else 0
        })
    return repositories[:LIMIT]


def main():
    periods = {}
    failures = []

    for period in PERIODS:
        try:
            repositories = parse(fetch(period))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as error:
            warn(f"Could not fetch the {period} trending page: {error}")
            failures.append(period)
            continue

        if not repositories:
            warn(f"The {period} trending page returned no repositories; "
                 "GitHub's markup may have changed.")
            failures.append(period)
            continue

        periods[period] = repositories
        print(f"{period}: {len(repositories)} repositories")

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://github.com/trending",
        "periods": periods
    }

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print(f"Wrote {OUTPUT} ({len(periods)} of {len(PERIODS)} periods).")
    if failures:
        warn(f"Trending periods unavailable: {', '.join(failures)}. "
             "The page falls back to a message for those tabs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

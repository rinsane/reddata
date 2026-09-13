# Reddata

See, filter, export and share the subreddits you have joined. Everything runs in
your browser — no account, no server-side storage, nothing uploaded.

Live: <https://reddata.pages.dev>

## Why it works the way it does

Reddit closed self-service API keys in November 2025 under its Responsible
Builder Policy. New OAuth clients now need manual approval, so a normal "log in
with Reddit" button is not available to build against yet.

Reddata works around that with a bookmarklet. Only a `reddit.com` tab can read
your Reddit session, so the reading happens there and the result comes back as a
file you drop into the site. No key involved.

## Pages

| Path    | What it does |
| ------- | ------------ |
| `/`     | Landing. Also hides the OAuth form for anyone holding pre-cutoff credentials. |
| `/grab` | Bookmarklet, plus the viewer: stats, filter, sort, mature toggle, CSV export, share link. |
| `/join` | Opens a share link, lets you pick communities, and builds a bookmarklet that subscribes you. |

## Using it

1. Open `/grab` and drag **Grab my subs** to your bookmarks bar.
2. Go to reddit.com, signed in, and click the bookmark. It saves `reddit-subs.json`.
3. Drop that file back on `/grab`.

Both bookmarklets refuse to run anywhere but `reddit.com` and its subdomains. That
is a safety guard, not just a convenience: token discovery scans the page for an
`accessToken`, and on some other site that could match an unrelated service's
token. The check is `/(^|\.)reddit\.com$/` against the hostname, so
`reddit.com.example.com` does not pass.

On reddit.com they look for a session two ways: the bearer token the web app keeps
on the page, then `api/me.json` plus a modhash over your cookies. The alert says
which mode ran (`token` or `cookie`), which is the first thing to check when
something fails.

### Sharing

**Share link** encodes the currently visible list into the URL fragment — gzip,
then base64url. A fragment is never sent to a server, so the list is not stored
anywhere and building a link makes no request at all.

Two shapes, chosen by the **Include details** toggle:

| | Carries | ~250 communities |
| --- | --- | --- |
| Detailed (default) | name, members, 18+, age, description | ~21 KB |
| Compact | names only | ~2.4 KB |

A detailed link gives the recipient the same viewer the sender has — stats,
search, sort, cards, mature and member filters — because both pages render from
`catalog.js`. A compact link hides the controls that need that data rather than
showing dead inputs. Records are tab separated and names are comma separated, so
a link decodes by looking for a tab; links sent before details existed still work.

Copy the whole URL; some chat apps trim the `#`, and a detailed link is long
enough that this matters.

### Joining

`/join` reads the list, lets the recipient select, and bakes the selection into a
bookmarklet that calls `/api/subscribe` in batches of 50 with a 2 second pause.

This drives reddit.com outside the sanctioned API, which is against the letter of
Reddit's terms and carries some account risk. `/join` says so on the page. Do not
remove that warning. The bookmarklet only ever subscribes.

Both bookmarklets need the modern reddit.com front end. old.reddit.com will report
no session found.

## OAuth path

Kept for when API access is approved. `functions/api/oauth.js` exchanges codes and
refresh tokens; `functions/api/reddit/[[path]].js` proxies a GET allowlist
(`api/v1/me`, `subreddits/mine/{subscriber,moderator,contributor}`). Both reject
cross-origin callers via `functions/_shared.js`. `public/_headers` carries the CSP.

Today the form asks each visitor for their own client id and secret, which no new
user can obtain. When approval lands, replace it with one server-side app: put the
credentials in Pages environment variables and ship a single "Log in with Reddit"
button, so no secret ever reaches a browser.

## Local

```bash
npm install
npm run dev          # http://localhost:8788
```

## Deploy

```bash
npx wrangler pages deploy public --project-name=reddata --branch=main
```

## Layout

```
public/
  index.html  grab.html  join.html
  app.js            OAuth flow for the landing page
  grab.js           grab bookmarklet + viewer
  join.js           join bookmarklet + picker
  catalog.js        filtering, sorting, stats, cards, dual slider (both pages)
  share.js          list <-> URL fragment
  reddit-auth.js    session discovery shared by both bookmarklets
  toast.js          transient messages
  styles.css  favicon.svg  _headers
functions/
  _shared.js  api/oauth.js  api/reddit/[[path]].js
```

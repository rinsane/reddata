# Reddata

Personal Reddit profile and joined communities. You bring your own Reddit app credentials; nothing is stored on a server.

## Reddit credentials

Reddit does not give a single API key.

1. Sign in to Reddit and open [prefs/apps](https://www.reddit.com/prefs/apps).
2. Create an app. Type: **web app**.
3. Redirect URI must match the site origin exactly, including the trailing slash. Example: `https://reddata.pages.dev/`
4. Client ID is the string under the app name. Secret is labeled `secret`.
5. After you authorize, Reddata reads `GET /api/v1/me` for your account id (`t2_…`) and `GET /subreddits/mine/subscriber` for joined communities.

Credentials never leave the browser except as a same-origin POST to the token Function, which forwards them to Reddit and does not store them. The Reddit proxy only allows GET on `/api/v1/me` and `/subreddits/mine/{subscriber,moderator,contributor}`.

## Local

```bash
npm install
npm run dev
```

Add the printed origin (usually `http://127.0.0.1:8788/`) as a redirect URI on the Reddit app.

## Cloudflare Pages

1. Push this repo to GitHub.
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Select `reddata`.
4. Framework preset: None. Build command: empty. Output directory: `public`.
5. After the first deploy, copy the `*.pages.dev` URL and add `https://<project>.pages.dev/` as the Reddit redirect URI.

Account ID (for Wrangler or GitHub Actions): Dashboard → any account page; the 32-character id is in the right sidebar and in the URL.

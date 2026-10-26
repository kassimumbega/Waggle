# Waggle on Vercel

Vercel hosts the page and the API. A free Neon Postgres database stores accounts and each user's data.

## 1. Create the database (free)

1. Go to https://neon.tech and sign up.
2. Create a project. Copy the connection string. It looks like `postgres://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`.
   The tables are created automatically the first time the app runs.

## 2. Put the project on GitHub

1. Create a new repository on GitHub (private is fine).
2. Upload the contents of this folder (`index.html`, `api/`, `lib/`, `package.json`, `vercel.json`, `README.md`).

## 3. Deploy on Vercel (free)

1. Go to https://vercel.com, sign up with GitHub, and click **Add New → Project**.
2. Import the repository. Leave the build settings as they are (no build command needed).
3. Open **Environment Variables** and add:
   - Name: `DATABASE_URL`
   - Value: the Neon connection string from step 1
4. Click **Deploy**. Vercel gives you an address like `waggle-xyz.vercel.app`.

## 4. Updating the app later

Change the files in GitHub (or upload the new versions). Vercel redeploys automatically.

## 5. Your own domain (later)

In the Vercel project, open **Settings → Domains**, add your domain, and follow the DNS instructions. Vercel sets up HTTPS for it.

## Important limits

- **Vercel's Hobby (free) plan is for personal, non-commercial use.** Once Waggle takes real business payments or is run as a company, move to the Pro plan (paid) to stay within the terms.
- Neon's free plan has limited storage and pauses when idle, so the first request after a quiet period can be slow.
- Team invitations, the shared marketplace, real payments and email password reset are not built yet (see the main README).

## Testing locally (optional)

`npm install`, then set `DATABASE_URL` to a Postgres database and run the tests in `tests/e2e.js` as described in the main README.

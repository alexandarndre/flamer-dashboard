# Publishing Flamer: step-by-step handoff

This guide is for whoever pushes the project to GitHub and connects the hosting. It takes about 30 minutes. After the
first push, everything below **runs automatically on every commit**: checks, tests, both deployments, and smoke tests
against the live sites.

> **Do not commit the interview transcript.** The folder contains a `lockedin-*.txt` file. It is listed in `.gitignore`,
> but check `git status` before the first commit (step 2) and make sure it is not there.

## 0. What you need

- A **GitHub** account (the repository must be public for free GitHub Pages).
- A **Vercel** account (the free Hobby plan is enough). Sign in to Vercel with GitHub, so it can see the repository.
- On your machine: **Node.js 22.12 or newer** and **any `yarn`** (`npm i -g yarn` if missing). The repository carries
  its own Yarn 4, so the version on your machine does not matter.
- Optional: **Docker** (to run the full stack locally) and **uv** (for the Python backend).

## 1. Check the project locally (5 min)

```bash
cd Flamer-Dashboard
yarn install
yarn format:check && yarn lint && yarn typecheck && yarn test
yarn dev                      # open http://localhost:5173 and click around, then Ctrl+C
```

Everything must pass. If `yarn install` fails with **YN0016 “quarantined”**, a dependency was published less than a day
ago and Yarn is refusing it on purpose (supply-chain safety). Wait a day, or see _Troubleshooting_.

## 2. Create the GitHub repository and push (5 min)

1. On GitHub: **New repository** → name it (e.g. `flamer-dashboard`) → **Public** → do **not** add a README, licence or
   `.gitignore` (the project has them).
2. In the project folder:

```bash
git init -b main
git add .
git status            # the lockedin-*.txt transcript must NOT be listed; node_modules and dist must not be either
git commit -m "feat: crawl operations dashboard"
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

## 3. Turn on GitHub Pages (2 min)

1. Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repository → **Actions** tab: the **Deploy to GitHub Pages** workflow may have failed on the first push because
   Pages was not enabled yet. Open it and press **Re-run all jobs**.
3. When it is green, the **deploy** job shows the site URL: `https://<your-user>.github.io/<repo>/`. The **smoke** job
   has already opened that URL in a real browser and checked the main flows.

On GitHub Pages there is no server: the API runs inside the visitor’s browser (a Service Worker with IndexedDB), so each
visitor has their own data.

## 4. Connect Vercel (10 min)

1. Vercel → **Add New… → Project → Import** the GitHub repository. Leave everything as detected (framework **Vite**;
   `vercel.json` sets the install and build commands). Press **Deploy**.
2. Add the database: project → **Storage → Create Database → Upstash for Redis** (free plan) → **Connect** it to the
   project for all environments. Vercel adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables automatically.
3. Project → **Deployments** → latest → **⋯ → Redeploy** (environment variables only apply to new deployments).
4. Open the production URL. The sidebar footer must say **Vercel Edge Function · Upstash Redis**. If it says
   _in-memory_, step 2 did not take effect: check the variables under **Settings → Environment Variables** and redeploy.
5. Let CI test preview deployments. Vercel protects preview URLs with a login by default, so the GitHub smoke test needs
   a key:
   - Vercel project → **Settings → Deployment Protection → Protection Bypass for Automation → Add secret** → copy it.
   - GitHub repository → **Settings → Secrets and variables → Actions → New repository secret** → name
     `VERCEL_AUTOMATION_BYPASS_SECRET`, paste the value.

From now on every pull request gets its own Vercel preview URL (a “review app”), posted on the PR, and the **Smoke-test
Vercel deployment** workflow tests it.

## 5. What now happens automatically

| When                        | What runs                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull request opened/updated | **CI**: formatting, lint, types, unit tests, three builds, browser tests, Python backend tests on Postgres, Docker build. Vercel **preview** + smoke test. |
| Push / merge to `main`      | **CI** again, **GitHub Pages** deploy + smoke test on the live site, Vercel **production** deploy + smoke test.                                            |
| Every week                  | **Dependabot** opens grouped update PRs (npm, Python, GitHub Actions, Docker), each going through the same checks.                                         |

Make `main` safe (optional, recommended): **Settings → Branches → Add rule** for `main` → require a pull request and
require the **CI** checks to pass.

## 6. Final checklist before sending the links

- [ ] Vercel production URL opens; footer says _Upstash Redis_; the **Demo** button shows the welcome dialog.
- [ ] GitHub Pages URL opens; footer says _Service Worker · IndexedDB_.
- [ ] Both URLs: start a crawl, set the demo clock to 60×, watch it finish; unblock something in _Needs attention_.
- [ ] `https://<vercel-url>/api/docs` shows the API reference.
- [ ] Actions tab: CI, Pages and Vercel smoke runs are green.
- [ ] Put both live URLs at the top of `README.md` (the _Live demo_ table) and commit.

Send HR: the GitHub repository URL, the Vercel URL (main demo) and the GitHub Pages URL, and point them to the README.

## 7. Running the whole stack with Docker (optional)

```bash
docker compose up --build                     # Node server + Redis, http://localhost:3000
docker compose --profile python up --build    # also the Python/FastAPI backend + Postgres, http://localhost:3001
docker compose --profile python down -v       # stop and delete the data
```

## Troubleshooting

| Problem                                                   | Fix                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `YN0016 … are quarantined` on `yarn install`/`yarn add`   | Yarn refuses packages younger than one day. Wait, or lower that package’s version floor in `package.json`. Don’t disable the gate.         |
| Pages workflow fails at _deploy_ with “not found”         | Pages source is not **GitHub Actions** yet (step 3.1). Fix it and re-run the workflow.                                                     |
| Pages site loads but shows only a spinner                 | Hard-refresh once; the Service Worker installs on the first visit. Check the browser console for errors.                                   |
| Vercel footer says _in-memory_ or the yellow banner shows | Upstash is not connected to this environment, or no redeploy happened after connecting (step 4).                                           |
| Vercel smoke test fails with 401/403                      | `VERCEL_AUTOMATION_BYPASS_SECRET` is missing or wrong (step 4.5).                                                                          |
| CI browser tests fail                                     | Download the `playwright-report` artifact from the failed run and open `index.html`: it has a trace for every failure.                     |
| Want to reset the shared demo data                        | Everyone has a private sandbox by default. To wipe everything, delete the `flamer:*` keys in the Upstash console; the API re-seeds itself. |

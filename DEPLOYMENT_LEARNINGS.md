# Full-Stack Deployment Learnings: NestJS + Railway + GitHub Pages

> **Project:** Simple Todo app — NestJS/Prisma backend on Railway, static HTML/JS/CSS frontend on GitHub Pages  
> **Date:** April 2026  
> **Status:** Successfully deployed ✅

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [Issues Encountered & Fixes](#2-issues-encountered--fixes)
3. [Key Concepts Learned](#3-key-concepts-learned)
4. [What Worked Well](#4-what-worked-well)
5. [AI Agent One-Shot Deployment Guide](#5-ai-agent-one-shot-deployment-guide)

---

## 1. Project Architecture

```
repo/
├── backend/          → Railway (NestJS + Prisma 5 + PostgreSQL)
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── auth/         (JWT login)
│       ├── todos/        (CRUD)
│       └── prisma/       (global PrismaService)
└── docs/             → GitHub Pages (HTML + CSS + JS)
    ├── index.html    (login page)
    ├── home.html     (todo list)
    └── style.css
```

**Auth flow:** Frontend → `POST /auth/login` → JWT stored in `localStorage` → attached as `Bearer` token on all subsequent requests.

---

## 2. Issues Encountered & Fixes

### Issue 1: Prisma Version Incompatibility (Prisma 7 Breaking Changes)

**What happened:**  
`npx prisma init` installed Prisma 7, which introduced major breaking changes:
- `datasource.url` is no longer allowed in `schema.prisma`
- A new `prisma.config.ts` file replaced the `.env`-based config
- The generator provider changed from `prisma-client-js` → `prisma-client`
- `PrismaClient` requires a database adapter instead of direct connection

**Fix:**  
Downgrade to Prisma 5 (stable, widely documented, Railway-compatible):
```bash
npm install @prisma/client@5 prisma@5 --save-dev
npm install @prisma/client@5 --save   # keep in runtime deps too
```
Delete the generated `prisma.config.ts` file — it's Prisma 7 only.

**Lesson:**  
Always check the Prisma version being installed. Prisma 7 is a complete paradigm shift. For Railway deployments in 2026, **Prisma 5** is the safe, stable choice until Prisma 7 docs and ecosystem fully mature.

---

### Issue 2: Railway Root Directory Not Set

**What happened:**  
The repo has both `backend/` and `docs/` folders at the root. Railway tried to build from the repo root where there is no `package.json`, causing the build to fail immediately.

**Error:**
```
Error: Cannot find module '/app/dist/main'
```
(Because nothing was ever compiled — build never ran.)

**Fix:**  
Railway dashboard → Service → **Settings** → **Source** → **Root Directory** → set to `backend`

**Lesson:**  
When your backend lives in a subdirectory, always set the Root Directory in Railway before doing anything else. This is step one.

---

### Issue 3: Nixpacks Not Running the Build

**What happened:**  
Even with root directory set, Railway's Nixpacks auto-detection was not running `npm run build`, so `dist/` was never created. Adding `nixpacks.toml` didn't help because Railway was using a cached old image.

**Fix:**  
Switched to a **Dockerfile** for full explicit control over the build process:
```dockerfile
FROM node:18-alpine
RUN apk add --no-cache openssl   # ← critical for Prisma
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY src ./src
COPY nest-cli.json tsconfig*.json ./
RUN npx prisma generate
RUN npx nest build
RUN npm prune --production
EXPOSE 3000
CMD ["node", "dist/main"]
```

**Lesson:**  
For NestJS on Railway, **use a Dockerfile** from the start. Nixpacks is convenient but unreliable for NestJS multi-step builds (generate → compile → prune). A Dockerfile eliminates all ambiguity.

---

### Issue 4: `dist/main.js` at Wrong Path (`dist/src/main.js` instead)

**What happened:**  
The compiled output landed at `dist/src/main.js` instead of `dist/main.js`. The start command `node dist/main` failed because `dist/main.js` didn't exist.

**Root cause:**  
`tsconfig.json` was missing `"rootDir": "./src"`. Without it, TypeScript treats the project root as the compile base, so `src/main.ts` → `dist/src/main.js`.

**Fix:**  
Add to `tsconfig.json`:
```json
"rootDir": "./src"
```

Also exclude `prisma/seed.ts` from the build in `tsconfig.build.json`:
```json
"exclude": ["node_modules", "test", "dist", "prisma", "**/*spec.ts"]
```

**Lesson:**  
Always set `rootDir` explicitly in NestJS TypeScript projects. The NestJS CLI scaffolds it without `rootDir` by default, which causes this exact issue on Railway.

---

### Issue 5: Stale `tsbuildinfo` Causing TypeScript to Skip Compilation

**What happened:**  
TypeScript's incremental compilation (`"incremental": true` in tsconfig) creates a `.tsbuildinfo` cache file. When `dist/` was deleted locally but `.tsbuildinfo` remained, TypeScript thought nothing had changed and emitted **zero files** while exiting with code 0 (no error!). The Docker image was built successfully but with an empty `dist/`.

**Fix:**  
- Delete the stale file: `rm tsconfig.build.tsbuildinfo`
- Add to `.gitignore` and `.dockerignore`:
  ```
  *.tsbuildinfo
  dist
  ```

**Lesson:**  
`*.tsbuildinfo` must **never** be committed or copied into Docker. Always add it to both `.gitignore` and `.dockerignore`. A silent zero-output build is one of the hardest bugs to spot.

---

### Issue 6: Missing OpenSSL on Alpine Linux (Prisma Query Engine)

**What happened:**  
Prisma's query engine (`libquery_engine-linux-musl.so.node`) requires OpenSSL 1.1, which is not included in the `node:18-alpine` base image.

**Error:**
```
Error loading shared library libssl.so.1.1: No such file or directory
(needed by /app/node_modules/.prisma/client/libquery_engine-linux-musl.so.node)
```

**Fix:**  
Add to Dockerfile before `npm ci`:
```dockerfile
RUN apk add --no-cache openssl
```

**Lesson:**  
Alpine Linux is minimal by design. Prisma always needs OpenSSL. This line is **mandatory** in any Alpine-based Dockerfile that uses Prisma.

---

### Issue 7: Internal vs Public DATABASE_URL

**What happened:**  
Railway provides two PostgreSQL connection URLs:
- **Internal:** `postgresql://...@postgres.railway.internal:5432/railway` — only works inside Railway's private network
- **Public:** `postgresql://...@yamanote.proxy.rlwy.net:24681/railway` — works from anywhere

When trying to run `prisma db push` or `prisma db seed` locally, using the internal URL fails silently or with a connection timeout.

**Fix:**  
Use the **public URL** for any local Prisma commands. Find it in Railway → PostgreSQL service → **Connect** tab → `DATABASE_PUBLIC_URL`.

**Lesson:**  
- `DATABASE_URL` (internal) → use this in Railway environment variables for the backend service
- `DATABASE_PUBLIC_URL` → use this for local CLI commands (`prisma db push`, `prisma db seed`, etc.)

---

### Issue 8: No Migrations = Tables Don't Exist

**What happened:**  
`prisma db seed` failed because the tables didn't exist. We had defined the schema but never run migrations or pushed it to the database.

**Error:**
```
The table `public.User` does not exist in the current database.
```

**Fix:**  
Run `prisma db push` first to create tables from the schema (no migration files needed for a fresh project):
```bash
DATABASE_URL="<public_url>" npx prisma db push
DATABASE_URL="<public_url>" npx prisma db seed
```

**Lesson:**  
Order matters: **push schema → then seed**. For production projects, prefer `prisma migrate deploy` over `db push` (migrations are versioned and reversible). For quick first deployments, `db push` is fine.

---

### Issue 9: CORS Blocking Local Frontend

**What happened:**  
The backend CORS config had hardcoded allowed origins (`localhost:3000`, `localhost:5500`). Testing the frontend via a local HTTP server on port `8080` was blocked.

**Error in browser console:**
```
Access to fetch at 'https://..railway.app/auth/login' from origin 
'http://localhost:8080' has been blocked by CORS policy
```

**Fix:**  
Use regex patterns instead of hardcoded ports in `main.ts`:
```typescript
app.enableCors({
  origin: [
    /^http:\/\/localhost(:\d+)?$/,      // any localhost port
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,  // any 127.0.0.1 port
    /\.github\.io$/,                    // GitHub Pages
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

**Lesson:**  
Never hardcode specific localhost ports in CORS. Use a regex that matches any `localhost:*` for development flexibility. After deploying to GitHub Pages, add the exact Pages URL to the list.

---

### Issue 10: Railway API Token vs Project Token

**What happened:**  
Railway CLI uses `RAILWAY_TOKEN` env var for non-interactive auth, but this expects a **project token** not an **account token**. The Railway CLI `login` command also doesn't support `--token` flag.

**Workaround:**  
Get the `DATABASE_PUBLIC_URL` from Railway and run Prisma commands locally with the URL injected directly:
```bash
DATABASE_URL="postgresql://..." npx prisma db push
DATABASE_URL="postgresql://..." npx prisma db seed
```

**Lesson:**  
For one-off DB commands from outside Railway, skip the CLI entirely and just inject `DATABASE_URL` as an environment variable prefix.

---

## 3. Key Concepts Learned

### GitHub Pages Serving Frontend
- GitHub Pages serves static files from `main` branch → `/docs` folder
- No build step needed for vanilla HTML/CSS/JS
- Pages URL format: `https://username.github.io/repo-name/`
- HTTPS by default — no mixed-content issues with Railway (also HTTPS)

### JWT in `localStorage`
- Acceptable for learning/test projects
- Not recommended for production (XSS risk) — use `httpOnly` cookies in real apps
- Always check for 401 responses and redirect to login if token is expired

### Railway Deployment Model
- Railway auto-deploys on every push to the connected branch
- Build cache persists between deploys — sometimes needs clearing when changing build tooling
- Environment variables injected at runtime (not baked into the image)
- PostgreSQL addon auto-injects `DATABASE_URL` (internal) into the linked service

### Prisma on Docker
- Must run `prisma generate` at build time (generates TypeScript types)
- Must run `prisma db push` or `prisma migrate deploy` separately (one-time or per-migration)
- Seed is a one-time operation — use `upsert` to make it idempotent

---

## 4. What Worked Well

- **Dockerfile approach** — total control, no Nixpacks surprises
- **Prisma 5** — stable, well-documented, works perfectly with NestJS 11
- **JWT strategy** — straightforward with `@nestjs/passport` + `passport-jwt`
- **Vanilla HTML frontend** — zero build complexity, instant GitHub Pages deploy
- **Regex CORS origins** — flexible for all local dev scenarios

---

## 5. AI Agent One-Shot Deployment Guide

> **Purpose:** If an AI agent reads this document, it should be able to deploy a NestJS + Prisma backend to Railway and a static frontend to GitHub Pages without any trial and error.

---

### Pre-Flight Checklist (Do These First)

- [ ] Node.js 18+ installed locally
- [ ] Git configured with a GitHub account
- [ ] Railway account created at railway.app
- [ ] `npm install -g @railway/cli` (optional, for convenience)
- [ ] GitHub repo created (can be private — Railway accesses via GitHub App)

---

### Step 1: Scaffold the Backend

```bash
mkdir my-project && cd my-project
npx @nestjs/cli new backend --skip-git --package-manager npm
cd backend
npm install @prisma/client@5 @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D prisma@5 @types/passport-jwt @types/bcrypt ts-node
```

> ⚠️ Do NOT use `prisma@latest` — pin to version 5 until Prisma 7 ecosystem matures.

---

### Step 2: Configure TypeScript (Critical)

In `tsconfig.json`, make sure these are set:
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

In `tsconfig.build.json`, exclude `prisma/` folder:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "prisma", "**/*spec.ts"]
}
```

Add to `.gitignore` and `.dockerignore`:
```
node_modules
dist
*.tsbuildinfo
.env
```

---

### Step 3: Prisma Schema

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`package.json` — add to scripts and root level:
```json
{
  "scripts": {
    "build": "prisma generate && nest build"
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

---

### Step 4: Write the Dockerfile (Use This Exactly)

Place in `backend/Dockerfile`:
```dockerfile
FROM node:18-alpine

# Prisma requires OpenSSL on Alpine — always include this
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY src ./src
COPY nest-cli.json tsconfig*.json ./

RUN npx prisma generate
RUN npx nest build
RUN npm prune --production

EXPOSE 3000
CMD ["node", "dist/main"]
```

---

### Step 5: Configure CORS (Use Regex, Not Hardcoded Ports)

`src/main.ts`:
```typescript
app.enableCors({
  origin: [
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    /\.github\.io$/,
    // Add exact GitHub Pages URL after deploying frontend:
    // 'https://username.github.io',
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

---

### Step 6: Push to GitHub

```bash
cd my-project
git init
echo ".claude/" >> .gitignore  # exclude any AI agent config
git add .gitignore backend/ docs/  # or frontend/
git commit -m "Initial commit"
gh repo create my-project --private --source=. --remote=origin --push
```

---

### Step 7: Deploy Backend on Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your repository
3. Railway will auto-detect — **before anything else**, go to:  
   **Service → Settings → Source → Root Directory** → type `backend` → Save
4. Click **New** → **Database** → **PostgreSQL** → Railway auto-injects `DATABASE_URL`
5. Go to **Service → Variables** → add:
   - `JWT_SECRET` = any long random string (e.g. generate with `openssl rand -hex 32`)
   - `PORT` = `3000` (optional, Railway sets this automatically)
6. Railway builds and deploys — watch the **Deployment** logs
7. Copy your Railway public URL (e.g. `https://myapp-production.up.railway.app`)

---

### Step 8: Initialize the Database

Get the **public** PostgreSQL URL from:  
Railway → PostgreSQL service → **Connect** tab → copy `DATABASE_PUBLIC_URL`

Then run locally:
```bash
cd backend
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma db push
DATABASE_URL="<DATABASE_PUBLIC_URL>" npx prisma db seed
```

> Use `db push` for the first deployment. For subsequent schema changes, use `prisma migrate dev` locally and `prisma migrate deploy` in production.

---

### Step 9: Deploy Frontend on GitHub Pages

1. Put all frontend files in a `docs/` folder in the repo root
2. Update `API_URL` in every HTML file to your Railway URL:
   ```javascript
   const API_URL = 'https://myapp-production.up.railway.app';
   ```
3. Push to GitHub
4. GitHub repo → **Settings** → **Pages** → Source: `main` branch → `/docs` folder → Save
5. Site is live at `https://username.github.io/repo-name/`

---

### Step 10: Final CORS Update

After getting your GitHub Pages URL, add it explicitly to `main.ts` CORS config:
```typescript
'https://username.github.io',
```
Push → Railway redeploys automatically.

---

### Verification Checklist

- [ ] `curl -s https://myapp.railway.app/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"alice","password":"password123"}'` → returns `{"access_token": "..."}`
- [ ] OPTIONS preflight includes `access-control-allow-origin` header for your frontend domain
- [ ] Frontend login redirects to home page
- [ ] CRUD operations (create/toggle/delete todos) all work
- [ ] Each user only sees their own todos

---

### Common Pitfalls — Quick Reference

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Cannot find module '/app/dist/main'` | `rootDir` missing in tsconfig OR stale `.tsbuildinfo` | Add `"rootDir": "./src"`, add `*.tsbuildinfo` to `.dockerignore` |
| `libssl.so.1.1: No such file or directory` | OpenSSL missing on Alpine | `RUN apk add --no-cache openssl` in Dockerfile |
| `Table does not exist` | Schema never pushed to DB | Run `prisma db push` before seeding |
| `Failed to fetch` / CORS error | Origin not in allowed list | Use regex CORS patterns for localhost |
| Internal DB URL connection timeout | Using internal URL from outside Railway | Use `DATABASE_PUBLIC_URL` for local commands |
| Build exits 0 but `dist/` is empty | Stale `.tsbuildinfo` skipping compilation | Delete `*.tsbuildinfo`, add to `.dockerignore` |
| Prisma generate errors about `url` in schema | Prisma 7 installed instead of 5 | Pin to `prisma@5` and `@prisma/client@5` |

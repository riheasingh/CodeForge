# LeetLab — Project guide & interview prep

This document explains the **LeetLab** codebase end-to-end (good for revision before interviews) and ends with a **local setup / API appendix** you can use when running the project.

---

## 1. Project overview

### What is the purpose?

**LeetLab** is a **LeetCode-style coding practice platform**: users browse problems, write code in a browser editor, **run** code against hidden-style test flows, **submit** solutions, and see results. Admins can **create** problems. Users can organize problems into **playlists**.

### What problem does it solve?

- Central place to store **coding problems** (statement, examples, constraints, starter code, tests).
- **Safe execution** of user code against test inputs (delegated to an external engine — **Piston** in this repo).
- **Progress tracking**: submissions stored in a database; “solved” state when all tests pass.
- **Lightweight auth** so each user sees their own submissions and solved list.

### High-level flow

1. User opens the **React** app → app checks if they are logged in (`/auth/check`).
2. Logged-in user sees **home** → list of problems from the API.
3. User opens a **problem** → frontend loads problem JSON (snippets, testcases, description).
4. **Run** / **Submit** sends code + test inputs + expected outputs to the backend → backend runs code via **Piston** → compares stdout to expected → returns result; on full pass **submit** also writes **Submission**, **TestCaseResult**, and **ProblemSolved** rows in **PostgreSQL** (via **Prisma**).

---

## 2. Tech stack

| Layer | Technology | Why it fits |
|--------|------------|-------------|
| **Frontend** | **React 19** | UI components, routing, fast SPA experience. |
| | **Vite** | Fast dev server and builds. |
| | **React Router v7** | Client-side routes (`/`, `/login`, `/problem/:id`, admin routes). |
| | **Zustand** | Simple global stores (auth, problems, execution, submissions, playlists) without Redux boilerplate. |
| | **Axios** | HTTP client with `baseURL` and `withCredentials: true` for cookies. |
| | **Tailwind CSS v4 + DaisyUI** | Utility-first styling and ready-made UI patterns (buttons, cards, tables). |
| | **Monaco Editor** (`@monaco-editor/react`) | VS Code–like editor in the browser. |
| | **React Hook Form + Zod** | Forms (login/signup, create problem) with validation. |
| | **react-hot-toast** | Non-blocking success/error messages. |
| | **lucide-react** | Icons. |
| **Backend** | **Node.js + Express 5** | REST API server, middleware, JSON body parsing. |
| | **Prisma ORM** | Type-safe DB access, migrations, schema as single source of truth. |
| | **PostgreSQL** | Relational data (users, problems, submissions, playlists). |
| | **bcryptjs** | Hash passwords before storing. |
| | **jsonwebtoken** | Sign JWTs; middleware verifies them. |
| | **cookie-parser** | Read `jwt` cookie on requests. |
| | **cors** | Allow frontend origin `http://localhost:5173` with credentials. |
| | **axios** (server) | Call Piston’s HTTP API from `judge0.lib.js`. |
| **Execution** | **Piston** (self-hosted / Docker) | Runs user/reference code in isolated workers; configured by `PISTON_API_URL`. |
| **Tools** | **ESLint** (frontend), **nodemon** (backend dev), **Prisma Migrate** | Code quality and DB versioning. |

**Note:** The backend helper file is named `judge0.lib.js`, but the implementation talks to **Piston** and shapes responses in a **Judge0-like** way (status ids such as “Accepted”, “Compilation Error”) so the rest of the app can stay consistent.

---

## 3. Folder structure

```
Leetlab/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # DB models & enums
│   │   └── migrations/        # SQL migration history
│   ├── src/
│   │   ├── index.js           # Express app entry: middleware, routes, listen
│   │   ├── libs/
│   │   │   ├── db.js          # PrismaClient singleton
│   │   │   └── judge0.lib.js # “Batch submit/poll” API → actually Piston + in-memory tokens
│   │   ├── middleware/
│   │   │   └── auth.middleware.js  # JWT verify + load user; admin check
│   │   ├── routes/            # Wire HTTP paths → controllers
│   │   ├── controllers/       # Business logic + Prisma calls
│   │   └── generated/prisma/  # Generated Prisma client (output path from schema)
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── main.jsx           # React root + BrowserRouter
│   │   ├── App.jsx            # Routes + auth gate + admin routes
│   │   ├── index.css
│   │   ├── layout/Layout.jsx  # Shell: Navbar + nested routes
│   │   ├── page/              # Full pages (Home, Login, Signup, Problem, AddProblem)
│   │   ├── components/        # Reusable UI (table, modals, submission panel, etc.)
│   │   ├── store/             # Zustand stores
│   │   └── lib/               # axios instance, language id mapping
│   ├── vite.config.js
│   └── package.json
└── README.md                  # This file
```

**How files are organized:** Backend follows classic **MVC-style separation** (routes thin, controllers fat). Frontend groups by **feature pages** and **shared components**, with **API + state** in `lib/` and `store/`.

---

## 4. Backend architecture (step-by-step)

### 4.1 Entry point (`backend/src/index.js`)

1. Loads `dotenv` and creates `express()`.
2. **CORS**: `origin: http://localhost:5173`, `credentials: true` (needed for cookies).
3. **Middleware:** `express.json()`, `cookie-parser()`.
4. **Routes:**
   - `GET /` — simple welcome string.
   - `GET /health` — runs `SELECT 1` via Prisma; returns JSON including DB connectivity (200 vs 503).
   - `app.use("/api/v1/auth", authRoutes)`
   - `app.use("/api/v1/problems", problemRoutes)`
   - `app.use("/api/v1/execute-code", executionRoute)`
   - `app.use("/api/v1/submission", submissionRoutes)`
   - `app.use("/api/v1/playlist", playlistRoutes)`
5. `app.listen(process.env.PORT, ...)`.

### 4.2 Routing system

| Prefix | File | Role |
|--------|------|------|
| `/api/v1/auth` | `auth.routes.js` | Register, login, logout, auth check |
| `/api/v1/problems` | `problem.routes.js` | CRUD-style problem APIs + solved list |
| `/api/v1/execute-code` | `executeCode.routes.js` | Run/submit code |
| `/api/v1/submission` | `submission.routes.js` | List submissions |
| `/api/v1/playlist` | `playlist.routes.js` | Playlists CRUD + add/remove problems |

Routes apply **middleware** in order: e.g. `authMiddleware` then `checkAdmin` for admin-only actions.

### 4.3 Controllers and logic

- **`auth.controller.js`**: Register (hash password, create user, JWT in cookie + body), login (compare hash, set cookie), logout (clear cookie), check (return `req.user`).
- **`problem.controller.js`**: Create problem (validates **reference solutions** by running all testcases per language through Piston), list problems (includes current user’s `solvedBy` rows), get by id, delete, get solved list. **`updateProblem` is currently a TODO stub** (not implemented).
- **`executeCode.controller.js`**: Validates parallel arrays `stdin` / `expected_outputs`, calls batch execution, compares trimmed stdout to expected, optionally persists **Submission** + **TestCaseResult** and upserts **ProblemSolved** if all pass.
- **`submission.controller.js`**: Fetch submissions for user globally or per problem; count submissions per problem.
- **`playlist.controller.js`**: CRUD playlists and junction table rows for problems in playlists.

### 4.4 Middleware usage

- **`authMiddleware`**: Reads token from `Authorization: Bearer <token>` **or** `req.cookies.jwt`, verifies with `JWT_SECRET`, loads user from DB, attaches `req.user`, else 401/404.
- **`checkAdmin`**: Ensures `req.user` has role `ADMIN` for create/delete/update problem routes.

### 4.5 Database connection

- **`libs/db.js`**: Exports a singleton `PrismaClient` (reused in dev via `globalThis` to avoid too many connections during hot reload).
- Prisma schema sets `output` to `../src/generated/prisma` so imports use that path.

### 4.6 Authentication flow

1. **Register / login** → server creates JWT payload `{ id: userId }`, sets **httpOnly** cookie `jwt` (7 days, `sameSite`/`secure` based on `NODE_ENV`), and also returns `token` in JSON (handy for Postman or future Bearer-only clients).
2. **Protected requests** → browser sends cookie automatically because Axios uses `withCredentials: true`; middleware validates JWT and loads user.
3. **`GET /auth/check`** → confirms session still valid; frontend uses this on app load to set `authUser`.
4. **Logout** → clears cookie (must be authenticated route).

### 4.7 API design (REST-style)

- Resource-oriented paths under **`/api/v1`**.
- Uses **GET** for reads, **POST** for creates/actions, **DELETE** for deletes (playlist delete), **PUT** reserved for problem update (not implemented).
- JSON request/response bodies; errors often `{ error: "..." }` or `{ message: "..." }`.

---

## 5. Database & schema

Prisma models (PostgreSQL):

### `User`

- Fields: `id` (uuid), `email` (unique), `password` (hashed), `name`, `image`, `role` (`USER` | `ADMIN`), timestamps.
- **Why:** One account per email; role gates admin features.

### `Problem`

- Core content: `title`, `description`, `difficulty` (enum), `tags` (string array), `constraints`, optional `hints` / `editorial`.
- Flexible JSON: `examples`, `testcases`, `codeSnippets`, `referenceSolutions` — avoids many join tables while keeping problem format versionable in app code.
- `userId` → creator (admin who added the problem). Cascade delete if user removed.

### `Submission`

- Links `userId` + `problemId`; stores `sourceCode` as JSON (Prisma `Json` — can hold string or structured), `language` string, aggregated `stdin`/`stdout`/`stderr`/`compileOutput`, `status`, optional `memory`/`time` (often JSON-stringified arrays per testcase in execute flow).

### `TestCaseResult`

- One row per testcase per submission: `testCase` index, `passed`, `stdout`, `expected`, `stderr`, `compileOutput`, `status`, etc.
- Index on `submissionId` for faster listing.

### `ProblemSolved`

- Unique pair `(userId, problemId)` — “user has fully solved this problem at least once.”
- **Why:** Quick solved badge on problem list without scanning all submissions.

### `Playlist` & `ProblemInPlaylist`

- **Playlist:** `name`, optional `description`, `userId`; **unique (`name`, `userId`)** so two playlists for the same user cannot share the same name.
- **ProblemInPlaylist:** Many-to-many join; **unique (`playListId`, `problemId`)** prevents duplicates.

**Relationships summary:** User → many Problems (as author), Submissions, ProblemSolved, Playlists. Problem → many Submissions, ProblemSolved, playlist links. Submission → many TestCaseResults.

---

## 6. Frontend architecture

### Framework and structure

- **React + Vite** SPA.
- **`main.jsx`**: Renders `<App />` inside `BrowserRouter`.
- **`App.jsx`**: On mount calls `checkAuth()`. Routes:
  - `/` inside `Layout` → `HomePage` if authenticated, else redirect to `/login`.
  - `/login`, `/signup` — guest only.
  - `/problem/:id` — authenticated.
  - `/add-problem` — nested under `<AdminRoute />` (role `ADMIN`).

### Component flow

- **`Layout`**: Navbar + `<Outlet />` for child routes.
- **`HomePage`**: Loads problems via `useProblemStore`, renders **`ProblemTable`** (filters, pagination, playlist modals, admin delete).
- **`ProblemPage`**: Loads single problem, Monaco editor, tabs (description, submissions, discussion placeholder, hints), Run/Submit calling **`useExecutionStore`**.

### State management

- **Zustand** stores: `useAuthStore`, `useProblemStore`, `useExecutionStore`, `useSubmissionStore`, `usePlaylistStore`, `useActions` (delete problem).

### API integration

- **`lib/axios.js`**: `axiosInstance` with `baseURL` `http://localhost:8081/api/v1` in development, `withCredentials: true`.
- Stores call paths like `/auth/login`, `/problems/get-all-problems`, `/execute-code`, etc.

### Important UI features

- **Problem table**: search, difficulty filter, tag filter, pagination, “solved” checkbox from `problem.solvedBy`, admin delete, “Save to Playlist” modal.
- **Problem solving UI**: Monaco, language dropdown from `problem.codeSnippets` keys, test case table, submission result panel (`Submission` component).
- **Create problem** (`CreateProblemForm`): large form with Zod schema, dynamic testcases, Monaco for snippets and reference solutions, POST to create endpoint.

---

## 7. Complete working flow (user journeys)

### Open the app

1. Browser loads Vite-built React app.
2. `App` runs `checkAuth` → `GET /api/v1/auth/check` with cookie.
3. If valid → `authUser` set → home or requested route; if invalid → `authUser` null → redirect to login for protected routes; initial load shows spinner while checking.

### Sign up

1. User fills form on **`SignUpPage`** → `useAuthStore.signup` → `POST /auth/register`.
2. Backend hashes password, creates user, sets cookie, returns user + token.
3. Frontend sets `authUser` → toast → user can navigate to `/`.

### Log in

1. **`LoginPage`** → `POST /auth/login` → same cookie + user pattern.

### Main actions (solve / run / submit)

1. From home, user clicks problem → **`/problem/:id`**.
2. `getProblemById` loads full problem; editor prefills from `codeSnippets[language]`.
3. **Run:** `executeCode(..., isSubmission: false)` → backend runs tests but **does not** write DB rows; returns a “preview” submission object with `id: "preview"`.
4. **Submit:** `isSubmission: true` → backend persists **Submission** + **TestCaseResult**; if all pass, **ProblemSolved** upsert.
5. Submissions tab: `getSubmissionForProblem` lists past runs for that user/problem; count badge uses `get-submissions-count`.

### Admin: create problem

1. Admin visits **`/add-problem`** (guarded by **`AdminRoute`**).
2. Form submits to **`POST /problems/create-problem`** with rich JSON.
3. Backend runs **reference solutions** against **testcases** via Piston; only if all pass is the problem saved.

### Playlists

1. User creates playlist from modal → `POST /playlist/create-playlist`.
2. “Save to Playlist” opens modal, loads playlists → `POST /playlist/:id/add-problem` with `{ problemIds: [...] }`.

---

## 8. Important features (implementation summary)

| Feature | Implementation |
|--------|------------------|
| **JWT auth + httpOnly cookie** | `auth.controller.js` + `auth.middleware.js` + Axios `withCredentials`. |
| **Role-based admin** | Prisma `UserRole`; `checkAdmin` on problem create/delete/update routes. |
| **Problem CRUD (partial)** | Create, read list, read one, delete implemented; **update not implemented** in controller. |
| **Reference solution validation** | On create, batch “Judge0-shaped” calls through `judge0.lib.js` → Piston. |
| **Run vs submit** | Same `executeCode` controller; `isSubmission` flag branches DB writes. |
| **Per-testcase results** | `TestCaseResult` rows created after submission. |
| **Solved tracking** | `ProblemSolved` unique per user/problem; list endpoint includes `solvedBy` for badges. |
| **Playlists** | `Playlist` + `ProblemInPlaylist`; APIs under `/playlist`. |
| **Health check** | `GET /health` for uptime + DB probe. |

---

## 9. Code flow (deep dive)

### 9.1 Submit solution (frontend → backend → DB)

1. **`ProblemPage`**: `handleSubmitSolution` builds `stdin[]` and `expected_outputs[]` from `problem.testcases`, gets `language_id` from **`lib/lang.js`**.
2. **`useExecutionStore.executeCode`**: `POST /api/v1/execute-code` with body including `problemId`, `isSubmission: true`.
3. **`executeCode.routes.js`**: `authMiddleware` ensures `req.user`.
4. **`executeCode.controller.js`**: Builds batch jobs → **`submitBatch`** / **`pollBatchResults`** in `judge0.lib.js` (each “token” is a UUID pointing to an in-memory result from Piston).
5. Compare stdout vs expected per index; build `detailedResults`.
6. **Prisma:** `db.submission.create` → if all passed, `db.problemSolved.upsert` → `db.testCaseResult.createMany` → `db.submission.findUnique` with `include: { testCases: true }`.
7. Response JSON → Zustand stores `submission` → **`Submission`** component renders verdict and testcase breakdown.

### 9.2 Create problem (admin)

1. **`CreateProblemForm`** validates with Zod, POSTs payload to `/problems/create-problem`.
2. **`problem.controller.createProblem`**: For each language in `referenceSolutions`, maps language → Piston/Judge0 id, runs each testcase; expects status id **3** (“Accepted”); on failure returns 400 with details.
3. On success, **`db.problem.create`** with `userId: req.user.id`.

### 9.3 Auth check on refresh

1. **`App.jsx`** `useEffect` → `checkAuth` → `GET /auth/check`.
2. **`authMiddleware`** validates cookie → **`check`** controller returns `{ user: req.user }`.
3. Frontend sets **`authUser`** so the session survives refresh without storing JWT in `localStorage` (cookie is httpOnly).

---

## 10. Interview questions

### Conceptual

1. Why use **httpOnly cookies** for JWT instead of storing the token in `localStorage`?
2. What are the trade-offs of storing **problem testcases in JSON** vs normalized tables?
3. How would you **sandbox** user code execution in production (beyond a single Piston instance)?
4. Explain **CORS** and why `credentials: true` needs a specific `origin` (not `*`).
5. How does **Prisma migrate** help teams ship schema changes safely?
6. What is the purpose of **`ProblemSolved`** if you already have **Submission** rows?
7. How would you add **rate limiting** to the execute endpoint to prevent abuse?

### Code / system design

1. Walk through **`authMiddleware`**: where can the token come from, and what happens if verification fails?
2. In **`executeCode.controller.js`**, why compare **`stdout.trim()`** to **`expected_outputs[i].trim()`**? What cases could this mishandle?
3. **`judge0.lib.js`** uses an in-memory `Map` for tokens. What breaks if you run **multiple server instances** behind a load balancer?
4. **`createProblem`** rejects non–status-3 results. What Prisma status id means “Accepted” in this abstraction, and what means “Internal Error”?
5. How would you implement **`updateProblem`** reusing validation from **`createProblem`** without duplicating code?
6. **`getAllProblems`** includes `solvedBy` filtered by user. How does that affect query cost at scale, and how might you optimize?

---

## 11. Improvements & scalability

### Correctness & consistency

- Align **frontend API paths** with backend (example: `useProblemStore` references **`/problems/get-solved-problem`** but the backend route is **`get-solved-problems`** — fix path or add alias).
- **`usePlaylistStore.removeProblemFromPlaylist`** uses **`POST .../remove-problems`**; backend exposes **`DELETE .../remove-problem`**. Align method, path, and body.
- **`removeProblemFromPlaylist`** in `playlist.controller.js`: Prisma field on `ProblemInPlaylist` is **`playListId`**, not `playlistId` — the `deleteMany` `where` should use the correct field name or the route will error at runtime.
- **`deletePlayList`**: consider `deleteMany` / `delete` with **`where: { id, userId }`** so users cannot delete others’ playlists by id guessing.
- Implement **`updateProblem`** or remove the route until ready.
- **`getPlayListDetails`** uses `findUnique({ where: { id, userId } })` — Prisma `findUnique` only allows **unique** fields; authorization is better done with **`findFirst`** where `id` AND `userId` match, or fetch by `id` then compare `userId`.

### Performance

- Paginate **`get-all-problems`** at DB level (cursor/limit) instead of returning all rows.
- Add caching for **problem statements** (CDN or HTTP cache) if traffic grows.
- Index frequent filters (e.g. `problem.difficulty`, tags — Postgres GIN for arrays).

### Scalability

- Move code execution to a **dedicated worker service** or queue (Redis + workers) so API threads are not blocked.
- Replace in-memory execution token store with **Redis** for multi-instance safety.
- Use **object storage** (S3) for large assets if you add images/files.

### Security & product

- Input size limits on **source_code** and **stdin**; timeout on Piston calls.
- Refresh tokens or shorter access token lifetime for stricter security.
- Structured logging (request id, user id) and metrics around execute latency and failure rates.

---

## Appendix A — Local setup & API (quick reference)

### Services / ports

- **Backend**: `http://localhost:8081`
- **Frontend** (CORS origin expected by backend): `http://localhost:5173`
- **Postgres**: `localhost:5432`
- **Piston**: `http://localhost:2000`

### Backend `.env` (`backend/.env`)

Typical variables:

- `PORT=8081`
- `DATABASE_URL="postgresql://..."` 
- `JWT_SECRET=...`
- `PISTON_API_URL=http://localhost:2000`

### Run backend

From `backend/`:

```bash
npm install
npm run dev
```

### Health check

- `GET http://localhost:8081/health` → `200` if DB is reachable, `503` if not.

### Authentication tips

Most APIs require **`authMiddleware`**.

- **Bearer token:** `Authorization: Bearer <token>` from register/login response.
- **Cookie:** login/register set `jwt` httpOnly cookie; Axios on the frontend sends it with `withCredentials: true`.

### Piston

`create-problem` validates reference solutions using Piston. Example Docker:

```bash
docker run -d --name piston -p 2000:2000 --restart unless-stopped ghcr.io/engineer-man/piston
```

Verify runtimes: `http://localhost:2000/api/v2/runtimes`

### Common issues

- **401**: Missing/invalid JWT — use Bearer header or ensure cookie is sent.
- **`/health` DB false**: Postgres down or wrong `DATABASE_URL`.
- **Create problem errors**: Piston unreachable — check `PISTON_API_URL` and container logs.

---

*This guide reflects the repository layout and code as analyzed for interview-style revision. When you change routes or schema, update this document in the same PR.*

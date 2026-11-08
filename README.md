# Open Chess Lab

Free and open-source chess platform: play against the engine or friends, play rated games against other players, analyze games with Stockfish, import PGN/FEN, and review your mistakes move by move. No ads, no tracking, no paywalls.

## Features

**Accounts**

- Register, log in, log out and reset your password by email
- Public profiles with ratings per time control, a rating history graph, win/draw/loss stats and the game list
- Guests can play casual games and use analysis; rated games need an account

**Rated play**

- Glicko-2 ratings per time control (bullet, blitz, rapid, classical); new players start at 1500 with a provisional `?` marker until their deviation drops below 110
- Quick pairing queues per time control that widen the allowed rating range the longer you wait
- Lobby with open seeks (time control, rated or casual, color, rating range)
- Expected rating gain and loss shown before the game, rating changes shown right after it
- Leaderboards per time control (established ratings only)
- Rematches, which stay rated when the original game was rated

**Server-authoritative games**

- Every move is validated on the server with chess.js; the server owns the position and the clocks
- Clocks with increment and lag compensation (up to 500 ms per move); the browser clocks only display
- Draw offers, resignation, threefold repetition, fifty-move rule, insufficient material, stalemate and timeouts (a timeout against insufficient mating material is a draw)
- Abort before both sides have moved; aborted games are unrated, and a game is aborted automatically when a first move is not made within 30 seconds
- When a player disconnects, the opponent can claim the win after 30 seconds
- Finished games are stored in PostgreSQL with full PGN and result; ongoing games survive a server restart

**Fair play**

- Stockfish and the evaluation bar are switched off for both players while they play a rated game
- After every rated game the server compares each player's moves with Stockfish and flags suspicious accuracy
- Moderators review flags, mark accounts and refund rating points to the opponents of marked accounts

**Engine, friends, analysis and review**

- Play Stockfish at eight levels (skill level plus depth and time limits), with undo, resign and flip; always unrated
- Play a friend on one device (hot-seat) or online through an invite link, rated or casual
- Analysis board with an evaluation bar, best-move arrow, three engine lines and free exploration with variations
- Import PGN by pasting or uploading, including multi-game files with a game picker; set up positions from FEN with clear validation errors
- Export any game as PGN (variations included on the analysis board) and any position as FEN
- Game review in the browser: every move classified as best, good, inaccuracy, mistake or blunder by centipawn loss, the better move shown for each mistake, accuracy per player, an evaluation graph and keyboard navigation

**General**

- Responsive layout for desktop and mobile, light and dark theme

## Tech stack

| Part        | Technology                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Monorepo    | npm workspaces: `apps/web`, `apps/server`, `packages/shared`                                    |
| Frontend    | Vite, React, TypeScript, chessground                                                            |
| Chess rules | chess.js on the client and the server                                                           |
| Engine      | Stockfish 19 (WebAssembly) in a Web Worker; the same build runs under Node for fair-play checks |
| Backend     | Node.js, Fastify, WebSocket (`ws` through `@fastify/websocket`)                                 |
| Data        | PostgreSQL with Prisma, Redis for the lobby and matchmaking queues                              |
| Auth        | Email and password with argon2id, httpOnly session cookies, CSRF tokens and an Origin check     |

`packages/shared` holds the game logic used by both sides: time controls, clock, game-end detection, Glicko-2, pairing, move classification and accuracy, fair-play metrics, PGN/FEN import, and the API and WebSocket types.

## Running with Docker

```sh
docker compose up --build
```

Then open <http://localhost:8080>. Compose starts PostgreSQL, Redis, the server (it applies the migrations on start) and an nginx container that serves the web app and proxies `/api` and `/ws`.

By default the demo users below are seeded. Set `SEED_DEMO_USERS=false` to turn that off. Other settings can be overridden in the shell or a root `.env` file, for example `WEB_PORT=9000 APP_ORIGIN=http://localhost:9000 docker compose up`.

## Running without Docker

You need Node.js 22 or newer, PostgreSQL and Redis.

```sh
npm install
cp .env.example apps/server/.env
npm run db:migrate
npm run db:seed
npm run dev
```

- Web app: <http://localhost:5173> (Vite proxies `/api` and `/ws` to the server)
- Server: <http://localhost:3000>

Edit `apps/server/.env` if your database or Redis run somewhere else. Use `npm run db:migrate:dev -w @open-chess-lab/server` to create new migrations while you develop.

### Demo users

| Username                        | Role      |
| ------------------------------- | --------- |
| `moderator`                     | moderator |
| `alice`, `bob`, `carol`, `dave` | players   |

Every demo password is `password123`. Do not seed demo users in production.

## Configuration

Every variable is listed in [`.env.example`](.env.example).

| Variable                                | Purpose                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | PostgreSQL connection string (required)                                                                                                  |
| `REDIS_URL`                             | Redis connection string                                                                                                                  |
| `APP_ORIGIN`                            | Public URL of the web app; used for CSRF and WebSocket Origin checks and in password reset links                                         |
| `COOKIE_SECURE`                         | Set to `true` when the site is served over HTTPS                                                                                         |
| `SESSION_TTL_DAYS`                      | Session lifetime                                                                                                                         |
| `SMTP_URL`, `MAIL_FROM`                 | Outgoing mail for password resets; without `SMTP_URL` the reset link is written to the server log                                        |
| `WEB_DIST_DIR`                          | Optional path to the built web app, so a single Node process serves everything                                                           |
| `STOCKFISH_PATH`                        | Optional native Stockfish binary for fair-play checks; defaults to the bundled WebAssembly build                                         |
| `FAIR_PLAY_ENABLED`, `FAIR_PLAY_DEPTH`  | Turn post-game checks on or off and set their search depth                                                                               |
| `HOST`, `PORT`, `LOG_LEVEL`, `NODE_ENV` | Server basics                                                                                                                            |
| `SEED_DEMO_USERS`                       | Docker only: seed the demo users on start                                                                                                |
| `VITE_ALLOWED_HOSTS`                    | Dev server only: extra host names Vite may answer to (comma-separated, or `all`), e.g. when opening it through a tunnel or preview proxy |

## Scripts

| Command                                  | What it does                                                         |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                            | Server (tsx watch) and web (Vite) together                           |
| `npm run build`                          | Builds shared, server and web                                        |
| `npm run lint`                           | ESLint (including a rule that rejects comments in code) and Prettier |
| `npm run typecheck`                      | TypeScript in every workspace                                        |
| `npm test`                               | Vitest for every workspace                                           |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / seed demo users                                   |

The tests cover Glicko-2, matchmaking pairing, move classification and accuracy, PGN/FEN import, the clock, game-end detection, the server game state machine, CSRF helpers and the analysis variation tree.

## Building and deploying

`npm run build` produces:

- `apps/server/dist`: run it with `node apps/server/dist/main.js`
- `apps/web/dist`: static files, including the Stockfish worker and its `.wasm` file

There are two ways to deploy:

1. **Containers.** Build the images with `docker build --target server .` and `docker build --target web .`, or reuse `docker-compose.yml`. Put a TLS-terminating proxy in front of the web container, and set `APP_ORIGIN` to the public HTTPS URL and `COOKIE_SECURE=true`.
2. **Single Node process.** Build, run `npm run db:migrate`, then start the server with `WEB_DIST_DIR=apps/web/dist`. It then serves the web app, the API and the WebSocket from one port.

Whichever way you choose:

- Serve `.wasm` files as `application/wasm`.
- Proxy WebSocket upgrades on `/ws`.
- Run one server instance. Live games and clocks are kept in that process's memory (and persisted after every move), so do not load-balance several instances.

## Hosting on Supabase and Render

Supabase hosts the PostgreSQL database. The Node server needs long-lived WebSocket connections and Redis, which Supabase does not run, so the server and Redis run on [Render](https://render.com). Both have free tiers. `render.yaml` describes the Render side.

1. **Create the database.** In Supabase, create a project and save the database password.
2. **Copy the connection strings.** Open _Connect_ in the Supabase dashboard and copy:
   - the **Transaction pooler** string (port `6543`). Append `?pgbouncer=true` to it; this is `DATABASE_URL`.
   - the **Session pooler** string (port `5432`); this is `DIRECT_URL`, used for migrations.

   Replace `[YOUR-PASSWORD]` in both. Use the pooler strings rather than the direct connection, because Render connects over IPv4.

3. **Create the Render services.** In Render, choose _New → Blueprint_, connect this GitHub repository and pick the branch to deploy. Render reads `render.yaml` and proposes a web service (built from the `Dockerfile`) plus a Key Value (Redis) instance.
4. **Fill in the database settings.** Enter `DATABASE_URL` and `DIRECT_URL` when Render asks, then click _Apply_.
5. **Wait for the first deploy.** It builds the image, applies the Prisma migrations to Supabase and starts the server. The app is then live at `https://<service-name>.onrender.com`. `APP_ORIGIN` is taken from Render's public URL automatically; set it yourself only when you add a custom domain.
6. **Optionally add demo users.** Set `SEED_DEMO_USERS=true` for one deploy, then set it back to `false`. To create a moderator, register normally and then run `UPDATE "User" SET role = 'moderator' WHERE username = 'your-name';` in the Supabase SQL editor.
7. **Optionally send real emails.** Add `SMTP_URL` and `MAIL_FROM` for password reset emails; without them, reset links appear in the Render logs.

Free Render web services sleep after 15 minutes without traffic and take about a minute to wake up. Games that were running when the service went to sleep are restored from the database when it starts again.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. It installs dependencies, lints, type-checks, runs the tests, builds every workspace, and applies the migrations and seed against a PostgreSQL service.

## License

Open Chess Lab is licensed under the [GNU General Public License v3.0](LICENSE), as required by Stockfish, which is also GPL-3.0. The Stockfish license text ships with the web build in `stockfish/COPYING.txt`.

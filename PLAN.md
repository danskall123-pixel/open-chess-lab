# Plan

- [ ] Monorepo scaffold: npm workspaces, TypeScript, ESLint (with a no-comments rule), Prettier, Vitest
- [ ] `packages/shared`: types, time controls, clock logic, game-end detection, Glicko-2, matchmaking pairing, move classification and accuracy, PGN/FEN import
- [ ] Unit tests for every shared module
- [ ] `apps/server`: config, Fastify app, Prisma schema, migrations, seed
- [ ] Auth: register, login, logout, password reset, argon2, httpOnly session cookies, CSRF, guest sessions
- [ ] Real-time games over WebSocket: server-authoritative moves and clocks, lag compensation, draw/resign/abort, disconnect claims, persistence
- [ ] Rating: Glicko-2 per time control, expected gain/loss, rating history, leaderboards
- [ ] Lobby seeks, matchmaking queues in Redis, invite links, rematch
- [ ] Fair play: post-game Stockfish check, flags, moderator review, marking and refunds
- [ ] `apps/web`: layout, theme, routing, auth pages, chessground board
- [ ] Lobby, online game page, play vs engine, hot-seat, invite flow
- [ ] Stockfish WASM worker, analysis board with eval bar and multi-PV, variations
- [ ] Import/export PGN and FEN, multi-game picker
- [ ] Game review: classification, accuracy, eval graph, keyboard navigation
- [ ] Profile with rating graph, stats, game list; leaderboards; moderation page
- [ ] Docker Compose, Dockerfiles, `.env.example`
- [ ] README, LICENSE (GPL-3.0), GitHub Actions CI

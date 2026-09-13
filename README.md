# EduFlux

EduFlux is a production-oriented education SaaS monorepo. Phase 2 adds durable authentication, authorization, and class membership workflows while preserving the Phase 1 marketing homepage.

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm 12.4.1
- MongoDB replica set (transactions are required for atomic class creation)

Copy `apps/api/.env.example` to `apps/api/.env` and provide strong secrets and a replica-set Mongo URI. Copy `apps/web/.env.example` when the API is not available at `http://localhost:5000` from the Next.js server.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The web app runs at `http://localhost:3000`; the API runs at `http://localhost:5000`. The browser talks to same-origin `/api/v1/*` paths, which Next.js proxies to Express.

## Workspace

```text
apps/
  web/       Next.js App Router marketing, auth, and class UI
  api/       Express 5 API, Mongo models, auth and class domains
  worker/    Background-process foundation
packages/
  config/        Cross-service constants
  shared-types/  Transport-safe TypeScript contracts
  validation/    Shared Zod request schemas
  utils/         Dependency-light general utilities
docs/            Architecture records
```

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @eduflux/api db:indexes
pnpm --filter @eduflux/web test:e2e
```

The API integration suite and browser test create an isolated, disposable MongoDB replica set. The Playwright flow requires the production web build first. `db:indexes` safely creates declared indexes and should run during deployment before traffic is shifted.

## Security model

- Passwords use Argon2id; raw passwords and session tokens are never stored.
- Sessions are server-side Mongo records addressed by a random opaque cookie. Production uses a `Secure`, `HttpOnly`, `SameSite=Lax`, host-only `__Host-` cookie.
- Mutations require a signed double-submit CSRF token and reject untrusted browser origins.
- Authentication and class-join routes are rate limited; repeated credential failures temporarily lock the account.
- Authorization is evaluated from current user and membership records on every request. Client-provided roles are ignored.
- Logs redact credentials, cookies, CSRF values, hashes, tokens, and secrets.

See [docs/architecture.md](docs/architecture.md) for data models, request flows, and deployment details.

# EduFlux

EduFlux is a production-oriented education SaaS monorepo. Firebase Authentication supplies identity, Express verifies identity and owns authorization, and MongoDB stores application profiles, roles, classes, and memberships.

## Requirements

- Node.js 24 LTS
- pnpm 12.4.1
- A MongoDB Atlas database or replica set
- Firebase Email/Password and Google providers enabled
- Firebase Admin service-account credentials or Application Default Credentials

## Local configuration

1. Run `pnpm install --frozen-lockfile`.
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and add the Firebase Web configuration.
3. Copy `apps/api/.env.example` to `apps/api/.env`.
4. Set `MONGODB_URI` to the URL-encoded Atlas connection string for the `eduflux` database.
5. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`, or configure `GOOGLE_APPLICATION_CREDENTIALS`. Escaped private-key newlines are supported.
6. Ensure Atlas Network Access permits the development machine. Do not use unrestricted production access.
7. Add `localhost` and later the production hostname to Firebase Authentication authorized domains.
8. Run `pnpm dev`, then test email registration/login, Google onboarding, both dashboards, and class creation/joining.

Never commit `.env`, service-account JSON, private keys, or MongoDB credentials.

## Authentication flow

```text
Browser -> Firebase Auth -> ID token -> Express /api/v1/auth/session-login
        -> Firebase Admin verification -> MongoDB application user
        -> Secure HttpOnly Firebase session cookie -> protected APIs
```

Email and password are sent only to Firebase. The client exchanges a fresh ID token for a seven-day server session and then clears client Firebase state. Google users without an application persona are sent to `/onboarding`. MongoDB roles and class memberships remain server-authoritative.

Existing pre-Firebase users require an explicit migration to Firebase UIDs. Development databases may be cleared; production users must be mapped after a verified Firebase account migration. Do not create the new unique UID index over unmigrated production records.

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

Automated authentication uses a test-only identity gateway and an isolated Mongo replica set. It never writes to Firebase or Atlas.

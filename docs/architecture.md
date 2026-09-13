# Architecture

## Runtime boundaries

Next.js owns presentation and server-side route protection. The Phase 1 marketing homepage remains server-rendered, with narrow client boundaries for navigation, GSAP enhancement, and its optional adaptive Three.js scene. Authentication and application screens use the same design system without adding WebGL.

Express owns all application APIs under `/api/v1`. Next rewrites same-origin browser requests to the API, so no public API base URL or secret is shipped to the client. The worker remains an independently deployable process without a queue dependency until a background workload exists.

## Authentication flow

1. A client fetches `GET /api/v1/auth/csrf`. Express sets an HttpOnly signed CSRF cookie and returns the same token for the request header.
2. Register and login validate strict shared Zod schemas. Emails are trimmed and canonicalized; passwords are hashed with Argon2id. Login also executes a dummy hash verification for unknown accounts.
3. Express stores only a SHA-256 hash of a cryptographically random session token and sets the raw token in an HttpOnly cookie. Session expiry is checked in application code; Mongo's TTL index performs eventual cleanup.
4. Protected requests resolve the session, load the current user, reject expired/revoked sessions and non-active accounts, and expose a minimal principal to downstream handlers.
5. Logout deletes the session by token hash and is idempotent. Logout-all deletes every session owned by the authenticated user.

Production cookies use `__Host-eduflux.sid` and `__Host-eduflux.csrf` with `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. Mutations require the CSRF cookie/header pair; supplied browser origins must exactly match `WEB_ORIGIN`. The API must be deployed behind HTTPS. `TRUST_PROXY_HOPS` must match the real proxy topology so rate-limit keys and IP HMACs cannot be spoofed.

## Data model and indexes

- `users`: public email/display name, canonical email, Argon2id hash, platform role, primary persona, status, and login-defense counters. Canonical email is uniquely indexed.
- `sessions`: token hash, user, expiry, creation/last-seen timestamps, and privacy-preserving client metadata. Token hash is unique; expiry has a TTL index.
- `classes`: owner, name, description, status, and an unambiguous eight-character join code. Join code is unique.
- `classmemberships`: class/user pair, membership role, and status. The pair is unique; lookup indexes cover user/status and class/status. A partial unique index guarantees one active owner per class.

Class creation inserts the class and its owner membership in one Mongo transaction. This is why every environment, including development and test, must use a replica set. Joining is duplicate-safe and always assigns `STUDENT`; the request cannot supply a role. Class and member access uses membership records, not the user's selected UI persona. Only owners and teachers may list members, and member responses intentionally omit email addresses.

## Reliability and observability

The API connects to Mongo before listening and exposes liveness and database-aware readiness endpoints. Mongoose buffering is disabled, pool/connect limits are explicit, and production does not create indexes implicitly. API failures use stable JSON envelopes with request IDs. Pino logs structured request summaries while redacting security material. Graceful shutdown closes HTTP and database connections.

## Verification strategy

Vitest covers validation and UI behavior. API integration tests run against an isolated real MongoDB replica set and verify indexes, transactions and rollback, hashing/session persistence, CSRF/origin defenses, expiry/revocation, rate limiting, duplicate joins, and membership authorization. Playwright exercises teacher registration and class creation, student registration and joining, forbidden member access, logout, and protected-route redirects against the production Next.js server and isolated API database.

The release gate is: frozen install, lint, TypeScript checks, all tests, production build, then Playwright. Node 24 LTS is the supported runtime.

## Dependency direction

Applications may consume packages. Shared packages cannot consume applications. `shared-types` contains transport contracts, `validation` contains runtime schemas, `config` contains non-secret defaults, and `utils` remains dependency-light. Database and cryptography packages are API-only and never enter the browser bundle.

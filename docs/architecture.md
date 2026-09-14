# Architecture

## Responsibilities

- Firebase Authentication owns passwords, provider linking, Google authentication, and primary identity.
- Express owns verified session exchange, cookies, CSRF, account status, authorization, and DTO boundaries.
- MongoDB owns the application user, persona, platform role, classes, and memberships.
- Next.js owns UI and server-side protected-route redirects. The marketing homepage remains statically optimized and does not import Firebase.

## Identity and sessions

`POST /api/v1/auth/session-login` accepts only a Firebase ID token and an optional validated onboarding persona. Firebase Admin verifies the token and its recent `auth_time`; Express then upserts by indexed `firebaseUid` and creates a Firebase session cookie. Production uses `__Host-eduflux.session` with HttpOnly, Secure, SameSite=Lax, and Path=/.

Each authenticated API request verifies the cookie once with revocation checking and performs one indexed Mongo lookup by Firebase UID. The attached principal contains only Mongo user ID, Firebase UID, platform role, and optional persona. Logout clears the cookie; logout-all also revokes Firebase refresh tokens.

CSRF remains mandatory for session exchange, onboarding, logout, class creation, and class joining. Supplied origins must match `WEB_ORIGIN`.

## User model

Users contain `firebaseUid`, canonical email, display name, optional photo, provider identifiers, optional persona, platform role, status, email verification, and timestamps. Unique indexes cover Firebase UID and canonical email. Password hashes, login counters, custom session tokens, and the session collection were removed.

Firebase UID maps to one Mongo user `_id`; existing class-membership references therefore remain unchanged. Client input can select only TEACHER or STUDENT as an initial persona. It cannot set platform or class roles.

## Google onboarding

A first Google exchange creates a user without a persona and returns `requiresOnboarding: true`. The UI redirects to `/onboarding`; the authenticated, CSRF-protected onboarding endpoint performs a first-write-only persona update.

## Runtime and performance

Mongo connects once before the API listens, with disabled buffering, bounded pooling, and database-aware readiness. Readiness also requires Firebase Admin initialization. Normal authentication is one Firebase verification plus one indexed Mongo query. Class membership queries retain their compound indexes and batched class listing.

Firebase client modules are referenced only from auth-route client code. They are absent from the marketing page source graph, so the GSAP/Three.js homepage architecture is unchanged.

## Deployment

Production startup intentionally fails without Firebase Admin credentials. Run index creation only after migrating legacy users to Firebase UIDs. Configure the exact production web origin, correct proxy-hop count, Firebase authorized domain, HTTPS, Atlas least-privilege credentials, and a restricted Atlas network policy.

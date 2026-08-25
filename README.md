# happy-wakey-e2e

System-level acceptance and resilience tests for the complete Happy Wakey organization. This repository owns black-box evidence; it does not own production identity, product authorization, schemas, infrastructure, or deployment state.

## Covered topology

`topology.json` defines the acceptance contract for the four supported web/API avenues:

1. Direct database reads through the subject-scoped lib-core read capability,
   backed by a database-enforced read-only principal and a verified Shared Auth
   subject.
2. Stateless HTTPS JSON requests from web to the API cluster, with redirects
   disabled and a bearer on each request.
3. Stateful, pooled TLS connections using asymmetric bounded length-delimited
   JSON frames. Every frame is re-introspected and connection identity is never
   cached.
4. Asynchronous JetStream/outbox operations. Authenticated HTTPS registration
   creates the idempotent outbox record; the durable signal contains no bearer
   or owner. The API commits the response, awaits its durable publication, and
   only then acknowledges the request. Core NATS request/reply is forbidden.

Every avenue must preserve the same `happy-wakey-interfaces` response contracts. Shared Auth proves identity and assurance; Happy Wakey remains responsible for ownership and product authorization. Ores telemetry must omit authorization, cookies, tokens, identity data, and bodies.

The committed topology and its unit tests are a reviewable target contract, not proof that every service is deployed. It records immutable merged API/web revisions and an explicit public-CI gate for the private official Shared Auth source; native tests and strict linting were validated separately in an authorized context against that exact revision. Production claims still require immutable image digests and live tests against the pinned Shared Auth, NATS, database, and infrastructure revisions.

## Test lanes

- `tests/topology.test.mjs` fails when any avenue, authority boundary, durability requirement, or Ores telemetry contract is removed.
- `tests/live.smoke.test.mjs` performs bounded, no-redirect health checks when explicitly enabled with environment-provided base URLs.
- Future black-box suites belong here for wrong issuer/audience/client/realm, revoked sessions, stale JWKS, service outages, TCP reconnects, NATS redelivery, duplicate operation IDs, database read-role enforcement, and cross-client contract parity.

Never place access tokens, cookies, service credentials, database URLs, NATS credentials, or customer fixtures in this repository. CI uses synthetic identities and approved runtime secret injection only.

## Run

Use the released `zed-pkg` CLI as the dependency and script entry point:

```sh
zed validate
zed install --adapter node
zed run npm test
```

Live health checks are opt-in and require only non-secret base URLs:

```sh
HAPPY_WAKEY_API_BASE=https://api.example.test \
HAPPY_WAKEY_WEB_BASE=https://web.example.test \
HAPPY_WAKEY_SHARED_AUTH_BASE=https://auth.example.test \
npm run test:live
```

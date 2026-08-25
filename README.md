# happy-wakey-e2e

System-level acceptance and resilience tests for the complete Happy Wakey organization. This repository owns black-box evidence; it does not own production identity, product authorization, schemas, infrastructure, or deployment state.

## Covered topology

`topology.json` defines the acceptance contract for the four supported web/API avenues:

1. Direct SeaORM database reads from a trusted web process, using a read-only principal and product-scoped Shared Auth subject.
2. Stateless HTTPS JSON requests from web to the API cluster.
3. Stateful, pooled TLS TCP connections using bounded length-delimited JSON frames.
4. Asynchronous NATS JetStream request/reply with operation IDs, durable consumers, idempotent API handling, deadlines, and bounded replies.

Every avenue must preserve the same `happy-wakey-interfaces` response contracts. Shared Auth proves identity and assurance; Happy Wakey remains responsible for ownership and product authorization. Ores telemetry must omit authorization, cookies, tokens, identity data, and bodies.

The committed topology and its unit tests are a reviewable target contract, not proof that every service is deployed. Production claims require live tests against exact API, web, Shared Auth, NATS, database, and infrastructure revisions.

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

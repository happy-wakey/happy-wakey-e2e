import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTopology, REQUIRED_MODES, validateTopology } from '../src/topology.mjs';

test('declares all four web/API interaction avenues', async () => {
  const topology = validateTopology(await loadTopology());
  assert.deepEqual(
    topology.modes.map(({ id }) => id),
    REQUIRED_MODES,
  );
});

test('keeps direct database work read-only and JetStream durable', async () => {
  const topology = validateTopology(await loadTopology());
  const direct = topology.modes.find(({ id }) => id === 'direct_db_read');
  const nats = topology.modes.find(({ id }) => id === 'async_jetstream');

  assert.equal(direct.writesAllowed, false);
  assert.equal(direct.webRole, 'read-only-capability');
  assert.equal(direct.rawConnectionExposed, false);
  assert.equal(nats.coreNatsAllowed, false);
  assert.equal(nats.signalCredentialFree, true);
  assert.equal(nats.responseCommittedBeforePublish, true);
  assert.equal(nats.responsePublishAckBeforeRequestAck, true);
});

test('fails closed when a required avenue disappears', async () => {
  const topology = await loadTopology();
  topology.modes = topology.modes.filter(({ id }) => id !== 'stateful_tls');
  assert.throws(() => validateTopology(topology), /missing interaction mode/);
});

test('keeps identity, product policy, and telemetry authorities distinct', async () => {
  const topology = validateTopology(await loadTopology());
  assert.equal(
    topology.sharedAuth.identityProof,
    'official-typed-protected-introspection',
  );
  assert.equal(topology.sharedAuth.serviceCredentialIndependent, true);
  assert.equal(topology.sharedAuth.requiredAudience, 'happy-wakey');
  assert.equal(topology.sharedAuth.productAuthorization, 'happy-wakey');
  assert.equal(topology.telemetry.provider, 'oresoftware/next-loggers-rust');
  assert.ok(topology.telemetry.forbiddenFields.includes('token'));
  assert.ok(topology.telemetry.forbiddenFields.includes('owner_id'));
});

test('rejects cross-mode fallback and Core NATS substitutions', async () => {
  const topology = await loadTopology();
  topology.crossMode.automaticFallback = true;
  assert.throws(() => validateTopology(topology), /fallback policy/);

  const coreNats = await loadTopology();
  const asyncMode = coreNats.modes.find(({ id }) => id === 'async_jetstream');
  asyncMode.transport = 'nats-core-request-reply';
  asyncMode.coreNatsAllowed = true;
  assert.throws(() => validateTopology(coreNats), /outbox\/JetStream/);
});

test('rejects unsafe acknowledgement order and identity caching', async () => {
  const topology = await loadTopology();
  const asyncMode = topology.modes.find(({ id }) => id === 'async_jetstream');
  asyncMode.responsePublishAckBeforeRequestAck = false;
  assert.throws(() => validateTopology(topology), /outbox\/JetStream/);

  const cached = await loadTopology();
  const tcp = cached.modes.find(({ id }) => id === 'stateful_tls');
  tcp.connectionIdentityCache = true;
  assert.throws(() => validateTopology(cached), /reauthenticate every TLS frame/);
});

test('pins merged implementation heads with an explicit private-source gate', async () => {
  const topology = validateTopology(await loadTopology());
  for (const service of ['api', 'web']) {
    assert.match(topology.implementation[service].revision, /^[0-9a-f]{40}$/);
    assert.equal(topology.implementation[service].delivery, 'merged-main');
    assert.equal(
      topology.implementation[service].requiredCi,
      'green-with-private-source-gate',
    );
  }
});

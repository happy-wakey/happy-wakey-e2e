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

test('pins merged application heads with hosted current-SHA evidence', async () => {
  const topology = validateTopology(await loadTopology());
  assert.equal(
    topology.implementation.api.revision,
    '60a7dac6f4a2bd16481edc776f7323129b962125',
  );
  assert.equal(
    topology.implementation.web.revision,
    '951b4185a5c6c8eafb490e9dcbab0fcb8bd57d02',
  );
  assert.equal(
    topology.implementation.desktop.revision,
    'ac31a2a22d532575cd6ba04c500c6ccf8e7117eb',
  );
  assert.equal(
    topology.implementation.flutter.revision,
    '2f748459cb942802a112825abbebd5c0ea77811c',
  );
  for (const service of ['api', 'web', 'cli', 'desktop', 'flutter']) {
    assert.match(topology.implementation[service].revision, /^[0-9a-f]{40}$/);
    assert.equal(topology.implementation[service].delivery, 'merged-main');
    assert.equal(
      topology.implementation[service].requiredCi,
      'hosted-green-current-sha',
    );
  }
});

test('keeps both desktop competitors on one bounded credential-free Bluetooth contract', async () => {
  const topology = validateTopology(await loadTopology());
  assert.equal(topology.bluetooth.nativeImplementations.rust, 'btleplug');
  assert.equal(topology.bluetooth.nativeImplementations.flutter, 'universal_ble');
  assert.equal(topology.bluetooth.maxCommandBytes, 512);
  assert.equal(topology.bluetooth.credentialFieldsAllowed, false);
  assert.equal(topology.bluetooth.formalLane.generationFenced, true);

  const weakened = await loadTopology();
  weakened.bluetooth.credentialFieldsAllowed = true;
  assert.throws(() => validateTopology(weakened), /Bluetooth transport contract/);
});

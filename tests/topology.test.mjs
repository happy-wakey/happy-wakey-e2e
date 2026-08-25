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

test('keeps direct database work read-only and NATS durable', async () => {
  const topology = validateTopology(await loadTopology());
  const direct = topology.modes.find(({ id }) => id === 'direct_db_read');
  const nats = topology.modes.find(({ id }) => id === 'async_nats');

  assert.equal(direct.writesAllowed, false);
  assert.equal(direct.webRole, 'read-only');
  assert.equal(nats.durable, true);
  assert.match(nats.transport, /jetstream/);
});

test('fails closed when a required avenue disappears', async () => {
  const topology = await loadTopology();
  topology.modes = topology.modes.filter(({ id }) => id !== 'stateful_tcp');
  assert.throws(() => validateTopology(topology), /missing interaction mode/);
});

test('keeps identity, product policy, and telemetry authorities distinct', async () => {
  const topology = validateTopology(await loadTopology());
  assert.equal(topology.sharedAuth.ordinaryRequests, 'local-jwks');
  assert.equal(topology.sharedAuth.immediateRevocation, 'protected-introspection');
  assert.equal(topology.sharedAuth.productAuthorization, 'happy-wakey');
  assert.equal(topology.telemetry.provider, 'ores-otel/ores.otel.log');
  assert.ok(topology.telemetry.forbiddenFields.includes('token'));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTopology, validateTopology } from '../src/topology.mjs';

test('AttoLang contracts stay source-only until guest execution and transport are verified', async () => {
  const topology = validateTopology(await loadTopology());
  assert.deepEqual(topology.languageSurfaces.atto, {
    sourceExtension: '.atto',
    clientRepository: 'happy-wakey-clients',
    interfaceRepository: 'happy-wakey-interfaces',
    status: 'source-contract-only',
    hostTransportVerified: false,
    guestCompilationVerified: false,
    wireSerializerVerified: false,
    allowProductionUse: false,
  });
});

for (const [name, change] of [
  ['missing AttoLang contract', (atto) => { atto.status = undefined; }],
  ['runtime parity claimed', (atto) => { atto.guestCompilationVerified = true; }],
  ['host transport falsely verified', (atto) => { atto.hostTransportVerified = true; }],
  ['wire serialization falsely verified', (atto) => { atto.wireSerializerVerified = true; }],
  ['production use prematurely permitted', (atto) => { atto.allowProductionUse = true; }],
  ['source extension drift', (atto) => { atto.sourceExtension = '.ores'; }],
  ['wrong interface authority', (atto) => { atto.interfaceRepository = 'unknown'; }],
]) {
  test(`rejects ${name}`, async () => {
    const topology = await loadTopology();
    change(topology.languageSurfaces.atto);
    assert.throws(() => validateTopology(topology), /AttoLang readiness/);
  });
}

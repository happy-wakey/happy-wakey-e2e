import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadTopology,
  REQUIRED_CARD_KINDS,
  REQUIRED_MODES,
  REQUIRED_REPOSITORIES,
  validateTopology,
} from '../src/topology.mjs';

test('declares all four web/API interaction avenues', async () => {
  const topology = validateTopology(await loadTopology());
  assert.deepEqual(
    topology.modes.map(({ id }) => id),
    REQUIRED_MODES,
  );
});

test('declares bounded email, message, sleep, and biometric brief surfaces', async () => {
  const topology = validateTopology(await loadTopology());
  assert.deepEqual(
    topology.morningBrief.surfaces.map(({ id }) => id),
    ['important_email', 'direct_messages', 'sleep', 'biometrics'],
  );
  assert.deepEqual(
    topology.morningBrief.surfaces.map(({ route }) => route),
    [
      '/v1/inbox/digest',
      '/v1/messages/digest',
      '/v1/health/sleep/{day}',
      '/v1/health/biometrics/{day}',
    ],
  );
  assert.equal(topology.morningBrief.bounds.maxItemsPerSurface, 20);
  assert.equal(topology.morningBrief.failurePolicy.independentLanes, true);
  assert.equal(topology.morningBrief.failurePolicy.failClosed, true);
  assert.deepEqual(topology.morningBrief.cardKinds, REQUIRED_CARD_KINDS);
  assert.equal(topology.morningBrief.feedless, true);
  assert.equal(topology.morningBrief.maxWeatherCities, 10);
  assert.equal(topology.morningBrief.reliableForecastHorizonDays, 14);
  assert.equal(topology.morningBrief.extendedOutlookMaxDays, 21);
  assert.equal(
    topology.morningBrief.extendedOutlookUncertaintyLabelRequired,
    true,
  );

  const unbounded = await loadTopology();
  unbounded.morningBrief.surfaces[0].maxItems = 21;
  assert.throws(() => validateTopology(unbounded), /surface bounds/);

  const failOpen = await loadTopology();
  failOpen.morningBrief.failurePolicy.failClosed = false;
  assert.throws(() => validateTopology(failOpen), /fail-closed/);
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
    'f027bb65f795e54b1bcfbc36db3098da3e4fcc2a',
  );
  assert.equal(
    topology.implementation.web.revision,
    '81d4a56e2d7af87623fdc0af73a90e0b5dc77870',
  );
  assert.equal(
    topology.implementation.desktop.revision,
    'e9f5bc1829692f4ed518e5e43b3256fe1b388972',
  );
  assert.equal(
    topology.implementation.flutter.revision,
    '4c8b391b98b267d13b92c93360d2854987364b4e',
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

test('tracks the complete non-empty Happy Wakey fleet', async () => {
  const topology = validateTopology(await loadTopology());
  assert.equal(topology.fleet.organization, 'happy-wakey');
  assert.deepEqual(topology.fleet.requiredRepositories, REQUIRED_REPOSITORIES);
  assert.equal(topology.fleet.requiredRepositories.length, 23);
  assert.equal(topology.fleet.allRepositoriesNonEmpty, true);
  assert.equal(topology.fleet.archivedRepositoriesAllowed, false);

  const missing = await loadTopology();
  missing.fleet.requiredRepositories.pop();
  assert.throws(() => validateTopology(missing), /fleet completeness/);
});

test('keeps individual and organization onboarding fail closed', async () => {
  const topology = validateTopology(await loadTopology());
  assert.deepEqual(topology.onboarding.accountKinds, [
    'individual',
    'organization',
  ]);
  assert.equal(topology.onboarding.identityAuthority, 'github.com/shared-auth');
  assert.equal(topology.onboarding.entryHosts.individual, 'user.hawky.pro');
  assert.equal(topology.onboarding.entryHosts.organization, 'org.hawky.pro');
  assert.equal(topology.onboarding.seatAllocationRequired, true);
  assert.equal(topology.onboarding.connectorConsentRequired, true);
  assert.equal(topology.onboarding.credentialsInProductDatabaseAllowed, false);

  const unsafe = await loadTopology();
  unsafe.onboarding.credentialsInProductDatabaseAllowed = true;
  assert.throws(() => validateTopology(unsafe), /onboarding contract/);
});

test('allows a social deep link only after a consented useful decision', async () => {
  const topology = validateTopology(await loadTopology());
  const policy = topology.messageCuration;
  assert.equal(policy.supportedApisWebhooksOrExportsOnly, true);
  assert.equal(policy.scrapingAllowed, false);
  assert.equal(policy.minimumUsefulnessScore, 0.8);
  assert.equal(policy.deepLinkRequiresUsefulDecision, true);
  assert.equal(policy.deepLinkRequiresReauthentication, true);
  assert.equal(policy.feedFallbackAllowed, false);

  const feedFallback = await loadTopology();
  feedFallback.messageCuration.feedFallbackAllowed = true;
  assert.throws(() => validateTopology(feedFallback), /curation policy/);
});

test('keeps vectors, regressions, and interface authorities independent', async () => {
  const topology = validateTopology(await loadTopology());
  assert.deepEqual(topology.intelligence.independentInterfaceAuthorities, [
    'typespec',
    'json-schema',
  ]);
  assert.deepEqual(topology.intelligence.runtimeValidationAuthorities, [
    'json-schema',
    'protobuf',
  ]);
  assert.equal(topology.intelligence.vectorDimensions.maximum, 4100);
  assert.equal(topology.intelligence.databaseRlsRequired, true);
  assert.equal(topology.intelligence.causalClaimsAllowed, false);

  const causal = await loadTopology();
  causal.intelligence.causalClaimsAllowed = true;
  assert.throws(() => validateTopology(causal), /vector, regression/);
});

test('bounds browser WebSockets, server TLS, chat, and private admin MCP', async () => {
  const topology = validateTopology(await loadTopology());
  assert.equal(
    topology.realtime.browserTransport,
    'cloudflare-durable-object-websocket-hibernation',
  );
  assert.equal(topology.realtime.serverTransport, 'tls-length-delimited-json');
  assert.equal(topology.realtime.maxWebSocketSessionSeconds, 900);
  assert.equal(topology.realtime.maxSocketsPerTenantObject, 128);
  assert.equal(topology.realtime.adminMcpNetwork, 'private-vpc-mtls');
  assert.equal(topology.realtime.adminPublicIngressAllowed, false);
  assert.equal(topology.chat.authority, 'github.com/ores-chat');

  const publicAdmin = await loadTopology();
  publicAdmin.realtime.adminPublicIngressAllowed = true;
  assert.throws(() => validateTopology(publicAdmin), /private admin boundary/);
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

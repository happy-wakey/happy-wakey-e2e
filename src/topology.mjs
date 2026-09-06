import { readFile } from 'node:fs/promises';

export const REQUIRED_MODES = Object.freeze([
  'direct_db_read',
  'stateless_https',
  'stateful_tls',
  'async_jetstream',
]);

const REQUIRED_BRIEF_SURFACES = Object.freeze({
  important_email: {
    section: 'inbox',
    route: '/v1/inbox/digest',
    authorization: 'provider-scoped-read-only',
    contentPolicy: 'metadata-or-bounded-snippet',
  },
  direct_messages: {
    section: 'messages',
    route: '/v1/messages/digest',
    authorization: 'optional-gateway-policy-scoped',
    contentPolicy: 'platform-access-level',
  },
  sleep: {
    section: 'sleep',
    route: '/v1/health/sleep/{day}',
    authorization: 'explicit-device-consent',
    contentPolicy: 'measured-or-modeled-labelled',
  },
  biometrics: {
    section: 'biometrics',
    route: '/v1/health/biometrics/{day}',
    authorization: 'explicit-device-consent',
    contentPolicy: 'personal-baseline-no-diagnosis',
  },
});

function validateMorningBrief(brief) {
  if (
    brief?.deliveryContract !== 'happy-wakey-interfaces.morning-briefing.v1' ||
    brief?.compositionContract !==
      'happy-wakey-interfaces.briefing-composition.v1'
  ) {
    throw new Error('morning brief contract authority is required');
  }

  const surfaces = brief.surfaces;
  if (!Array.isArray(surfaces) || surfaces.length !== 4) {
    throw new Error('morning brief must declare exactly four surfaces');
  }
  const seen = new Set();
  for (const surface of surfaces) {
    const expected = REQUIRED_BRIEF_SURFACES[surface?.id];
    if (!expected || seen.has(surface.id)) {
      throw new Error('morning brief surfaces must be unique and complete');
    }
    seen.add(surface.id);
    for (const [key, value] of Object.entries(expected)) {
      if (surface[key] !== value) {
        throw new Error(`morning brief ${surface.id} contract drifted`);
      }
    }
    if (
      !Number.isInteger(surface.maxItems) ||
      surface.maxItems < 1 ||
      surface.maxItems > 20
    ) {
      throw new Error('morning brief surface bounds are invalid');
    }
  }
  if (seen.size !== Object.keys(REQUIRED_BRIEF_SURFACES).length) {
    throw new Error('morning brief surfaces are incomplete');
  }

  const bounds = brief.bounds;
  if (
    bounds?.maxSurfaces !== 4 ||
    bounds.maxItemsPerSurface !== 20 ||
    bounds.maxTextBytes !== 4096
  ) {
    throw new Error('morning brief bounds are invalid');
  }
  const failurePolicy = brief.failurePolicy;
  if (
    !failurePolicy?.independentLanes ||
    !failurePolicy.failClosed ||
    !failurePolicy.degradedStateRequired
  ) {
    throw new Error('morning brief failure policy must remain fail-closed');
  }
}

export async function loadTopology(
  location = new URL('../topology.json', import.meta.url),
) {
  return JSON.parse(await readFile(location, 'utf8'));
}

export function validateTopology(topology) {
  const auth = topology?.sharedAuth;
  if (
    auth?.identityProof !== 'official-typed-protected-introspection' ||
    !auth.serviceCredentialIndependent ||
    auth.requiredAudience !== 'happy-wakey' ||
    !auth.failClosed ||
    !auth.realmIsolation
  ) {
    throw new Error('Shared Auth typed introspection must remain fail-closed');
  }
  if (auth.productAuthorization !== 'happy-wakey') {
    throw new Error('product authorization must remain Happy Wakey-owned');
  }

  for (const [name, value] of Object.entries(topology.implementation ?? {})) {
    const revision = typeof value === 'string' ? value : value?.revision;
    if (!/^[0-9a-f]{40}$/.test(revision ?? '')) {
      throw new Error(`implementation pin is not immutable: ${name}`);
    }
  }
  for (const service of ['api', 'web', 'cli', 'desktop', 'flutter']) {
    const implementation = topology.implementation?.[service];
    if (
      implementation?.delivery !== 'merged-main' ||
      implementation.requiredCi !== 'hosted-green-current-sha'
    ) {
      throw new Error(`${service} delivery status is not honest`);
    }
  }

  const bluetooth = topology.bluetooth;
  if (
    bluetooth?.serviceUuid !== '8e0e0001-7d5a-4c3f-9c31-94e9d447fc01' ||
    bluetooth.commandCharacteristicUuid !== '8e0e0002-7d5a-4c3f-9c31-94e9d447fc01' ||
    bluetooth.commandSchema !== 'happy-wakey.ble.preview-command.v1' ||
    bluetooth.maxCommandBytes !== 512 ||
    bluetooth.scanTimeoutMs !== 4000 ||
    bluetooth.connectTimeoutMs !== 8000 ||
    bluetooth.credentialFieldsAllowed ||
    bluetooth.nativeImplementations?.rust !== 'btleplug' ||
    bluetooth.nativeImplementations?.flutter !== 'universal_ble' ||
    bluetooth.formalLane?.name !== 'bluetooth' ||
    !bluetooth.formalLane.generationFenced ||
    !bluetooth.formalLane.staleCompletionsSuppressed
  ) {
    throw new Error('Bluetooth transport contract was weakened');
  }

  const modes = new Map(topology.modes?.map((mode) => [mode.id, mode]) ?? []);
  for (const required of REQUIRED_MODES) {
    if (!modes.has(required)) {
      throw new Error(`missing interaction mode: ${required}`);
    }
  }
  if (modes.size !== REQUIRED_MODES.length) {
    throw new Error('interaction modes must be unique and exactly bounded');
  }
  const direct = modes.get('direct_db_read');
  if (
    direct.writesAllowed ||
    direct.databaseRole !== 'read-only-principal' ||
    direct.rawConnectionExposed
  ) {
    throw new Error('direct database access from the web tier must be read-only');
  }

  const https = modes.get('stateless_https');
  if (
    https.transport !== 'https-json' ||
    https.redirectsAllowed ||
    !https.bearerPerRequest
  ) {
    throw new Error('stateless mode must remain bounded HTTPS');
  }

  const tcp = modes.get('stateful_tls');
  if (
    tcp.transport !== 'tls-length-delimited-json' ||
    !tcp.reauthenticateEveryFrame ||
    tcp.connectionIdentityCache
  ) {
    throw new Error('stateful mode must reauthenticate every TLS frame');
  }

  const nats = modes.get('async_jetstream');
  if (
    nats.transport !== 'nats-jetstream-outbox' ||
    nats.registration !== 'authenticated-https' ||
    !nats.signalCredentialFree ||
    nats.coreNatsAllowed ||
    nats.requestConsumer !== 'durable-explicit-ack-pull' ||
    !nats.responseCommittedBeforePublish ||
    !nats.responsePublishAckBeforeRequestAck ||
    !nats.deterministicMessageId ||
    !nats.redeliveryReplaysStoredResponse
  ) {
    throw new Error('async mode must preserve durable outbox/JetStream semantics');
  }

  if (topology.telemetry?.provider !== 'oresoftware/next-loggers-rust') {
    throw new Error('the Ores telemetry contract is required');
  }
  if (
    topology.crossMode?.automaticFallback ||
    topology.crossMode?.maxRequestBytes !== 32768 ||
    topology.crossMode?.maxResponseBytes !== 921600
  ) {
    throw new Error('cross-mode bounds or fallback policy changed');
  }

  validateMorningBrief(topology.morningBrief);

  return topology;
}

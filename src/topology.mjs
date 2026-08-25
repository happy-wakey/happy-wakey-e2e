import { readFile } from 'node:fs/promises';

export const REQUIRED_MODES = Object.freeze([
  'direct_db_read',
  'stateless_https',
  'stateful_tls',
  'async_jetstream',
]);

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
  for (const service of ['api', 'web']) {
    const implementation = topology.implementation?.[service];
    if (
      implementation?.delivery !== 'merged-main' ||
      implementation.requiredCi !== 'blocked-private-shared-auth-source'
    ) {
      throw new Error(`${service} delivery status is not honest`);
    }
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

  return topology;
}

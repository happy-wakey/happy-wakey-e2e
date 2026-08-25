import { readFile } from 'node:fs/promises';

export const REQUIRED_MODES = Object.freeze([
  'direct_db_read',
  'stateless_http',
  'stateful_tcp',
  'async_nats',
]);

export async function loadTopology(
  location = new URL('../topology.json', import.meta.url),
) {
  return JSON.parse(await readFile(location, 'utf8'));
}

export function validateTopology(topology) {
  if (!topology?.sharedAuth?.realmIsolation) {
    throw new Error('Shared Auth realm isolation must be enabled');
  }
  if (topology.sharedAuth.productAuthorization !== 'happy-wakey') {
    throw new Error('product authorization must remain Happy Wakey-owned');
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
  if (modes.get('direct_db_read').writesAllowed) {
    throw new Error('direct database access from the web tier must be read-only');
  }
  if (modes.get('async_nats').transport !== 'nats-jetstream-request-reply') {
    throw new Error('asynchronous mutation delivery must use a durable NATS mode');
  }
  if (topology.telemetry?.provider !== 'ores-otel/ores.otel.log') {
    throw new Error('the Ores telemetry contract is required');
  }

  return topology;
}

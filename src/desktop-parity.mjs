import { readFile } from 'node:fs/promises';

export const REQUIRED_DESTINATION_IDS = Object.freeze([
  'home',
  'calendar',
  'weather',
  'markets',
  'news',
  'planner',
  'focus',
  'devices',
  'browser',
  'settings',
]);

export async function loadDesktopParity(
  location = new URL('../contracts/desktop-parity.json', import.meta.url),
) {
  return JSON.parse(await readFile(location, 'utf8'));
}

export function validateDesktopParity(contract) {
  if (contract?.schema !== 'happy-wakey.desktop-parity.v1') {
    throw new Error('desktop parity schema must remain versioned');
  }
  const ids = (contract.destinations ?? []).map(({ id }) => id);
  if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_DESTINATION_IDS)) {
    throw new Error('desktop destinations drifted from the shared contract');
  }
  for (const destination of contract.destinations) {
    if (!destination.label || destination.label.length > 24) {
      throw new Error(`destination label is invalid: ${destination.id}`);
    }
  }
  const ble = contract.ble;
  if (
    ble?.schema !== 'happy-wakey.ble.preview-command.v1' ||
    ble.action !== 'preview_alarm' ||
    ble.durationMs !== 3000 ||
    ble.maxBytes !== 512 ||
    ble.serviceUuid !== '8e0e0001-7d5a-4c3f-9c31-94e9d447fc01' ||
    ble.commandUuid !== '8e0e0002-7d5a-4c3f-9c31-94e9d447fc01'
  ) {
    throw new Error('BLE preview command contract drifted');
  }
  for (const field of ['token', 'subject', 'owner_id']) {
    if (!ble.forbiddenFields?.includes(field)) {
      throw new Error(`BLE contract must forbid ${field}`);
    }
  }
  const safety = contract.urlSafety;
  if (
    safety?.platformUrlDefault !== '' ||
    safety.forbidPublicIpHosts !== true ||
    safety.httpsRequiredExceptLoopback !== true ||
    safety.loopbackHttpAllowed !== true
  ) {
    throw new Error('URL safety contract must remain fail-closed');
  }
  return contract;
}

export function encodePreviewAlarmCommand(operationId) {
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      operationId,
    )
  ) {
    throw new Error('Bluetooth operation identifier must be a UUID');
  }
  const payload = JSON.stringify({
    schema: 'happy-wakey.ble.preview-command.v1',
    operation_id: operationId.toLowerCase(),
    action: 'preview_alarm',
    duration_ms: 3000,
  });
  const bytes = Buffer.from(payload, 'utf8');
  if (bytes.length > 512) {
    throw new Error('Bluetooth command exceeded its byte limit');
  }
  return bytes;
}

export function isSafeHttpUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const numericIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
  if (parsed.protocol === 'http:') return loopback;
  if (parsed.protocol !== 'https:') return false;
  return loopback || !numericIp;
}

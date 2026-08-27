import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  encodePreviewAlarmCommand,
  isSafeHttpUrl,
  loadDesktopParity,
  validateDesktopParity,
} from '../src/desktop-parity.mjs';

function sibling(relative) {
  return fileURLToPath(new URL(relative, import.meta.url));
}

test('desktop destinations stay at Flutter/Qt feature parity', async () => {
  const contract = validateDesktopParity(await loadDesktopParity());
  assert.equal(contract.destinations.length, 10);
  assert.deepEqual(
    contract.destinations.map(({ label }) => label),
    [
      'Home',
      'Calendar',
      'Weather',
      'Markets',
      'News',
      'Planner',
      'Focus',
      'Devices',
      'Browser',
      'Settings',
    ],
  );
});

test('BLE preview command is versioned, bounded, and credential-free', async () => {
  const contract = validateDesktopParity(await loadDesktopParity());
  const bytes = encodePreviewAlarmCommand(
    '018f5cc6-6d8b-7b2a-9f38-269e6a7b1f11',
  );
  assert.ok(bytes.length <= contract.ble.maxBytes);
  const value = JSON.parse(bytes.toString('utf8'));
  assert.equal(value.schema, contract.ble.schema);
  assert.equal(value.action, contract.ble.action);
  assert.equal(value.duration_ms, contract.ble.durationMs);
  for (const field of contract.ble.forbiddenFields) {
    assert.equal(value[field], undefined);
  }
  assert.throws(() => encodePreviewAlarmCommand('not-an-operation-id'));
});

test('platform and bookmark URLs fail closed without a public IP default', async () => {
  const contract = validateDesktopParity(await loadDesktopParity());
  assert.equal(contract.urlSafety.platformUrlDefault, '');
  assert.equal(isSafeHttpUrl('https://example.test/v1'), true);
  assert.equal(isSafeHttpUrl('http://127.0.0.1:8128/'), true);
  assert.equal(isSafeHttpUrl('http://example.test'), false);
  assert.equal(isSafeHttpUrl('https://98.90.186.114/'), false);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
});

test('sibling Flutter and Qt trees match the contract when checked out', async () => {
  const contract = validateDesktopParity(await loadDesktopParity());
  const flutterDest = sibling(
    '../../happy-wakey-flutter/lib/src/core/desktop_destinations.dart',
  );
  const flutterEnv = sibling(
    '../../happy-wakey-flutter/lib/src/core/environment.dart',
  );
  const flutterBle = sibling(
    '../../happy-wakey-flutter/lib/src/services/bluetooth_service.dart',
  );
  const rustDest = sibling(
    '../../happy-wakey-desktop-app.rs/src/destinations.rs',
  );
  const rustGateway = sibling('../../happy-wakey-desktop-app.rs/src/gateway.rs');
  const rustEnv = sibling('../../happy-wakey-desktop-app.rs/src/env_config.rs');
  const rustBle = sibling('../../happy-wakey-desktop-app.rs/src/bluetooth.rs');
  if (
    ![
      flutterDest,
      flutterEnv,
      flutterBle,
      rustDest,
      rustGateway,
      rustEnv,
      rustBle,
    ].every(existsSync)
  ) {
    return;
  }
  const flutterDestSource = readFileSync(flutterDest, 'utf8');
  const flutterEnvSource = readFileSync(flutterEnv, 'utf8');
  const rustDestSource = readFileSync(rustDest, 'utf8');
  const rustGatewaySource = readFileSync(rustGateway, 'utf8');
  const rustEnvSource = readFileSync(rustEnv, 'utf8');
  for (const destination of contract.destinations) {
    assert.match(flutterDestSource, new RegExp(`id: '${destination.id}'`));
    assert.match(flutterDestSource, new RegExp(`label: '${destination.label}'`));
    assert.match(rustDestSource, new RegExp(`id: "${destination.id}"`));
    assert.match(rustDestSource, new RegExp(`label: "${destination.label}"`));
  }
  assert.doesNotMatch(flutterEnvSource, /defaultValue:\s*'https:\/\//);
  assert.doesNotMatch(rustGatewaySource, /DEFAULT_PLATFORM_URL/);
  assert.doesNotMatch(rustEnvSource, /98\.90\.186\.114/);
  assert.match(
    readFileSync(flutterBle, 'utf8'),
    new RegExp(contract.ble.schema),
  );
  assert.match(readFileSync(rustBle, 'utf8'), new RegExp(contract.ble.schema));
});

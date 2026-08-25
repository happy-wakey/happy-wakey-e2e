import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.HAPPY_WAKEY_LIVE_E2E === '1';
const endpoints = [
  ['api', process.env.HAPPY_WAKEY_API_BASE],
  ['web', process.env.HAPPY_WAKEY_WEB_BASE],
  ['shared-auth', process.env.HAPPY_WAKEY_SHARED_AUTH_BASE],
];

function healthUrl(base) {
  const url = new URL('/healthz', base);
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('live endpoints require HTTPS except explicit loopback tests');
  }
  return url;
}

for (const [name, base] of endpoints) {
  test(
    `${name} health is bounded and does not redirect`,
    { skip: !live || !base },
    async () => {
      const response = await fetch(healthUrl(base), {
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      assert.equal(response.ok, true);
      const body = await response.text();
      assert.ok(body.length <= 4_096, 'health body must remain bounded');
    },
  );
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTopology, validateTopology } from '../src/topology.mjs';

// Independent mutations of an otherwise valid contract must always fail closed.
// Keep these cases separate so CI identifies exactly which boundary regressed.
const mutations = [
  ['realtime public admin ingress', (t) => { t.realtime.adminPublicIngressAllowed = true; }, /realtime or private admin boundary/],
  ['disabled realtime authentication', (t) => { t.realtime.sharedAuthAdmissionRequired = false; }, /realtime or private admin boundary/],
  ['cross-mode automatic downgrade', (t) => { t.crossMode.automaticFallback = true; }, /fallback policy/],
  ['oversize cross-mode request', (t) => { t.crossMode.maxRequestBytes = 32769; }, /cross-mode bounds/],
  ['stateful TLS identity reuse', (t) => {
    t.modes.find((mode) => mode.id === 'stateful_tls').connectionIdentityCache = true;
  }, /reauthenticate every TLS frame/],
  ['public connector scraping', (t) => { t.messageCuration.scrapingAllowed = true; }, /message|curation|scrap/i],
  ['uncertainty omitted from outlook', (t) => {
    t.morningBrief.extendedOutlookUncertaintyLabelRequired = false;
  }, /morning HUD feature or uncertainty policy/],
  ['client-owned identity credentials', (t) => {
    t.onboarding.credentialsInProductDatabaseAllowed = true;
  }, /onboarding contract/],
];

for (const [name, mutate, expected] of mutations) {
  test(`rejects ${name}`, async () => {
    const topology = await loadTopology();
    mutate(topology);
    assert.throws(() => validateTopology(topology), expected);
  });
}

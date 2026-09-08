import { readFile } from 'node:fs/promises';

export const REQUIRED_MODES = Object.freeze([
  'direct_db_read',
  'stateless_https',
  'stateful_tls',
  'async_jetstream',
]);

export const REQUIRED_REPOSITORIES = Object.freeze([
  'happy-wakey-admin-api-server.rs',
  'happy-wakey-admin-web-server.rs',
  'happy-wakey-api-server.rs',
  'happy-wakey-assets',
  'happy-wakey-cli',
  'happy-wakey-clients',
  'happy-wakey-desktop-app.rs',
  'happy-wakey-docs',
  'happy-wakey-e2e',
  'happy-wakey-flutter',
  'happy-wakey-infra',
  'happy-wakey-interfaces',
  'happy-wakey-lambdas',
  'happy-wakey-lib-core',
  'happy-wakey-mcp-server.rs',
  'happy-wakey-monorepo',
  'happy-wakey-orm-core',
  'happy-wakey-pub-lib-core',
  'happy-wakey-sidecar.rs',
  'happy-wakey-sync',
  'happy-wakey-web-server.rs',
  'happy-wakey.github.io',
  'happy-wakey.rs',
]);

export const REQUIRED_CARD_KINDS = Object.freeze([
  'this_day_in_history',
  'useful_message',
  'email_bottleneck',
  'team_bottleneck',
  'calendar',
  'weather',
  'extended_outlook',
  'flight',
  'market',
  'kpi',
  'task',
  'news',
  'audio_briefing',
]);

const REQUIRED_COMPOSITION_LANES = Object.freeze([
  'briefing',
  'day_plan',
  'tasks',
  'habits',
  'focus',
  'sleep',
  'biometrics',
  'inbox',
  'messages',
  'markets',
  'environment',
  'modules',
]);

function hasExactMembers(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((value) => actual.includes(value));
}

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
  if (
    !hasExactMembers(brief.cardKinds, REQUIRED_CARD_KINDS) ||
    !hasExactMembers(brief.compositionLanes, REQUIRED_COMPOSITION_LANES) ||
    !brief.feedless ||
    brief.maxWeatherCities !== 10 ||
    brief.reliableForecastHorizonDays !== 14 ||
    brief.extendedOutlookMaxDays !== 21 ||
    !brief.extendedOutlookUncertaintyLabelRequired
  ) {
    throw new Error('morning HUD feature or uncertainty policy drifted');
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

function validateFleet(topology) {
  const fleet = topology.fleet;
  if (
    fleet?.organization !== 'happy-wakey' ||
    !hasExactMembers(fleet.requiredRepositories, REQUIRED_REPOSITORIES) ||
    !fleet.allRepositoriesNonEmpty ||
    fleet.archivedRepositoriesAllowed ||
    fleet.selfRevisionPolicy !== 'merged-commit-is-authority'
  ) {
    throw new Error('Happy Wakey fleet completeness contract drifted');
  }

  const onboarding = topology.onboarding;
  if (
    onboarding?.identityAuthority !== 'github.com/shared-auth' ||
    !hasExactMembers(onboarding.accountKinds, ['individual', 'organization']) ||
    onboarding.entryHosts?.individual !== 'user.hawky.pro' ||
    onboarding.entryHosts?.organization !== 'org.hawky.pro' ||
    !hasExactMembers(onboarding.organizationMembershipRoles, [
      'member',
      'manager',
      'org_admin',
      'owner',
    ]) ||
    !onboarding.seatAllocationRequired ||
    !onboarding.connectorConsentRequired ||
    onboarding.credentialsInProductDatabaseAllowed
  ) {
    throw new Error('B2C/B2B onboarding contract drifted');
  }

  const expectedDomains = {
    'hawky.pro': 'marketing',
    'app.hawky.pro': 'primary-web',
    'user.hawky.pro': 'individual-login-and-pages',
    'org.hawky.pro': 'organization-login-and-pages',
    'api.hawky.pro': 'public-api',
    'main.hawky.pro': 'organization-main-deep-link',
    'admin.hawky.pro': 'private-admin-web',
    'admin-api.hawky.pro': 'private-admin-api',
    'm.hawky.pro': 'mobile-web',
  };
  if (
    Object.keys(topology.domains ?? {}).length !==
      Object.keys(expectedDomains).length ||
    Object.entries(expectedDomains).some(
      ([host, purpose]) => topology.domains?.[host] !== purpose,
    )
  ) {
    throw new Error('hawky.pro host routing contract drifted');
  }
}

function validateRealtimeAndIntelligence(topology) {
  const realtime = topology.realtime;
  if (
    realtime?.browserTransport !==
      'cloudflare-durable-object-websocket-hibernation' ||
    realtime.serverTransport !== 'tls-length-delimited-json' ||
    !realtime.tenantPartitioned ||
    !realtime.sharedAuthAdmissionRequired ||
    realtime.maxWebSocketSessionSeconds !== 900 ||
    realtime.maxSocketsPerTenantObject !== 128 ||
    realtime.maxFrameBytes !== 32768 ||
    realtime.adminMcpNetwork !== 'private-vpc-mtls' ||
    realtime.adminPublicIngressAllowed
  ) {
    throw new Error('realtime or private admin boundary drifted');
  }

  const curation = topology.messageCuration;
  if (
    !hasExactMembers(curation?.providers, [
      'email',
      'whatsapp',
      'linkedin',
      'x_dm',
      'slack',
      'teams',
    ]) ||
    !curation.supportedApisWebhooksOrExportsOnly ||
    curation.scrapingAllowed ||
    !curation.consentRequired ||
    curation.minimumUsefulnessScore !== 0.8 ||
    !curation.decisionRequiresContentHash ||
    !curation.deepLinkRequiresUsefulDecision ||
    !curation.deepLinkRequiresReauthentication ||
    curation.feedFallbackAllowed
  ) {
    throw new Error('feedless message curation policy drifted');
  }

  const intelligence = topology.intelligence;
  if (
    !hasExactMembers(intelligence?.independentInterfaceAuthorities, [
      'typespec',
      'json-schema',
    ]) ||
    !hasExactMembers(intelligence.runtimeValidationAuthorities, [
      'json-schema',
      'protobuf',
    ]) ||
    !hasExactMembers(intelligence.databaseScopeKeys, [
      'tenant_id',
      'subject_id',
    ]) ||
    !intelligence.databaseRlsRequired ||
    intelligence.vectorDimensions?.minimum !== 1 ||
    intelligence.vectorDimensions?.maximum !== 4100 ||
    !hasExactMembers(intelligence.regressionCorrections, [
      'none',
      'bonferroni',
      'benjamini_hochberg',
    ]) ||
    intelligence.causalClaimsAllowed
  ) {
    throw new Error('vector, regression, or schema authority drifted');
  }

  const chat = topology.chat;
  if (
    chat?.authority !== 'github.com/ores-chat' ||
    !hasExactMembers(chat.audiences, [
      'sales_visitor',
      'customer_support',
      'organization_admin',
      'internal_operator',
      'owner',
    ]) ||
    !chat.explicitSearchScopesRequired ||
    chat.adminMcpConnection !== 'private-vpc-mtls'
  ) {
    throw new Error('Ores Chat audience or MCP isolation drifted');
  }

  const common = topology.commonBackend;
  const expectedAuthorities = [
    ['middleware', 'github.com/oresoftware/ores-middleware'],
    ['rateLimiting', 'github.com/ores-rate-limit'],
    ['telemetry', 'github.com/ores-otel'],
    ['stateSync', 'github.com/opto-sync'],
    ['chat', 'github.com/ores-chat'],
    ['cliConfiguration', 'github.com/flags-2-env'],
  ];
  if (expectedAuthorities.some(([name, value]) => common?.[name] !== value)) {
    throw new Error('common backend authority drifted');
  }
}

export async function loadTopology(
  location = new URL('../topology.json', import.meta.url),
) {
  return JSON.parse(await readFile(location, 'utf8'));
}

export function validateTopology(topology) {
  validateFleet(topology);
  validateRealtimeAndIntelligence(topology);
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

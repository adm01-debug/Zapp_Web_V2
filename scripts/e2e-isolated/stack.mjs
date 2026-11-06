import { ORIGIN, PROVIDER_ORIGIN, CATALOG_SKU, OFFICIAL_HOST, OWNER_LABEL, PURPOSE, PURPOSE_LABEL, assertRunId, assertSourceSha, fail } from './runtime-contract.mjs';

export function serviceConfiguration({ credentials: c, runId, sourceSha, fullSuite = false }) {
  assertRunId(runId); assertSourceSha(sourceSha);
  const database = role => 'postgres://' + role + ':' + c.databasePassword + '@127.0.0.1:5432/postgres';
  const shared = { TZ: 'UTC' };
  return {
    postgres: {
      env: { ...shared, POSTGRES_USER: 'supabase_admin', POSTGRES_PASSWORD: c.databasePassword, POSTGRES_DB: 'postgres', POSTGRES_HOST: '/var/run/postgresql', PGPORT: '5432', JWT_EXP: '3600' },
      args: ['postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf', '-c', 'cron.launch_active_jobs=off', '-c', 'listen_addresses=127.0.0.1', '-c', 'log_min_messages=fatal'],
    },
    auth: {
      env: {
        ...shared, GOTRUE_API_HOST: '127.0.0.1', GOTRUE_API_PORT: '9999',
        API_EXTERNAL_URL: ORIGIN + '/auth/v1',
        GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: database('supabase_auth_admin'),
        GOTRUE_SITE_URL: ORIGIN, GOTRUE_URI_ALLOW_LIST: ORIGIN,
        GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
        GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
        GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_SECRET: c.jwtSecret, GOTRUE_JWT_ISSUER: ORIGIN + '/auth/v1',
        GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'true',
        GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false', GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
        GOTRUE_SMTP_HOST: '127.0.0.1', GOTRUE_SMTP_PORT: '1025',
        GOTRUE_SMTP_ADMIN_EMAIL: 'no-mail@example.invalid', GOTRUE_SMTP_SENDER_NAME: 'E2E local',
        GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify',
        GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',
      },
      // The image's default entrypoint runs its real migrations before serving.
      args: [],
    },
    rest: {
      env: {
        ...shared, PGRST_DB_URI: database('authenticator'), PGRST_DB_SCHEMAS: 'public,storage',
        PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions', PGRST_DB_ANON_ROLE: 'anon',
        PGRST_JWT_SECRET: c.jwtSecret, PGRST_DB_USE_LEGACY_GUCS: 'false',
        PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: '3000',
        PGRST_ADMIN_SERVER_HOST: '127.0.0.1', PGRST_ADMIN_SERVER_PORT: '3001',
        PGRST_APP_SETTINGS_JWT_EXP: '3600',
      },
      args: [],
    },
    storage: {
      env: {
        ...shared, ANON_KEY: c.anonKey, SERVICE_KEY: c.serviceRoleKey, AUTH_JWT_SECRET: c.jwtSecret,
        POSTGREST_URL: 'http://127.0.0.1:3000', DATABASE_URL: database('supabase_storage_admin'),
        STORAGE_PUBLIC_URL: ORIGIN, REQUEST_ALLOW_X_FORWARDED_PATH: 'true',
        FILE_SIZE_LIMIT: '52428800', STORAGE_BACKEND: 'file', FILE_STORAGE_BACKEND_PATH: '/var/lib/storage',
        GLOBAL_S3_BUCKET: 'e2e-local', TENANT_ID: 'e2e-local', REGION: 'local',
        ENABLE_IMAGE_TRANSFORMATION: 'false',
      },
      args: [],
    },
    realtime: {
      env: {
        ...shared, PORT: '4000', DB_HOST: '127.0.0.1', DB_PORT: '5432', DB_USER: 'supabase_admin',
        DB_PASSWORD: c.databasePassword, DB_NAME: 'postgres', DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime',
        DB_ENC_KEY: c.databasePassword.slice(0, 16), API_JWT_SECRET: c.jwtSecret,
        SECRET_KEY_BASE: c.jwtSecret, METRICS_JWT_SECRET: c.jwtSecret,
        ERL_AFLAGS: '-proto_dist inet_tcp', DNS_NODES: "''", RLIMIT_NOFILE: '10000',
        APP_NAME: 'realtime', SEED_SELF_HOST: 'true', RUN_JANITOR: 'true', DISABLE_HEALTHCHECK_LOGGING: 'true',
      },
      args: [],
    },
    edge: {
      env: {
        ...shared, JWT_SECRET: c.jwtSecret, SUPABASE_URL: ORIGIN, SUPABASE_PUBLIC_URL: ORIGIN,
        SUPABASE_ANON_KEY: c.anonKey, SUPABASE_SERVICE_ROLE_KEY: c.serviceRoleKey,
        SUPABASE_DB_URL: database('postgres'),
        EVOLUTION_API_URL: PROVIDER_ORIGIN, EVOLUTION_API_KEY: c.evolutionKey,
        EVOLUTION_API_FLAVOR: 'GO', EVOLUTION_DEFAULT_INSTANCE: 'E2E_LOCAL',
        EVOLUTION_DEFAULT_INSTANCE_TOKEN: c.instanceToken,
        ...(fullSuite ? { PROMOGIFTS_SUPABASE_URL: PROVIDER_ORIGIN, PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY: c.catalogKey } : {}),
        ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha,
      },
      args: ['start', '--user-worker-request-idle-timeout', '150000', '--main-service', '/bundles/main.eszip'],
    },
    gateway: {
      env: { ...shared, ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha },
      args: ['node', '/work/scripts/e2e-isolated/gateway.mjs'],
    },
    ...(fullSuite ? { provider: {
      env: { ...shared, ZAPP_E2E_RUN_ID: runId, GITHUB_SHA: sourceSha,
        EVOLUTION_API_KEY: c.evolutionKey, EVOLUTION_DEFAULT_INSTANCE_TOKEN: c.instanceToken,
        PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY: c.catalogKey, E2E_QR_INSTANCE_TOKEN: c.qrInstanceToken },
      args: ['node', '/work/scripts/e2e-isolated/providers.mjs'],
    } } : {}),
    vite: {
      env: {
        ...shared, NODE_ENV: 'development', HOME: '/tmp', GITHUB_SHA: sourceSha,
        VITE_ZAPP_LOCAL_SUPABASE_URL: ORIGIN, VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: c.anonKey,
        VITE_CRM_INTEGRATION_ENABLED: 'true',
      },
      args: ['bun', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
    },
    driver: {
      env: {
        ...shared, CI: 'true', HOME: '/tmp', GITHUB_SHA: sourceSha, ZAPP_E2E_RUN_ID: runId,
        ZAPP_E2E_LOCAL: '1', ZAPP_E2E_PROOF: '/run/zapp-e2e/proof.json', PLAYWRIGHT_BASE_URL: ORIGIN,
        VITE_ZAPP_LOCAL_SUPABASE_URL: ORIGIN, VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: c.anonKey,
        E2E_SUPABASE_URL_OVERRIDE: ORIGIN, E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE: c.anonKey,
        API_URL: ORIGIN, ANON_KEY: c.anonKey, SERVICE_ROLE_KEY: c.serviceRoleKey,
        E2E_LOCAL_SUPABASE_URL: ORIGIN, E2E_LOCAL_SUPABASE_ANON_KEY: c.anonKey,
        E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: c.serviceRoleKey,
        E2E_TEST_EMAIL: c.email, E2E_TEST_PASSWORD: c.password,
        ...(fullSuite ? { DB_URL: database('supabase_admin'), EVOLUTION_DEFAULT_INSTANCE_TOKEN: c.instanceToken,
          E2E_CATALOG_PRODUCT_SKU: CATALOG_SKU, E2E_QR_TEST_EMAIL: c.qrEmail,
          E2E_QR_TEST_PASSWORD: c.qrPassword, E2E_QR_INSTANCE_TOKEN: c.qrInstanceToken } : {}),
        CAPTURA_DIR: '/output/captures', PLAYWRIGHT_HTML_OPEN: 'never',
      },
      args: ['node', '-e', 'setInterval(() => {}, 1000)'],
    },
  };
}

/** Arguments are passed directly to execFile/spawn, never interpolated through a shell. */
export function containerArguments({ runId, name, image, anchorId, mounts = [], envFile, args = [], memory = '2g', user }) {
  assertRunId(runId);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) fail('invalid-service-name');
  if (typeof image !== 'string' || /(?:^|:)latest(?:$|@)/.test(image) || !/:[^/]+$/.test(image)) fail('unfixed-image');
  const result = [
    'run', '-d', '--name', runId + '-' + name,
    '--label', OWNER_LABEL + '=' + runId, '--label', PURPOSE_LABEL + '=' + PURPOSE,
    '--network', anchorId ? 'container:' + anchorId : 'none',
    '--cap-drop', 'NET_RAW', '--security-opt', 'no-new-privileges:true', '--memory', memory,
  ];
  // Official services retain the working directory configured in their images.
  if (['anchor', 'driver', 'vite', 'gateway'].includes(name)) result.push('--workdir', '/work');
  // Docker disallows --add-host for container: networks; descendants reuse the
  // anchor's hosts file and the controller verifies that file in driver and PG.
  if (!anchorId) result.push('--add-host', OFFICIAL_HOST + ':127.0.0.1');
  if (user !== undefined) {
    if (!/^\d+:\d+$/.test(user)) fail('invalid-container-user');
    result.push('--user', user);
  }
  if (envFile) result.push('--env-file', envFile);
  for (const mount of mounts) {
    if (!['bind', 'volume'].includes(mount.type) || /[,\r\n]/.test(mount.source + mount.target)) fail('invalid-mount');
    result.push('--mount', 'type=' + mount.type + ',src=' + mount.source + ',dst=' + mount.target + (mount.readOnly ? ',readonly' : ''));
  }
  return result.concat(image, args);
}

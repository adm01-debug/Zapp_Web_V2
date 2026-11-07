/**
 * Seed sintético e idempotente da prova E2E da aba Arquivos (cartão t_6c2d8281).
 *
 *   bun e2e/fixtures/arquivos-local/seed.ts
 *
 * Exige no ambiente (saiam de `zapp-db-local env . <stack>`, nunca de produção):
 *   API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY
 *
 * O que garante no banco/Storage LOCAIS:
 *   - usuário auth.users + identity + profile + user_roles('agent') + user_settings
 *     (a linha de settings é o que suprime o overlay de boas-vindas — useOnboarding);
 *   - conexão WhatsApp sintética e 3 contatos atribuídos ao usuário:
 *       ArquivosLocal → 1 imagem + 1 vídeo + 1 áudio(ptt) + 1 documento (+ 1 texto);
 *       PaginacaoLocal → 65 mensagens de imagem (> MEDIA_PAGE_SIZE = 60);
 *       VazioLocal → só texto (aba mostra o estado "Nenhum arquivo nesta conversa");
 *   - objetos privados no bucket whatsapp-media sob <contact_id>/<arquivo> —
 *     o formato exigido pela policy "Users can read assigned whatsapp media".
 *
 * Idempotente: ids fixos + `on conflict`. Rodar duas vezes produz o mesmo estado.
 * Toda escrita dependente vai numa única transação; todo erro aborta com throw.
 */
// O tsconfig do e2e carrega só os tipos do Node, e o seed usa o cliente SQL
// transacional do Bun em runtime. A superfície usada fica declarada aqui (tipos
// mínimos), para o typecheck do repo cobrir também este arquivo.
type LinhasSql = Record<string, unknown>[];
interface SqlTx {
  (partes: TemplateStringsArray, ...valores: unknown[]): Promise<LinhasSql>;
}
interface SqlCliente extends SqlTx {
  begin<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}
// @ts-expect-error — 'bun' é módulo de runtime; não há pacote de tipos no projeto.
import { SQL } from 'bun';
const abrirSql = SQL as unknown as (url: string) => SqlCliente;
import { E2E_ARQUIVOS, caminhoObjeto, locatorObjeto } from './dados';
import { writeSync } from 'node:fs';

// Observabilidade sem mensagem, SQL, URL ou identificadores da fixture.
const SEED_DIAGNOSTIC_PREFIX = '[e2e-isolated/seed-files-volume-diagnostic] ';
const SEED_DIAGNOSTIC_STAGES = [
  'db-open', 'sql-begin', 'sql-auth-user', 'sql-auth-identity', 'sql-profile-read',
  'sql-profile-create', 'sql-profile-update', 'sql-user-role', 'sql-user-settings',
  'sql-connection', 'sql-contacts', 'sql-message-context', 'sql-media', 'sql-text', 'sql-pagination',
  'sql-empty-text', 'sql-commit', 'storage-upload-image', 'storage-upload-video',
  'storage-upload-audio', 'storage-upload-document', 'storage-upload-pagination',
  'auth-login', 'rls-media', 'rls-pagination', 'rls-volume-check', 'rls-pagination-check',
  'storage-sign', 'storage-reference-check', 'storage-download', 'storage-bytes-check',
  'storage-public-check', 'stdout-summary', 'db-close',
] as const;
type SeedStage = typeof SEED_DIAGNOSTIC_STAGES[number];
interface SeedFailure {
  stage: SeedStage;
  error_name: string;
  code?: string;
  sqlstate?: string;
  http_status?: number;
}
const SEED_ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError',
  'SQLError', 'PostgresError', 'AbortError', 'TimeoutError', 'UnknownError']);
const SEED_ERROR_CODES = new Set([
  'ERR_POSTGRES_SERVER_ERROR', 'ERR_POSTGRES_SYNTAX_ERROR', 'ERR_POSTGRES_CONNECTION_CLOSED',
  'ERR_POSTGRES_CONNECTION_FAILED', 'ERR_POSTGRES_CONNECTION_REFUSED', 'ERR_POSTGRES_AUTHENTICATION_FAILED_PBKDF2',
  'ERR_POSTGRES_INVALID_SERVER_KEY', 'ERR_POSTGRES_INVALID_SERVER_SIGNATURE',
  'ERR_POSTGRES_INVALID_TRANSACTION_STATE', 'ERR_POSTGRES_NOT_TAGGED_CALL',
  'ERR_POSTGRES_QUERY_CANCELLED', 'ERR_POSTGRES_TLS_NOT_AVAILABLE', 'ERR_POSTGRES_TLS_UPGRADE_FAILED',
  'ERR_POSTGRES_UNKNOWN_AUTHENTICATION_METHOD', 'ERR_POSTGRES_UNSAFE_TRANSACTION',
  'ERR_POSTGRES_UNSUPPORTED_AUTHENTICATION_METHOD', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
]);
let seedStage: SeedStage = 'db-open';
let seedHttpStatus: number | undefined;
let primarySeedFailure: SeedFailure | undefined;
let cleanupSeedFailure: SeedFailure | undefined;
function markSeedStage(stage: SeedStage): void {
  seedStage = stage;
  seedHttpStatus = undefined;
}
function seedFailureDescriptor(stage: SeedStage, error: unknown, httpStatus?: number): SeedFailure {
  const field = (name: string): unknown => {
    try { return error !== null && (typeof error === 'object' || typeof error === 'function') ? (error as Record<string, unknown>)[name] : undefined; }
    catch { return undefined; }
  };
  const name = field('name'), code = field('code'), errno = field('errno');
  return {
    stage,
    error_name: typeof name === 'string' && SEED_ERROR_NAMES.has(name) ? name : 'UnknownError',
    ...(typeof code === 'string' && SEED_ERROR_CODES.has(code) ? { code } : {}),
    ...(typeof errno === 'string' && /^(?!00000)[0-9A-Z]{5}$/.test(errno) ? { sqlstate: errno } : {}),
    ...(typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { http_status: httpStatus } : {}),
  };
}
function emitSeedFailure(failure: SeedFailure, cleanup?: SeedFailure): void {
  try {
    // Sincrona: EPIPE/erro de escrita não pode substituir o erro do seed.
    writeSync(2, SEED_DIAGNOSTIC_PREFIX + JSON.stringify({ schema: 1, failure, ...(cleanup ? { cleanup } : {}) }) + '\n');
  } catch { /* O catch externo relança o mesmo erro original. */ }
}

function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`seed arquivos-local: variável ${nome} ausente (rode via env de zapp-db-local)`);
  return valor;
}

function exigirLocal(url: string, rotulo: string): void {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`seed arquivos-local: ${rotulo} aponta para host não-local (${host}). Proibido.`);
  }
}

const API_URL = exigirEnv('API_URL').replace(/\/$/, '');
const DB_URL = exigirEnv('DB_URL');
const ANON_KEY = exigirEnv('ANON_KEY');
const SERVICE_ROLE_KEY = exigirEnv('SERVICE_ROLE_KEY');
exigirLocal(API_URL, 'API_URL');
exigirLocal(DB_URL, 'DB_URL');

const { usuario, conexao, contato, contatoPaginacao, contatoVazio, bucket, mensagens } =
  E2E_ARQUIVOS;
const TOTAL_PAGINACAO = contatoPaginacao.totalMidias;

// PNG 1x1 transparente válido (decodifica no <img> — prova objeto privado servido).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const MP4_MINIMO = Buffer.from(
  'AAAAHGZ0eXBpc29tAAAAAGlzb21hdmMxbXA0MQAAAAhmcmVlAAAAEG1kYXQAAAAIbW9vdg==',
  'base64',
);
const OGG_MINIMO = Buffer.from('T2dnUwACAAAAAAAAAAAAAAAAAAAAAAIotXIBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAAAAAAABAAAASZW+VAEuT3B1c1RhZ3MGAAAAZmZtcGVnAQAAABQAAABlbmNvZGVyPUxhdmMgbGlib3B1c09nZ1MABNhCAAAAAAAAAAAAAAIAAADdBDkMEl9COzg+PkI9PzkzNDY1MDEsVniBp11snpmsAAAICuBa1RGcRDEVBXs95n4cuPkNWVlfIdC6OqWOdTg8Ghgfufrxatn11XCRTws4Gv6YQ7C1Q6rwWWvi9DUODQBlxA0S4eFybEGNMpE4sshIlIDlpeoEeJ9nAef8lU1OqhinGd/lXFnf+26hM2X1qKVJDeRXd4ePCkLQkkaR/R/UO3A/99WXqDhWglIlcAu6ljwcD09B94m9eJqy33Wc/Es6RX4oWnKHxoOIOxxHKhYoGBNEAf+6D5PCseF12KP8lNFsToFxtvMgI6ef9dbn9yzdfAV4mrLfdZz8Re3XM58TY98QE9kP78C3oXi8J2i5ib9or8iK8NkHMqPIoenVHibH38UOrXdvWUsTTHiast91nPxJM79K9yUjaEQfEQz8Zg0v1o9uXfol6aU938s+qy0HU27utEvhaM+hXZ12JWGMmmnf4GgPSeUEeJqN8rCSoFAtabDlQwj3Y4qr+5MhrjOu6B2sKlGVvnxCyyglkpdintiRSqoEdvgP8iSZ1yQLatUbouwu7E14mjqfcy3SLe9fVPbGqbf24ZJRJ5b+A+yN/Xn1aPHNcwq0rv4mjkq3vWBf3p20FODo0wBgId1PVrddSphTFeBPQQR4mjqfdZz8SzpFedcuwqsRjTrLsfAQLnnnYy+AdB9NmAneqi4SnMfqlYaLzi5ZbWVOB0Zk13dYHtLf6MAEeJo6n3Wc/EXt135IUce5YQAbr0yJWk0lpB+OaXWjCPYxg8+4W+fkLwqkv9EOZr7mic8XTLVoFPTtd6JknvsMSJnCX3Mt0jEzsiciVpcpFh9wH7NrmpAqI5tz32aLJEKnqVQJF/QEIc+YRtIEQu7m6Ia8SIzWuBfUSJnCX3Wc/EkLXqYaYfKDh5TCfVa4rpXBzJYgWo17eDkqek03Odpo5qsT55y0tE6gfGRQSJnCX3Mt0jFKL8GI7K8lCm7GI1vqr9X3Qwuug8y3ilh0x079/LZnJMkJbbZGbBwp2CY4+EiZSh91nPxLOk2XRMzBqHIk2EJh6iQB3oBpbWo9hPbwmegpaaCDsk2lPt8ZT2Y9J9XEz/ALGEiZSh91nPxJSjdu541PPqXB9fLN4236/psxTbJETTlOi8/f5yIL5vClpmzazVZmwouei02ASJlKH3Mt0jNVEtoR9cbKmLKsyJ3MYmm7FzLZrreYozSujbdjwyUMkHD6eg8OTJRASJlKH3Wc/EtTQUa80Mui9hTUobqxrejE1e3IDxFssNxB6Ma6PadRz2nsaalfYV7FEEiZSh9zLdIt70zi63ZbeEXqGvxs658BYwW0i1oV2iP0MVkqbqQrYAXYAojYSJnbEyU1Yqt75gj8w8gq8nA/FKvuWQrooAmWuTkpfZqeWPcPFo9L2NCQheblW6Gbp+lcnCnyiYB+U3zgN6abxg7PNVaUhBj4nxiX9neNhNUfUqPK+9Q=', 'base64');
const PDF_MINIMO = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n',
);

async function uploadObjeto(caminho: string, corpo: Buffer, mimetype: string): Promise<void> {
  const res = await fetch(`${API_URL}/storage/v1/object/${bucket}/${caminho}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': mimetype,
      'x-upsert': 'true',
    },
    // `Buffer<ArrayBufferLike>` não casa com o BodyInit do lib DOM deste tsconfig
    // (só na tipagem: em runtime o fetch do Bun aceita o Buffer direto).
    body: corpo as unknown as BodyInit,
  });
  seedHttpStatus = res.status;
  if (!res.ok) {
    throw new Error(`seed: upload ${caminho} falhou (${res.status}): ${await res.text()}`);
  }
}

async function loginLocal(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: usuario.email, password: usuario.senha }),
  });
  seedHttpStatus = res.status;
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`seed: login do usuário sintético falhou (${res.status}): ${json.error_description ?? res.statusText}`);
  }
  return json.access_token;
}

/** SELECT de messages com JWT do usuário — prova a RLS real, não a service role. */
async function contarMidiaComoUsuario(token: string, contactId: string): Promise<number> {
  const res = await fetch(
    `${API_URL}/rest/v1/messages?contact_id=eq.${contactId}&media_url=not.is.null` +
      `&or=(is_deleted.is.null,is_deleted.eq.false)&select=id`,
    { headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` } },
  );
  seedHttpStatus = res.status;
  if (!res.ok) throw new Error(`seed: contagem como usuário falhou (${res.status}): ${await res.text()}`);
  return ((await res.json()) as unknown[]).length;
}

/** Assina e baixa o objeto privado COMO o usuário — prova o caminho de leitura da aba. */
async function provarObjetoPrivadoComoUsuario(token: string, caminho: string, esperado: Buffer): Promise<void> {
  markSeedStage('storage-sign');
  const signRes = await fetch(`${API_URL}/storage/v1/object/sign/${bucket}/${caminho}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  seedHttpStatus = signRes.status;
  const signJson = (await signRes.json()) as { signedURL?: string; error?: string };
  if (!signRes.ok || !signJson.signedURL) {
    throw new Error(`seed: assinatura como usuário falhou (${signRes.status}): ${signJson.error ?? signRes.statusText}`);
  }
  markSeedStage('storage-reference-check');
  if (esperado.length === 0) throw new Error('seed: corpo de referência vazio');
  markSeedStage('storage-download');
  const getRes = await fetch(`${API_URL}/storage/v1${signJson.signedURL}`);
  seedHttpStatus = getRes.status;
  if (!getRes.ok) {
    throw new Error(`seed: download assinado falhou (${getRes.status})`);
  }
  const baixado = Buffer.from(await getRes.arrayBuffer());
  markSeedStage('storage-bytes-check');
  if (Buffer.compare(baixado, esperado) !== 0) {
    throw new Error(`seed: objeto privado baixado difere do esperado (${baixado.length} bytes vs ${esperado.length})`);
  }

  // Prova negativa: o bucket é privado — a URL "public" do MESMO objeto tem de falhar.
  markSeedStage('storage-public-check');
  const publicRes = await fetch(`${API_URL}/storage/v1/object/public/${bucket}/${caminho}`, {
    headers: { apikey: ANON_KEY },
  });
  seedHttpStatus = publicRes.status;
  if (publicRes.ok) throw new Error('seed: objeto privado acessível via rota pública — fixture inseguro');
}

async function main() {
  markSeedStage('db-open');
  const db = abrirSql(DB_URL);
  try {
    markSeedStage('sql-begin');
    await db.begin(async (tx) => {
      markSeedStage('sql-auth-user');
      await tx`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
          '00000000-0000-0000-0000-000000000000', ${usuario.id}, 'authenticated', 'authenticated',
          ${usuario.email}, extensions.crypt(${usuario.senha}, extensions.gen_salt('bf')), now(),
          '', '', '', '',
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
        )
        on conflict (id) do update
          set email = excluded.email,
              encrypted_password = excluded.encrypted_password,
              email_confirmed_at = excluded.email_confirmed_at,
              updated_at = now()`;

      markSeedStage('sql-auth-identity');
      await tx`
        insert into auth.identities (
          id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
        ) values (
          'e2e26100-7005-4509-a000-0000000000a1', ${usuario.id}, ${usuario.id}, 'email',
          ${{ sub: usuario.id, email: usuario.email, email_verified: true }},
          now(), now(), now()
        )
        on conflict (id) do update set identity_data = excluded.identity_data, updated_at = now()`;

      // O gatilho on_auth_user_created cria o profile; se não existir, cria com id fixo.
      markSeedStage('sql-profile-read');
      let [profile] = await tx`select id from profiles where user_id = ${usuario.id}`;
      if (!profile) {
        markSeedStage('sql-profile-create');
        [profile] = await tx`
          insert into profiles (id, user_id, name, email, role)
          values ('e2e26100-7005-4509-a000-000000000010', ${usuario.id}, ${usuario.nome}, ${usuario.email}, 'agent')
          returning id`;
      }
      const profileId = profile.id as string;

      markSeedStage('sql-profile-update');
      await tx`
        update profiles set name = ${usuario.nome}, email = ${usuario.email}, role = 'agent', updated_at = now()
        where id = ${profileId}`;
      markSeedStage('sql-user-role');
      await tx`
        insert into user_roles (user_id, role) values (${usuario.id}, 'agent')
        on conflict do nothing`;
      // Linha de settings = onboarding concluído (useOnboarding se contenta com o EXISTS).
      markSeedStage('sql-user-settings');
      await tx`
        insert into user_settings (user_id) values (${usuario.id})
        on conflict (user_id) do nothing`;

      markSeedStage('sql-connection');
      await tx`
        insert into whatsapp_connections (id, name, phone_number, instance_id, status, created_by)
        values (${conexao.id}, ${conexao.nome}, ${conexao.telefone}, ${conexao.instanceId}, 'connected', ${profileId})
        on conflict (id) do update
          set name = excluded.name, status = excluded.status, updated_at = now()`;

      const contatos = [contato, contatoPaginacao, contatoVazio];
      for (const c of contatos) {
        markSeedStage('sql-contacts');
        await tx`
          insert into contacts (
            id, name, phone, assigned_to, whatsapp_connection_id, conversation_status, channel_type
          ) values (
            ${c.id}, ${c.nome}, ${c.telefone}, ${profileId}, ${conexao.id}, 'open', 'whatsapp'
          )
          on conflict (id) do update
            set name = excluded.name, assigned_to = excluded.assigned_to,
                conversation_status = 'open', deleted_at = null, updated_at = now()`;
      }

      // As guardas de mensagens reconhecem a identidade do backend. A mudança
      // fica nesta transação e não altera os JWTs usados na prova HTTP abaixo.
      markSeedStage('sql-message-context');
      const [caller] = await tx`select current_user as caller_role`;
      if (caller?.caller_role === 'supabase_admin') {
        await tx`set local role service_role`;
      }

      const midias = [mensagens.imagem, mensagens.video, mensagens.audio, mensagens.documento];
      for (const [i, m] of midias.entries()) {
        const criadaEm = `2026-10-06 10:0${i}:00+00`;
        markSeedStage('sql-media');
        await tx`
          insert into messages (
            id, contact_id, whatsapp_connection_id, sender, agent_id, content, message_type,
            media_url, media_type, media_mimetype, media_filename, media_size, ptt,
            is_read, is_deleted, created_at, updated_at
          ) values (
            ${m.id}, ${contato.id}, ${conexao.id}, ${m.sender},
            ${m.sender === 'agent' ? profileId : null}, ${m.content}, ${m.messageType},
            ${locatorObjeto(API_URL, m.objeto)}, ${m.mediaType}, ${m.mimetype}, ${m.filename},
            ${1024 * (i + 1)}, ${m.ptt}, false, false, ${criadaEm}, ${criadaEm}
          )
          on conflict (id) do update
            set contact_id = excluded.contact_id, media_url = excluded.media_url,
                media_type = excluded.media_type, media_mimetype = excluded.media_mimetype,
                media_filename = excluded.media_filename, media_size = excluded.media_size,
                message_type = excluded.message_type, sender = excluded.sender, ptt = excluded.ptt,
                is_deleted = false, updated_at = now()`;
      }

      markSeedStage('sql-text');
      await tx`
        insert into messages (id, contact_id, whatsapp_connection_id, sender, content, message_type, is_read)
        values (${mensagens.texto.id}, ${contato.id}, ${conexao.id}, 'contact', ${mensagens.texto.content}, 'text', false)
        on conflict (id) do nothing`;

      // 65 imagens > MEDIA_PAGE_SIZE: "Buscando entre os N carregados" + "Carregar tudo".
      markSeedStage('sql-pagination');
      await tx`
        insert into messages (
          id, contact_id, whatsapp_connection_id, sender, content, message_type,
          media_url, media_type, media_mimetype, media_filename, media_size, is_read, is_deleted,
          created_at, updated_at
        )
        select
          ('e2e26100-7005-4509-a000-' || lpad((200 + g)::text, 12, '0'))::uuid,
          ${contatoPaginacao.id}, ${conexao.id}, 'contact',
          'Imagem sintética de paginação #' || g, 'image',
          ${locatorObjeto(API_URL, contatoPaginacao.objeto, contatoPaginacao.id)},
          'image', 'image/png',
          'e2e-arquivos-pagina-' || lpad(g::text, 2, '0') || '.png',
          900 + g, false, false,
          timestamptz '2026-10-06 12:00:00+00' + (g || ' seconds')::interval,
          timestamptz '2026-10-06 12:00:00+00' + (g || ' seconds')::interval
        from generate_series(1, ${TOTAL_PAGINACAO}) as g
        on conflict (id) do update
          set media_url = excluded.media_url, media_filename = excluded.media_filename,
              media_type = excluded.media_type, is_deleted = false, updated_at = now()`;

      markSeedStage('sql-empty-text');
      await tx`
        insert into messages (id, contact_id, whatsapp_connection_id, sender, content, message_type, is_read)
        values (
          'e2e26100-7005-4509-a000-0000000003e8', ${contatoVazio.id}, ${conexao.id},
          'contact', 'mensagem de texto — conversa sem mídia', 'text', false
        )
        on conflict (id) do nothing`;
      markSeedStage('sql-commit');
    });

    // Storage fora da transação SQL (API própria), com erro checado em cada upload.
    markSeedStage('storage-upload-image');
    await uploadObjeto(caminhoObjeto(mensagens.imagem.objeto), PNG_1X1, 'image/png');
    markSeedStage('storage-upload-video');
    await uploadObjeto(caminhoObjeto(mensagens.video.objeto), MP4_MINIMO, 'video/mp4');
    markSeedStage('storage-upload-audio');
    await uploadObjeto(caminhoObjeto(mensagens.audio.objeto), OGG_MINIMO, 'audio/ogg');
    markSeedStage('storage-upload-document');
    await uploadObjeto(caminhoObjeto(mensagens.documento.objeto), PDF_MINIMO, 'application/pdf');
    markSeedStage('storage-upload-pagination');
    await uploadObjeto(`${contatoPaginacao.id}/e2e-arquivos-pagina.png`, PNG_1X1, 'image/png');

    // Verificação com o JWT do usuário sintético (papel de aplicação, não service role).
    markSeedStage('auth-login');
    const token = await loginLocal();
    markSeedStage('rls-media');
    const totalMidia = await contarMidiaComoUsuario(token, contato.id);
    markSeedStage('rls-pagination');
    const totalPaginacao = await contarMidiaComoUsuario(token, contatoPaginacao.id);
    markSeedStage('rls-volume-check');
    if (totalMidia !== E2E_ARQUIVOS.contagens.todos) {
      throw new Error(`seed: esperadas ${E2E_ARQUIVOS.contagens.todos} mídias visíveis, RLS devolveu ${totalMidia}`);
    }
    markSeedStage('rls-pagination-check');
    if (totalPaginacao !== TOTAL_PAGINACAO) {
      throw new Error(`seed: esperadas ${TOTAL_PAGINACAO} mídias de paginação, RLS devolveu ${totalPaginacao}`);
    }
    await provarObjetoPrivadoComoUsuario(token, caminhoObjeto(mensagens.imagem.objeto), PNG_1X1);

    // stdout direto: o lint deste repo só permite console.warn/error.
    markSeedStage('stdout-summary');
    process.stdout.write(
      [
        '[seed arquivos-local] ok:',
        `  usuário ${usuario.email} (id ${usuario.id}) — login local conferido`,
        `  contato ${contato.nome}: ${totalMidia} mídias (1 de cada tipo) + texto`,
        `  contato ${contatoPaginacao.nome}: ${totalPaginacao} mídias (>60 = 2 páginas)`,
        `  contato ${contatoVazio.nome}: sem mídia (estado vazio)`,
        '  objeto privado assinado e baixado como usuário; rota pública negada',
        '',
      ].join('\n'),
    );
  } catch (error) {
    primarySeedFailure = seedFailureDescriptor(seedStage, error, seedHttpStatus);
    throw error;
  } finally {
    markSeedStage('db-close');
    try { await db.end(); }
    catch (error) {
      cleanupSeedFailure = seedFailureDescriptor(seedStage, error, seedHttpStatus);
      throw error;
    }
  }
}

try { await main(); }
catch (error) {
  const failure = primarySeedFailure ?? cleanupSeedFailure ?? seedFailureDescriptor(seedStage, error, seedHttpStatus);
  emitSeedFailure(failure, primarySeedFailure && cleanupSeedFailure ? cleanupSeedFailure : undefined);
  throw error;
}

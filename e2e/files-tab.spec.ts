/**
 * Aba Arquivos — fixture de mídia privada pelo LOCATOR CANÔNICO.
 *
 * POR QUE ESTE SPEC EXISTE. As migrations
 * `20261003182707_fixture_e2e_aba_arquivos_midia.sql` e
 * `20261003192707_fixture_e2e_aba_arquivos_segunda_midia.sql` prometiam que a leitura da
 * fixture vinha da policy aditiva `whatsapp media readable via visible message`
 * (20261003142707), que autorizava por `messages.media_url`. Essa policy foi REMOVIDA pelo
 * R2-DB-022 B1 (20261006175251_r2_db_022_storage_acl.sql): as policies de SELECT de
 * `storage.objects` passaram a autorizar só pelo locator canônico — o 1º segmento do nome
 * do objeto precisa ser um `contact_id` visível ao usuário. O caminho antigo da fixture
 * (`whatsapp-media/5b6f6f71-.../<arquivo>.png`) deixou de ser legível e nada mediria isso.
 *
 * ESTE SPEC NÃO USA SESSÃO SALVA, CREDENCIAL REAL NEM BANCO EXTERNO (regra R1). Ele exige um
 * stack LOCAL e um usuário SINTÉTICO criado por `e2e/fixtures/seed-files-tab.mjs`:
 *
 *   zapp-db-local env <cópia> <nome>          # API_URL / PUBLISHABLE_KEY / SECRET_KEY
 *   export E2E_LOCAL_SUPABASE_URL=http://127.0.0.1:<porta>
 *   export E2E_LOCAL_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY>
 *   export E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY>
 *   node e2e/fixtures/seed-files-tab.mjs
 *   npx playwright test e2e/files-tab.spec.ts --no-deps
 *
 * `--no-deps` é obrigatório: sem ele o projeto catch-all dispara o `setup` (login real com
 * `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`), que este spec não usa nem pode usar. Os três testes também
 * não criam `page`: falam HTTP direto com a API de Storage, então nenhum browser/cookie entra aqui.
 *
 * Sem as variáveis, os testes são PULADOS (não há como apontar para produção: a URL é
 * validada como 127.0.0.1/localhost e o spec recusa qualquer outro host).
 */
import { test, expect } from '@playwright/test';
import { PRIVATE_MEDIA_BUCKETS, parseSupabaseStorageObjectUrl } from '../src/lib/storage_object_reference';

const API = process.env.E2E_LOCAL_SUPABASE_URL?.trim();
const ANON = process.env.E2E_LOCAL_SUPABASE_ANON_KEY?.trim();

const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const EMAIL = 'e2e.files-tab.local@example.test';
const PASSWORD = 'e2e-files-tab-local-2026';
// Path ANTIGO documentado nas migrations que este cartão substitui: o 1º segmento NÃO é um
// contato, então a ACL fail-closed tem de negá-lo.
const LEGACY_OBJECT = '5b6f6f71-916f-4537-9638-647485aba7db/e2e-files-tab-1791054089114.png';
// 1x1 PNG sintético do seed: 70 bytes.
const PNG_BYTES = 70;

function localStackOrSkip(): { api: string; anon: string } {
  const api = API;
  const anon = ANON;
  test.skip(
    !api || !anon,
    'sem stack local: exporte E2E_LOCAL_SUPABASE_URL/ANON_KEY e rode e2e/fixtures/seed-files-tab.mjs',
  );
  const host = new URL(api as string).hostname;
  expect(['127.0.0.1', 'localhost']).toContain(host);
  return { api: api as string, anon: anon as string };
}

async function loginSynthUser(api: string, anon: string): Promise<Record<string, string>> {
  const res = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string };
  expect(res.ok, `login do usuário sintético local falhou (HTTP ${res.status})`).toBeTruthy();
  expect(body.access_token, 'login local sem access_token').toBeTruthy();
  return { apikey: anon, Authorization: `Bearer ${body.access_token}`, 'Content-Type': 'application/json' };
}

interface FixtureRow {
  media_filename: string;
  media_url: string;
  media_size: number;
}

/** As duas linhas da fixture, lidas pelo PostgREST com o JWT do usuário (a RLS decide). */
async function fixtureRows(api: string, auth: Record<string, string>): Promise<FixtureRow[]> {
  const res = await fetch(
    `${api}/rest/v1/messages?contact_id=eq.${CONTACT_ID}` +
      '&media_filename=in.(e2e-files-tab.png,e2e-files-tab-2.png)' +
      '&select=media_filename,media_url,media_size',
    { headers: auth },
  );
  expect(res.ok, `consulta das linhas da fixture falhou (HTTP ${res.status})`).toBeTruthy();
  return (await res.json()) as FixtureRow[];
}

test.describe('aba Arquivos — fixture local no locator canônico', () => {
  test('as linhas da fixture apontam para o locator canônico do contato', async () => {
    const { api, anon } = localStackOrSkip();
    const auth = await loginSynthUser(api, anon);

    const rows = await fixtureRows(api, auth);
    expect(rows.map((r) => r.media_filename).sort()).toEqual(['e2e-files-tab-2.png', 'e2e-files-tab.png']);

    const origin = new URL(api).origin;
    for (const row of rows) {
      // A MESMA regra que a aba Arquivos usa para achar o objeto (useContactMedia -> signInBatch).
      const ref = parseSupabaseStorageObjectUrl(row.media_url, PRIVATE_MEDIA_BUCKETS, [origin]);
      expect(ref, `media_url fora do formato de locator aceito: ${row.media_url}`).not.toBeNull();
      expect(ref!.bucket).toBe('whatsapp-media');
      // Locator canônico: o 1º segmento do path é o contact_id da conversa.
      expect(ref!.path.split('/')[0]).toBe(CONTACT_ID);
      expect(row.media_size).toBe(PNG_BYTES);
    }
  });

  test('assina e baixa a mídia da fixture pelo locator canônico', async () => {
    const { api, anon } = localStackOrSkip();
    const auth = await loginSynthUser(api, anon);

    // O caminho vem da PRÓPRIA linha da fixture (não de um literal no teste): o que se mede é
    // a cadeia fixture -> locator -> assinatura, e não um path que o teste escolheu.
    const rows = await fixtureRows(api, auth);
    const row = rows.find((r) => r.media_filename === 'e2e-files-tab.png');
    expect(row, 'linha e2e-files-tab.png ausente na fixture').toBeTruthy();
    const ref = parseSupabaseStorageObjectUrl(row!.media_url, PRIVATE_MEDIA_BUCKETS, [new URL(api).origin]);
    expect(ref, `media_url sem locator utilizável: ${row!.media_url}`).not.toBeNull();

    const sign = await fetch(
      `${api}/storage/v1/object/sign/${ref!.bucket}/${ref!.path}`,
      {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ expiresIn: 60 }),
      },
    );
    expect(sign.status, 'o usuário do teste precisa assinar a mídia do próprio contato').toBe(200);
    const { signedURL } = (await sign.json()) as { signedURL: string };
    expect(signedURL).toBeTruthy();

    const download = await fetch(`${api}/storage/v1${signedURL}`);
    expect(download.status, 'a URL assinada tem de devolver o objeto').toBe(200);
    expect(download.headers.get('content-type')).toContain('image/png');
    expect((await download.arrayBuffer()).byteLength).toBe(PNG_BYTES);
  });

  test('nega o objeto fora do locator canônico (fail-closed)', async () => {
    const { api, anon } = localStackOrSkip();
    const auth = await loginSynthUser(api, anon);

    // O objeto EXISTE no bucket (o seed o cria com service role em `--com-legado`); o que
    // falha é a autorização de leitura, não a existência: é isso que a ACL nova garante.
    const sign = await fetch(`${api}/storage/v1/object/sign/whatsapp-media/${LEGACY_OBJECT}`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ expiresIn: 60 }),
    });
    expect(sign.status, 'path sem contact_id no 1º segmento não pode ser lido por agente').not.toBe(200);
    expect([400, 403, 404]).toContain(sign.status);
  });
});

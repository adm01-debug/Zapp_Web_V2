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
const OGG_MINIMO = Buffer.from('T2dnUwACAAAAAAAAAABbZWxkAAAAAIBvZ3MBBPA7T2dnUw==', 'base64');
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
  if (!res.ok) throw new Error(`seed: contagem como usuário falhou (${res.status}): ${await res.text()}`);
  return ((await res.json()) as unknown[]).length;
}

/** Assina e baixa o objeto privado COMO o usuário — prova o caminho de leitura da aba. */
async function provarObjetoPrivadoComoUsuario(token: string, caminho: string, esperado: Buffer): Promise<void> {
  const signRes = await fetch(`${API_URL}/storage/v1/object/sign/${bucket}/${caminho}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const signJson = (await signRes.json()) as { signedURL?: string; error?: string };
  if (!signRes.ok || !signJson.signedURL) {
    throw new Error(`seed: assinatura como usuário falhou (${signRes.status}): ${signJson.error ?? signRes.statusText}`);
  }
  if (esperado.length === 0) throw new Error('seed: corpo de referência vazio');
  const getRes = await fetch(`${API_URL}/storage/v1${signJson.signedURL}`);
  if (!getRes.ok) {
    throw new Error(`seed: download assinado falhou (${getRes.status})`);
  }
  const baixado = Buffer.from(await getRes.arrayBuffer());
  if (Buffer.compare(baixado, esperado) !== 0) {
    throw new Error(`seed: objeto privado baixado difere do esperado (${baixado.length} bytes vs ${esperado.length})`);
  }

  // Prova negativa: o bucket é privado — a URL "public" do MESMO objeto tem de falhar.
  const publicRes = await fetch(`${API_URL}/storage/v1/object/public/${bucket}/${caminho}`, {
    headers: { apikey: ANON_KEY },
  });
  if (publicRes.ok) throw new Error('seed: objeto privado acessível via rota pública — fixture inseguro');
}

async function main() {
  const db = abrirSql(DB_URL);
  try {
    await db.begin(async (tx) => {
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
      let [profile] = await tx`select id from profiles where user_id = ${usuario.id}`;
      if (!profile) {
        [profile] = await tx`
          insert into profiles (id, user_id, name, email, role)
          values ('e2e26100-7005-4509-a000-000000000010', ${usuario.id}, ${usuario.nome}, ${usuario.email}, 'agent')
          returning id`;
      }
      const profileId = profile.id as string;

      await tx`
        update profiles set name = ${usuario.nome}, email = ${usuario.email}, role = 'agent', updated_at = now()
        where id = ${profileId}`;
      await tx`
        insert into user_roles (user_id, role) values (${usuario.id}, 'agent')
        on conflict do nothing`;
      // Linha de settings = onboarding concluído (useOnboarding se contenta com o EXISTS).
      await tx`
        insert into user_settings (user_id) values (${usuario.id})
        on conflict (user_id) do nothing`;

      await tx`
        insert into whatsapp_connections (id, name, phone_number, instance_id, status, created_by)
        values (${conexao.id}, ${conexao.nome}, ${conexao.telefone}, ${conexao.instanceId}, 'connected', ${profileId})
        on conflict (id) do update
          set name = excluded.name, status = excluded.status, updated_at = now()`;

      const contatos = [contato, contatoPaginacao, contatoVazio];
      for (const c of contatos) {
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

      const midias = [mensagens.imagem, mensagens.video, mensagens.audio, mensagens.documento];
      for (const [i, m] of midias.entries()) {
        const criadaEm = `2026-10-06 10:0${i}:00+00`;
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

      await tx`
        insert into messages (id, contact_id, whatsapp_connection_id, sender, content, message_type, is_read)
        values (${mensagens.texto.id}, ${contato.id}, ${conexao.id}, 'contact', ${mensagens.texto.content}, 'text', false)
        on conflict (id) do nothing`;

      // 65 imagens > MEDIA_PAGE_SIZE: "Buscando entre os N carregados" + "Carregar tudo".
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

      await tx`
        insert into messages (id, contact_id, whatsapp_connection_id, sender, content, message_type, is_read)
        values (
          'e2e26100-7005-4509-a000-0000000003e8', ${contatoVazio.id}, ${conexao.id},
          'contact', 'mensagem de texto — conversa sem mídia', 'text', false
        )
        on conflict (id) do nothing`;
    });

    // Storage fora da transação SQL (API própria), com erro checado em cada upload.
    await uploadObjeto(caminhoObjeto(mensagens.imagem.objeto), PNG_1X1, 'image/png');
    await uploadObjeto(caminhoObjeto(mensagens.video.objeto), MP4_MINIMO, 'video/mp4');
    await uploadObjeto(caminhoObjeto(mensagens.audio.objeto), OGG_MINIMO, 'audio/ogg');
    await uploadObjeto(caminhoObjeto(mensagens.documento.objeto), PDF_MINIMO, 'application/pdf');
    await uploadObjeto(`${contatoPaginacao.id}/e2e-arquivos-pagina.png`, PNG_1X1, 'image/png');

    // Verificação com o JWT do usuário sintético (papel de aplicação, não service role).
    const token = await loginLocal();
    const totalMidia = await contarMidiaComoUsuario(token, contato.id);
    const totalPaginacao = await contarMidiaComoUsuario(token, contatoPaginacao.id);
    if (totalMidia !== E2E_ARQUIVOS.contagens.todos) {
      throw new Error(`seed: esperadas ${E2E_ARQUIVOS.contagens.todos} mídias visíveis, RLS devolveu ${totalMidia}`);
    }
    if (totalPaginacao !== TOTAL_PAGINACAO) {
      throw new Error(`seed: esperadas ${TOTAL_PAGINACAO} mídias de paginação, RLS devolveu ${totalPaginacao}`);
    }
    await provarObjetoPrivadoComoUsuario(token, caminhoObjeto(mensagens.imagem.objeto), PNG_1X1);

    // stdout direto: o lint deste repo só permite console.warn/error.
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
  } finally {
    await db.end();
  }
}

await main();

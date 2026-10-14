import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Prova de fluxo inteiro do `deleteFile` contra o banco/Storage LOCAL
 * (ponto 3 da recusa do [refazer 1]): cliente PostgREST real, RLS real,
 * Storage real. Só o toast segue mockado (efeito de UI, não o fluxo provado).
 *
 * Roda com o stack local no ar:
 *   eval $(zapp-db-local env <workspace> <nome> | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')
 *   KB_INT_API_URL="$API_URL" KB_INT_ANON_KEY="$ANON_KEY" KB_INT_SERVICE_KEY="$SERVICE_ROLE_KEY" \
 *     bunx vitest run src/hooks/integrations/__tests__/useKnowledgeBase.deleteFile.integration.test.tsx
 *
 * Sem essas variáveis o arquivo pula (skip) — não quebra o `zapp-verify` nem o CI.
 */

const API_URL = process.env.KB_INT_API_URL ?? '';
const ANON_KEY = process.env.KB_INT_ANON_KEY ?? '';
const SERVICE_KEY = process.env.KB_INT_SERVICE_KEY ?? '';
const TEM_STACK = Boolean(API_URL && ANON_KEY && SERVICE_KEY);

const holder = vi.hoisted(() => ({ client: null as unknown as SupabaseClient, url: '' }));

vi.mock('@/integrations/supabase/client', () => ({
  get SUPABASE_URL() {
    return holder.url;
  },
  get supabase() {
    return holder.client;
  },
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));

import { useKnowledgeBase } from '../useKnowledgeBase';

function clienteLocal(key: string) {
  // Sem persistência: cada cliente carrega só a própria sessão em memória.
  // (Com o padrão, o cliente anônimo herdaria a sessão do admin via
  // localStorage e o caso "sem permissão" mentiria.)
  return createClient(API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const BUCKET = 'whatsapp-media';
const SENHA = 'prova-local-123';
const sufixo = Date.now().toString(36);

let servico: SupabaseClient;
let admin: SupabaseClient;
let anonimo: SupabaseClient;
let userId = '';
const email = `kb-prova-${sufixo}@exemplo.local`;
const criados: { linhas: string[]; objetos: string[] } = { linhas: [], objetos: [] };

async function objetoExiste(nome: string): Promise<boolean> {
  const { data } = await servico.storage.from(BUCKET).list('kb', { search: nome });
  return (data ?? []).some((o) => o.name === nome);
}

async function prepararArquivo(opts: { urlPublicaLegada?: boolean } = {}) {
  const nome = `prova-${sufixo}-${criados.objetos.length}.md`;
  const caminho = `kb/${nome}`;
  const up = await servico.storage.from(BUCKET).upload(caminho, new Blob(['conteudo de prova']), {
    contentType: 'text/markdown',
  });
  expect(up.error, 'upload do objeto de prova no Storage local').toBeNull();
  criados.objetos.push(caminho);

  let fileUrl: string;
  if (opts.urlPublicaLegada) {
    // Formato das linhas gravadas antes da migração p/ URL assinada.
    fileUrl = `${API_URL}/storage/v1/object/public/${BUCKET}/${caminho}`;
  } else {
    const assinada = await servico.storage.from(BUCKET).createSignedUrl(caminho, 86400);
    expect(assinada.error, 'URL assinada do objeto de prova').toBeNull();
    fileUrl = assinada.data!.signedUrl;
  }

  const linha = await admin
    .from('knowledge_base_files')
    .insert({ file_name: nome, file_url: fileUrl, file_type: 'text/markdown', file_size: 18 })
    .select('id')
    .single();
  expect(linha.error, 'linha de prova em knowledge_base_files').toBeNull();
  criados.linhas.push(linha.data!.id as string);
  return { id: linha.data!.id as string, nome, caminho, fileUrl };
}

(TEM_STACK ? describe : describe.skip)('deleteFile — fluxo inteiro no stack local', () => {
  beforeAll(async () => {
    servico = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const criado = await servico.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
    expect(criado.error, 'usuário de prova no Auth local').toBeNull();
    userId = criado.data!.user!.id;
    const papel = await servico.from('user_roles').insert({ user_id: userId, role: 'admin' });
    expect(papel.error, 'papel admin do usuário de prova').toBeNull();

    admin = clienteLocal(ANON_KEY);
    const sessao = await admin.auth.signInWithPassword({ email, password: SENHA });
    expect(sessao.error, 'login do usuário de prova').toBeNull();
    anonimo = clienteLocal(ANON_KEY);

    holder.url = API_URL;
  }, 60_000);

  afterAll(async () => {
    if (!TEM_STACK) return;
    try {
      for (const id of criados.linhas) await servico.from('knowledge_base_files').delete().eq('id', id);
      if (criados.objetos.length > 0) await servico.storage.from(BUCKET).remove(criados.objetos);
      if (userId) {
        await servico.from('user_roles').delete().eq('user_id', userId);
        await servico.auth.admin.deleteUser(userId);
      }
    } catch {
      // Limpeza é cortesia: ids/objetos têm sufixo único por execução.
    }
  });

  it('admin exclui: a linha some da base E o objeto sai do Storage', async () => {
    holder.client = admin;
    vi.clearAllMocks();
    const alvo = await prepararArquivo();
    expect(await objetoExiste(alvo.nome)).toBe(true);

    const { result } = renderHook(() => useKnowledgeBase());
    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile(alvo.id);
    });

    expect(aceito).toBe(true);
    const linha = await servico.from('knowledge_base_files').select('id').eq('id', alvo.id).maybeSingle();
    expect(linha.data, 'linha removida da base local').toBeNull();
    expect(await objetoExiste(alvo.nome), 'objeto removido do Storage local').toBe(false);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Arquivo removido' }));
  }, 60_000);

  it('sem permissão (RLS): nada é excluído — linha e objeto ficam, erro visível', async () => {
    holder.client = admin;
    vi.clearAllMocks();
    const alvo = await prepararArquivo();
    holder.client = anonimo;

    const { result } = renderHook(() => useKnowledgeBase());
    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile(alvo.id);
    });

    expect(aceito).toBe(false);
    const linha = await servico.from('knowledge_base_files').select('id').eq('id', alvo.id).maybeSingle();
    expect(linha.data?.id, 'linha preservada após DELETE negado').toBe(alvo.id);
    expect(await objetoExiste(alvo.nome), 'objeto preservado após DELETE negado').toBe(true);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao excluir arquivo', variant: 'destructive' })
    );
  }, 60_000);

  it('locator público legado: a linha sai, o objeto fica (só /sign/ apaga mídia)', async () => {
    holder.client = admin;
    vi.clearAllMocks();
    const alvo = await prepararArquivo({ urlPublicaLegada: true });

    const { result } = renderHook(() => useKnowledgeBase());
    let aceito: boolean | undefined;
    await act(async () => {
      aceito = await result.current.deleteFile(alvo.id);
    });

    expect(aceito).toBe(true);
    const linha = await servico.from('knowledge_base_files').select('id').eq('id', alvo.id).maybeSingle();
    expect(linha.data, 'linha legada removida da base local').toBeNull();
    expect(await objetoExiste(alvo.nome), 'objeto legado preservado no Storage').toBe(true);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: expect.stringContaining('objeto não foi localizado') })
    );
  }, 60_000);
});

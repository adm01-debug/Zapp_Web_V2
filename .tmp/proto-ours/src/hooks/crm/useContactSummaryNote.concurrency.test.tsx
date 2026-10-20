/**
 * Corrida entre duas gravações do "Resumo comercial" (`contacts.notes`) — item 259 (R2-AUTH-034).
 *
 * O hook REAL é montado (`renderHook`) com o cliente Supabase mockado. Cada gravação fica
 * PENDENTE até o teste mandar confirmar/falhar: quem controla a ordem das respostas é o teste,
 * e é isso que prova a corrida (a skill da área exige ordem controlada, não só "esperar a resposta").
 *
 * Modelo do banco falso:
 *  · a gravação passa a existir quando CONFIRMA — o cliente só sabe que o valor está no banco a
 *    partir da resposta; a confirmação é o sinal de que a coluna já tem aquele valor;
 *  · a leitura devolve o valor vigente e pode ser SEGURADA pelo teste (`segurarLeituras`), para
 *    provar o que o hook publica sozinho, sem depender do tempo de um refetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const banco = vi.hoisted(() => ({
  notes: 'Resumo inicial',
  gravacoes: [] as Array<{
    notes: string;
    pediuContagem: boolean;
    resolver: (resposta: { data: null; error: unknown; count: number | null }) => void;
    rejeitar: (erro: unknown) => void;
  }>,
  leituras: [] as Array<() => void>,
  segurarLeituras: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            new Promise((resolver: (v: unknown) => void) => {
              const entregar = () => resolver({ data: { notes: banco.notes }, error: null });
              if (banco.segurarLeituras) banco.leituras.push(entregar);
              else entregar();
            }),
        }),
      }),
      update: (payload: { notes: string }, opcoes?: { count?: string }) => ({
        eq: () =>
          new Promise((resolver, rejeitar) => {
            banco.gravacoes.push({
              notes: payload.notes,
              // o PostgREST só devolve `count` quando a chamada pede `count: 'exact'`
              pediuContagem: opcoes?.count === 'exact',
              resolver,
              rejeitar,
            });
          }),
      }),
    }),
  },
}));

import { contactSummaryNoteKey, useContactSummaryNote } from '@/hooks/crm/useContactSummaryNote';

const CONTATO = 'c1c1c1c1-0000-4000-8000-000000000001';

function gravacao(indice: number) {
  const g = banco.gravacoes[indice];
  if (!g) throw new Error(`gravação ${indice} não foi disparada`);
  return {
    notes: g.notes,
    pediuContagem: g.pediuContagem,
    confirmar: (linhasAfetadas = 1) => {
      banco.notes = g.notes;
      g.resolver({ data: null, error: null, count: g.pediuContagem ? linhasAfetadas : null });
    },
    falharCom: (erro: unknown) => g.resolver({ data: null, error: erro, count: null }),
    rejeitar: (erro: unknown) => g.rejeitar(erro),
  };
}

function liberarLeituras() {
  banco.leituras.splice(0, banco.leituras.length).forEach((entregar) => entregar());
}

/** Réplica do chamador real (`NotesTab`): mantém o rascunho e só fecha a edição no sucesso. */
function useResumoComRascunho(contactId: string) {
  const { summary, isLoading, isSaving, save } = useContactSummaryNote(contactId);
  const [rascunho, setRascunho] = useState('');
  const [editando, setEditando] = useState(true);
  const [erro, setErro] = useState<unknown>(null);

  const confirmar = useCallback(
    async (texto: string) => {
      setRascunho(texto);
      try {
        await save(texto);
        setEditando(false);
        setErro(null);
      } catch (e) {
        // Falhou: o rascunho continua na tela e a edição continua aberta.
        setErro(e);
      }
    },
    [save],
  );

  return { summary, isLoading, isSaving, save, rascunho, setRascunho, editando, erro, confirmar };
}

function renderResumo() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = renderHook(() => useResumoComRascunho(CONTATO), { wrapper });
  return { ...utils, queryClient };
}

async function montarComResumoInicial() {
  const ctx = renderResumo();
  await waitFor(() => expect(ctx.result.current.isLoading).toBe(false));
  expect(ctx.result.current.summary).toBe('Resumo inicial');
  return ctx;
}

describe('useContactSummaryNote — corrida entre gravações', () => {
  beforeEach(() => {
    banco.notes = 'Resumo inicial';
    banco.gravacoes = [];
    banco.leituras = [];
    banco.segurarLeituras = false;
  });

  it('a falha da segunda gravação é propagada e o chamador mantém o texto editado', async () => {
    const { result, queryClient } = await montarComResumoInicial();

    // A 1ª gravação sai direto (vai ser superada); a 2ª é a do chamador (NotesTab).
    let primeira!: Promise<void>;
    let segunda!: Promise<void>;
    await act(async () => {
      primeira = result.current.save('Primeiro texto');
    });
    await act(async () => {
      segunda = result.current.confirmar('Segundo texto');
    });
    expect(banco.gravacoes).toHaveLength(2);
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    // A segunda (a mais recente) FALHA; a primeira confirma DEPOIS dela.
    await act(async () => {
      gravacao(1).falharCom({ message: 'permissão negada' });
      await segunda;
    });

    expect(result.current.erro).toBeTruthy();
    expect(result.current.editando).toBe(true);
    expect(result.current.rascunho).toBe('Segundo texto');

    // A resposta superada da primeira não pode "virar" o resultado na tela.
    await act(async () => {
      gravacao(0).confirmar();
      await primeira;
      // deixa o que tiver sido disparado (refetch) chegar antes de olhar
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(queryClient.getQueryData(contactSummaryNoteKey(CONTATO))).not.toBe('Primeiro texto');
    expect(result.current.summary).not.toBe('Primeiro texto');
    expect(result.current.editando).toBe(true);
    expect(result.current.rascunho).toBe('Segundo texto');
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it('`save` rejeita quando a gravação mais recente falha (não vira sucesso silencioso)', async () => {
    const { result, queryClient } = await montarComResumoInicial();

    let primeira!: Promise<void>;
    let segunda!: Promise<void>;
    await act(async () => {
      primeira = result.current.save('Primeiro texto').catch(() => undefined);
    });
    await act(async () => {
      segunda = result.current.save('Segundo texto');
    });

    gravacao(1).falharCom({ message: 'permissão negada' });
    await expect(segunda).rejects.toMatchObject({ message: 'permissão negada' });

    await act(async () => {
      gravacao(0).confirmar();
      await primeira;
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(queryClient.getQueryData(contactSummaryNoteKey(CONTATO))).not.toBe('Primeiro texto');
    expect(result.current.summary).not.toBe('Primeiro texto');
  });

  it('gravação que não afeta nenhuma linha não é sucesso (RLS/contato inexistente)', async () => {
    const { result } = await montarComResumoInicial();

    let salvar!: Promise<void>;
    await act(async () => {
      salvar = result.current.save('Texto novo');
    });
    gravacao(0).confirmar(0);

    await expect(salvar).rejects.toThrow(/nenhuma linha/i);
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.summary).toBe('Resumo inicial');
  });

  it('gravação confirmada entra no cache na hora — não espera (nem depende de) refetch', async () => {
    const { result, queryClient } = await montarComResumoInicial();

    // A leitura fica pendurada: qualquer refetch vai demorar o que o teste quiser.
    banco.segurarLeituras = true;

    let salvar!: Promise<void>;
    await act(async () => {
      salvar = result.current.save('Texto novo');
    });
    await act(async () => {
      gravacao(0).confirmar();
    });
    // Deixa o hook processar a confirmação SEM esperar por `save`: sem a correção o `save`
    // fica preso esperando o refetch (leitura pendurada) e o valor confirmado nunca aparece.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isSaving).toBe(false);
    expect(queryClient.getQueryData(contactSummaryNoteKey(CONTATO))).toBe('Texto novo');
    expect(result.current.summary).toBe('Texto novo');
    expect(banco.leituras.length).toBe(0);

    banco.segurarLeituras = false;
    liberarLeituras();
    await salvar.catch(() => undefined);
  });

  it('resposta antiga não reverte o valor já confirmado pela gravação mais recente', async () => {
    const { result, queryClient } = await montarComResumoInicial();

    let primeira!: Promise<void>;
    let segunda!: Promise<void>;
    await act(async () => {
      primeira = result.current.save('Primeiro texto');
    });
    await act(async () => {
      segunda = result.current.save('Segundo texto');
    });

    // A mais recente confirma primeiro.
    await act(async () => {
      gravacao(1).confirmar();
      await segunda;
    });
    expect(queryClient.getQueryData(contactSummaryNoteKey(CONTATO))).toBe('Segundo texto');

    // ... e a anterior termina DEPOIS: não pode trazer o cache de volta para o texto antigo.
    await act(async () => {
      gravacao(0).confirmar();
      await primeira;
    });

    expect(queryClient.getQueryData(contactSummaryNoteKey(CONTATO))).toBe('Segundo texto');
    expect(result.current.summary).toBe('Segundo texto');
    expect(result.current.isSaving).toBe(false);
  });

  it('rejeição de rede propaga o erro e não deixa `isSaving` preso', async () => {
    const { result } = await montarComResumoInicial();

    let salvar!: Promise<void>;
    await act(async () => {
      salvar = result.current.save('Texto novo');
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    gravacao(0).rejeitar(new Error('network down'));

    await expect(salvar).rejects.toThrow('network down');
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.summary).toBe('Resumo inicial');
  });
});

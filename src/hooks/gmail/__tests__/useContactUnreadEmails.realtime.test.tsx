/**
 * U05 — tempo real dos alertas de e-mail não lido, do BANCO até o chip da barra.
 *
 * Diferente de `useContactUnreadEmails.test.tsx` (que mede o estado do hook), aqui o
 * caminho é o da tela: o hook REAL alimenta a barra REAL (`ConversationTabs` →
 * `EmailUnreadChip`) e a prova é o que o usuário lê no chip.
 *  - chega e-mail novo → o evento de `email_threads` do contato dispara a recontagem e o
 *    número no chip SOBE (1 → 2), com o nome acessível acompanhando;
 *  - e-mail é lido → a contagem cai a 0 e o chip DESAPARECE (sem alerta fantasma);
 *  - troca de contato → o chip nunca mostra a contagem do contato anterior, nem aceita a
 *    resposta atrasada dele;
 *  - falha da consulta → nenhum alerta falso (chip ausente) e nada lança.
 *
 * Só o cliente Supabase é falso (fronteira: banco/tempo real). Ele registra a consulta e o
 * canal e deixa o teste controlar a ORDEM das respostas — é assim que a corrida de troca de
 * contato é provada. O número esperado vem do teste, não da implementação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

type ResultadoConsulta = { count: number | null; error: unknown };

interface ConsultaRegistrada {
  tabela: string;
  filtros: Array<[string, unknown]>;
  resolver: (resultado: ResultadoConsulta) => void;
}

interface PayloadRealtime {
  eventType?: string;
  new?: { contact_id?: string | null } | null;
  old?: { contact_id?: string | null } | null;
}

interface CanalRegistrado {
  topico: string;
  config?: Record<string, unknown>;
  callback?: (payload: PayloadRealtime) => void;
  removido: boolean;
}

interface ConsultaBuilder {
  select: (...args: unknown[]) => ConsultaBuilder;
  eq: (coluna: string, valor: unknown) => ConsultaBuilder;
  then: (
    onFulfilled: (valor: ResultadoConsulta) => unknown,
    onRejected?: (erro: unknown) => unknown,
  ) => Promise<unknown>;
}

interface CanalBuilder {
  on: (
    evento: string,
    config: Record<string, unknown>,
    callback: (payload: PayloadRealtime) => void,
  ) => CanalBuilder;
  subscribe: () => CanalBuilder;
}

const estado = vi.hoisted(() => {
  const consultas: ConsultaRegistrada[] = [];
  const canais: CanalRegistrado[] = [];
  const registroPorCanal = new Map<object, CanalRegistrado>();

  function criarConsulta(tabela: string): ConsultaBuilder {
    let resolver: ((resultado: ResultadoConsulta) => void) | null = null;
    const pendente = new Promise<ResultadoConsulta>((resolve) => { resolver = resolve; });
    const registro: ConsultaRegistrada = {
      tabela,
      filtros: [],
      resolver: (resultado) => resolver?.(resultado),
    };
    consultas.push(registro);

    const builder: ConsultaBuilder = {
      select: () => builder,
      eq: (coluna: string, valor: unknown) => { registro.filtros.push([coluna, valor]); return builder; },
      then: (onFulfilled, onRejected) => pendente.then(onFulfilled, onRejected),
    };
    return builder;
  }

  function criarCanal(topico: string): CanalBuilder {
    const registro: CanalRegistrado = { topico, removido: false };
    canais.push(registro);

    const builder: CanalBuilder = {
      on: (evento, config, callback) => {
        registro.config = { evento, ...config };
        registro.callback = callback;
        return builder;
      },
      subscribe: () => builder,
    };
    registroPorCanal.set(builder as object, registro);
    return builder;
  }

  function removerCanal(canal: unknown): Promise<string> {
    const registro = typeof canal === 'object' && canal !== null
      ? registroPorCanal.get(canal)
      : undefined;
    if (registro) registro.removido = true;
    return Promise.resolve('ok');
  }

  return { consultas, canais, criarConsulta, criarCanal, removerCanal };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => estado.criarConsulta(tabela),
    channel: (topico: string) => estado.criarCanal(topico),
    removeChannel: (canal: unknown) => estado.removerCanal(canal),
  },
}));

import { useContactUnreadEmails } from '@/hooks/gmail/useContactUnreadEmails';
import { ConversationTabs } from '@/components/inbox/chat/ConversationTabs';

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

const consultas = () => estado.consultas as ConsultaRegistrada[];
const canais = () => estado.canais as CanalRegistrado[];

/** A barra REAL alimentada pelo hook REAL — é o que o usuário lê no chip. */
function PainelEmail({ contactId }: { contactId: string | null }) {
  const { count } = useContactUnreadEmails(contactId);
  return (
    <ConversationTabs
      activeTab="chat"
      onTabChange={() => {}}
      counts={ZERO}
      emailUnread={{ count, onOpen: () => {} }}
    />
  );
}

/** Emite um evento do canal realtime dentro de act (o debounce é esperado depois). */
function emitir(indice: number, payload: PayloadRealtime) {
  const canal = canais()[indice];
  if (!canal.callback) throw new Error('canal sem listener registrado');
  act(() => { canal.callback?.(payload); });
}

/** Resolve a consulta e espera o React aplicar o estado. */
async function responder(indice: number, resultado: ResultadoConsulta) {
  await act(async () => { consultas()[indice].resolver(resultado); });
}

/** O chip está montado com esta contagem (nome acessível incluído). */
function chipCom(contagem: number) {
  const nome = contagem === 1 ? '1 e-mail não lido' : `${contagem} e-mails não lidos`;
  return screen.getByRole('button', { name: nome });
}

beforeEach(() => {
  estado.consultas.length = 0;
  estado.canais.length = 0;
});

describe('useContactUnreadEmails + chip — tempo real (U05)', () => {
  it('chega e-mail novo: o evento sobe o número no chip (1 → 2)', async () => {
    render(<PainelEmail contactId="c1" />);

    // Antes da resposta não há alerta (nada de contagem inventada).
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();
    expect(consultas()).toHaveLength(1);
    expect(consultas()[0].filtros).toContainEqual(['email_threads.contact_id', 'c1']);

    await responder(0, { count: 1, error: null });
    expect(chipCom(1)).toBeInTheDocument();
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('1');

    // Chegou e-mail: UPDATE em `email_threads` do contato.
    expect(canais()[0].config).toMatchObject({ table: 'email_threads', filter: 'contact_id=eq.c1' });
    emitir(0, { eventType: 'UPDATE', new: { contact_id: 'c1' }, old: {} });

    // Debounce: o número atual NÃO pisca para 0/loading antes da resposta nova.
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('1');
    await waitFor(() => expect(consultas()).toHaveLength(2), { timeout: 3000 });

    await responder(1, { count: 2, error: null });
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('2');
    expect(chipCom(2)).toBeInTheDocument();
  });

  it('e-mail lido: a contagem cai a zero e o chip some', async () => {
    render(<PainelEmail contactId="c1" />);
    await responder(0, { count: 2, error: null });
    expect(chipCom(2)).toBeInTheDocument();

    // Leitura marca `is_read` e o UPDATE da conversa dispara a recontagem.
    emitir(0, { eventType: 'UPDATE', new: { contact_id: 'c1' }, old: {} });
    await waitFor(() => expect(consultas()).toHaveLength(2), { timeout: 3000 });

    await responder(1, { count: 0, error: null });
    // Sem não lidos o alerta não pode ficar na tela.
    await waitFor(() => expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument());
  });

  it('troca de contato: o chip não mistura a contagem do contato anterior', async () => {
    const { rerender } = render(<PainelEmail contactId="c1" />);
    await responder(0, { count: 3, error: null });
    expect(chipCom(3)).toBeInTheDocument();

    rerender(<PainelEmail contactId="c2" />);
    // Imediatamente no contato novo nada é mostrado (nem a contagem antiga).
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();
    expect(canais()[0].removido).toBe(true);

    await responder(1, { count: 5, error: null });
    expect(chipCom(5)).toBeInTheDocument();

    // A resposta ATRASADA do contato anterior chega depois: tem de ser descartada.
    await responder(0, { count: 99, error: null });
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('5');
    expect(chipCom(5)).toBeInTheDocument();
  });

  it('falha da consulta: sem alerta falso e sem lançar', async () => {
    render(<PainelEmail contactId="c1" />);
    await responder(0, { count: null, error: { message: 'falha de rede' } });

    // Erro não vira alerta: nada de chip (a contagem não é "conhecida").
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();

    // E a recontagem por tempo real volta a funcionar depois da falha.
    emitir(0, { eventType: 'UPDATE', new: { contact_id: 'c1' }, old: {} });
    await waitFor(() => expect(consultas()).toHaveLength(2), { timeout: 3000 });
    await responder(1, { count: 4, error: null });
    expect(chipCom(4)).toBeInTheDocument();
  });
});

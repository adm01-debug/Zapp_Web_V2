/**
 * SendErrorBanner · autor e idade (PK-23, paridade com o varredor do PD-78) — refazer 1.
 *
 * Antes: o banner filtrava só `sender === 'agent'` — a falha de QUALQUER atendente entrava no
 * contador e "Enviar de novo" reenviava o texto da última falha, que podia ser de outro atendente.
 *
 * Agora (especificação revista na reatribuição do Claude em 15/10): o banner mostra TODAS as
 * falhas — a de colega NÃO some para atendente comum: aparece identificada pelo autor
 * (prefixo do `agent_id`) e com o reenvio BLOQUEADO (nota no lugar do botão). Regras:
 *  - próprio autor reenvia direto (acima de 1 h pede confirmação);
 *  - admin/supervisor vê as de todos, mas reenviar a de outro pede confirmação explícita;
 *  - perfil ainda não carregado: a falha aparece (não some da tela) e o reenvio pede confirmação;
 *  - acima de 24 h a falha é rotulada "Falha antiga" e nunca sai reenvio automático;
 *  - com mais de uma falha, o reenvio usa a falha ESCOLHIDA no seletor (não a última);
 *  - a confirmação pertence à falha exibida: trocar a seleção (seletor ou lista) zera o
 *    "Confirmar reenvio" (efeito em `selecionadaId`).
 *
 * Cadeia de autoria (DDL aplicado, não achismo):
 *  - `supabase/migrations/20251215163158_8fcb49be-34d2-4749-a644-f943eaf83c4a.sql` —
 *    `CREATE TABLE public.messages (… agent_id UUID REFERENCES public.profiles(id) …)`;
 *  - `supabase/migrations/20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql` —
 *    `CREATE TABLE public.profiles (id UUID … PRIMARY KEY, user_id UUID REFERENCES
 *    auth.users(id) …)` — ou seja, `profiles.id` é uuid próprio e quem aponta para
 *    `auth.users(id)` é `profiles.user_id`: `agent_id` NUNCA é `auth.uid()`.
 * A prova P2 abaixo monta o componente REAL com `user.id` DIFERENTE de `profile.id`:
 * se o código comparasse contra `auth.uid()`, a falha própria cairia no ramo "de outro".
 *
 * O componente REAL é montado; o reenvio é provado pelo `onSendMessage` (mensagem nova).
 * Este arquivo substitui o registro de provas pendentes que só tinha `it.todo`.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';
import { SendErrorBanner, LIMITE_CONFIRMACAO_MS, LIMITE_FALHA_ANTIGA_MS } from '../SendErrorBanner';

const controle = vi.hoisted(() => ({
  perfil: { id: 'p-atual', role: 'agent' } as { id: string; role: string } | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-atual' }, profile: controle.perfil }),
}));

const AGORA = Date.parse('2026-10-15T12:00:00.000Z');
const MINUTO = 60 * 1000;

function haMinutos(minutos: number): string {
  return new Date(AGORA - minutos * MINUTO).toISOString();
}

function falha(over: Partial<Message> = {}): Message {
  return {
    id: 'f-' + Math.random().toString(36).slice(2),
    content: 'texto',
    sender: 'agent',
    type: 'text',
    status: 'failed',
    timestamp: new Date(AGORA),
    created_at: haMinutos(1),
    ...over,
  } as Message;
}

beforeEach(() => {
  controle.perfil = { id: 'p-atual', role: 'agent' };
  vi.spyOn(Date, 'now').mockReturnValue(AGORA);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SendErrorBanner · autor (P1: falha de colega aparece, reenvio bloqueado)', () => {
  it('atendente comum: falha de colega aparece no contador, identificada, sem botão de reenvio', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'colega', agent_id: 'p-outro', content: 'texto do colega', created_at: haMinutos(1) }),
          falha({ id: 'minha', agent_id: 'p-atual', content: 'meu texto', created_at: haMinutos(2) }),
        ]}
        onSendMessage={onSendMessage}
      />,
    );

    // A mais recente é a do colega: ela é a selecionada — aparece, mas bloqueada.
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('2 mensagens não foram enviadas');
    expect(banner).toHaveTextContent('outro atendente (p-outro)');
    expect(screen.queryByRole('button', { name: 'Enviar de novo' })).toBeNull();

    // Trocando para a própria, o reenvio libera e manda o texto CERTO (não o do colega).
    fireEvent.change(screen.getByLabelText('Mensagem com falha'), { target: { value: 'minha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('meu texto');
  });

  it('atendente comum: só falha de colega → o aviso aparece, sem reenvio', () => {
    render(
      <SendErrorBanner
        messages={[falha({ id: 'colega', agent_id: 'p-outro', content: 'texto do colega' })]}
        onSendMessage={vi.fn()}
      />,
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('1 mensagem não foi enviada');
    expect(banner).toHaveTextContent('outro atendente (p-outro)');
    expect(screen.queryByRole('button', { name: 'Enviar de novo' })).toBeNull();
  });

  it('P2: a referência é `profiles.id`, não `auth.uid()` — user.id difere de profile.id no mock', () => {
    // O mock acima monta `user: { id: 'u-atual' }` com `profile: { id: 'p-atual' }` de propósito:
    // se o componente comparasse `agent_id` contra `auth.uid()`, a falha própria (agent_id
    // 'p-atual') cairia no ramo "de outro" e este reenvio direto falharia (botão ausente).
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[falha({ id: 'minha', agent_id: 'p-atual', content: 'meu texto', created_at: haMinutos(5) })]}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).toHaveBeenCalledWith('meu texto');
    cleanup();

    // Contrapartida: falha marcada com o próprio auth uid NÃO é "minha" — `agent_id` aponta
    // para `profiles.id`, então para o atendente comum ela aparece bloqueada como de outro.
    render(
      <SendErrorBanner
        messages={[falha({ id: 'uid', agent_id: 'u-atual', content: 'texto', created_at: haMinutos(5) })]}
        onSendMessage={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('outro atendente (u-atual)');
    expect(screen.queryByRole('button', { name: 'Enviar de novo' })).toBeNull();
  });

  it('atendente comum: falha própria recente reenvia direto, sem confirmação', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[falha({ id: 'minha', agent_id: 'p-atual', content: 'meu texto', created_at: haMinutos(5) })]}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).toHaveBeenCalledWith('meu texto');
  });

  it('supervisor vê a falha de outro atendente, mas reenviar pede confirmação', () => {
    controle.perfil = { id: 'p-gestor', role: 'supervisor' };
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[falha({ id: 'colega', agent_id: 'p-outro', content: 'texto do colega', created_at: haMinutos(1) })]}
        onSendMessage={onSendMessage}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('1 mensagem não foi enviada');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Confirmar reenvio' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reenvio' }));
    expect(onSendMessage).toHaveBeenCalledWith('texto do colega');
  });

  it('perfil ainda não carregado: a falha aparece (não some da tela) e exige confirmação', () => {
    controle.perfil = null;
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[falha({ id: 'qualquer', agent_id: 'p-atual', content: 'texto', created_at: haMinutos(1) })]}
        onSendMessage={onSendMessage}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('1 mensagem não foi enviada');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Confirmar reenvio' })).toBeInTheDocument();
  });
});

describe('SendErrorBanner · filtro por idade', () => {
  it('falha entre 1 h e 24 h pede confirmação antes de reenviar', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[falha({ id: 'minha', agent_id: 'p-atual', content: 'texto', created_at: haMinutos(120) })]}
        onSendMessage={onSendMessage}
      />,
    );

    expect(LIMITE_CONFIRMACAO_MS).toBe(60 * 60 * 1000);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reenvio' }));
    expect(onSendMessage).toHaveBeenCalledWith('texto');
  });

  it('falha com mais de 24 h aparece como "Falha antiga" e não reenvia automático', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'velha', agent_id: 'p-atual', content: 'texto antigo', created_at: haMinutos(25 * 60) }),
        ]}
        onSendMessage={onSendMessage}
      />,
    );

    expect(LIMITE_FALHA_ANTIGA_MS).toBe(24 * 60 * 60 * 1000);
    expect(screen.getByRole('alert')).toHaveTextContent('Falha antiga');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reenvio' }));
    expect(onSendMessage).toHaveBeenCalledWith('texto antigo');
  });

  it('"Cancelar" na confirmação não reenvia', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[falha({ id: 'velha', agent_id: 'p-atual', content: 'texto', created_at: haMinutos(120) })]}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Confirmar reenvio' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

describe('SendErrorBanner · escolha da falha', () => {
  it('com mais de uma falha, reenvia a ESCOLHIDA (não a última)', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'f1', agent_id: 'p-atual', content: 'primeira', created_at: haMinutos(30) }),
          falha({ id: 'f2', agent_id: 'p-atual', content: 'segunda', created_at: haMinutos(10) }),
        ]}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.change(screen.getByLabelText('Mensagem com falha'), { target: { value: 'f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('primeira');
  });

  it('sem escolha explícita vale a falha mais recente', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'f1', agent_id: 'p-atual', content: 'primeira', created_at: haMinutos(30) }),
          falha({ id: 'f2', agent_id: 'p-atual', content: 'segunda', created_at: haMinutos(10) }),
        ]}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(onSendMessage).toHaveBeenCalledWith('segunda');
  });

  it('P3: o seletor lista as 2 falhas com rótulo completo (hora, resumo, idade, autor)', () => {
    // Tamanho do controle (não é suposição): `select#send-error-banner-escolha` nativo com
    // `max-w-[16rem]` (largura máxima 256 px) e `min-h-10` (altura mínima 40 px). <select>
    // nativo abre popup listando TODAS as <option> — 2 opções cabem na lista sem paginação;
    // a prova abaixo mostra que os 2 rótulos vão inteiros ao DOM (nome acessível completo,
    // sem truncamento de informação: hora + resumo + "falha antiga" + "outro atendente (id)").
    controle.perfil = { id: 'p-gestor', role: 'admin' };
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'f1', agent_id: 'p-atual', content: 'primeira', created_at: haMinutos(10) }),
          falha({ id: 'f2', agent_id: 'p-outro', content: 'segunda', created_at: haMinutos(25 * 60) }),
        ]}
        onSendMessage={vi.fn()}
      />,
    );

    const opcoes = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(opcoes).toHaveLength(2);
    expect(opcoes.some((t) => t.includes('primeira'))).toBe(true);
    expect(opcoes.some((t) => t.includes('segunda') && t.includes('falha antiga') && t.includes('outro atendente (p-outro)'))).toBe(true);
    const maiorRotulo = Math.max(...opcoes.map((t) => t.length));
    // Rótulo mais longo medido nesta prova (hora + resumo de 7 chars + 2 marcadores).
    expect(maiorRotulo).toBeLessThanOrEqual(90);
  });
});

describe('SendErrorBanner · confirmação amarrada à falha exibida (P4)', () => {
  it('trocar a falha confirmada pela lista zera o "Confirmar reenvio" (não vale para outra)', () => {
    // f1 exige confirmação (> 1 h). Sem o efeito em `selecionadaId`, remover f1 da lista
    // manteria `confirmando === true` e o grupo apareceria valendo para f2 — reenvio errado.
    const onSendMessage = vi.fn();
    const f1 = falha({ id: 'f1', agent_id: 'p-atual', content: 'primeira', created_at: haMinutos(120) });
    const f2 = falha({ id: 'f2', agent_id: 'p-atual', content: 'segunda', created_at: haMinutos(5) });
    const { rerender } = render(
      <SendErrorBanner messages={[f1, f2]} onSendMessage={onSendMessage} />,
    );

    fireEvent.change(screen.getByLabelText('Mensagem com falha'), { target: { value: 'f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(screen.getByRole('group', { name: 'Confirmar reenvio' })).toBeInTheDocument();

    rerender(<SendErrorBanner messages={[f2]} onSendMessage={onSendMessage} />);
    expect(screen.queryByRole('group', { name: 'Confirmar reenvio' })).toBeNull();
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('trocar pelo seletor também zera a confirmação pendente', () => {
    const onSendMessage = vi.fn();
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'f1', agent_id: 'p-atual', content: 'primeira', created_at: haMinutos(120) }),
          falha({ id: 'f2', agent_id: 'p-atual', content: 'segunda', created_at: haMinutos(130) }),
        ]}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.change(screen.getByLabelText('Mensagem com falha'), { target: { value: 'f1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    expect(screen.getByRole('group', { name: 'Confirmar reenvio' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mensagem com falha'), { target: { value: 'f2' } });
    expect(screen.queryByRole('group', { name: 'Confirmar reenvio' })).toBeNull();
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

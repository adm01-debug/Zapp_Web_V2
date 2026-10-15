/**
 * SendErrorBanner · filtro por autor e idade (PK-23, paridade com o varredor do PD-78).
 *
 * Antes: o banner filtrava só `sender === 'agent'` — a falha de QUALQUER atendente entrava no
 * contador e "Enviar de novo" reenviava o texto da última falha, que podia ser de outro atendente.
 *
 * Agora: `messages.agent_id` aponta para `profiles.id` (RLS de insert em `messages`), então
 *  - atendente comum: só as falhas DELE contam e aparecem — texto de colega nunca é reenviado;
 *  - admin/supervisor: vê as de todos, mas reenviar a de outro pede confirmação explícita;
 *  - perfil ainda não carregado: a falha aparece (não some da tela) e o reenvio pede confirmação;
 *  - acima de 1 h o reenvio pede confirmação; acima de 24 h a falha é rotulada "Falha antiga" e
 *    nunca sai reenvio automático;
 *  - com mais de uma falha, o reenvio usa a falha ESCOLHIDA no seletor (não a última).
 *
 * O componente REAL é montado; o reenvio é provado pelo `onSendMessage` (mensagem nova).
 * Este arquivo substitui o registro de provas pendentes que só tinha `it.todo`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('SendErrorBanner · filtro por autor', () => {
  it('atendente comum: falha de colega não aparece nem entra no contador', () => {
    render(
      <SendErrorBanner
        messages={[
          falha({ id: 'colega', agent_id: 'p-outro', content: 'texto do colega', created_at: haMinutos(1) }),
          falha({ id: 'minha', agent_id: 'p-atual', content: 'meu texto', created_at: haMinutos(2) }),
        ]}
        onSendMessage={vi.fn()}
      />,
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('1 mensagem não foi enviada');
    expect(banner).not.toHaveTextContent('texto do colega');
  });

  it('atendente comum: só falha de colega → nenhum aviso', () => {
    const { container } = render(
      <SendErrorBanner
        messages={[falha({ id: 'colega', agent_id: 'p-outro', content: 'texto do colega' })]}
        onSendMessage={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
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

  it('o seletor mostra a hora e o resumo de cada falha, marcando a antiga e a de outro atendente', () => {
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
    expect(opcoes.some((t) => t.includes('primeira'))).toBe(true);
    expect(opcoes.some((t) => t.includes('segunda') && t.includes('falha antiga') && t.includes('outro atendente'))).toBe(true);
  });
});

/**
 * PE-69 / t_8979ec6f — ticks de entregue/lido das mensagens PRÓPRIAS no chat
 * interno.
 *
 * O teste renderiza o `TeamMessageItem` REAL (nenhum mock do componente) e
 * confere o que o usuário e o leitor de tela recebem em cada estado:
 *  - enviado  -> um traço (lucide-check) + nome acessível "Enviado";
 *  - entregue -> dois traços (lucide-check-check) + "Entregue";
 *  - lido     -> dois traços na cor 'info' do sistema + "Lido [por todos]" (o
 *                estado `read` só vem do all_read da view);
 *  - mensagem de outro -> nenhum tick (não polui a conversa).
 *
 * A cor não é resolvida pelo jsdom: o teste pina a classe que o componente
 * aplica ao ícone do tick renderizado (o token `--info` existe em tokens.css).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamMessageItem } from '../TeamMessageItem';
import type { TeamMessage } from '@/hooks/team-chat/teamChatTypes';

const baseMsg = (over: Partial<TeamMessage> = {}): TeamMessage => ({
  id: 'm-1',
  conversation_id: 'conv-a',
  sender_id: 'u1',
  content: 'oi',
  message_type: 'text',
  media_url: null,
  media_type: null,
  reply_to_id: null,
  is_edited: false,
  status: 'sent',
  created_at: '2026-10-13T10:00:00+00:00',
  updated_at: '2026-10-13T10:00:00+00:00',
  sender: { id: 'u1', name: 'Eu', avatar_url: null },
  ...over,
});

function renderItem(
  over: Partial<TeamMessage> = {},
  opts: { isMine?: boolean; conversationType?: 'direct' | 'group' } = {},
) {
  const { isMine = true, conversationType = 'group' } = opts;
  const noop = () => {};
  return render(
    <TeamMessageItem
      msg={baseMsg(over)}
      isMine={isMine}
      showDate={false}
      conversationType={conversationType}
      repliedMsg={null}
      isEditing={false}
      editText=""
      ttsIsPlaying={false}
      ttsIsLoading={false}
      onReply={noop}
      onEdit={noop}
      onDelete={noop}
      onCopy={noop}
      onTtsToggle={noop}
      onSaveEdit={noop}
      onCancelEdit={noop}
      setEditText={noop}
    />,
  );
}

/** O wrapper acessível do tick (role="img" com nome). */
function tick(): HTMLElement {
  return screen.getByRole('img');
}

describe('TeamMessageItem — ticks de estado da mensagem própria (PE-69)', () => {
  it('enviado: um traço com nome acessível "Enviado"', () => {
    const { container } = renderItem({ status: 'sent' });
    const el = screen.getByRole('img', { name: 'Enviado' });
    expect(el.querySelector('svg.lucide-check')).toBeTruthy();
    expect(el.querySelector('svg.lucide-check-check')).toBeNull();
    expect(container.querySelectorAll('svg.lucide-check-check')).toHaveLength(0);
  });

  it('entregue: dois traços com nome acessível "Entregue"', () => {
    renderItem({ status: 'delivered' });
    const el = screen.getByRole('img', { name: 'Entregue' });
    expect(el.querySelector('svg.lucide-check-check')).toBeTruthy();
  });

  it('lido em grupo: dois traços na cor info e nome "Lido por todos os participantes"', () => {
    renderItem({ status: 'read' }, { conversationType: 'group' });
    const el = screen.getByRole('img', { name: 'Lido por todos os participantes' });
    expect(el.querySelector('svg.lucide-check-check')).toBeTruthy();
    expect(el.className).toContain('text-info');
    expect(el.className).not.toContain('text-primary-foreground');
  });

  it('lido em conversa direta: nome "Lido" (não há "todos")', () => {
    renderItem({ status: 'read' }, { conversationType: 'direct' });
    expect(screen.getByRole('img', { name: 'Lido' })).toBeTruthy();
  });

  it('enviado/entregue usam a cor do texto do balão próprio, não a cor info', () => {
    const { unmount } = renderItem({ status: 'delivered' });
    const entregue = tick();
    expect(entregue.className).toContain('text-primary-foreground');
    expect(entregue.className).not.toContain('text-info');
    unmount();
  });

  it('status desconhecido cai para enviado (fail-safe do normalize)', () => {
    renderItem({ status: 'queued' });
    expect(screen.getByRole('img', { name: 'Enviado' })).toBeTruthy();
  });

  it('mensagem de outro participante não mostra tick nenhum', () => {
    const { container } = renderItem({ status: 'read', sender_id: 'u2' }, { isMine: false });
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelectorAll('svg.lucide-check, svg.lucide-check-check')).toHaveLength(0);
  });

  it('enviando: relógio com nome "Enviando mensagem"', () => {
    renderItem({ status: 'sending' });
    const el = screen.getByRole('img', { name: 'Enviando mensagem' });
    expect(el.querySelector('svg.lucide-clock')).toBeTruthy();
  });

  it('mensagem apagada não mostra tick', () => {
    renderItem({ status: 'deleted' });
    expect(screen.queryByRole('img')).toBeNull();
  });
});

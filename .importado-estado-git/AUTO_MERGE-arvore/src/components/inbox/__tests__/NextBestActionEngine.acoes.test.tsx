import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageSquare, TrendingUp, CheckSquare } from 'lucide-react';

// Nomes com prefixo `mock` são permitidos dentro do factory hoisted do vi.mock.
const mockActions = [
  {
    type: 'respond',
    label: 'Responder agora',
    description: 'Fulano aguarda resposta há 6h',
    priority: 'high' as const,
    icon: MessageSquare,
  },
  {
    type: 'complete_tasks',
    label: 'Completar 2 tarefa(s)',
    description: '2 tarefas abertas nesta conversa',
    priority: 'medium' as const,
    icon: CheckSquare,
  },
  {
    type: 'upsell',
    label: 'Explorar oportunidade',
    description: 'Sem ações urgentes. Considere oferecer novos produtos/serviços.',
    priority: 'low' as const,
    icon: TrendingUp,
  },
];

vi.mock('@/hooks/chat/useNextBestAction', () => ({
  useNextBestAction: () => ({ actions: mockActions, loading: false }),
}));

import { NextBestActionEngine } from '../NextBestActionEngine';

describe('NextBestActionEngine — cartão só é clicável quando faz algo', () => {
  it('sugestão sem alvo na tela fica informativa: não é botão e não tem cursor de clique', () => {
    const { container } = render(
      <NextBestActionEngine contactId="c1" contactName="Fulano" />,
    );

    const responder = screen.getByText('Responder agora');
    expect(responder).toBeInTheDocument();
    expect(responder.closest('.cursor-pointer')).toBeNull();
    expect(screen.getByText('Explorar oportunidade').closest('.cursor-pointer')).toBeNull();
    expect(screen.queryByRole('button', { name: /Responder agora/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Explorar oportunidade/ })).toBeNull();

    // Só 'complete_tasks' tem destino que já existe (aba Tarefas).
    expect(container.querySelectorAll('.cursor-pointer')).toHaveLength(1);
  });

  it('"Completar tarefas" vira botão acessível e abre a aba Tarefas pelo evento da tela', () => {
    const abriuTarefas = vi.fn();
    window.addEventListener('inbox-open-tasks-tab', abriuTarefas);
    try {
      render(<NextBestActionEngine contactId="c1" contactName="Fulano" />);

      const botao = screen.getByRole('button', { name: /Completar 2 tarefa/ });
      fireEvent.click(botao);
      expect(abriuTarefas).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(botao, { key: 'Enter' });
      expect(abriuTarefas).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('inbox-open-tasks-tab', abriuTarefas);
    }
  });

  it('espaço segurado não dispara a ação em repetição', () => {
    const abriuTarefas = vi.fn();
    window.addEventListener('inbox-open-tasks-tab', abriuTarefas);
    try {
      render(<NextBestActionEngine contactId="c1" contactName="Fulano" />);

      fireEvent.keyDown(screen.getByRole('button', { name: /Completar 2 tarefa/ }), {
        key: ' ',
        repeat: true,
      });
      expect(abriuTarefas).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('inbox-open-tasks-tab', abriuTarefas);
    }
  });
});

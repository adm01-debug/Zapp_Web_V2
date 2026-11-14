/**
 * Botão "Performance" do cabeçalho do chat de equipe: deixou de ser placeholder
 * `disabled` "(em breve)" e segue o padrão dos outros painéis (`onToggleX` +
 * `showX`). Sem callback (não-membro do canal) o botão não aparece. O painel
 * `TeamPerformancePanel` mostra erro quando a consulta falha.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamChatHeader } from '../TeamChatHeader';
import { TeamPerformancePanel } from '../TeamPerformancePanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

vi.mock('../MoveDepartmentDialog', () => ({ MoveDepartmentDialog: () => null }));

const performanceMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/team-chat/useTeamPerformance', () => ({
  useTeamPerformance: () => performanceMock(),
}));

const conversa = {
  id: 'conv-1', type: 'group', name: 'Time Comercial', avatar_url: null, created_by: 'u1',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', members: [],
} as unknown as TeamConversation;

const headerProps = {
  conversation: conversa,
  voiceId: 'v1',
  speed: 1,
  showSearch: false,
  onBack: vi.fn(),
  onVoiceChange: vi.fn(),
  onSpeedChange: vi.fn(),
};

describe('TeamChatHeader — botão Performance', () => {
  it('sem onTogglePerformance não há botão nem placeholder "(em breve)"', () => {
    render(<TooltipProvider><TeamChatHeader {...headerProps} /></TooltipProvider>);

    expect(screen.queryByRole('button', { name: /performance/i })).toBeNull();
    expect(screen.queryByText(/em breve/i)).toBeNull();
  });

  it('com onTogglePerformance o botão fica habilitado e chama o callback', () => {
    const onTogglePerformance = vi.fn();
    render(
      <TooltipProvider>
        <TeamChatHeader {...headerProps} onTogglePerformance={onTogglePerformance} showPerformance={false} />
      </TooltipProvider>,
    );

    const botao = screen.getByRole('button', { name: 'Ver performance' });
    expect(botao).not.toBeDisabled();
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(botao);
    expect(onTogglePerformance).toHaveBeenCalledTimes(1);
  });

  it('com o painel aberto o botão indica estado pressionado e oferece fechar', () => {
    render(
      <TooltipProvider>
        <TeamChatHeader {...headerProps} onTogglePerformance={vi.fn()} showPerformance />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Fechar performance' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TeamPerformancePanel — estados', () => {
  it('mostra aviso de erro quando a consulta falha', () => {
    performanceMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<TeamPerformancePanel conversationId="conv-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as métricas.');
  });

  it('mostra carregando enquanto busca', () => {
    performanceMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<TeamPerformancePanel conversationId="conv-1" />);

    expect(screen.getByText('Carregando métricas...')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniChatPiP } from '@/components/mobile/MiniChatPiP';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, style, onClick, ...rest }: { children?: import("react").ReactNode; className?: string; style?: import("react").CSSProperties; onClick?: () => void } & Record<string, unknown>) => (
      <div className={className} style={style} onClick={onClick} data-testid="pip-container">
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children?: import("react").ReactNode }) => <>{children}</>,
}));

describe('MiniChatPiP', () => {
  const defaultProps = {
    contactName: 'Maria Silva',
    contactAvatar: 'https://example.com/avatar.jpg',
    lastMessage: 'Olá, tudo bem?',
    isVisible: true,
    onExpand: vi.fn(),
    onDismiss: vi.fn(),
    onQuickReply: vi.fn(),
  };

  it('renders contact name when visible', () => {
    render(<MiniChatPiP {...defaultProps} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    render(<MiniChatPiP {...defaultProps} isVisible={false} />);
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
  });

  it('shows correct initials', () => {
    render(<MiniChatPiP {...defaultProps} />);
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  it('shows "Toque para responder" in collapsed state', () => {
    render(<MiniChatPiP {...defaultProps} />);
    expect(screen.getByText('Toque para responder')).toBeInTheDocument();
  });

  it('calls onDismiss when Fechar is clicked', () => {
    render(<MiniChatPiP {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  // N-043: o controle de expandir da versão minimizada era uma div com onClick
  // (não focável, sem nome acessível). Precisa ser um botão real e anunciado.
  it('o controle de expandir da versão minimizada é botão focável com nome acessível', () => {
    render(<MiniChatPiP {...defaultProps} />);
    const expandir = screen.getByRole('button', { name: /restaurar|expandir/i });
    expect(expandir.tagName).toBe('BUTTON');
    expandir.focus();
    expect(expandir).toHaveFocus();
    fireEvent.click(expandir);
    expect(defaultProps.onExpand).toHaveBeenCalled();
  });

  it('the minimize button has aria-label "Recolher"', () => {
    render(<MiniChatPiP {...defaultProps} />);
    // Expand the PiP first — the minimize button only appears in expanded state
    fireEvent.click(screen.getByText('Toque para responder'));
    expect(screen.getByRole('button', { name: 'Recolher' })).toBeInTheDocument();
  });

  it('the send button has aria-label "Enviar"', () => {
    render(<MiniChatPiP {...defaultProps} />);
    // Expand first to show the send button
    fireEvent.click(screen.getByText('Toque para responder'));
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('the open full chat button has aria-label "Abrir conversa"', () => {
    render(<MiniChatPiP {...defaultProps} />);
    // Expand first to show the open full chat button
    fireEvent.click(screen.getByText('Toque para responder'));
    expect(screen.getByRole('button', { name: 'Abrir conversa' })).toBeInTheDocument();
  });

  it('expands when "Toque para responder" is clicked', () => {
    render(<MiniChatPiP {...defaultProps} />);
    fireEvent.click(screen.getByText('Toque para responder'));
    // Should now show the reply input
    expect(screen.getByPlaceholderText('Resposta rápida...')).toBeInTheDocument();
  });

  it('sends quick reply on enter', () => {
    render(<MiniChatPiP {...defaultProps} />);
    // Expand
    fireEvent.click(screen.getByText('Toque para responder'));

    const input = screen.getByPlaceholderText('Resposta rápida...');
    fireEvent.change(input, { target: { value: 'Oi!' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(defaultProps.onQuickReply).toHaveBeenCalledWith('Oi!');
  });

  it('does not send empty reply', () => {
    const onQuickReply = vi.fn();
    render(<MiniChatPiP {...defaultProps} onQuickReply={onQuickReply} />);
    fireEvent.click(screen.getByText('Toque para responder'));

    const input = screen.getByPlaceholderText('Resposta rápida...');
    // Don't type anything, just press enter
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onQuickReply).not.toHaveBeenCalled();
  });

  it('shows "Abrir conversa completa" when expanded', () => {
    render(<MiniChatPiP {...defaultProps} />);
    fireEvent.click(screen.getByText('Toque para responder'));
    expect(screen.getByText('Abrir conversa completa')).toBeInTheDocument();
  });

  it('handles missing contact name gracefully', () => {
    render(<MiniChatPiP {...defaultProps} contactName="" />);
    expect(screen.getByText('??')).toBeInTheDocument();
  });

  it('works without onQuickReply', () => {
    render(<MiniChatPiP {...defaultProps} onQuickReply={undefined} />);
    fireEvent.click(screen.getByText('Toque para responder'));
    // Should not show reply input
    expect(screen.queryByPlaceholderText('Resposta rápida...')).not.toBeInTheDocument();
  });
});

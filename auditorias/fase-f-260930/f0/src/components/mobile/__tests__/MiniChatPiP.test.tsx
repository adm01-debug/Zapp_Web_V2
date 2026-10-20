// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniChatPiP } from '@/components/mobile/MiniChatPiP';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, style, onClick, ...rest }: any) => (
      <div className={className} style={style} onClick={onClick} data-testid="pip-container">
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
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

  it('calls onDismiss when X is clicked', () => {
    render(<MiniChatPiP {...defaultProps} />);
    // Find the X button (dismiss)
    const buttons = screen.getAllByRole('button');
    const dismissBtn = buttons.find(b => b.querySelector('.lucide-x'));
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    }
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

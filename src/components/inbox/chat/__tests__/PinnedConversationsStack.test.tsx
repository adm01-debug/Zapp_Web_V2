import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PinnedConversationsStack, PinnedChatItem } from '../PinnedConversationsStack';

const item = (id: string, name: string): PinnedChatItem => ({ id, name, avatarUrl: null });

describe('PinnedConversationsStack', () => {
  it('renders nothing with 0 pinned items', () => {
    const { container } = render(
      <PinnedConversationsStack items={[]} onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single face without an overflow badge', () => {
    render(<PinnedConversationsStack items={[item('c-1', 'Marilia')]} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Abrir conversa fixada com Marilia')).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('renders exactly maxVisible faces without an overflow badge', () => {
    const items = Array.from({ length: 6 }, (_, i) => item(`c-${i}`, `Contato ${i}`));
    render(<PinnedConversationsStack items={items} onSelect={vi.fn()} maxVisible={6} />);
    for (const it of items) expect(screen.getByLabelText(`Abrir conversa fixada com ${it.name}`)).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('caps visible faces at maxVisible and shows the overflow counter', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`c-${i}`, `Contato ${i}`));
    render(<PinnedConversationsStack items={items} onSelect={vi.fn()} maxVisible={6} />);
    expect(screen.getAllByLabelText(/^Abrir conversa fixada com /)).toHaveLength(6);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('calls onSelect with the contact id when a face is clicked', () => {
    const onSelect = vi.fn();
    render(<PinnedConversationsStack items={[item('c-1', 'Marilia')]} onSelect={onSelect} />);
    screen.getByLabelText('Abrir conversa fixada com Marilia').click();
    expect(onSelect).toHaveBeenCalledWith('c-1');
  });
});

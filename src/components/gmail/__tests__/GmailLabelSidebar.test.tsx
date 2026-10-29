import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GmailLabelSidebar } from '../GmailLabelSidebar';
import type { EmailLabel } from '@/hooks/integrations/useGmail';

function makeLabel(overrides: Partial<EmailLabel> = {}): EmailLabel {
  return {
    id: 'l1',
    gmail_label_id: 'Label_9',
    name: 'Clientes VIP',
    label_type: 'user',
    color: '#7c3aed',
    message_count: 0,
    unread_count: 0,
    ...overrides,
  };
}

describe('GmailLabelSidebar', () => {
  it('mostra as pastas fixas primeiro e ignora rótulos que duplicam pasta do sistema', () => {
    render(
      <GmailLabelSidebar
        labels={[
          makeLabel({ gmail_label_id: 'INBOX', label_type: 'system', name: 'Inbox' }),
          makeLabel({ gmail_label_id: 'INBOX', label_type: 'user', name: 'Inbox duplicada' }),
          makeLabel({ name: 'Clientes VIP' }),
        ]}
        activeLabel="INBOX"
        onSelectLabel={() => {}}
      />,
    );
    expect(screen.getAllByRole('button', { name: /inbox/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /clientes vip/i })).toBeInTheDocument();
  });

  it('mostra todas as pastas do Gmail', () => {
    render(<GmailLabelSidebar labels={[]} activeLabel="INBOX" onSelectLabel={() => {}} />);
    for (const name of ['Inbox', 'Não lidos', 'Favoritos', 'Importantes', 'Enviados', 'Rascunhos', 'Spam', 'Lixeira']) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it('marca a pasta atual com aria-current e as demais sem', () => {
    render(<GmailLabelSidebar labels={[]} activeLabel="SPAM" onSelectLabel={() => {}} />);
    expect(screen.getByRole('button', { name: /spam/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /inbox/i })).not.toHaveAttribute('aria-current');
  });

  it('chama onSelectLabel com o gmail_label_id da pasta', () => {
    const onSelect = vi.fn();
    render(<GmailLabelSidebar labels={[]} activeLabel="INBOX" onSelectLabel={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /lixeira/i }));
    expect(onSelect).toHaveBeenCalledWith('TRASH');
  });

  it('mostra o marcador personalizado do hook', () => {
    render(<GmailLabelSidebar labels={[makeLabel()]} activeLabel="INBOX" onSelectLabel={() => {}} />);
    expect(screen.getByText('Marcadores')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clientes vip/i })).toBeInTheDocument();
  });

  it('exibe a contagem do rótulo quando há', () => {
    render(
      <GmailLabelSidebar
        labels={[makeLabel({ gmail_label_id: 'UNREAD', label_type: 'system', name: 'Não lidos', message_count: 7 })]}
        activeLabel="INBOX"
        onSelectLabel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /não lidos/i })).toHaveTextContent('7');
  });

  it('não mostra contagem quando o rótulo está zerado', () => {
    render(<GmailLabelSidebar labels={[]} activeLabel="INBOX" onSelectLabel={() => {}} />);
    expect(screen.getByRole('button', { name: /não lidos/i })).not.toHaveTextContent(/\d/);
  });

  it('o seletor do celular troca a pasta', () => {
    const onSelect = vi.fn();
    render(<GmailLabelSidebar labels={[]} activeLabel="INBOX" onSelectLabel={onSelect} />);
    fireEvent.change(screen.getByLabelText('Pasta do Gmail'), { target: { value: 'DRAFT' } });
    expect(onSelect).toHaveBeenCalledWith('DRAFT');
  });

  it('teclado: seta para baixo leva o foco à pasta seguinte', () => {
    render(<GmailLabelSidebar labels={[]} activeLabel="INBOX" onSelectLabel={() => {}} />);
    const inbox = screen.getByRole('button', { name: /inbox/i });
    const unread = screen.getByRole('button', { name: /não lidos/i });
    inbox.focus();
    fireEvent.keyDown(inbox, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(unread);
    fireEvent.keyDown(unread, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(inbox);
  });

  it('teclado: End e Home vão ao extremo da lista', () => {
    render(<GmailLabelSidebar labels={[]} activeLabel="INBOX" onSelectLabel={() => {}} />);
    const inbox = screen.getByRole('button', { name: /inbox/i });
    const trash = screen.getByRole('button', { name: /lixeira/i });
    inbox.focus();
    fireEvent.keyDown(inbox, { key: 'End' });
    expect(document.activeElement).toBe(trash);
    fireEvent.keyDown(trash, { key: 'Home' });
    expect(document.activeElement).toBe(inbox);
  });
});

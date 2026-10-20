import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog } from '@/components/ui/dialog';
import { ContactSelectionStep } from '../ContactSelectionStep';
import type { ContactResult } from '../useSendProduct';

const renderStep = (props: React.ComponentProps<typeof ContactSelectionStep>) =>
  render(<Dialog open><ContactSelectionStep {...props} /></Dialog>);

const contact: ContactResult = { id: 'c1', name: 'Tomaz', phone: '5511949600474', avatar_url: null };

const baseProps = {
  productName: 'Açucareiro em bambu',
  selectedImagesCount: 1,
  template: 'informal' as const,
  templateLabels: { formal: 'Formal', informal: 'Informal', promo: 'Promoção' },
  contactSearch: '',
  onContactSearchChange: vi.fn(),
  contactResults: [] as ContactResult[],
  searchingContacts: false,
  selectedContact: null as ContactResult | null,
  onSelectContact: vi.fn(),
  isSending: false,
  onBack: vi.fn(),
  onSend: vi.fn(),
};

describe('ContactSelectionStep', () => {
  it('botão de enviar fica desabilitado sem contato selecionado', () => {
    renderStep({ ...baseProps });
    expect(screen.getByText('Selecione um contato').closest('button')).toBeDisabled();
  });

  it('com contato selecionado, o botão habilita e mostra o nome', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} selectedContact={contact} /></Dialog>);
    const btn = screen.getByText('Enviar para Tomaz').closest('button');
    expect(btn).not.toBeDisabled();
  });

  it('sem busca e sem resultados, mostra o estado vazio de "busque"', () => {
    renderStep({ ...baseProps });
    expect(screen.getByText('Busque por nome ou telefone')).toBeInTheDocument();
  });

  it('com busca e sem resultados, mostra "nenhum contato encontrado"', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="xyz" /></Dialog>);
    expect(screen.getByText('Nenhum contato encontrado')).toBeInTheDocument();
  });

  it('lista os resultados de contato retornados', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="tom" contactResults={[contact]} /></Dialog>);
    expect(screen.getByText('Tomaz')).toBeInTheDocument();
    expect(screen.getByText('5511949600474')).toBeInTheDocument();
  });

  it('durante o envio, mostra "Enviando..." e desabilita o botão', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} selectedContact={contact} isSending /></Dialog>);
    expect(screen.getByText('Enviando...').closest('button')).toBeDisabled();
  });

  it('com bloqueio pré-envio, explica o motivo e desabilita o Enviar (CT-08)', () => {
    render(
      <Dialog open>
        <ContactSelectionStep
          {...baseProps}
          selectedContact={contact}
          sendBlockedReason="Nenhuma conexão de WhatsApp ativa. Reconecte a instância em Conexões para poder enviar."
        />
      </Dialog>
    );
    expect(screen.getByText(/Nenhuma conexão de WhatsApp ativa/)).toBeInTheDocument();
    expect(screen.getByText('Enviar para Tomaz').closest('button')).toBeDisabled();
  });

  it('enquanto a checagem pré-envio roda, o Enviar fica desabilitado (CT-08)', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} selectedContact={contact} checkingSendReadiness /></Dialog>);
    expect(screen.getByText('Enviar para Tomaz').closest('button')).toBeDisabled();
  });
});

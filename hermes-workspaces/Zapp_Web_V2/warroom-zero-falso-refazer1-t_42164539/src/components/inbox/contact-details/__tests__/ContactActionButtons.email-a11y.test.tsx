import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ContactActionButtons } from '../ContactActionButtons';

// Acessibilidade do ícone de e-mail do painel do contato (plano
// PLANO_EMAIL_LINK_CONTATO_14_ETAPAS_2026-10-07.md, etapa E07/L07).
// Foco por teclado, aria-disabled sem e-mail, dica falada (nome acessível),
// ordem de tabulação do painel e ativação por Enter/Espaço.

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// U04 — o selo de e-mails não lidos vem do hook U02; mockado (contagem 0 aqui)
// para nenhum teste falar com o Supabase real.
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({
  useContactUnreadEmails: () => ({ count: 0, status: 'ok' }),
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));
const navigateToView = vi.fn();
let videoCallFlag = false;
vi.mock('@/hooks/system/useFeatureFlag', () => ({
  useFeatureFlag: (key: string, fallback = false) => (key === 'video_call' ? videoCallFlag : fallback),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => navigateToView(...args),
}));
// O Tooltip do Radix usa portal + timers: é fronteira de UI, não o alvo do
// teste. O conteúdo continua sendo renderizado como texto (é o que um leitor
// de tela lê), então a dica falada segue verificável.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-testid="contact-action-tooltip">{children}</span>
  ),
}));

const baseContact = { id: 'c1', name: 'Maria Silva', phone: '+5511****9999', email: 'maria@test.com' };
const onStartCall = vi.fn();

/** Localiza o Tile de e-mail pelo ícone; o <button> real fica dentro. */
function emailTile() {
  return screen.getAllByTestId('contact-action-tile').find(t => t.querySelector('svg.lucide-mail'))!;
}

/**
 * Controles que o teclado alcança (Tab), na ordem do DOM. Um <button>
 * desabilitado não recebe foco; o Tile desabilitado expõe um invólucro
 * `[tabindex="0"]` que É alcançável — é o que a pessoa ouve "Sem e-mail".
 */
function ordemDeTab(painel: HTMLElement): (string | null)[] {
  return Array.from(
    painel.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'),
  ).map(el => el.getAttribute('aria-label'));
}

describe('ContactActionButtons — acessibilidade do ícone de e-mail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    videoCallFlag = false;
  });

  it('o controle de e-mail é um <button> nativo — é isso que faz Enter e Espaço o ativarem', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tile = emailTile();
    // jsdom não converte keydown em click; a garantia de ativação por teclado
    // é a semântica nativa: <button type="button"> ativa em Enter e Espaço.
    // Um `role="button"` em <div>/<span> perderia essa ativação automática.
    expect(tile.tagName).toBe('BUTTON');
    expect(tile).toHaveAttribute('type', 'button');
  });

  it('Enter/Espaço (clique nativo) no e-mail habilitado abre o módulo com o contato', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tile = emailTile();
    tile.focus();
    // No navegador, Enter e Espaço num botão nativo disparam 'click' — é o
    // mesmo evento que o teclado produz.
    fireEvent.click(tile);
    expect(navigateToView).toHaveBeenCalledWith('email-chat', {
      emailContact: 'c1',
      emailTo: 'maria@test.com',
    });
  });

  it('com o e-mail desabilitado o teclado NÃO abre o módulo', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    const wrapper = emailTile().closest('[tabindex="0"]')!;
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    fireEvent.keyDown(wrapper, { key: ' ' });
    fireEvent.click(wrapper);
    expect(navigateToView).not.toHaveBeenCalled();
  });

  it('sem e-mail: o controle tem aria-disabled=true e role=button (WCAG 4.1.2)', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    const wrapper = emailTile().closest('[tabindex="0"]')!;
    expect(wrapper).toHaveAttribute('role', 'button');
    expect(wrapper).toHaveAttribute('aria-disabled', 'true');
  });

  it('com e-mail: o controle NÃO é anunciado como desabilitado', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tile = emailTile();
    expect(tile).not.toBeDisabled();
    expect(tile).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('o e-mail desabilitado continua alcançável pelo teclado (Tab) e recebe foco no invólucro', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    const tile = emailTile();
    // O <button> desabilitado não pode receber foco — quem o recebe é o invólucro.
    expect(tile).toBeDisabled();
    tile.focus();
    expect(document.activeElement).not.toBe(tile);

    const wrapper = tile.closest('[tabindex="0"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    wrapper.focus();
    expect(document.activeElement).toBe(wrapper);
  });

  it('o e-mail habilitado recebe foco no próprio botão', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tile = emailTile();
    tile.focus();
    expect(document.activeElement).toBe(tile);
  });

  it('dica falada: o ícone tem nome acessível "E-mail" nos dois estados (ícone não tem texto próprio)', () => {
    const { rerender } = render(
      <ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />,
    );
    // Desabilitado: o invólucro focável (role=button) anuncia "E-mail".
    const wrapper = emailTile().closest('[tabindex="0"]')!;
    expect(wrapper).toHaveAccessibleName('E-mail');

    rerender(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(emailTile()).toHaveAttribute('aria-label', 'E-mail');
    expect(emailTile()).toHaveAccessibleName('E-mail');
  });

  it('dica falada: o texto do tooltip muda com o estado do e-mail (Sem e-mail / Abrir e-mail)', () => {
    const { rerender } = render(
      <ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />,
    );
    expect(screen.getByText('Sem e-mail')).toBeInTheDocument();

    rerender(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(screen.getByText('Abrir e-mail')).toBeInTheDocument();
    expect(screen.queryByText('Sem e-mail')).not.toBeInTheDocument();
  });

  it('ordem de tabulação do painel segue a ordem visual dos Tiles', () => {
    const { container } = render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const painel = container.firstElementChild as HTMLElement;
    // Ordem visual (grid de 6 colunas) = ordem de leitura, exigida pela WCAG 2.4.3.
    expect(ordemDeTab(painel)).toEqual([
      'Ligar',
      'E-mail',
      'Transferir',
      'Adicionar participante',
      'Mais',
    ]);
  });

  it('ordem de tabulação com o e-mail desabilitado é a mesma (o ícone cinza continua na fila do Tab)', () => {
    const { container } = render(
      <ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />,
    );
    const painel = container.firstElementChild as HTMLElement;
    expect(ordemDeTab(painel)).toEqual([
      'Ligar',
      'E-mail',
      'Transferir',
      'Adicionar participante',
      'Mais',
    ]);
  });

  it('a videochamada, quando ligada, entra na ordem após "Ligar"', () => {
    videoCallFlag = true;
    const { container } = render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const painel = container.firstElementChild as HTMLElement;
    expect(ordemDeTab(painel)).toEqual([
      'Ligar',
      'Vídeo',
      'E-mail',
      'Transferir',
      'Adicionar participante',
      'Mais',
    ]);
  });
});

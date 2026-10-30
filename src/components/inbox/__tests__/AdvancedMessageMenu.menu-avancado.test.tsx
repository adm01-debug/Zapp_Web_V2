import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * Menu avançado do chat (src/components/inbox/AdvancedMessageMenu.tsx) — 4 achados da auditoria
 * de paridade V3 -> V2:
 *  (a) 'Status/Story' aparecia para todo mundo, mas a Edge nega `send-status` a quem não é
 *      admin/supervisor (o agente via uma opção que sempre falha) e, para o admin, publicava para
 *      TODOS os contatos do número sem nenhuma confirmação;
 *  (b) `selectableCount` da enquete: o `max` do input só limitava as setas — digitar 0 ou 99 ia
 *      direto para `deliveryPayload`; opções duplicadas passavam e `key={i}` fazia o foco/valor
 *      pular de linha ao remover uma opção do meio;
 *  (c) cartão de contato só exigia campos não vazios (telefone texto livre, e-mail sem validação);
 *  (d) figurinha por URL aceitava qualquer texto, mas a fila canônica exige `^https://`.
 */

const h = vi.hoisted(() => ({
  sendStatusMessage: vi.fn(),
  sendOutboundMessage: vi.fn(),
  sendRichOutboundMessage: vi.fn(),
  onPollSent: vi.fn(),
  onContactSent: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  role: { isSupervisor: false, loading: false },
}));

vi.mock('sonner', () => ({ toast: h.toast }));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendStatusMessage: h.sendStatusMessage, isLoading: false }),
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: h.sendOutboundMessage,
  sendRichOutboundMessage: h.sendRichOutboundMessage,
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => h.role,
}));

// Radix Popover não abre de forma confiável sob jsdom (mesmo padrão dos testes desta pasta): o
// gatilho real da tela abre o conteúdo, que só monta quando `open` é verdadeiro.
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });

  return {
    Popover: ({ children, open, onOpenChange }: { children?: ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => (
      <Ctx.Provider value={{ open: !!open, setOpen: onOpenChange ?? (() => {}) }}>{children}</Ctx.Provider>
    ),
    PopoverTrigger: ({ children }: { children?: ReactNode }) => {
      const { setOpen } = React.useContext(Ctx);
      const child = React.Children.only(children) as React.ReactElement<{ onClick?: (e: unknown) => void }>;
      return React.cloneElement(child, {
        onClick: (e: unknown) => { child.props.onClick?.(e); setOpen(true); },
      });
    },
    PopoverContent: ({ children }: { children?: ReactNode }) => {
      const { open } = React.useContext(Ctx);
      return open ? <div>{children}</div> : null;
    },
  };
});

import { AdvancedMessageMenu } from '../AdvancedMessageMenu';

function renderMenu() {
  return render(
    <AdvancedMessageMenu
      contactId="contato-1"
      instanceName="instancia-1"
      recipientNumber="5511999999999"
      onPollSent={h.onPollSent}
      onContactSent={h.onContactSent}
    />,
  );
}

function abrirMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Mais opções de mensagem' }));
}

function abrirEnquete() {
  abrirMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Enquete' }));
}

/** Preenche título + N opções da enquete aberta. */
function preencherEnquete(titulo: string, opcoes: string[]) {
  fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: titulo } });
  const campos = screen.getAllByLabelText(/^Opção /) as HTMLInputElement[];
  opcoes.forEach((valor, i) => {
    if (i >= campos.length) {
      fireEvent.click(screen.getByRole('button', { name: /Adicionar opção/ }));
    }
    const atual = (screen.getAllByLabelText(/^Opção /) as HTMLInputElement[])[i];
    fireEvent.change(atual, { target: { value: valor } });
  });
}

const axeOpcoes = { rules: { 'color-contrast': { enabled: false } } };

beforeEach(() => {
  vi.clearAllMocks();
  h.role.isSupervisor = false;
  h.role.loading = false;
});

describe('AdvancedMessageMenu — Status/Story só para quem pode publicar', () => {
  it('o agente (não supervisor) não vê a opção Status/Story', () => {
    renderMenu();
    abrirMenu();

    expect(screen.queryByRole('button', { name: 'Status/Story' })).not.toBeInTheDocument();
    // As demais opções continuam disponíveis para o agente.
    expect(screen.getByRole('button', { name: 'Enquete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cartão de Contato' })).toBeInTheDocument();
  });

  it('enquanto os papéis carregam a opção fica escondida (não pisca para o agente)', () => {
    h.role.loading = true;
    renderMenu();
    abrirMenu();

    expect(screen.queryByRole('button', { name: 'Status/Story' })).not.toBeInTheDocument();
  });

  it('o admin vê a opção e publicar exige confirmação de que todos os contatos verão', async () => {
    h.role.isSupervisor = true;
    h.sendStatusMessage.mockResolvedValue(undefined);
    renderMenu();
    abrirMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Status/Story' }));
    fireEvent.change(screen.getByLabelText('Texto do status'), { target: { value: 'Promoção do dia' } });

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

    // Confirmação ANTES de publicar: o status vai para todos os contatos do número.
    expect(screen.getByText(/todos os seus contatos/i)).toBeInTheDocument();
    expect(h.sendStatusMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar para todos' }));

    expect(h.sendStatusMessage).toHaveBeenCalledWith('instancia-1', { type: 'text', content: 'Promoção do dia' });
  });
});

describe('AdvancedMessageMenu — validação da enquete', () => {
  it('selectableCount digitado acima do número de opções é limitado ao total preenchido', () => {
    renderMenu();
    abrirEnquete();
    preencherEnquete('Horário', ['Manhã', 'Tarde']);

    fireEvent.change(screen.getByLabelText('Seleções permitidas'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Enquete/ }));

    expect(h.sendRichOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'poll',
        deliveryPayload: { name: 'Horário', selectableCount: 2, values: ['Manhã', 'Tarde'] },
      }),
    );
  });

  it('selectableCount 0 é publicado como 1', () => {
    renderMenu();
    abrirEnquete();
    preencherEnquete('Horário', ['Manhã', 'Tarde']);

    fireEvent.change(screen.getByLabelText('Seleções permitidas'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Enquete/ }));

    expect(h.sendRichOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryPayload: { name: 'Horário', selectableCount: 1, values: ['Manhã', 'Tarde'] } }),
    );
  });

  it('opções duplicadas bloqueiam o envio', () => {
    renderMenu();
    abrirEnquete();
    preencherEnquete('Horário', ['Manhã', 'manhã']);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Enquete/ }));

    expect(h.sendRichOutboundMessage).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith('Remova as opções repetidas da enquete');
  });

  it('remover a opção do meio não troca o valor das outras linhas (id estável)', () => {
    renderMenu();
    abrirEnquete();
    preencherEnquete('Horário', ['Leite', 'Pão', 'Queijo']);

    const terceiraLinha = (screen.getAllByLabelText(/^Opção /) as HTMLInputElement[])[2];
    fireEvent.click(screen.getByRole('button', { name: 'Remover opção 2' }));

    // Com `key={i}` o nó do terceiro input era reaproveitado para a opção seguinte e o valor
    // digitado nele se perdia/trocava de lugar.
    expect(document.body.contains(terceiraLinha)).toBe(true);
    expect(terceiraLinha.value).toBe('Queijo');
    expect((screen.getAllByLabelText(/^Opção /) as HTMLInputElement[]).map((i) => i.value)).toEqual(['Leite', 'Queijo']);
  });
});

describe('AdvancedMessageMenu — validação do cartão de contato', () => {
  function abrirContato() {
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Cartão de Contato' }));
  }

  it('telefone com menos de 8 dígitos mostra a mensagem no próprio campo e não envia', () => {
    renderMenu();
    abrirContato();

    fireEvent.change(screen.getByLabelText('Nome completo *'), { target: { value: 'João Silva' } });
    fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Contato/ }));

    expect(screen.getByText('O telefone deve ter de 8 a 15 dígitos.')).toBeInTheDocument();
    expect(h.sendRichOutboundMessage).not.toHaveBeenCalled();
  });

  it('telefone com mais de 15 dígitos é recusado', () => {
    renderMenu();
    abrirContato();

    fireEvent.change(screen.getByLabelText('Nome completo *'), { target: { value: 'João Silva' } });
    fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '1234567890123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Contato/ }));

    expect(screen.getByText('O telefone deve ter de 8 a 15 dígitos.')).toBeInTheDocument();
    expect(h.sendRichOutboundMessage).not.toHaveBeenCalled();
  });

  it('e-mail inválido mostra a mensagem no campo do e-mail', () => {
    renderMenu();
    abrirContato();

    fireEvent.change(screen.getByLabelText('Nome completo *'), { target: { value: 'João Silva' } });
    fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '5511999999999' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'joao@empresa' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Contato/ }));

    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(h.sendRichOutboundMessage).not.toHaveBeenCalled();
  });

  it('nome vazio acusa só o campo do nome', () => {
    renderMenu();
    abrirContato();

    fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '5511999999999' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Contato/ }));

    expect(screen.getByText('Informe o nome completo.')).toBeInTheDocument();
    expect(screen.queryByText('O telefone deve ter de 8 a 15 dígitos.')).not.toBeInTheDocument();
    expect(h.sendRichOutboundMessage).not.toHaveBeenCalled();
  });

  it('dados válidos enviam o cartão e limpam os erros', async () => {
    h.sendRichOutboundMessage.mockResolvedValue(undefined);
    renderMenu();
    abrirContato();

    fireEvent.change(screen.getByLabelText('Nome completo *'), { target: { value: 'João Silva' } });
    fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '(55) 11 99999-9999' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'joao@empresa.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Contato/ }));

    expect(h.sendRichOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'contact',
        deliveryPayload: {
          fullName: 'João Silva',
          phoneNumber: '(55) 11 99999-9999',
          email: 'joao@empresa.com',
        },
      }),
    );
    await waitFor(() => expect(h.onContactSent).toHaveBeenCalledWith('João Silva'));
  });
});

describe('AdvancedMessageMenu — figurinha por URL', () => {
  function abrirFigurinha() {
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Figurinha' }));
  }

  it('URL que não é https mostra o erro e deixa o envio desabilitado', () => {
    renderMenu();
    abrirFigurinha();

    fireEvent.change(screen.getByLabelText('URL da figurinha (imagem/webp)'), { target: { value: 'figurinha.webp' } });

    expect(screen.getByText(/comece com https:\/\//i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar/ })).toBeDisabled();
  });

  it('URL https mostra a prévia, habilita o envio e envia a URL', () => {
    h.sendOutboundMessage.mockResolvedValue(undefined);
    renderMenu();
    abrirFigurinha();

    fireEvent.change(screen.getByLabelText('URL da figurinha (imagem/webp)'), {
      target: { value: 'https://exemplo.com/sticker.webp' },
    });

    expect(screen.getByAltText('Prévia da figurinha')).toHaveAttribute('src', 'https://exemplo.com/sticker.webp');
    const enviar = screen.getByRole('button', { name: /Enviar/ });
    expect(enviar).toBeEnabled();

    fireEvent.click(enviar);
    expect(h.sendOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'sticker', mediaUrl: 'https://exemplo.com/sticker.webp' }),
    );
  });
});

describe('AdvancedMessageMenu — acessibilidade', () => {
  it('menu e diálogos não têm violações de axe', async () => {
    h.role.isSupervisor = true;
    renderMenu();
    abrirMenu();

    let resultado = await axe(document.body, axeOpcoes);
    expect(resultado.violations.map((v) => v.id)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Enquete' }));
    resultado = await axe(document.body, axeOpcoes);
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});

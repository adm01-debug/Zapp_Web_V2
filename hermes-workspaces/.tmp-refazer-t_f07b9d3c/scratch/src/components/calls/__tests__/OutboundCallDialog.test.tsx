/**
 * t_1d36d214 (C02) — o "Ligar" do painel do contato e do cabeçalho do chat
 * volta a discar na hora, no cartão do contato, SEM navegar para a Telefonia.
 *
 * Este arquivo prova o ELO inteiro do caminho novo, com provider e CallDialog
 * REAIS (só o transporte SIP é dublê):
 *
 *   zapp:start-call {source:'inbox'}  →  provider registra `chamadaSaida`
 *     →  OutboundCallDialog abre o CallDialog  →  auto-dial por
 *     `dial(phone, { abrirDiscador: false })`  →  máquina em `dialing`,
 *     `makeCall` chamado, URL intacta.
 *
 * As falhas que o cartão exige:
 *  - microfone negado (`garantirMicrofone` → false): o cartão FECHA em vez de
 *    ficar eternamente em "Chamando..." (o motivo sai no toast da guarda do
 *    microfone — `useMicrophoneGuard`, coberto em `useSipClient.test.ts`);
 *  - "Encerrar" desliga pela máquina e limpa o pedido (o diálogo some);
 *  - sem pedido, nada é renderizado.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** O hook de SIP é o transporte — aqui ele é dublê, controlado pelo teste. */
const h = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/communication/useSipClient', () => ({
  useSipClient: () => h.value,
}));

// A auditoria fala com o Supabase: fora do caminho provado aqui.
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }));

const { CallSessionProvider } = await import('@/providers/CallSessionProvider');
const { OutboundCallDialog } = await import('../OutboundCallDialog');
const { dispatchStartCall } = await import('@/lib/calls/events');

function sipDuble(overrides: Record<string, unknown> = {}) {
  return {
    sipStatus: 'registered',
    callStatus: 'idle',
    callDuration: 0,
    isMuted: false,
    currentNumber: '',
    callDirection: null,
    currentCallId: null,
    connect: vi.fn(),
    connectWithStoredCredentials: vi.fn(),
    disconnect: vi.fn(),
    makeCall: vi.fn(async () => {}),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
    acceptIncomingCall: vi.fn(async () => {}),
    rejectIncomingCall: vi.fn(async () => {}),
    garantirMicrofone: vi.fn(async () => true),
    ...overrides,
  };
}

function RotaAtual() {
  const local = useLocation();
  return <span data-testid="rota">{local.pathname + local.search}</span>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <CallSessionProvider>
        <RotaAtual />
        <OutboundCallDialog />
      </CallSessionProvider>
    </MemoryRouter>,
  );
}

const PEDIDO_INBOX = {
  channel: 'voip' as const,
  phone: '5511987654321',
  contactId: 'contato-9',
  name: 'Fulano de Tal',
  avatar: 'https://img.test/f.png',
  source: 'inbox' as const,
};

/** O botão que contém o ícone lucide indicado. */
function botaoDoIcone(icone: string): HTMLButtonElement | null {
  return document.querySelector(`svg.lucide-${icone}`)?.closest('button') ?? null;
}

beforeEach(() => {
  h.value = sipDuble();
});

describe('OutboundCallDialog — "Ligar" do inbox abre o cartão e disca na hora', () => {
  it('sem CallSessionProvider, retorna null e não bloqueia os overlays irmãos do App', () => {
    const { container } = render(<OutboundCallDialog />);

    expect(container).toBeEmptyDOMElement();
  });

  it('sem pedido de saída, nada é renderizado', () => {
    montar();
    expect(screen.queryByText('Chamando...')).toBeNull();
  });

  it('o evento do inbox abre o cartão do contato e disca, sem mudar a URL', async () => {
    montar();
    act(() => { dispatchStartCall(PEDIDO_INBOX); });

    // O cartão do contato aparece em primeiro plano, já no estado "Chamando".
    expect(await screen.findByText('Fulano de Tal')).toBeInTheDocument();
    expect(await screen.findByText('Chamando...')).toBeInTheDocument();
    expect(screen.getByText('5511987654321')).toBeInTheDocument();

    // Discou pelo SIP com o telefone do pedido (o diálogo é quem disca).
    await waitFor(() =>
      expect(h.value.makeCall).toHaveBeenCalledWith('5511987654321', expect.any(String)),
    );

    // Não saiu do chat: nem react-router, nem pushState para `?view=voip`.
    expect(screen.getByTestId('rota').textContent).toBe('/');
    expect(window.location.search).not.toContain('view=voip');
  });

  it('microfone negado fecha o cartão (não fica eternamente em "Chamando...")', async () => {
    h.value = sipDuble({ garantirMicrofone: vi.fn(async () => false) });
    montar();

    act(() => { dispatchStartCall(PEDIDO_INBOX); });

    // O cartão abriu e tentou discar — a guarda do microfone foi consultada.
    await waitFor(() => expect(h.value.garantirMicrofone).toHaveBeenCalled());
    // Recusada, `dial` devolve `false` e o diálogo se fecha — nada fica preso
    // em "Chamando..." (o motivo sai no toast da própria guarda).
    await waitFor(() => expect(screen.queryByText('Fulano de Tal')).toBeNull());
    expect(h.value.makeCall).not.toHaveBeenCalled();
  });

  it('"Encerrar" desliga pela máquina e limpa o pedido (o cartão sai de cena)', async () => {
    montar();
    act(() => { dispatchStartCall(PEDIDO_INBOX); });
    expect(await screen.findByText('Fulano de Tal')).toBeInTheDocument();
    await waitFor(() => expect(h.value.makeCall).toHaveBeenCalled());

    const encerrar = botaoDoIcone('phone-off');
    expect(encerrar).not.toBeNull();
    fireEvent.click(encerrar as HTMLButtonElement);

    expect(h.value.hangUp).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Fulano de Tal')).toBeNull());
    // O pedido foi limpo: um novo evento abriria um cartão novo (prova a seguir).
    act(() => { dispatchStartCall({ ...PEDIDO_INBOX, name: 'Beltrano' }); });
    expect(await screen.findByText('Beltrano')).toBeInTheDocument();
  });
});

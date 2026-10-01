import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T21 — o `CallDialog` parou de inserir na tabela `calls` e passou a CONSUMIR
 * o provider (`useCallSession`).
 *
 * O aceite literal do plano é: **ao abrir o diálogo de chamada → ZERO inserts
 * em `calls`**. Como a UI saiu do negócio de persistir (quem grava é o motor,
 * pela RPC `upsert_my_call`), este arquivo prova as duas metades:
 *
 * 1. nenhum caminho de escrita em `calls` é tocado — nem os 4 métodos legados
 *    do hook `useCalls` (`startCall`/`answerCall`/`endCall`/`missCall`), nem
 *    `supabase.from('calls').insert`. Os dois são espionados;
 * 2. a ligação passou a sair pelo `dial()` do provider, com o telefone do
 *    contato — e só uma vez por abertura.
 *
 * As armadilhas que os dentes cobrem (o motivo de cada teste existir):
 * - o `dial` do provider troca de identidade a cada render (depende do estado
 *   do SIP), então o efeito re-executa o tempo todo: sem a trava de uma
 *   discagem por abertura, o telefone seria discado em laço;
 * - o botão Mudo era estado local (não silenciava nada): agora tem de chamar
 *   `toggleMute()` do motor;
 * - o botão Alto-falante só existiria com `setSinkId` disponível — que não
 *   existe em `src/`: o botão sai e o teste impede que volte "cosmético".
 */

const {
  mockStartCall,
  mockAnswerCall,
  mockEndCall,
  mockMissCall,
  mockFrom,
  mockInsert,
  mockRpc,
  mockUseCallSession,
  mockDial,
  mockAccept,
  mockHangup,
  mockToggleMute,
} = vi.hoisted(() => ({
  mockStartCall: vi.fn(),
  mockAnswerCall: vi.fn(),
  mockEndCall: vi.fn(),
  mockMissCall: vi.fn(),
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockRpc: vi.fn(),
  mockUseCallSession: vi.fn(),
  mockDial: vi.fn(),
  mockAccept: vi.fn(),
  mockHangup: vi.fn(),
  mockToggleMute: vi.fn(),
}));

/** Encadeamento do PostgREST: `from(...).insert(...).select().single()`. */
const builder = {
  insert: mockInsert,
  update: vi.fn(),
  select: vi.fn(() => builder),
  single: vi.fn(() => builder),
  eq: vi.fn(() => builder),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// O hook legado cujos 4 métodos escrevem direto em `calls`. O teste afirma que
// nenhum deles é chamado — e, se o diálogo voltar a chamá-los, as spies abaixo
// registram e a asserção fica vermelha.
vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({
    startCall: mockStartCall,
    answerCall: mockAnswerCall,
    endCall: mockEndCall,
    missCall: mockMissCall,
  }),
}));

// O provider — a fonte única da sessão.
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => mockUseCallSession(),
}));

// UI: stubs cruéis o bastante para não esconder nada do que é afirmado.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

import { CallDialog } from '../CallDialog';

const CONTATO = { id: 'contato-1', name: 'Fulano de Tal', phone: '5511999999999' };

/**
 * Valor do provider. `status` é o estado da máquina (`session.status`) e o
 * resto são os campos do `useSipClient` que a UI consome.
 */
function providerValue({
  status = 'idle',
  sessionId = 'sessao-1',
  ...rest
}: {
  status?: string;
  sessionId?: string | null;
  callDuration?: number;
  isMuted?: boolean;
} = {}) {
  return {
    session: { status, sessionId },
    dial: mockDial,
    accept: mockAccept,
    hangup: mockHangup,
    callDuration: 0,
    isMuted: false,
    toggleMute: mockToggleMute,
    ...rest,
  };
}

function montar(overrides: Partial<ComponentProps<typeof CallDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    contact: CONTATO,
    direction: 'outbound' as const,
    onEnd: vi.fn(),
    ...overrides,
  };
  const utils = render(<CallDialog {...props} />);
  return { ...props, ...utils };
}

/** O botão que contém o ícone lucide indicado. */
function botaoDoIcone(container: HTMLElement, icone: string): HTMLButtonElement | null {
  return container.querySelector(`svg.lucide-${icone}`)?.closest('button') ?? null;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockFrom.mockReturnValue(builder);
  mockInsert.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.single.mockReturnValue(builder);
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockAccept.mockResolvedValue(undefined);
  mockUseCallSession.mockReturnValue(providerValue({ status: 'dialing' }));
});

describe('CallDialog — aceite T21: abrir o diálogo NÃO insere em `calls`', () => {
  it('disca pelo provider e não toca em nenhum caminho de escrita da tabela `calls`', () => {
    montar();

    // 1) A ligação saiu pelo provider, com o telefone do contato.
    expect(mockDial).toHaveBeenCalledTimes(1);
    expect(mockDial).toHaveBeenCalledWith(CONTATO.phone);

    // 2) Nenhum dos 4 métodos legados (os que escrevem em `calls`) foi chamado.
    expect(mockStartCall).not.toHaveBeenCalled();
    expect(mockAnswerCall).not.toHaveBeenCalled();
    expect(mockEndCall).not.toHaveBeenCalled();
    expect(mockMissCall).not.toHaveBeenCalled();

    // 3) Nenhuma chamada ao Supabase — muito menos `.insert` em `calls`.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('não disca de novo quando a chamada já existe (`existingCallId`) — e continua sem insert', () => {
    montar({ existingCallId: 'chamada-ja-criada', initialStatus: 'answered' });

    expect(mockDial).not.toHaveBeenCalled();
    expect(mockStartCall).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    // Já atendida: não se pede "Atender" uma segunda vez.
    expect(botaoDoIcone(document.body, 'phone')).toBeNull();
  });

  it('disca UMA única vez por abertura, mesmo com `dial` trocando de identidade a cada render', () => {
    // Cada render entrega um `dial` novo (é o que o provider real faz: o
    // `useCallback` depende do estado do SIP). Sem a trava, o efeito discaria
    // em cada render.
    mockUseCallSession.mockImplementation(() => ({
      ...providerValue({ status: 'dialing' }),
      dial: (phone: string) => mockDial(phone),
    }));

    const { rerender } = render(
      <CallDialog open contact={CONTATO} direction="outbound" onOpenChange={vi.fn()} onEnd={vi.fn()} />,
    );
    expect(mockDial).toHaveBeenCalledTimes(1);

    rerender(
      <CallDialog open contact={CONTATO} direction="outbound" onOpenChange={vi.fn()} onEnd={vi.fn()} />,
    );
    expect(mockDial).toHaveBeenCalledTimes(1);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('não disca uma SAÍDA quando a chamada está CHEGANDO (inbound sem `existingCallId`)', () => {
    montar({ direction: 'inbound' });
    expect(mockDial).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('a fonte não volta a falar com `useCalls`/`startCall` nem a escrever na tabela', () => {
    // Cinto e suspensório: se alguém reintroduzir o caminho antigo no diálogo,
    // a asserção de comportamento acima pode ser driblada por um mock; a fonte
    // não.
    const fonte = readFileSync(
      join(process.cwd(), 'src/components/calls/CallDialog.tsx'),
      'utf8',
    );
    expect(fonte).not.toMatch(/useCalls\b/);
    expect(fonte).not.toMatch(/startCall/);
    expect(fonte).not.toMatch(/\.(?:insert|upsert)\s*\(/);
    expect(fonte).toMatch(/useCallSession/);
  });
});

describe('CallDialog — estado visual vem do provider', () => {
  it('o cronômetro vem de `callDuration`, não de um timer local', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active', callDuration: 65 }));
    montar();

    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getAllByText('Chamada em andamento').length).toBeGreaterThan(0);
  });

  it('mapeia `session.status` para as variantes visuais da UI', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'dialing' }));
    const { unmount } = montar();
    expect(screen.getByText('Chamando...')).toBeInTheDocument();
    unmount();

    mockUseCallSession.mockReturnValue(providerValue({ status: 'connecting' }));
    montar();
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('`initialStatus="answered"` mantém a chamada atendida que veio do alerta (não regride para "atender")', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'ringing_in', sessionId: 's1' }));
    montar({ direction: 'inbound', existingCallId: 's1', initialStatus: 'answered' });

    // Controles de chamada ATENDIDA (Mudo) e nenhum botão de Atender.
    expect(botaoDoIcone(document.body, 'mic')).not.toBeNull();
    expect(botaoDoIcone(document.body, 'phone')).toBeNull();
  });
});

describe('CallDialog — comandos vão para a máquina de sessão', () => {
  it('o botão Mudo chama `toggleMute()` do provider (não é mais estado local) e reflete `isMuted`', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    const { container } = montar();

    const botaoMudo = botaoDoIcone(container, 'mic');
    expect(botaoMudo).not.toBeNull();
    fireEvent.click(botaoMudo as HTMLButtonElement);
    expect(mockToggleMute).toHaveBeenCalledTimes(1);
    // O estado local de antes nunca mudava o motor.
    expect(mockStartCall).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('não existe botão de Alto-falante (sem `setSinkId` em src/ o botão era só um ícone)', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    const { container } = montar();

    expect(container.querySelector('svg.lucide-volume-2')).toBeNull();
    expect(container.querySelector('svg.lucide-volume-x')).toBeNull();
    // Os únicos controles da chamada atendida são Mudo e Encerrar.
    expect(container.querySelectorAll('button')).toHaveLength(2);
  });

  it('"Atender" chama `accept()` do provider', async () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'ringing_in' }));
    const { container, onAnswer } = montar({ direction: 'inbound', onAnswer: vi.fn() });

    const botaoAtender = botaoDoIcone(container, 'phone');
    expect(botaoAtender).not.toBeNull();
    fireEvent.click(botaoAtender as HTMLButtonElement);

    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('"Encerrar" chama `hangup()` do provider, sem insert, e fecha o diálogo', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    const { container, onEnd, onOpenChange } = montar();

    const botaoEncerrar = botaoDoIcone(container, 'phone-off');
    expect(botaoEncerrar).not.toBeNull();
    fireEvent.click(botaoEncerrar as HTMLButtonElement);

    expect(mockHangup).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockEndCall).not.toHaveBeenCalled();
    expect(mockMissCall).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

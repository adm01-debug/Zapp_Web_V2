import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
 * - o botão Alto-falante só existe onde o navegador tem `setSinkId` (SL-246): sem
 *   a função não há troca de saída, e o botão cosmético não volta.
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
import { REMOTE_AUDIO_ID } from '@/lib/calls/adapters/SipCallAdapter';

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

    // 1) A ligação saiu pelo provider, com o telefone do contato — e SEM
    //    navegar para a Telefonia (C02: `abrirDiscador:false`, o cartão do
    //    contato disca ali mesmo).
    expect(mockDial).toHaveBeenCalledTimes(1);
    expect(mockDial).toHaveBeenCalledWith(CONTATO.phone, { abrirDiscador: false });

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

  it('microfone negado (`dial` → false) fecha o diálogo em vez de ficar "Chamando..." eterno (C02)', async () => {
    // A guarda do microfone (`garantirMicrofone`) recusou: o provider devolve
    // `false` para o diálogo fechar. O motivo vai ao toast pela própria guarda
    // (`useMicrophoneGuard`) — prova em `useSipClient.test.ts`.
    mockDial.mockResolvedValue(false);
    const { onEnd, onOpenChange } = montar();

    await waitFor(() => {
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    // Não desligou chamada nenhuma: a recusa foi ANTES do DIAL existir.
    expect(mockHangup).not.toHaveBeenCalled();
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

  it('sem `setSinkId` no navegador não existe controle de saída (nada de botão cosmético)', () => {
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    const { container } = montar();

    expect(container.querySelector('svg.lucide-volume-2')).toBeNull();
    expect(container.querySelector('svg.lucide-volume-x')).toBeNull();
    expect(screen.queryByTestId('call-output-device-trigger')).toBeNull();
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

/**
 * SL-246 — seleção de dispositivo de saída (`setSinkId`) / alto-falante.
 *
 * A evidência do cartão (`CallDialog.tsx:240`) dizia que a troca de saída não
 * existia em lugar nenhum de `src/`. Estes testes provam o que passou a valer:
 * o controle só existe onde o NAVEGADOR tem `setSinkId`, a lista vem de
 * `enumerateDevices()` (só `audiooutput`) e a escolha vai para o elemento de
 * áudio remoto do SIP (`REMOTE_AUDIO_ID`) — quem realmente toca o áudio.
 */
const SAIDAS_DE_AUDIO = [
  { deviceId: 'alto-falante-1', kind: 'audiooutput', label: 'Alto-falante (Realtek)' },
  { deviceId: 'headset-2', kind: 'audiooutput', label: 'Headset USB' },
];

describe('CallDialog — SL-246: saída de áudio (setSinkId)', () => {
  const enumerateDevices = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices },
    });
  });

  afterEach(() => {
    // O `setSinkId` do jsdom não existe nativamente: o que cada teste instala
    // sai daqui, para o próximo arquivo/teste ver o navegador sem suporte.
    delete (HTMLMediaElement.prototype as Partial<HTMLMediaElement>).setSinkId;
    delete (window.navigator as { mediaDevices?: unknown }).mediaDevices;
    document.querySelectorAll('audio').forEach((audio) => audio.remove());
  });

  /**
   * Navegador COM suporte (Chrome/Edge) + o elemento de áudio remoto que o
   * adapter SIP põe na página, com espião próprio no `setSinkId`.
   */
  function comTrocaDeSaida() {
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    const audio = document.createElement('audio');
    audio.id = REMOTE_AUDIO_ID;
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(audio, 'setSinkId', { configurable: true, value: setSinkId });
    document.body.appendChild(audio);
    return setSinkId;
  }

  async function abrirSeletor() {
    fireEvent.click(screen.getByTestId('call-output-device-trigger'));
    return screen.findByTestId('call-output-device-panel');
  }

  it('com `setSinkId` o botão existe e a lista traz só saídas de áudio', async () => {
    comTrocaDeSaida();
    enumerateDevices.mockResolvedValue([
      ...SAIDAS_DE_AUDIO,
      { deviceId: 'webcam-1', kind: 'videoinput', label: 'Webcam' },
    ]);
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    const { container } = montar();

    expect(container.querySelector('svg.lucide-volume-2')).not.toBeNull();
    const botao = screen.getByTestId('call-output-device-trigger');
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    // Antes do clique a lista NÃO existe: nada de teste que já nasce aberto.
    expect(screen.queryByTestId('call-output-device-panel')).toBeNull();

    await abrirSeletor();

    expect(await screen.findByText('Alto-falante (Realtek)')).toBeInTheDocument();
    expect(screen.getByText('Headset USB')).toBeInTheDocument();
    // O microfone/câmera não entram na lista de saída.
    expect(screen.queryByText('Webcam')).toBeNull();
    expect(botao).toHaveAttribute('aria-expanded', 'true');
  });

  it('enquanto o navegador lista as saídas, a tela diz que está carregando', async () => {
    comTrocaDeSaida();
    let liberar: ((valor: unknown) => void) | undefined;
    enumerateDevices.mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      }),
    );
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    montar();

    fireEvent.click(screen.getByTestId('call-output-device-trigger'));

    expect(await screen.findByText('Carregando saídas de áudio…')).toBeInTheDocument();

    liberar?.(SAIDAS_DE_AUDIO);

    expect(await screen.findByText('Headset USB')).toBeInTheDocument();
    expect(screen.queryByText('Carregando saídas de áudio…')).toBeNull();
  });

  it('sem nenhuma saída de áudio o painel avisa o vazio — e vazio não é erro', async () => {
    comTrocaDeSaida();
    enumerateDevices.mockResolvedValue([]);
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    montar();

    await abrirSeletor();

    expect(await screen.findByText('Nenhuma saída de áudio encontrada.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('escolher a saída troca o sink do áudio remoto e só marca depois de confirmar', async () => {
    const setSinkId = comTrocaDeSaida();
    enumerateDevices.mockResolvedValue(SAIDAS_DE_AUDIO);
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    montar();
    await abrirSeletor();

    fireEvent.click(screen.getByRole('option', { name: 'Headset USB' }));

    await waitFor(() => expect(setSinkId).toHaveBeenCalledWith('headset-2'));
    // A lista fecha DEPOIS da confirmação do navegador, e sem erro na tela.
    await waitFor(() => expect(screen.queryByTestId('call-output-device-panel')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();

    // Reabrir mostra a saída escolhida como a atual (o estado veio do resultado).
    await abrirSeletor();
    expect(screen.getByRole('option', { name: 'Headset USB' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Alto-falante (Realtek)' })).toHaveAttribute('aria-selected', 'false');
  });

  it('quando o navegador recusa a troca, o motivo aparece e a saída NÃO muda', async () => {
    const setSinkId = comTrocaDeSaida();
    setSinkId.mockRejectedValue(new Error('NotFoundError'));
    enumerateDevices.mockResolvedValue(SAIDAS_DE_AUDIO);
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    montar();
    await abrirSeletor();

    fireEvent.click(screen.getByRole('option', { name: 'Headset USB' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível trocar a saída de áudio.');
    // A lista fica aberta, onde o usuário está olhando, e nada ficou marcado.
    expect(screen.getByTestId('call-output-device-panel')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Headset USB' })).toHaveAttribute('aria-selected', 'false');
  });

  it('encerrar a chamada fecha o seletor (a próxima abertura não traz a lista antiga)', async () => {
    const setSinkId = comTrocaDeSaida();
    enumerateDevices.mockResolvedValue(SAIDAS_DE_AUDIO);
    mockUseCallSession.mockReturnValue(providerValue({ status: 'active' }));
    const { container } = montar();
    await abrirSeletor();
    expect(screen.getByTestId('call-output-device-panel')).toBeInTheDocument();

    fireEvent.click(botaoDoIcone(container, 'phone-off') as HTMLButtonElement);

    expect(mockHangup).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('call-output-device-panel')).toBeNull();
    // Encerrar não troca a saída de áudio de quem ficou na página.
    expect(setSinkId).not.toHaveBeenCalled();
  });
});

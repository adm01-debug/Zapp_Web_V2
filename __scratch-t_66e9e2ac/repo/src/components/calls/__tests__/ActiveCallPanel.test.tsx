import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActiveCallPanel } from '../ActiveCallPanel';

const acceptIncomingCall = vi.fn();
const rejectIncomingCall = vi.fn();
const hangUp = vi.fn();
// API da MÁQUINA (SL-109): `accept`/`reject`/`hangup` despacham o evento antes
// de falar com o SIP; os métodos acima (crus do `useSipClient`) só falam com o
// SIP e deixam a máquina divergente do motor.
const accept = vi.fn();
const reject = vi.fn();
const hangup = vi.fn();
const toggleMute = vi.fn();
const sendDTMF = vi.fn();

type Sessao = {
  status: string;
  channel: 'voip' | 'whatsapp';
  phone: string | null;
  name: string | null;
};
let sessao: Sessao;
let isMuted = false;
let canReject = true;

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    session: sessao,
    currentNumber: sessao.phone ?? '',
    isMuted,
    acceptIncomingCall,
    rejectIncomingCall,
    hangUp,
    accept,
    reject,
    hangup,
    toggleMute,
    sendDTMF,
  }),
}));
vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({ voip: { canDial: true, reason: null, canReject }, whatsapp: { canDial: true, reason: null } }),
}));

describe('ActiveCallPanel (T62/T63)', () => {
  beforeEach(() => {
    for (const f of [acceptIncomingCall, rejectIncomingCall, hangUp, accept, reject, hangup, toggleMute, sendDTMF]) f.mockReset();
    sessao = { status: 'dialing', channel: 'voip', phone: '+5511999998888', name: 'Ana Paula' };
    isMuted = false;
    canReject = true;
  });

  // Os 5 estados nao-idle de antes do encerramento (T62: "5 estados renderizam").
  it.each([
    ['dialing', 'Chamando'],
    ['ringing_out', 'Tocando'],
    ['ringing_in', 'Chamada recebida'],
    ['connecting', 'Conectando'],
    ['active', 'Em ligação'],
  ])('renderiza o estado %s com o rotulo do dominio', (status, rotulo) => {
    sessao = { ...sessao, status };
    render(<ActiveCallPanel segundos={0} />);
    expect(screen.getByTestId('tel-active-status').textContent).toContain(rotulo);
  });

  it('mostra contato, numero e o badge do canal', () => {
    sessao = { status: 'active', channel: 'whatsapp', phone: '+5511988887777', name: 'João Silva' };
    render(<ActiveCallPanel segundos={0} />);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByTestId('tel-active-number').textContent).toContain('+5511988887777');
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByTestId('tel-active-origin').textContent).toContain('WhatsApp');
  });

  it('o relogio so corre na ligacao atendida', () => {
    sessao = { ...sessao, status: 'dialing' };
    const { rerender } = render(<ActiveCallPanel segundos={156} />);
    expect(screen.getByTestId('tel-active-status').textContent).not.toContain('02:36');
    sessao = { ...sessao, status: 'active' };
    rerender(<ActiveCallPanel segundos={156} />);
    expect(screen.getByTestId('tel-active-status').textContent).toContain('02:36');
  });

  it('em chamada recebida oferece Atender e Recusar, e nao mute', () => {
    sessao = { ...sessao, status: 'ringing_in' };
    render(<ActiveCallPanel segundos={0} />);
    expect(screen.getByTestId('tel-accept')).toBeInTheDocument();
    expect(screen.getByTestId('tel-reject')).toBeInTheDocument();
    expect(screen.queryByTestId('tel-mute')).toBeNull();
  });

  it('recusar respeita canReject', () => {
    sessao = { ...sessao, status: 'ringing_in' };
    canReject = false;
    render(<ActiveCallPanel segundos={0} />);
    expect((screen.getByTestId('tel-reject') as HTMLButtonElement).disabled).toBe(true);
  });

  it('SL-109: atender, recusar e encerrar passam pela MÁQUINA, não pelos métodos crus do useSipClient', () => {
    // Os métodos crus (`acceptIncomingCall`/`rejectIncomingCall`/`hangUp`) falam
    // só com o SIP: sem o dispatch da máquina, aceitar por aqui deixava a sessão
    // presa em `ringing_in` (o `ESTABLISHED` que o motor publica em seguida é
    // transição inválida) e encerrar gravava `hangup_remote` no lugar de
    // `hangup_local`. O caminho certo é a API da máquina do provider.
    sessao = { ...sessao, status: 'ringing_in' };
    const { unmount } = render(<ActiveCallPanel segundos={0} />);
    fireEvent.click(screen.getByTestId('tel-accept'));
    fireEvent.click(screen.getByTestId('tel-reject'));
    expect(accept).toHaveBeenCalled();
    expect(reject).toHaveBeenCalled();
    expect(acceptIncomingCall).not.toHaveBeenCalled();
    expect(rejectIncomingCall).not.toHaveBeenCalled();
    unmount();

    sessao = { ...sessao, status: 'active' };
    render(<ActiveCallPanel segundos={0} />);
    fireEvent.click(screen.getByTestId('tel-hangup'));
    expect(hangup).toHaveBeenCalled();
    expect(hangUp).not.toHaveBeenCalled();
  });

  it('mute expoe aria-pressed refletindo o estado', () => {
    sessao = { ...sessao, status: 'active' };
    isMuted = true;
    render(<ActiveCallPanel segundos={0} />);
    const botao = screen.getByTestId('tel-mute');
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(botao.getAttribute('aria-label')).toBe('Ativar microfone');
    fireEvent.click(botao);
    expect(toggleMute).toHaveBeenCalled();
  });

  it('o teclado DTMF so aparece na ligacao atendida e manda tom', () => {
    sessao = { ...sessao, status: 'active' };
    render(<ActiveCallPanel segundos={0} />);
    expect(document.querySelector('[data-keypad-scope]')).toBeNull();
    fireEvent.click(screen.getByTestId('tel-dtmf-toggle'));
    const teclado = document.querySelector('[data-keypad-scope]');
    expect(teclado?.getAttribute('data-keypad-mode')).toBe('dtmf');
    fireEvent.click(screen.getByLabelText('5'));
    expect(sendDTMF).toHaveBeenCalledWith('5');
  });

  it('fora da ligacao o mute e o teclado ficam desabilitados', () => {
    sessao = { ...sessao, status: 'dialing' };
    render(<ActiveCallPanel segundos={0} />);
    expect((screen.getByTestId('tel-mute') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tel-dtmf-toggle') as HTMLButtonElement).disabled).toBe(true);
  });
});

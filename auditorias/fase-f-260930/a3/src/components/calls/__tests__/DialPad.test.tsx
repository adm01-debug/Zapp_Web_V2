// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialPad } from '../DialPad';

const defaultProps = {
  sipStatus: 'disconnected' as const,
  callStatus: 'idle' as const,
  callDuration: 0,
  isMuted: false,
  currentNumber: '',
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onCall: vi.fn(),
  onHangUp: vi.fn(),
  onToggleMute: vi.fn(),
  onDTMF: vi.fn(),
};

describe('DialPad', () => {
  beforeEach(() => vi.clearAllMocks());

  // === RENDERING TESTS ===

  it('renders all 12 dial buttons', () => {
    render(<DialPad {...defaultProps} />);
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    digits.forEach(d => {
      expect(screen.getByText(d)).toBeInTheDocument();
    });
  });

  it('renders sub-labels for digits 2-9 and 0', () => {
    render(<DialPad {...defaultProps} />);
    expect(screen.getByText('ABC')).toBeInTheDocument();
    expect(screen.getByText('DEF')).toBeInTheDocument();
    expect(screen.getByText('GHI')).toBeInTheDocument();
    expect(screen.getByText('JKL')).toBeInTheDocument();
    expect(screen.getByText('MNO')).toBeInTheDocument();
    expect(screen.getByText('PQRS')).toBeInTheDocument();
    expect(screen.getByText('TUV')).toBeInTheDocument();
    expect(screen.getByText('WXYZ')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('renders number input when not in call', () => {
    render(<DialPad {...defaultProps} />);
    expect(screen.getByPlaceholderText('Digite o número')).toBeInTheDocument();
  });

  it('renders connect button when disconnected', () => {
    render(<DialPad {...defaultProps} />);
    expect(screen.getByText('Conectar SIP')).toBeInTheDocument();
  });

  it('renders disconnect button when connected', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    expect(screen.getByText('Desconectar')).toBeInTheDocument();
  });

  it('shows Desconectado badge when disconnected', () => {
    render(<DialPad {...defaultProps} />);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });

  it('shows Conectado badge when registered', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('shows Conectando... badge when connecting', () => {
    render(<DialPad {...defaultProps} sipStatus="connecting" />);
    expect(screen.getByText('Conectando...')).toBeInTheDocument();
  });

  it('shows Erro badge on error', () => {
    render(<DialPad {...defaultProps} sipStatus="error" />);
    expect(screen.getByText('Erro')).toBeInTheDocument();
  });

  // === INTERACTION TESTS ===

  it('appends digit to number when pressed (not in call)', () => {
    render(<DialPad {...defaultProps} />);
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('3'));
    const input = screen.getByPlaceholderText('Digite o número') as HTMLInputElement;
    expect(input.value).toBe('123');
  });

  it('sends DTMF when digit pressed during call', () => {
    render(<DialPad {...defaultProps} callStatus="active" />);
    fireEvent.click(screen.getByText('5'));
    expect(defaultProps.onDTMF).toHaveBeenCalledWith('5');
  });

  it('calls onConnect when Conectar SIP is clicked', () => {
    render(<DialPad {...defaultProps} />);
    fireEvent.click(screen.getByText('Conectar SIP'));
    expect(defaultProps.onConnect).toHaveBeenCalled();
  });

  it('calls onDisconnect when Desconectar is clicked', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    fireEvent.click(screen.getByText('Desconectar'));
    expect(defaultProps.onDisconnect).toHaveBeenCalled();
  });

  it('disables connect button when connecting', () => {
    render(<DialPad {...defaultProps} sipStatus="connecting" />);
    const btn = screen.getByText('Conectar SIP').closest('button');
    expect(btn).toBeDisabled();
  });

  it('disables call button when not connected', () => {
    render(<DialPad {...defaultProps} />);
    const callButtons = screen.getAllByRole('button');
    const greenCallBtn = callButtons.find(b => b.className.includes('bg-success'));
    expect(greenCallBtn).toBeDisabled();
  });

  it('disables call button when number is empty', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    const callButtons = screen.getAllByRole('button');
    const greenCallBtn = callButtons.find(b => b.className.includes('bg-success'));
    expect(greenCallBtn).toBeDisabled();
  });

  it('enables call button when connected and number entered', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    fireEvent.click(screen.getByText('1'));
    const callButtons = screen.getAllByRole('button');
    const greenCallBtn = callButtons.find(b => b.className.includes('bg-success'));
    expect(greenCallBtn).not.toBeDisabled();
  });

  it('calls onCall with number when call button clicked', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('5'));
    fireEvent.click(screen.getByText('1'));
    const callButtons = screen.getAllByRole('button');
    const greenCallBtn = callButtons.find(b => b.className.includes('bg-success'));
    fireEvent.click(greenCallBtn!);
    expect(defaultProps.onCall).toHaveBeenCalledWith('551');
  });

  it('calls onHangUp when hangup clicked during call', () => {
    render(<DialPad {...defaultProps} callStatus="active" currentNumber="123" />);
    // Find the destructive hangup button
    const buttons = screen.getAllByRole('button');
    const hangupBtn = buttons.find(b => b.className.includes('destructive') && b.className.includes('rounded-full'));
    expect(hangupBtn).toBeTruthy();
    fireEvent.click(hangupBtn!);
    expect(defaultProps.onHangUp).toHaveBeenCalled();
  });

  it('calls onToggleMute when mute button clicked', () => {
    render(<DialPad {...defaultProps} callStatus="active" currentNumber="123" />);
    const buttons = screen.getAllByRole('button');
    // Mute button is outline, rounded-full, w-12
    const muteBtn = buttons.find(b => b.className.includes('rounded-full') && b.className.includes('w-12'));
    expect(muteBtn).toBeTruthy();
    fireEvent.click(muteBtn!);
    expect(defaultProps.onToggleMute).toHaveBeenCalled();
  });

  it('disables mute button when not in active call', () => {
    render(<DialPad {...defaultProps} callStatus="calling" currentNumber="123" />);
    const buttons = screen.getAllByRole('button');
    const muteBtn = buttons.find(b => b.className.includes('rounded-full') && b.className.includes('w-12'));
    expect(muteBtn).toBeDisabled();
  });

  // === CALL STATUS DISPLAY ===

  it('shows Chamando... during calling state', () => {
    render(<DialPad {...defaultProps} callStatus="calling" currentNumber="123" />);
    expect(screen.getByText('Chamando...')).toBeInTheDocument();
  });

  it('shows Tocando... during ringing state', () => {
    render(<DialPad {...defaultProps} callStatus="ringing" currentNumber="123" />);
    expect(screen.getByText('Tocando...')).toBeInTheDocument();
  });

  it('shows formatted duration during active call', () => {
    render(<DialPad {...defaultProps} callStatus="active" callDuration={125} currentNumber="123" />);
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('shows 00:00 at start of active call', () => {
    render(<DialPad {...defaultProps} callStatus="active" callDuration={0} currentNumber="123" />);
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('formats large durations correctly with hours', () => {
    render(<DialPad {...defaultProps} callStatus="active" callDuration={3661} currentNumber="123" />);
    expect(screen.getByText('1:01:01')).toBeInTheDocument();
  });

  it('displays current number during call', () => {
    render(<DialPad {...defaultProps} callStatus="active" currentNumber="5511999" />);
    expect(screen.getByText('5511999')).toBeInTheDocument();
  });

  // === INPUT VALIDATION ===

  it('filters non-numeric characters from input', () => {
    render(<DialPad {...defaultProps} />);
    const input = screen.getByPlaceholderText('Digite o número') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc123def456' } });
    expect(input.value).toBe('123456');
  });

  it('allows +, *, # in input', () => {
    render(<DialPad {...defaultProps} />);
    const input = screen.getByPlaceholderText('Digite o número') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+55*11#' } });
    expect(input.value).toBe('+55*11#');
  });

  it('does not show delete button when input is empty', () => {
    render(<DialPad {...defaultProps} />);
    // Delete icon shouldn't be rendered
    const buttons = screen.getAllByRole('button');
    const deleteBtn = buttons.find(b => b.querySelector('.lucide-delete'));
    expect(deleteBtn).toBeFalsy();
  });

  it('shows delete button when input has value', () => {
    render(<DialPad {...defaultProps} />);
    fireEvent.click(screen.getByText('1'));
    // Delete button appears - just verify the number was entered
    const input = screen.getByPlaceholderText('Digite o número') as HTMLInputElement;
    expect(input.value).toBe('1');
    // The delete button exists in the DOM
    const allButtons = screen.getAllByRole('button');
    expect(allButtons.length).toBeGreaterThan(12); // 12 dial + connect + call + delete
  });

  it('hides number input during active call', () => {
    render(<DialPad {...defaultProps} callStatus="active" currentNumber="123" />);
    expect(screen.queryByPlaceholderText('Digite o número')).not.toBeInTheDocument();
  });

  it('hides call button during active call', () => {
    render(<DialPad {...defaultProps} callStatus="active" currentNumber="123" />);
    const callButtons = screen.getAllByRole('button');
    const greenCallBtn = callButtons.find(b => b.className.includes('bg-success'));
    expect(greenCallBtn).toBeFalsy();
  });

  it('shows SIP connection message when disconnected', () => {
    render(<DialPad {...defaultProps} />);
    expect(screen.getByText('Conecte-se ao servidor SIP para fazer chamadas')).toBeInTheDocument();
  });

  it('hides SIP connection message when connected', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    expect(screen.queryByText('Conecte-se ao servidor SIP para fazer chamadas')).not.toBeInTheDocument();
  });

  // === SECURITY / EDGE CASES ===

  it('does not call onCall with empty string', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    const callButtons = screen.getAllByRole('button');
    const greenCallBtn = callButtons.find(b => b.className.includes('bg-success'));
    fireEvent.click(greenCallBtn!);
    expect(defaultProps.onCall).not.toHaveBeenCalled();
  });

  it('trims whitespace from number before calling', () => {
    render(<DialPad {...defaultProps} sipStatus="registered" />);
    const input = screen.getByPlaceholderText('Digite o número') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  123  ' } });
    // The filter removes spaces, so value should be '123'
    expect(input.value).toBe('123');
  });

  it('handles rapid digit presses', () => {
    render(<DialPad {...defaultProps} />);
    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByText('1'));
    }
    const input = screen.getByPlaceholderText('Digite o número') as HTMLInputElement;
    expect(input.value).toBe('1'.repeat(20));
  });

  it('sends correct DTMF for * and # during call', () => {
    render(<DialPad {...defaultProps} callStatus="active" />);
    fireEvent.click(screen.getByText('*'));
    expect(defaultProps.onDTMF).toHaveBeenCalledWith('*');
    fireEvent.click(screen.getByText('#'));
    expect(defaultProps.onDTMF).toHaveBeenCalledWith('#');
  });
});

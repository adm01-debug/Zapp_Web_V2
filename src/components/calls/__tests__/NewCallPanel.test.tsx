import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NewCallPanel } from '../NewCallPanel';

type Cap = { canDial: boolean; reason: string | null };
const renderPainel = () => render(<TooltipProvider><NewCallPanel /></TooltipProvider>);

const dispatchStartCall = vi.fn();
const hangup = vi.fn();
const buscarContatos = vi.fn();
const contatoJoao = { id: 'c1', name: 'João Silva', phone: '11999998888' };
let sessao = { status: 'idle' };
let pendente: string | null = null;
let sipStatus = 'registered';
let voip: Cap = { canDial: true, reason: null };
let whatsapp: Cap = { canDial: true, reason: null };

vi.mock('@/lib/calls/events', () => ({
  dispatchStartCall: (...a: unknown[]) => dispatchStartCall(...a),
}));
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    numeroPendente: pendente,
    hangup,
    session: sessao,
    sipStatus,
    sipReason: null,
  }),
}));
vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({ voip, whatsapp, linhaWhatsApp: null }),
}));
vi.mock('@/services/contact.service', () => ({
  ContactService: { searchContacts: (...a: unknown[]) => buscarContatos(...a) },
}));

describe('NewCallPanel (T56/T59/T60)', () => {
  beforeEach(() => {
    dispatchStartCall.mockReset();
    hangup.mockReset();
    buscarContatos.mockReset().mockResolvedValue({ data: [contatoJoao] });
    sessao = { status: 'idle' };
    pendente = null;
    sipStatus = 'registered';
    voip = { canDial: true, reason: null };
    whatsapp = { canDial: true, reason: null };
    window.localStorage.clear();
  });

  it('tem o segmentado VoIP/WhatsApp como radiogroup, independente das abas do historico', () => {
    renderPainel();
    const grupo = screen.getByRole('radiogroup', { name: 'Canal da ligação' });
    expect(grupo).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'VoIP' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'WhatsApp' }).getAttribute('aria-checked')).toBe('false');
  });

  it('lembra o canal escolhido no localStorage', () => {
    renderPainel();
    fireEvent.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    expect(window.localStorage.getItem('tel:new-call-channel')).toBe('whatsapp');
    expect(screen.getByRole('radio', { name: 'WhatsApp' }).getAttribute('aria-checked')).toBe('true');
  });

  it('desabilita a opcao sem capacidade de discar', () => {
    whatsapp = { canDial: false, reason: 'whatsapp_no_outbound' };
    renderPainel();
    expect((screen.getByRole('radio', { name: 'WhatsApp' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mostra numero incompleto e bloqueia o CTA', () => {
    renderPainel();
    fireEvent.click(screen.getByLabelText('1'));
    fireEvent.click(screen.getByLabelText('1'));
    expect(screen.getByTestId('tel-number-incomplete').textContent).toContain('Número incompleto');
    expect((screen.getByTestId('tel-dial-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disca pelo canal escolhido com autoDial quando o numero fica completo', () => {
    renderPainel();
    for (const d of '11999998888') fireEvent.click(screen.getByLabelText(d));
    const cta = screen.getByTestId('tel-dial-button');
    expect((cta as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cta);
    expect(dispatchStartCall).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'voip', phone: '+5511999998888', autoDial: true, source: 'other',
    }));
  });

  it('usa o canal WhatsApp quando ele esta escolhido', () => {
    renderPainel();
    fireEvent.click(screen.getByRole('radio', { name: 'WhatsApp' }));
    for (const d of '11999998888') fireEvent.click(screen.getByLabelText(d));
    fireEvent.click(screen.getByTestId('tel-dial-button'));
    expect(dispatchStartCall).toHaveBeenCalledWith(expect.objectContaining({ channel: 'whatsapp' }));
  });

  it('preenche o numero que o clique-para-discar deixou (T29/T57)', () => {
    pendente = '+5511911112222';
    renderPainel();
    expect(screen.getByTestId('tel-number-display').textContent).toContain('(11) 91111-2222');
  });

  it('com a linha reconectando o CTA avisa em vez de discar', () => {
    sipStatus = 'reconnecting';
    renderPainel();
    const cta = screen.getByTestId('tel-dial-button');
    expect(cta.textContent).toContain('Reconectando');
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });

  it('com capacidade negada explica o motivo e nao disca', () => {
    voip = { canDial: false, reason: 'line_in_use_other_user' };
    renderPainel();
    expect(screen.getByTestId('tel-dial-reason').textContent).toBeTruthy();
    expect((screen.getByTestId('tel-dial-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('em chamada o CTA vira Cancelar e encerra', () => {
    sessao = { status: 'dialing' };
    renderPainel();
    const cta = screen.getByTestId('tel-dial-button');
    expect(cta.textContent).toContain('Cancelar');
    fireEvent.click(cta);
    expect(hangup).toHaveBeenCalled();
  });

  // R2-MOD-016: escolher um contato (T57) preenche o numero; o teclado (T58) mexe
  // nesse numero SEM passar por `escolherContato`. O chip nao pode continuar dizendo
  // que a ligacao e para o contato A quando o destino ja e outro.
  const escolherJoao = async () => {
    fireEvent.change(screen.getByLabelText('Buscar contato'), { target: { value: 'jo' } });
    fireEvent.click(await screen.findByText('João Silva'));
    expect(screen.getByTestId('tel-contact-chip').textContent).toContain('João Silva');
  };

  it('tira o chip do contato quando o numero muda pelo teclado (R2-MOD-016)', async () => {
    renderPainel();
    await escolherJoao();

    fireEvent.click(screen.getByLabelText('9'));

    expect(screen.queryByTestId('tel-contact-chip')).toBeNull();
  });

  it('tira o chip do contato quando o numero muda pelo backspace (R2-MOD-016)', async () => {
    renderPainel();
    await escolherJoao();

    fireEvent.click(screen.getByLabelText('Apagar dígito'));

    expect(screen.queryByTestId('tel-contact-chip')).toBeNull();
  });

  it('devolve o chip quando o numero volta a ser o do contato (R2-MOD-016)', async () => {
    renderPainel();
    await escolherJoao();

    fireEvent.click(screen.getByLabelText('Apagar dígito'));
    expect(screen.queryByTestId('tel-contact-chip')).toBeNull();

    fireEvent.click(screen.getByLabelText('8'));

    expect(screen.getByTestId('tel-contact-chip').textContent).toContain('João Silva');
  });

  it('nao manda o contato antigo quando o numero ja foi alterado (R2-MOD-016)', async () => {
    renderPainel();
    await escolherJoao();

    fireEvent.click(screen.getByLabelText('Apagar dígito'));
    const cta = screen.getByTestId('tel-dial-button');
    expect((cta as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cta);

    expect(dispatchStartCall).toHaveBeenCalledTimes(1);
    expect(dispatchStartCall.mock.calls[0][0]).not.toHaveProperty('contactId');
  });
});

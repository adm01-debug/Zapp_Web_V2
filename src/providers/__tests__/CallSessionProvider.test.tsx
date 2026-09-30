/**
 * T10 — o `CallSessionProvider` ganha a máquina de estados de `session.ts`.
 *
 * O que este arquivo trava:
 *  - o **aceite do T10**: `dial` navega (MemoryRouter) e o estado da sessão
 *    sobrevive à navegação;
 *  - a **compatibilidade**: `useCallSession()` continua entregando os campos que
 *    `VoIPPanel`/`DialPad`/`ActiveCallBar` leem hoje — sem eles a Fase 4 quebra
 *    a UI antes de substituí-la;
 *  - que o motor dirige a máquina (`calling → dialing`, `active → active`,
 *    `ended → ended`) e que `hangup` preserva o `endedBy` **sem** transição
 *    inválida por evento duplicado.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallSessionApi } from '../CallSessionProvider';

/** O hook de SIP é o transporte — aqui ele é dublê, controlado pelo teste. */
const h = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/hooks/communication/useSipClient', () => ({
  useSipClient: () => h.value,
}));

const { CallSessionProvider, useCallSession, VOIP_VIEW_SEARCH } = await import('../CallSessionProvider');
const { INVALID_TRANSITION_PREFIX } = await import('@/lib/calls/session');

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
    makeCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
    acceptIncomingCall: vi.fn(async () => {}),
    rejectIncomingCall: vi.fn(async () => {}),
    ...overrides,
  };
}

function RotaAtual() {
  const local = useLocation();
  return <span data-testid="rota">{local.pathname + local.search}</span>;
}

function Sonda() {
  const api: CallSessionApi = useCallSession();
  return (
    <div>
      <span data-testid="status">{api.session.status}</span>
      <span data-testid="telefone">{api.session.phone ?? '-'}</span>
      <span data-testid="sessao">{api.sessionId ?? '-'}</span>
      <span data-testid="endedBy">{api.session.endedBy ?? '-'}</span>
      {/* Campos que a UI antiga consome — se algum sumir, a Fase 4 quebra. */}
      <span data-testid="sipStatus">{String(api.sipStatus)}</span>
      <span data-testid="callStatus">{String(api.callStatus)}</span>
      <span data-testid="callDuration">{String(api.callDuration)}</span>
      <span data-testid="isMuted">{String(api.isMuted)}</span>
      <span data-testid="currentNumber">{String(api.currentNumber)}</span>
      <span data-testid="callDirection">{String(api.callDirection)}</span>
      <span data-testid="answeredAt">{api.session.answeredAt ?? '-'}</span>
      <span data-testid="endReason">{api.session.endReason ?? '-'}</span>
      <button onClick={() => { api.dial('11999992048'); }}>discar</button>
      <button onClick={() => { api.hangup(); }}>desligar</button>
      <button onClick={() => { void api.accept(); }}>aceitar</button>
      <button onClick={() => { void api.reject(); }}>recusar</button>
      <button onClick={() => { api.openDialer(); }}>abrir</button>
    </div>
  );
}

function Harness({ rota = '/' }: { rota?: string }) {
  return (
    <MemoryRouter initialEntries={[rota]}>
      <CallSessionProvider>
        <RotaAtual />
        <Sonda />
      </CallSessionProvider>
    </MemoryRouter>
  );
}

function montar() {
  return render(<Harness />);
}

function remontar(tela: ReturnType<typeof render>, rota = '/') {
  tela.rerender(<Harness rota={rota} />);
}

const texto = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  h.value = sipDuble();
});

describe('CallSessionProvider (T10)', () => {
  it('aceite: `dial` navega para o dialer e mantém o estado da sessão', () => {
    montar();
    expect(texto('rota')).toBe('/');
    expect(texto('status')).toBe('idle');

    fireEvent.click(screen.getByText('discar'));

    // navegou (MemoryRouter) para a view de telefonia…
    expect(texto('rota')).toBe(`/${VOIP_VIEW_SEARCH}`);
    // …e o estado da máquina sobreviveu à navegação, com a sessão identificada.
    expect(texto('status')).toBe('dialing');
    expect(texto('telefone')).toBe('11999992048');
    expect(texto('sessao')).not.toBe('-');
  });

  it('mantém os campos que a UI antiga consome (VoIPPanel/DialPad/ActiveCallBar)', () => {
    h.value = sipDuble({
      sipStatus: 'registered',
      callStatus: 'ringing',
      callDuration: 7,
      isMuted: true,
      currentNumber: '5511988887777',
      callDirection: 'inbound',
    });
    montar();

    expect(texto('sipStatus')).toBe('registered');
    expect(texto('callStatus')).toBe('ringing');
    expect(texto('callDuration')).toBe('7');
    expect(texto('isMuted')).toBe('true');
    expect(texto('currentNumber')).toBe('5511988887777');
    expect(texto('callDirection')).toBe('inbound');
  });

  it('o status do motor dirige a máquina, mantendo o mesmo sessionId', () => {
    const tela = montar();
    fireEvent.click(screen.getByText('discar'));
    const sessaoDoDial = texto('sessao');

    // O motor estabelece: ESTABLISHED, sem trocar a sessão.
    h.value = sipDuble({ callStatus: 'active', callDirection: 'outbound', currentNumber: '11999992048' });
    remontar(tela, `/${VOIP_VIEW_SEARCH}`);
    expect(texto('status')).toBe('active');
    expect(texto('sessao')).toBe(sessaoDoDial);

    // O motor encerra: a máquina fecha a sessão.
    h.value = sipDuble({ callStatus: 'ended', callDirection: 'outbound', currentNumber: '11999992048' });
    remontar(tela, `/${VOIP_VIEW_SEARCH}`);
    expect(texto('status')).toBe('ended');
  });

  it('`hangup` marca o encerramento local sem gerar transição inválida', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    fireEvent.click(screen.getByText('discar'));
    fireEvent.click(screen.getByText('desligar'));

    expect(texto('endedBy')).toBe('hangup_local');
    expect(texto('status')).toBe('ended');
    // O efeito não repete o encerramento depois que o estado já é terminal.
    const invalidas = aviso.mock.calls.filter((linha) => String(linha[0]).includes(INVALID_TRANSITION_PREFIX));
    expect(invalidas).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * Regressão do defeito que o **E2E** pegou em 30/09: `AppProviders` monta este
   * provider FORA do `BrowserRouter` (`App.tsx:129-156`), então um
   * `useNavigate()` aqui derrubava a aplicação inteira — a página de login
   * parou de renderizar.
   *
   * Os casos acima não pegavam porque eles mesmos fornecem o `MemoryRouter` que
   * o app não tem: o teste escondia a dependência que faltava. Este monta sem
   * Router nenhum, exatamente como o app monta.
   */
  it('monta SEM Router (como o app monta) e ainda assim abre o dialer', () => {
    h.value = sipDuble();
    expect(() =>
      render(
        <CallSessionProvider>
          <Sonda />
        </CallSessionProvider>,
      ),
    ).not.toThrow();

    fireEvent.click(screen.getByText('abrir'));
    expect(window.location.search).toBe('?view=voip');
  });

  /**
   * Regressão do caminho de ENTRADA, apontado pela auditoria adversarial
   * (dois agentes independentes): a máquina congelava em `ringing_in` porque
   * o encerramento despachava `HANGUP_LOCAL`, inválido ali. O remoto que
   * cancela/expira uma chamada ainda tocando é `CANCEL_REMOTE`.
   */
  it('chamada ENTRADA encerrada sem `reject` não congela a máquina', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = montar();
    h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('ringing_in');

    h.value = sipDuble({ callStatus: 'ended', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('ended');
    expect(texto('endReason')).toBe('cancelled_remote');
    const invalidas = aviso.mock.calls.filter((linha) =>
      String(linha[0]).includes(INVALID_TRANSITION_PREFIX),
    );
    expect(invalidas).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * Regressão do caminho de ENTRADA atendida: sem despachar `ACCEPT`, o
   * `ESTABLISHED` do motor era transição inválida e `answeredAt` ficava `null`
   * para sempre — a chamada atendida nunca marcava atendimento.
   */
  it('aceitar uma chamada ENTRADA marca `active` com `answeredAt`', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = montar();
    h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('ringing_in');

    fireEvent.click(screen.getByText('aceitar'));
    h.value = sipDuble({ callStatus: 'active', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('active');
    expect(texto('answeredAt')).not.toBe('-');
    const invalidas = aviso.mock.calls.filter((linha) =>
      String(linha[0]).includes(INVALID_TRANSITION_PREFIX),
    );
    expect(invalidas).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * T11 — um id por chamada: o uuid que o provider põe no evento `DIAL` (e que
   * a máquina guarda em `sessionId`) é o MESMO que vai para o fluxo SIP, que o
   * usa como `p_id` das 3 gravações no banco. Se os dois divergirem, a linha da
   * chamada nunca é encontrada pelo resto do ciclo.
   */
  it('T11: `dial` entrega o MESMO uuid ao evento DIAL e ao SIP', () => {
    montar();
    fireEvent.click(screen.getByText('discar'));

    const sessao = texto('sessao');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(sessao).toMatch(uuid);

    const makeCall = h.value.makeCall as ReturnType<typeof vi.fn>;
    expect(makeCall).toHaveBeenCalledWith('11999992048', sessao);
  });

  /**
   * O id calculado é UM só, mesmo quando ele não é sorteado na hora: com uma
   * `currentCallId` em mãos (chamada em curso no SIP), o provider adota esse
   * valor — e o evento `DIAL` e a chamada SIP recebem, os dois, o mesmo.
   */
  it('T11: quando `currentCallId` já existe, DIAL e SIP usam esse mesmo id', () => {
    const makeCall = vi.fn();
    h.value = sipDuble({ currentCallId: 'linha-em-curso', makeCall });
    montar();
    fireEvent.click(screen.getByText('discar'));

    expect(texto('sessao')).toBe('linha-em-curso');
    expect(makeCall).toHaveBeenCalledWith('11999992048', 'linha-em-curso');
  });
});

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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallSessionApi } from '../CallSessionProvider';
import { useNavigationHistory } from '@/hooks/system/useNavigationHistory';

/** O hook de SIP é o transporte — aqui ele é dublê, controlado pelo teste. */
const h = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  // T12: o callback de fim que o provider passa ao hook (`useSipClient(onEnd)`).
  onEnd: undefined as ((outcome: unknown) => void) | undefined,
}));

vi.mock('@/hooks/communication/useSipClient', () => ({
  useSipClient: (onEnd?: (outcome: unknown) => void) => {
    h.onEnd = onEnd;
    return h.value;
  },
}));

const { CallSessionProvider, useCallSession, VOIP_VIEW_SEARCH, RING_TIMEOUT_MS } =
  await import('../CallSessionProvider');
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
    // T17: o provider confere o microfone antes de despachar o `DIAL`.
    garantirMicrofone: vi.fn(async () => true),
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
      <span data-testid="sipCode">{api.session.sipCode ?? '-'}</span>
      <button onClick={() => { api.dial('11999992048'); }}>discar</button>
      <button onClick={() => { api.hangup(); }}>desligar</button>
      <button onClick={() => { void api.accept(); }}>aceitar</button>
      <button onClick={() => { void api.reject(); }}>recusar</button>
      <button onClick={() => { api.openDialer(); }}>abrir</button>
    </div>
  );
}

function SondaNav() {
  const { currentView } = useNavigationHistory('inbox');
  return <span data-testid="nav-view">{currentView}</span>;
}

function Harness({ rota = '/' }: { rota?: string }) {
  return (
    <MemoryRouter initialEntries={[rota]}>
      <CallSessionProvider>
        <RotaAtual />
        <Sonda />
        <SondaNav />
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

/** Warnings de transição inválida registrados (o esperado é nenhum). */
function transicoesInvalidas(aviso: { mock: { calls: unknown[][] } }): string[] {
  return aviso.mock.calls
    .filter((linha) => String(linha[0]).includes(INVALID_TRANSITION_PREFIX))
    .map((linha) => String(linha[0]));
}

/** Leva o provider a `active`: disca e depois o motor reporta `active`. */
async function emChamadaAtiva(): Promise<ReturnType<typeof render>> {
  const tela = montar();
  await clicarDiscar();
  h.value = sipDuble({ callStatus: 'active', callDirection: 'outbound', currentNumber: '11999992048' });
  remontar(tela, `/${VOIP_VIEW_SEARCH}`);
  return tela;
}

beforeEach(() => {
  h.value = sipDuble();
});

/** T17: `dial` passou a ser assíncrono — o microfone é conferido ANTES do `DIAL`. */
async function clicarDiscar() {
  fireEvent.click(screen.getByText('discar'));
  await act(async () => { await Promise.resolve(); });
}

describe('CallSessionProvider (T10)', () => {
  it('aceite: `dial` navega para o dialer e mantém o estado da sessão', async () => {
    montar();
    expect(texto('rota')).toBe('/');
    expect(texto('status')).toBe('idle');

    await clicarDiscar();

    // navegou (MemoryRouter) para a view de telefonia…
    expect(texto('rota')).toBe(`/${VOIP_VIEW_SEARCH}`);
    // …e o estado da máquina sobreviveu à navegação, com a sessão identificada.
    expect(texto('status')).toBe('dialing');
    expect(texto('telefone')).toBe('11999992048');
    expect(texto('sessao')).not.toBe('-');
  });

  it('openDialer emite zapp:navigate e sincroniza useNavigationHistory para voip', () => {
    montar();
    expect(texto('nav-view')).toBe('inbox');

    fireEvent.click(screen.getByText('abrir'));

    // A view de telefonia é navegada via react-router, mas o hook precisa
    // acompanhar pelo evento `zapp:navigate` — é o que esconde a ActiveCallBar.
    expect(texto('nav-view')).toBe('voip');
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

  it('o status do motor dirige a máquina, mantendo o mesmo sessionId', async () => {
    const tela = montar();
    await clicarDiscar();
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

  it('`hangup` marca o encerramento local sem gerar transição inválida', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    await clicarDiscar();
    fireEvent.click(screen.getByText('desligar'));

    expect(texto('endedBy')).toBe('hangup_local');
    expect(texto('status')).toBe('ended');
    // O efeito não repete o encerramento depois que o estado já é terminal.
    expect(transicoesInvalidas(aviso)).toEqual([]);
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
    expect(transicoesInvalidas(aviso)).toEqual([]);
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
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * T11 — um id por chamada: o uuid que o provider põe no evento `DIAL` (e que
   * a máquina guarda em `sessionId`) é o MESMO que vai para o fluxo SIP, que o
   * usa como `p_id` das 3 gravações no banco. Se os dois divergirem, a linha da
   * chamada nunca é encontrada pelo resto do ciclo.
   */
  it('T11: `dial` entrega o MESMO uuid ao evento DIAL e ao SIP', async () => {
    montar();
    await clicarDiscar();

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
  it('T11: quando `currentCallId` já existe, DIAL e SIP usam esse mesmo id', async () => {
    const makeCall = vi.fn();
    h.value = sipDuble({ currentCallId: 'linha-em-curso', makeCall });
    montar();
    await clicarDiscar();

    expect(texto('sessao')).toBe('linha-em-curso');
    expect(makeCall).toHaveBeenCalledWith('11999992048', 'linha-em-curso');
  });

  /**
   * T17: com o microfone negado, o `DIAL` NÃO é despachado. O provider despachava
   * primeiro e só então chamava o SIP — a negativa deixaria a máquina presa em
   * `dialing`, com uma chamada fantasma na tela que nada encerrava.
   */
  it('T17: microfone negado não despacha o DIAL (não fica preso em dialing)', async () => {
    const makeCall = vi.fn();
    const garantirMicrofone = vi.fn(async () => false);
    h.value = sipDuble({ makeCall, garantirMicrofone });
    montar();

    await clicarDiscar();
    await act(async () => { await Promise.resolve(); });

    expect(garantirMicrofone).toHaveBeenCalled();
    expect(makeCall).not.toHaveBeenCalled();
    expect(texto('status')).toBe('idle');
    expect(texto('sessao')).toBe('-');
  });

  /**
   * Regressão medida pelo agente 3 da auditoria adversarial: uma **2ª chamada
   * de ENTRADA** depois de uma chamada terminal ficava PRESA em `ended` — só o
   * ramo `calling` reiniciava a máquina, então o `INVITE_RECEIVED` era engolido
   * sem warn e a chamada nunca tocava.
   */
  it('2ª chamada de ENTRADA após terminal destrava a máquina (não fica presa em `ended`)', () => {
    const tela = montar();
    h.value = sipDuble({ callStatus: 'calling', currentNumber: '11999992048' });
    remontar(tela);
    expect(texto('status')).toBe('dialing');

    h.value = sipDuble({ callStatus: 'ended', currentNumber: '11999992048' });
    remontar(tela);
    expect(texto('status')).toBe('ended');

    h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('ringing_in');
  });

  /**
   * O id da sessão é SEMPRE um uuid: ele vira `p_id` (coluna `uuid`) nas 3
   * gravações, então um id fora do formato mataria a persistência inteira
   * (`22P02`). Achado do agente DBA — o fallback antigo devolvia `local-…`.
   */
  it('o id da sessão é sempre um uuid, mesmo sem `crypto.randomUUID`', async () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) });
    try {
      montar();
      await clicarDiscar();
      expect(texto('sessao')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });

  /**
   * T12 — o desfecho fino do fim (quem encerrou + código SIP) chega pelo `onEnd`
   * do hook e é despachado num PONTO ÚNICO (`despacharFim`), com guarda de estado
   * terminal. O clique em desligar continua fechando a sessão na hora, com
   * `HANGUP_LOCAL`.
   */
  it('T12: desligamento local fecha a sessão como hangup_local (endReason, não só endedBy)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await emChamadaAtiva();

    act(() => { h.onEnd?.({ endedBy: 'hangup_local', sipCode: null }); });

    expect(texto('status')).toBe('ended');
    expect(texto('endReason')).toBe('hangup_local');
    expect(texto('endedBy')).toBe('hangup_local');
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  it('T12: fim informado pelo motor como remoto fecha a sessão como hangup_remote', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await emChamadaAtiva();

    act(() => { h.onEnd?.({ endedBy: 'hangup_remote', sipCode: 200 }); });

    expect(texto('status')).toBe('ended');
    expect(texto('endReason')).toBe('hangup_remote');
    expect(texto('endedBy')).toBe('hangup_remote');
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  it('T12: sem clique, o status `ended` do motor também fecha como hangup_remote', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = await emChamadaAtiva();

    h.value = sipDuble({ callStatus: 'ended', callDirection: 'outbound', currentNumber: '11999992048' });
    remontar(tela, `/${VOIP_VIEW_SEARCH}`);

    expect(texto('status')).toBe('ended');
    expect(texto('endedBy')).toBe('hangup_remote');
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  it('T12: o desfecho do hook NÃO reescreve um fim já decidido (guarda de terminal)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await emChamadaAtiva();

    fireEvent.click(screen.getByText('desligar'));
    expect(texto('endedBy')).toBe('hangup_local');

    // O `onEnd` do remoto chega DEPOIS do clique (e duas vezes): a guarda de
    // terminal ignora os dois — sem duplo dispatch e sem warn de transição.
    act(() => { h.onEnd?.({ endedBy: 'hangup_remote', sipCode: 200 }); });
    act(() => { h.onEnd?.({ endedBy: 'hangup_remote', sipCode: 200 }); });

    expect(texto('endedBy')).toBe('hangup_local');
    expect(texto('status')).toBe('ended');
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * T16 (D5) — o `despacharFim` colapsava TODO desfecho em `HANGUP_REMOTE`
   * (só `hangup_local` escapava), então uma recusa virava "Cancelada por quem
   * ligou" e uma falha técnica virava "Encerrada pelo outro lado". Cada caso
   * abaixo é uma linha da tabela de `session.ts` que a auditoria mediu errada.
   */
  describe('T16 (D5) — o desfecho do motor vira a ação certa da máquina', () => {
    /** Entrada ainda tocando (`ringing_in`), como o motor reporta hoje. */
    function entradaTocando() {
      const tela = montar();
      h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
      remontar(tela);
      expect(texto('status')).toBe('ringing_in');
      return tela;
    }

    it('recusa (`reject`) fecha em `declined`, não em `cancelled_remote`', () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      entradaTocando();

      act(() => { h.onEnd?.({ endedBy: 'reject', sipCode: 603 }); });

      expect(texto('status')).toBe('ended');
      expect(texto('endReason')).toBe('declined');
      expect(texto('endedBy')).toBe('reject');
      expect(texto('sipCode')).toBe('603');
      expect(transicoesInvalidas(aviso)).toEqual([]);
      aviso.mockRestore();
    });

    it('expiração (`timeout`) fecha em `timeout`, não em `cancelled_remote`', () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      entradaTocando();

      act(() => { h.onEnd?.({ endedBy: 'timeout', sipCode: null }); });

      expect(texto('endReason')).toBe('timeout');
      expect(texto('endedBy')).toBe('timeout');
      expect(transicoesInvalidas(aviso)).toEqual([]);
      aviso.mockRestore();
    });

    it('falha técnica (`failure`) numa chamada ATENDIDA fecha em `failed`', async () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await emChamadaAtiva();

      act(() => { h.onEnd?.({ endedBy: 'failure', sipCode: null }); });

      expect(texto('status')).toBe('ended');
      expect(texto('endReason')).toBe('failed');
      expect(texto('endedBy')).toBe('failure');
      expect(transicoesInvalidas(aviso)).toEqual([]);
      aviso.mockRestore();
    });

    it('cancelamento do remoto numa entrada continua `cancelled_remote` (tabela respeitada)', () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      entradaTocando();

      act(() => { h.onEnd?.({ endedBy: 'cancel_remote', sipCode: 487 }); });

      expect(texto('endReason')).toBe('cancelled_remote');
      expect(texto('endedBy')).toBe('cancel_remote');
      expect(transicoesInvalidas(aviso)).toEqual([]);
      aviso.mockRestore();
    });
  });

  /**
   * T16 (D6) — "Desligar" numa chamada de ENTRADA que ainda toca despachava
   * `HANGUP_LOCAL`, transição INVÁLIDA a partir de `ringing_in`: a máquina só
   * logava warn e a chamada ficava presa. Desligar ali É recusar.
   */
  it('T16 (D6): desligar uma chamada de ENTRADA que ainda toca recusa (`declined`) sem transição inválida', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = montar();
    h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('ringing_in');

    fireEvent.click(screen.getByText('desligar'));

    expect(texto('status')).toBe('ended');
    expect(texto('endReason')).toBe('declined');
    expect(texto('endedBy')).toBe('reject');
    // O SIP continua sendo desligado de fato.
    expect(h.value.hangUp).toHaveBeenCalledTimes(1);
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * T17 (D8) — o desfecho REAL engolido pela guarda de terminal.
   *
   * Medido com React real: o motor fecha `callStatus` ANTES de entregar o
   * `onEnd`, o efeito vê `ended` com o estado ainda aberto e despacha o default
   * hardcoded (`hangup_remote` sem código) — e o `onEnd` verdadeiro, que chega
   * depois, batia na guarda `isTerminal` e era descartado. Resultado: um 486 do
   * SIP ficava congelado como "não atendida" para sempre.
   */
  it('T17 (D8): o `onEnd` real PREVALECE sobre o fim presumido que o status `ended` despacha antes', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = montar();
    await clicarDiscar();
    const sessao = texto('sessao');

    // 1) A ORDEM do defeito: o motor publica `ended` primeiro…
    h.value = sipDuble({ callStatus: 'ended', callDirection: 'outbound', currentNumber: '11999992048' });
    remontar(tela, `/${VOIP_VIEW_SEARCH}`);
    expect(texto('status')).toBe('ended');
    expect(texto('endReason')).toBe('no_answer'); // desfecho presumido, sem código

    // 2) …e só DEPOIS entrega o desfecho real (486 do SIP = ocupado).
    act(() => { h.onEnd?.({ endedBy: 'hangup_remote', sipCode: 486 }); });

    expect(texto('status')).toBe('ended');
    expect(texto('endReason')).toBe('busy'); // 486, e não `no_answer`
    expect(texto('sipCode')).toBe('486');
    expect(texto('endedBy')).toBe('hangup_remote');
    // A correção reconstrói a sessão sem perder a identidade.
    expect(texto('sessao')).toBe(sessao);
    expect(texto('telefone')).toBe('11999992048');
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });

  /**
   * O mesmo caminho numa chamada de ENTRADA ATENDIDA: a reconstrução precisa
   * passar por `ACCEPT` (o `ESTABLISHED` só é válido a partir de `connecting`) e
   * preservar o `answeredAt` original — e o motivo pedido é `failed`, que numa
   * atendida só sai pelo evento `FAILED`.
   */
  it('T17 (D8): a correção reconstrói uma ENTRADA atendida sem perder `answeredAt`', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tela = montar();
    h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    fireEvent.click(screen.getByText('aceitar'));
    h.value = sipDuble({ callStatus: 'active', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('active');
    const sessao = texto('sessao');
    const atendidaEm = texto('answeredAt');
    expect(atendidaEm).not.toBe('-');

    // Motor publica `ended` → fim presumido…
    h.value = sipDuble({ callStatus: 'ended', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('endReason')).toBe('hangup_remote');

    // …e o `onEnd` real chega depois com a falha técnica do SIP.
    act(() => { h.onEnd?.({ endedBy: 'failure', sipCode: 500 }); });

    expect(texto('endReason')).toBe('failed');
    expect(texto('endedBy')).toBe('failure');
    expect(texto('sessao')).toBe(sessao);
    expect(texto('answeredAt')).toBe(atendidaEm);
    expect(transicoesInvalidas(aviso)).toEqual([]);
    aviso.mockRestore();
  });
});

/**
 * T21 — o TTL do toque é decisão da MÁQUINA, não da UI.
 *
 * O relógio que encerra uma chamada de ENTRADA que ninguém atende tem de viver
 * no provider e fechar a sessão por `TIMEOUT` (→ `ended`/`timeout`, e a
 * persistência segue daí). Antes esse `setTimeout` estava na tela
 * (`IncomingCallAlert`): a UI decidia o fim. Aqui ele é observável e cancelável:
 *  - armado só em `ringing_in`;
 *  - cancelado quando o status muda (aceitou/recusou/o remoto cancelou);
 *  - cancelado no unmount (sem vazar timer).
 */
describe('T21 — o TIMEOUT do toque vive na máquina', () => {
  /** Leva a sessão a `ringing_in` (entrada tocando), como o motor reporta. */
  function entradaTocando(): ReturnType<typeof render> {
    const tela = montar();
    h.value = sipDuble({ callStatus: 'ringing', callDirection: 'inbound', currentNumber: '5511988887777' });
    remontar(tela);
    expect(texto('status')).toBe('ringing_in');
    return tela;
  }

  it('chamada ENTRADA que ninguém atende encerra sozinha pelo TIMEOUT da máquina', () => {
    vi.useFakeTimers();
    try {
      entradaTocando();
      expect(texto('status')).toBe('ringing_in');

      // O relógio do toque expira sem ninguém atender.
      act(() => { vi.advanceTimersByTime(RING_TIMEOUT_MS); });

      expect(texto('status')).toBe('ended');
      expect(texto('endReason')).toBe('timeout');
      expect(texto('endedBy')).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('atender antes do estouro cancela o timer', () => {
    vi.useFakeTimers();
    try {
      const tela = entradaTocando();

      // Atende: `ringing_in` → `connecting` → (motor `active`) → `active`.
      fireEvent.click(screen.getByText('aceitar'));
      h.value = sipDuble({ callStatus: 'active', callDirection: 'inbound', currentNumber: '5511988887777' });
      remontar(tela);
      expect(texto('status')).toBe('active');

      // Relógio avança MUITO além do TTL: o timer já foi cancelado e nada expira.
      act(() => { vi.advanceTimersByTime(RING_TIMEOUT_MS * 3); });

      expect(texto('status')).toBe('active');
      expect(texto('endReason')).not.toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('desmontar o provider não deixa timer vazando', () => {
    vi.useFakeTimers();
    try {
      const agendar = vi.spyOn(globalThis, 'setTimeout');
      const limpar = vi.spyOn(globalThis, 'clearTimeout');
      const tela = entradaTocando();

      // O relógio do toque foi armado com o TTL esperado…
      const indice = agendar.mock.calls.findIndex((chamada) => chamada[1] === RING_TIMEOUT_MS);
      expect(indice).toBeGreaterThanOrEqual(0);
      const idDoToque = agendar.mock.results[indice]?.value as number;

      limpar.mockClear();
      tela.unmount();

      // …e o unmount cancela EXATAMENTE aquele timer.
      expect(limpar).toHaveBeenCalledWith(idDoToque);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

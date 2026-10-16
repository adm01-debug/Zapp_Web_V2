/**
 * Aviso de mensagem nova em QUALQUER tela (VM-06 / critérios de aceite).
 *
 * O aviso antigo só existia na inbox: quem estava em outra view não recebia
 * som/notificação. Aqui o alvo é o consumidor global (`useGlobalIncomingMessageAlerts`),
 * montado em App.tsx/DeferredProviders — os testes dirigem o hook REAL pelo callback do canal e
 * observam o efeito (som, toast), com o andaime de mocks compartilhado.
 */
import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactElement } from 'react';

import {
  callbacks,
  dedupeResult,
  playNotificationSound,
  resetAlertKit,
  toast,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

const h = vi.hoisted(() => ({
  fetchContactsByIds: vi.fn(),
  openContactChat: vi.fn(),
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { fetchContactsByIds: h.fetchContactsByIds },
}));

vi.mock('@/components/catalog/useSendProduct', () => ({
  openContactChat: h.openContactChat,
}));

import { useGlobalIncomingMessageAlerts } from '@/hooks/realtime/useGlobalIncomingMessageAlerts';
import { resetOpenConversation, setOpenConversationId } from '@/hooks/realtime/openConversationStore';
import {
  TEAM_ALERTS_STORAGE_KEY,
  getIncomingAlertScope,
  resetIncomingAlertScope,
  setAlertProfileId,
  setTeamAlertsEnabled,
  shouldAlertIncomingMessage,
  useTeamAlertsPreference,
} from '@/hooks/realtime/incomingAlertScope';

const CONTATO_SEM_DONO = { id: 'c1', name: 'Fulano', phone: '1199', avatar_url: null };

/** `profiles.id` de quem está logado: é o valor de `contacts.assigned_to`. */
const MEU_PERFIL = 'perfil-1';

function montar() {
  renderHook(() => useGlobalIncomingMessageAlerts({ myProfileId: MEU_PERFIL }));
}

function mensagemNova(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    contact_id: 'c1',
    sender: 'contact',
    is_read: false,
    content: 'oi, tudo bem?',
    created_at: new Date().toISOString(),
    ...over,
  };
}

let visibility: 'visible' | 'hidden' = 'visible';

/**
 * Dispatcher do canal físico. O canal é COMPARTILHADO (`useSupabaseRealtime`):
 * entre testes ele pode ser reaproveitado, e aí o `.on()` não roda de novo e o
 * kit não recria a entrada em `callbacks` — por isso guardar o último
 * dispatcher visto e reusar.
 */
let dispatcher: ((payload: unknown) => unknown) | null = null;

function canalAtual(): (payload: unknown) => unknown {
  const registrado = callbacks[callbacks.length - 1] as ((payload: unknown) => unknown) | undefined;
  if (registrado) dispatcher = registrado;
  if (!dispatcher) throw new Error('canal de Realtime não registrado pelo hook');
  return dispatcher;
}

/** Entrega o INSERT no canal registrado por este hook e espera o efeito. */
async function entregarInsert(message: Record<string, unknown>) {
  const entregar = canalAtual();
  await act(async () => {
    await entregar({ eventType: 'INSERT', new: message });
  });
}

/** Espera a consulta do contato acontecer (ela precede qualquer decisão). */
async function esperarConsultaDoContato() {
  await waitFor(() => expect(h.fetchContactsByIds).toHaveBeenCalled());
  await act(async () => {});
}

beforeEach(() => {
  resetAlertKit();
  // O kit limpa os espiões de som/notificação, mas não o do toast: limpar aqui
  // para contar os avisos em tela desta suíte.
  toast.mockClear();
  // A preferência do supervisor é persistida local: sem limpar, a escolha de um
  // teste vaza para o seguinte.
  localStorage.clear();
  resetOpenConversation();
  resetIncomingAlertScope();
  h.fetchContactsByIds.mockReset().mockResolvedValue([CONTATO_SEM_DONO]);
  h.openContactChat.mockClear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
});

describe('useGlobalIncomingMessageAlerts — aviso fora da inbox', () => {
  it('avisa mensagem de conversa sem dono com som e toast, sem a inbox montada', async () => {
    montar();
    // O aviso depende de assinatura: o consumidor global entra no canal de messages.
    expect(canalAtual()).toBeTypeOf('function');

    await entregarInsert(mensagemNova());

    await waitFor(() => expect(playNotificationSound).toHaveBeenCalledWith('message', 'chime', 55));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatchObject({ title: 'Nova mensagem de Fulano' });
  });

  it('não avisa a conversa que está aberta na tela com a aba visível', async () => {
    setOpenConversationId('c1');
    montar();

    await entregarInsert(mensagemNova());
    await esperarConsultaDoContato();

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('avisa a conversa aberta quando a aba está oculta (usuário não está lendo)', async () => {
    setOpenConversationId('c1');
    visibility = 'hidden';
    montar();

    await entregarInsert(mensagemNova());

    await waitFor(() => expect(playNotificationSound).toHaveBeenCalledTimes(1));
  });

  it('não avisa conversa de outro atendente (o padrão é negado)', async () => {
    h.fetchContactsByIds.mockResolvedValue([
      { id: 'c9', name: 'Outro', phone: '1188', assigned_to: 'perfil-2', avatar_url: null },
    ]);
    montar();

    await entregarInsert(mensagemNova({ contact_id: 'c9' }));
    await esperarConsultaDoContato();

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('supervisor com a opção "avisar também da equipe" LIGADA é avisado da conversa de colega', async () => {
    setTeamAlertsEnabled(true);
    h.fetchContactsByIds.mockResolvedValue([
      { id: 'c9', name: 'Outro', phone: '1188', assigned_to: 'perfil-2', avatar_url: null },
    ]);
    montar();

    await entregarInsert(mensagemNova({ contact_id: 'c9' }));

    await waitFor(() => expect(playNotificationSound).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('entrega o aviso a um dono só quando outro consumidor já reivindicou a mensagem', async () => {
    // `dedupeResult` é a porta que o kit expõe para o caminho do dedupe: aqui
    // ele simula a inbox (ou um replay do Realtime) já tendo avisado este id.
    dedupeResult.valor = false;
    montar();

    await entregarInsert(mensagemNova());
    await esperarConsultaDoContato();

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('abre a conversa ao clicar no aviso', async () => {
    montar();

    await entregarInsert(mensagemNova());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

    const args = toast.mock.calls[0][0] as { action: ReactElement<{ onClick: () => void }> };
    // O clique abre a conversa por `import()` (o módulo do catálogo puxa o
    // `sonner` estaticamente e não pode entrar no bundle inicial), então a
    // chamada chega num microtask — a asserção é a mesma, só espera o import.
    await act(async () => {
      args.action.props.onClick();
    });

    await waitFor(() => expect(h.openContactChat).toHaveBeenCalledWith('c1'));
  });
});

describe('preferência "avisar também da equipe" (supervisor)', () => {
  it('começa DESLIGADA, liga, grava a escolha e mantém módulo e tela em sincronia', () => {
    // Interruptor do painel de Configurações: lê o valor, grava a escolha e a
    // decisão do alerta (`shouldAlertIncomingMessage`) passa a enxergá-la.
    const { result } = renderHook(() => useTeamAlertsPreference());
    expect(result.current.teamAlertsEnabled).toBe(false);

    act(() => result.current.setTeamAlertsEnabled(true));

    expect(result.current.teamAlertsEnabled).toBe(true);
    expect(localStorage.getItem(TEAM_ALERTS_STORAGE_KEY)).toBe('1');
    expect(getIncomingAlertScope().teamAlerts).toBe(true);

    // Com a identidade publicada, a conversa de colega deixa de ser negada.
    setAlertProfileId('perfil-1');
    expect(shouldAlertIncomingMessage({ assigned_to: 'perfil-2' })).toBe(true);

    act(() => result.current.setTeamAlertsEnabled(false));
    expect(shouldAlertIncomingMessage({ assigned_to: 'perfil-2' })).toBe(false);
    expect(shouldAlertIncomingMessage({ assigned_to: null })).toBe(true);
  });
});

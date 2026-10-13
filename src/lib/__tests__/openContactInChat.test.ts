import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockNavigateToView } = vi.hoisted(() => ({ mockNavigateToView: vi.fn() }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: mockNavigateToView }));

import { openContactInChat } from '../openContactInChat';

type Janela = Window & { __pendingOpenContactId?: string };

/** Registra os contatos entregues pelo evento `open-contact-chat`. */
function escutar(registro: string[]) {
  const listener = (event: Event) =>
    registro.push((event as CustomEvent<{ contactId: string }>).detail.contactId);
  window.addEventListener('open-contact-chat', listener);
  return () => window.removeEventListener('open-contact-chat', listener);
}

/** Mesmo efeito do handler de `useRealtimeInbox`: consome e limpa a pendência. */
function escutarConsumindo(registro: string[]) {
  const listener = (event: Event) => {
    registro.push((event as CustomEvent<{ contactId: string }>).detail.contactId);
    delete (window as Janela).__pendingOpenContactId;
  };
  window.addEventListener('open-contact-chat', listener);
  return () => window.removeEventListener('open-contact-chat', listener);
}

describe('openContactInChat — fonte única de abertura da conversa', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockNavigateToView.mockClear();
    delete (window as Janela).__pendingOpenContactId;
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('navega para o inbox, marca o contato pendente e entrega o evento', async () => {
    const recebidos: string[] = [];
    const soltar = escutar(recebidos);

    openContactInChat('c1');

    expect(mockNavigateToView).toHaveBeenCalledWith('inbox');
    expect((window as Janela).__pendingOpenContactId).toBe('c1');

    await vi.advanceTimersByTimeAsync(150);
    expect(recebidos).toEqual(['c1']);

    // Encerra a cadeia e drena os timers restantes (teardown limpo do jsdom).
    soltar();
    delete (window as Janela).__pendingOpenContactId;
    await vi.advanceTimersByTimeAsync(5000);
  });

  it('não navega de novo quando já está na view do inbox', async () => {
    window.history.replaceState(null, '', '/?view=inbox');
    const recebidos: string[] = [];
    const soltar = escutar(recebidos);

    openContactInChat('c1');

    expect(mockNavigateToView).not.toHaveBeenCalled();
    expect((window as Janela).__pendingOpenContactId).toBe('c1');

    soltar();
    delete (window as Janela).__pendingOpenContactId;
    await vi.advanceTimersByTimeAsync(5000);
  });

  // Antes, cada tela tinha a sua cópia. Este caso trava a regra da função única:
  // UM clique novo cancela a cadeia do anterior (senão as duas cadeias puxam a
  // Inbox para contatos diferentes — "clique rápido puxa a Inbox de volta").
  it('um clique novo cancela a cadeia do anterior', async () => {
    const recebidos: string[] = [];
    const soltar = escutar(recebidos);

    openContactInChat('c1');
    await vi.advanceTimersByTimeAsync(150); // 1º disparo de c1
    expect(recebidos).toEqual(['c1']);

    openContactInChat('c2');
    expect((window as Janela).__pendingOpenContactId).toBe('c2');

    await vi.advanceTimersByTimeAsync(5000);

    // c1 até 15 vezes: a cadeia anterior foi cancelada no clique novo.
    expect(recebidos.filter((id) => id === 'c1')).toEqual(['c1']);
    expect(recebidos).toContain('c2');

    soltar();
    delete (window as Janela).__pendingOpenContactId;
  });

  it('para e limpa os timers quando a inbox consome o contato', async () => {
    const recebidos: string[] = [];
    const soltar = escutarConsumindo(recebidos);

    openContactInChat('c9');
    await vi.advanceTimersByTimeAsync(150);

    expect(recebidos).toEqual(['c9']);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(recebidos).toEqual(['c9']);
    expect(vi.getTimerCount()).toBe(0);

    soltar();
  });

  it('reabre o mesmo contato depois de consumido', async () => {
    const recebidos: string[] = [];
    const soltar = escutarConsumindo(recebidos);

    openContactInChat('c9');
    await vi.advanceTimersByTimeAsync(150);
    openContactInChat('c9');
    await vi.advanceTimersByTimeAsync(150);

    expect(recebidos).toEqual(['c9', 'c9']);
    expect(vi.getTimerCount()).toBe(0);

    soltar();
  });

  it('não estoura quando o ambiente web some no meio da cadeia', async () => {
    const recebidos: string[] = [];
    const soltar = escutar(recebidos);

    openContactInChat('c9');
    await vi.advanceTimersByTimeAsync(200);
    expect(recebidos).toEqual(['c9']);

    vi.stubGlobal('window', undefined);
    try {
      await vi.advanceTimersByTimeAsync(4000);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(recebidos).toEqual(['c9']);

    soltar();
    delete (window as Janela).__pendingOpenContactId;
    await vi.advanceTimersByTimeAsync(5000);
  });
});

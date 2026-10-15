import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * O aviso do sistema (Web Notification) é a parte do alerta que vive FORA da aba: quando o
 * usuário está em outra janela, é o único canal que ainda existe. Ele precisa nascer com o
 * clique instalado (sem clique, nem a janela volta para frente), com `tag` por conversa (tag
 * fixa faz um aviso substituir o outro) e sem derrubar o fluxo de quem chamou quando o
 * navegador recusa alguma coisa.
 */
class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted');
  static abertos: FakeNotification[] = [];
  static estouraNoConstrutor = false;

  title: unknown;
  options: Record<string, unknown>;
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(title: unknown, options?: Record<string, unknown>) {
    if (FakeNotification.estouraNoConstrutor) throw new TypeError('construtor estourou');
    this.title = title;
    this.options = options ?? {};
    FakeNotification.abertos.push(this);
  }
}

import { showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSounds';

describe('notificationSounds — aviso do sistema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeNotification.abertos = [];
    FakeNotification.permission = 'granted';
    FakeNotification.estouraNoConstrutor = false;
    FakeNotification.requestPermission.mockReset().mockResolvedValue('granted' as NotificationPermission);
    vi.stubGlobal('Notification', FakeNotification);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('leva a tag da conversa e o ícone do contato', () => {
    showBrowserNotification('Nova mensagem de Fulano', 'oi', { icon: '/a.png', tag: 'c1' });

    expect(FakeNotification.abertos).toHaveLength(1);
    expect(FakeNotification.abertos[0].options.tag).toBe('c1');
    expect(FakeNotification.abertos[0].options.icon).toBe('/a.png');
  });

  it('tag em branco cai no padrão em vez de entrar vazia', () => {
    showBrowserNotification('Nova mensagem', 'oi', { tag: '   ' });

    expect(FakeNotification.abertos[0].options.tag).toBe('notification');
  });

  it('instala o clique mesmo sem callback: foca a janela e fecha o aviso', () => {
    const foco = vi.spyOn(window, 'focus').mockImplementation(() => {});
    showBrowserNotification('Nova mensagem', 'oi');

    const aviso = FakeNotification.abertos[0];
    expect(typeof aviso.onclick).toBe('function');
    expect(() => aviso.onclick?.()).not.toThrow();
    expect(foco).toHaveBeenCalled();
    expect(aviso.close).toHaveBeenCalled();
  });

  it('callback que não é função não estoura no clique e o aviso ainda fecha', () => {
    showBrowserNotification('Nova mensagem', 'oi', { onClick: 'nao-e-funcao' as never });

    const aviso = FakeNotification.abertos[0];
    expect(() => aviso.onclick?.()).not.toThrow();
    expect(aviso.close).toHaveBeenCalled();
  });

  it('title e ícone fora do formato não impedem o aviso de sair', () => {
    showBrowserNotification(undefined as never, 'oi', { icon: { url: 'x' } as never });

    expect(FakeNotification.abertos).toHaveLength(1);
    expect(FakeNotification.abertos[0].options.icon).toBe('/favicon.ico');
  });

  it('navegador que estoura na criação não derruba quem chamou', () => {
    FakeNotification.estouraNoConstrutor = true;

    expect(() => showBrowserNotification('Nova mensagem', 'oi')).not.toThrow();
  });

  it('fecha o aviso sozinho depois de 5 segundos', () => {
    showBrowserNotification('Nova mensagem', 'oi');

    vi.advanceTimersByTime(5000);
    expect(FakeNotification.abertos[0].close).toHaveBeenCalled();
  });

  it('não pede nada quando a permissão já foi concedida', async () => {
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('volta false quando a permissão foi negada', async () => {
    FakeNotification.permission = 'denied';

    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('volta false quando o pedido ao usuário estoura no meio', async () => {
    FakeNotification.permission = 'default';
    FakeNotification.requestPermission.mockRejectedValue(new Error('sem gesto do usuário'));

    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('volta false quando o Notification do navegador está quebrado', async () => {
    vi.stubGlobal('Notification', undefined);

    await expect(requestNotificationPermission()).resolves.toBe(false);
  });
});

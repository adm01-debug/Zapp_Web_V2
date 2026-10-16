import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock AudioContext
const mockOscillator = {
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  type: 'sine',
  frequency: { setValueAtTime: vi.fn() },
};

const mockGainNode = {
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
};

const criarOscilador = vi.fn(() => mockOscillator);
const criarGanho = vi.fn(() => mockGainNode);

/**
 * Precisa ser uma CLASSE de verdade. Com um `vi.fn()` no lugar do construtor, o
 * `new AudioContext()` estourava ("is not a constructor"), o erro era engolido pelo catch do
 * `playNotificationSound` e a suíte inteira passava sem nunca tocar um som — verde falso.
 */
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = criarOscilador;
  createGain = criarGanho;
}

vi.stubGlobal('AudioContext', FakeAudioContext);

import {
  playNotificationSound,
} from '@/utils/notificationSounds';

describe('notificationSounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('playNotificationSound', () => {
    it('plays default message sound without error', () => {
      expect(() => playNotificationSound('message')).not.toThrow();
    });

    it('plays with chime sound type', () => {
      expect(() => playNotificationSound('message', 'chime')).not.toThrow();
    });

    it('plays with bell sound type', () => {
      expect(() => playNotificationSound('mention', 'bell')).not.toThrow();
    });

    it('plays with alert sound type', () => {
      expect(() => playNotificationSound('sla_breach', 'alert')).not.toThrow();
    });

    it('plays with beep sound type', () => {
      expect(() => playNotificationSound('message', 'beep')).not.toThrow();
    });

    it('plays with soft sound type', () => {
      expect(() => playNotificationSound('message', 'soft')).not.toThrow();
    });

    it('plays achievement sound', () => {
      expect(() => playNotificationSound('achievement')).not.toThrow();
    });

    it('plays goal_achieved sound', () => {
      expect(() => playNotificationSound('goal_achieved')).not.toThrow();
    });

    it('plays sla_warning sound', () => {
      expect(() => playNotificationSound('sla_warning')).not.toThrow();
    });

    it('respects custom volume', () => {
      expect(() => playNotificationSound('message', 'chime', 0.5)).not.toThrow();
    });

    it('handles zero volume', () => {
      expect(() => playNotificationSound('message', 'chime', 0)).not.toThrow();
    });

    it('all notification types are playable', () => {
      const types = ['message', 'mention', 'sla_breach', 'sla_warning', 'achievement', 'goal_achieved'] as const;
      types.forEach(type => {
        expect(() => playNotificationSound(type)).not.toThrow();
      });
    });

    it('all sound types work with message', () => {
      const sounds = ['beep', 'chime', 'bell', 'alert', 'soft'] as const;
      sounds.forEach(sound => {
        expect(() => playNotificationSound('message', sound)).not.toThrow();
      });
    });

    it('não fica mudo quando o tipo de som vem fora do vocabulário', () => {
      // Um valor inválido (preferência antiga, cache otimista) fazia o acesso ao SOUND_CONFIGS
      // estourar: o erro era engolido pelo catch e o alerta simplesmente não tocava. Silêncio é
      // o pior resultado para um alerta, então o som padrão é a resposta certa — e o oscilador
      // precisa ser criado de fato (antes, nenhum era).
      vi.useFakeTimers();
      try {
        expect(() => playNotificationSound('message', 'quiet' as never)).not.toThrow();
        vi.runAllTimers();
        expect(criarOscilador).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('showBrowserNotification', () => {
    const NotificationOriginal = (globalThis as unknown as { Notification?: unknown }).Notification;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      (globalThis as unknown as { Notification?: unknown }).Notification = NotificationOriginal;
    });

    function instalaNotificacaoFalsa() {
      const criadas: Array<{ titulo: string; opcoes: Record<string, unknown>; fechada: boolean }> = [];
      class FakeNotification {
        static permission = 'granted';
        onclick: (() => void) | null = null;
        fechada = false;
        titulo: string;
        opcoes: Record<string, unknown>;
        constructor(titulo: string, opcoes: Record<string, unknown>) {
          this.titulo = titulo;
          this.opcoes = opcoes;
          criadas.push({ titulo, opcoes, fechada: false });
        }
        close() {
          this.fechada = true;
          const reg = criadas.find((c) => c.titulo === this.titulo);
          if (reg) reg.fechada = true;
        }
      }
      vi.stubGlobal('Notification', FakeNotification);
      return criadas;
    }

    it('alerta crítico fica FIXO (requireInteraction) e não fecha em 5 s', async () => {
      const { showBrowserNotification } = await import('../notificationSounds');
      const criadas = instalaNotificacaoFalsa();
      showBrowserNotification('⚠️ Crise', 'fila acima do limite', {
        tag: 'warroom-a-1',
        requireInteraction: true,
      });
      expect(criadas).toHaveLength(1);
      expect(criadas[0].opcoes).toMatchObject({ requireInteraction: true });
      vi.advanceTimersByTime(30_000);
      expect(criadas[0].fechada).toBe(false);
    });

    it('aviso comum fecha sozinho em 5 s', async () => {
      const { showBrowserNotification } = await import('../notificationSounds');
      const criadas = instalaNotificacaoFalsa();
      showBrowserNotification('⚠️ Aviso', 'quase no limite', { tag: 'warroom-a-2' });
      expect(criadas).toHaveLength(1);
      expect(criadas[0].opcoes).toMatchObject({ requireInteraction: false });
      vi.advanceTimersByTime(5_000);
      expect(criadas[0].fechada).toBe(true);
    });
  });
});

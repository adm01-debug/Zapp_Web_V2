/**
 * Comportamento de `src/utils/soundConfigs.ts`: a FORMA de cada configuração
 * (arrays alinhados, atrasos crescentes) e o consumo REAL por `playNotificationSound`
 * com um AudioContext falso — cada frequência/duração/ganho da configuração vira um
 * oscilador agendado. Array desalinhado vira `undefined` no scheduler (alerta mudo/errado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_CONFIGS, type NotificationType, type SoundType } from '../soundConfigs';
import { playNotificationSound } from '../notificationSounds';

const SONS: SoundType[] = ['beep', 'chime', 'bell', 'alert', 'soft'];
const NOTIFICACOES: NotificationType[] = [
  'message',
  'mention',
  'sla_breach',
  'sla_warning',
  'achievement',
  'goal_achieved',
];

type Chamada = ReturnType<typeof vi.fn>;

interface OsciladorFake {
  type: string;
  connect: Chamada;
  start: Chamada;
  stop: Chamada;
  frequency: { setValueAtTime: Chamada };
  parouEm: number | null;
}

interface GanhoFake {
  connect: Chamada;
  gain: {
    setValueAtTime: Chamada;
    linearRampToValueAtTime: Chamada;
    exponentialRampToValueAtTime: Chamada;
  };
}

let osciladores: OsciladorFake[] = [];
let ganhos: GanhoFake[] = [];

function novoOscilador(): OsciladorFake {
  const osc: OsciladorFake = {
    type: '',
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { setValueAtTime: vi.fn() },
    parouEm: null,
  };
  osc.stop = vi.fn((quando: number) => {
    osc.parouEm = quando;
  });
  return osc;
}

function novoGanho(): GanhoFake {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
}

class AudioContextFake {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator() {
    const osc = novoOscilador();
    osciladores.push(osc);
    return osc;
  }
  createGain() {
    const ganho = novoGanho();
    ganhos.push(ganho);
    return ganho;
  }
}

vi.stubGlobal('AudioContext', AudioContextFake);

beforeEach(() => {
  osciladores = [];
  ganhos = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('forma das configurações', () => {
  it('cobre exatamente os cinco tipos de som e as seis notificações', () => {
    expect(Object.keys(SOUND_CONFIGS).sort()).toEqual([...SONS].sort());
    for (const som of SONS) {
      expect(Object.keys(SOUND_CONFIGS[som]).sort(), som).toEqual([...NOTIFICACOES].sort());
    }
  });

  it('mantém frequências, durações, ganhos e atrasos com o mesmo comprimento', () => {
    for (const som of SONS) {
      for (const tipo of NOTIFICACOES) {
        const c = SOUND_CONFIGS[som][tipo];
        const rotulo = `${som}/${tipo}`;
        expect(c.frequencies.length, rotulo).toBeGreaterThan(0);
        expect(c.durations.length, rotulo).toBe(c.frequencies.length);
        expect(c.gains.length, rotulo).toBe(c.frequencies.length);
        expect(c.delays.length, rotulo).toBe(c.frequencies.length);
        for (const f of c.frequencies) expect(Number.isFinite(f) && f > 0, rotulo).toBe(true);
        for (const d of c.durations) expect(Number.isFinite(d) && d > 0, rotulo).toBe(true);
        for (const g of c.gains) expect(g > 0 && g <= 1, `${rotulo} ganho ${g}`).toBe(true);
        expect(['sine', 'square', 'sawtooth', 'triangle'], rotulo).toContain(c.waveform);
      }
    }
  });

  it('começa o primeiro tom sem atraso e mantém a fila em ordem crescente', () => {
    for (const som of SONS) {
      for (const tipo of NOTIFICACOES) {
        const delays = SOUND_CONFIGS[som][tipo].delays;
        const rotulo = `${som}/${tipo}`;
        expect(delays[0], rotulo).toBe(0);
        for (let i = 1; i < delays.length; i += 1) {
          expect(delays[i], `${rotulo}[${i}]`).toBeGreaterThan(delays[i - 1]);
        }
      }
    }
  });
});

describe('consumo real pela playNotificationSound', () => {
  it.each(SONS.flatMap((som) => NOTIFICACOES.map((tipo) => [som, tipo] as const)))(
    '%s/%s agenda um oscilador por tom, com a frequência, a duração e o gain da configuração',
    (som, tipo) => {
      vi.useFakeTimers();
      playNotificationSound(tipo, som, 70);
      vi.runAllTimers();

      const c = SOUND_CONFIGS[som][tipo];
      expect(osciladores).toHaveLength(c.frequencies.length);
      expect(ganhos).toHaveLength(c.frequencies.length);

      c.frequencies.forEach((freq, i) => {
        const osc = osciladores[i];
        expect(osc.type).toBe(c.waveform);
        expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(freq, 0);
        expect(osc.parouEm).toBeCloseTo(c.durations[i], 6);
        expect(ganhos[i].gain.linearRampToValueAtTime).toHaveBeenCalledWith(c.gains[i] * 0.7, 0.02);
        expect(ganhos[i].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, c.durations[i]);
      });
    },
  );

  it('um som fora do vocabulário cai no som padrão (chime/message), não no silêncio', () => {
    vi.useFakeTimers();
    playNotificationSound('message', 'inexistente' as SoundType, 70);
    vi.runAllTimers();
    const padrao = SOUND_CONFIGS.chime.message;
    expect(osciladores).toHaveLength(padrao.frequencies.length);
    expect(osciladores[0].frequency.setValueAtTime).toHaveBeenCalledWith(padrao.frequencies[0], 0);
  });
});

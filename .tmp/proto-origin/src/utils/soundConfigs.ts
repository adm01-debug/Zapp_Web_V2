export type SoundType = 'beep' | 'chime' | 'bell' | 'alert' | 'soft';
export type NotificationType = 'message' | 'mention' | 'sla_breach' | 'sla_warning' | 'achievement' | 'goal_achieved';

export interface SoundConfig {
  frequencies: number[];
  durations: number[];
  waveform: OscillatorType;
  gains: number[];
  delays: number[];
}

const base = (f: number[], d: number[], w: OscillatorType, g: number[], dl: number[]): SoundConfig => ({
  frequencies: f, durations: d, waveform: w, gains: g, delays: dl,
});

export const SOUND_CONFIGS: Record<SoundType, Record<NotificationType, SoundConfig>> = {
  beep: {
    message: base([880, 1100], [0.1, 0.1], 'sine', [0.3, 0.2], [0, 0.1]),
    mention: base([1200, 1400, 1200], [0.1, 0.1, 0.15], 'sine', [0.3, 0.35, 0.25], [0, 0.12, 0.24]),
    sla_breach: base([440, 880, 440], [0.2, 0.15, 0.25], 'square', [0.4, 0.45, 0.35], [0, 0.22, 0.4]),
    sla_warning: base([660, 880], [0.15, 0.2], 'triangle', [0.3, 0.35], [0, 0.18]),
    achievement: base([523, 659, 784, 1047], [0.12, 0.12, 0.12, 0.3], 'sine', [0.25, 0.3, 0.35, 0.4], [0, 0.15, 0.3, 0.45]),
    goal_achieved: base([659, 784, 988, 1319], [0.15, 0.12, 0.12, 0.35], 'sine', [0.3, 0.35, 0.4, 0.45], [0, 0.18, 0.36, 0.55]),
  },
  chime: {
    message: base([1047, 1319], [0.2, 0.25], 'sine', [0.25, 0.2], [0, 0.15]),
    mention: base([784, 988, 1319], [0.15, 0.15, 0.25], 'sine', [0.2, 0.25, 0.3], [0, 0.12, 0.24]),
    sla_breach: base([523, 392, 330], [0.25, 0.25, 0.4], 'sine', [0.35, 0.4, 0.35], [0, 0.28, 0.56]),
    sla_warning: base([659, 523], [0.2, 0.3], 'sine', [0.3, 0.25], [0, 0.22]),
    achievement: base([523, 659, 784, 1047, 1319], [0.1, 0.1, 0.1, 0.15, 0.35], 'sine', [0.2, 0.25, 0.3, 0.35, 0.4], [0, 0.1, 0.2, 0.3, 0.45]),
    goal_achieved: base([659, 784, 988, 1319], [0.15, 0.12, 0.12, 0.35], 'sine', [0.3, 0.35, 0.4, 0.45], [0, 0.18, 0.36, 0.55]),
  },
  bell: {
    message: base([1175, 880], [0.3, 0.2], 'sine', [0.35, 0.2], [0, 0.05]),
    mention: base([1175, 1480, 1175], [0.2, 0.15, 0.25], 'sine', [0.3, 0.35, 0.25], [0, 0.15, 0.32]),
    sla_breach: base([587, 440, 349], [0.3, 0.3, 0.5], 'triangle', [0.4, 0.45, 0.35], [0, 0.35, 0.7]),
    sla_warning: base([784, 587], [0.25, 0.35], 'sine', [0.35, 0.3], [0, 0.28]),
    achievement: base([587, 784, 988, 1175, 1480], [0.12, 0.12, 0.12, 0.15, 0.4], 'sine', [0.25, 0.3, 0.35, 0.4, 0.45], [0, 0.12, 0.24, 0.36, 0.5]),
    goal_achieved: base([587, 784, 988, 1175, 1480], [0.12, 0.12, 0.12, 0.15, 0.4], 'sine', [0.25, 0.3, 0.35, 0.4, 0.45], [0, 0.12, 0.24, 0.36, 0.5]),
  },
  alert: {
    message: base([800, 1000], [0.08, 0.08], 'square', [0.2, 0.15], [0, 0.1]),
    mention: base([1000, 1200, 1000], [0.08, 0.08, 0.12], 'square', [0.2, 0.25, 0.18], [0, 0.1, 0.2]),
    sla_breach: base([400, 600, 400, 600], [0.15, 0.15, 0.15, 0.2], 'square', [0.35, 0.4, 0.35, 0.3], [0, 0.18, 0.36, 0.54]),
    sla_warning: base([600, 500], [0.12, 0.15], 'square', [0.3, 0.25], [0, 0.15]),
    achievement: base([600, 800, 1000, 1200], [0.08, 0.08, 0.08, 0.2], 'square', [0.2, 0.25, 0.3, 0.35], [0, 0.1, 0.2, 0.3]),
    goal_achieved: base([600, 800, 1000, 1200], [0.08, 0.08, 0.08, 0.2], 'square', [0.2, 0.25, 0.3, 0.35], [0, 0.1, 0.2, 0.3]),
  },
  soft: {
    message: base([440, 550], [0.25, 0.3], 'sine', [0.15, 0.12], [0, 0.2]),
    mention: base([550, 660, 550], [0.2, 0.2, 0.25], 'sine', [0.15, 0.18, 0.12], [0, 0.22, 0.44]),
    sla_breach: base([330, 440, 330], [0.3, 0.25, 0.35], 'sine', [0.25, 0.3, 0.22], [0, 0.32, 0.6]),
    sla_warning: base([440, 392], [0.25, 0.3], 'sine', [0.2, 0.18], [0, 0.28]),
    achievement: base([392, 440, 523, 659], [0.15, 0.15, 0.18, 0.4], 'sine', [0.15, 0.18, 0.22, 0.28], [0, 0.18, 0.36, 0.55]),
    goal_achieved: base([392, 440, 523, 659], [0.15, 0.15, 0.18, 0.4], 'sine', [0.15, 0.18, 0.22, 0.28], [0, 0.18, 0.36, 0.55]),
  },
};

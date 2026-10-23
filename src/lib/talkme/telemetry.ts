import { getLogger } from '@/lib/logger';

const log = getLogger('talkMeTelemetry');

export type TalkMeTelemetryEvent =
  | 'abertura'
  | 'aceite_ok'
  | 'conflito'
  | 'resultado_desconhecido'
  | 'offline'
  | 'erro_fila'
  | 'erro_shader';

interface TalkMeTelemetryData {
  queue_id?: string;
  ms_desde_abertura?: number;
  tipo_erro?: string;
}

export function emitTalkMeTelemetry(event: TalkMeTelemetryEvent, data: TalkMeTelemetryData = {}): void {
  try {
    log.warn('Evento TALK ME', { event, ...data });
  } catch {
    // Telemetria nunca pode interferir no fluxo principal.
  }
}

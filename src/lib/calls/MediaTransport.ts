/**
 * Contrato do **transporte de mídia** das ligações por WhatsApp — etapa E005 de
 * `docs/plans/PLANO_LIGACOES_WHATSAPP_MEOWCALLER_100_ETAPAS_2026-10-07.md`
 * (Fase 0) e §2, princípio 2 ("uma interface de transporte de mídia
 * (`MediaTransport`) com a implementação 'PCM por WebSocket' agora e 'WebRTC'
 * para a API oficial depois").
 *
 * O motor (`WhatsAppCallEngine`) decide **quem** disca; o transporte leva o
 * **áudio**. As duas implementações futuras (WS agora, WebRTC depois) cabem
 * atrás desta fronteira: o que muda entre elas é o fio, não quem chama.
 *
 * **Nenhum WebSocket, WebRTC, `AudioContext` ou `AudioWorklet` neste arquivo** —
 * é só a forma. Quem decodifica o formato do fio (a implementação WS decodifica
 * o `PCM16LE em base64` de `GET /call/stream/:callId`,
 * `docs/design/ANALISE_LIGACOES_WHATSAPP_2026-10-07.md:22`) entrega aqui
 * `AudioFrame` já em PCM cru — quem consome não conhece o fio.
 *
 * Formato de referência da primeira implementação: **PCM 16 bits
 * little-endian, mono, 16 kHz, quadros de 960 amostras (60 ms)**.
 */

/** Taxa de amostragem do PCM de referência, em Hz. */
export const PCM16_SAMPLE_RATE_HZ = 16000;

/** Amostras por quadro do PCM de referência (60 ms a 16 kHz). */
export const PCM16_FRAME_SAMPLES = 960;

/** Canais do PCM de referência — mono. */
export const PCM16_CHANNELS = 1;

/**
 * Um quadro de áudio já decodificado, em PCM cru. Neutraliza o fio: o quadro que
 * chega de um WebSocket (base64) e o que sai para um WebRTC têm a mesma cara.
 */
export interface AudioFrame {
  /** Amostras PCM 16 bits little-endian (o `Int16Array` já é little-endian). */
  data: Int16Array;
  /** Taxa de amostragem do quadro, em Hz. */
  sampleRate: number;
  /** Canais do quadro (1 = mono). */
  channels: number;
}

/**
 * Fotografia das estatísticas do transporte. Existe porque a saúde da ligação
 * (RTT por ping/pong, perda de quadro) precisa ser medida pelo próprio
 * transporte — a tela não supõe nada (`ANALISE_LIGACOES_WHATSAPP_2026-10-07.md:30`
 * cita `stats` de RTT e perda na classe Wavoip).
 */
export interface MediaTransportStats {
  /** Último RTT medido, em ms. `null` enquanto não houver medição. */
  rttMs: number | null;
  /** Quadros de saída entregues ao fio. */
  framesSent: number;
  /** Quadros de entrada entregues aos assinantes. */
  framesReceived: number;
  /** Quadros descartados (jitter buffer / atraso). */
  framesDropped: number;
}

/** Assinante dos quadros de entrada. */
export type MediaTransportFrameListener = (frame: AudioFrame) => void;

/**
 * Contrato do transporte de mídia. Uma instância por ligação.
 */
export interface MediaTransport {
  /**
   * Abre o transporte e resolve quando ele está pronto para trocar quadros.
   * **Rejeita em falha real** (sem autorização, serviço fora). Abrir já aberto é
   * no-op.
   */
  open(): Promise<void>;

  /**
   * Fecha e libera o que o transporte abriu. **Idempotente**: fechar antes de
   * abrir (ou fechar duas vezes) não lança.
   */
  close(): Promise<void>;

  /**
   * Envia um quadro de saída. Devolve `true` se o quadro foi para o fio e
   * `false` quando não havia o que enviar (transporte fechado). **Nunca lança**:
   * um quadro perdido não pode derrubar a ligação.
   */
  sendFrame(frame: AudioFrame): boolean;

  /**
   * Assina os quadros de entrada. Devolve a função que cancela a assinatura —
   * idempotente: cancelar duas vezes não pode quebrar quem desmonta a tela.
   */
  onFrame(listener: MediaTransportFrameListener): () => void;

  /**
   * Fotografia das estatísticas correntes. Devolve um objeto novo a cada
   * chamada; **nunca lança**.
   */
  stats(): MediaTransportStats;
}

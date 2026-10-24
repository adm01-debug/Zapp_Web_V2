import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { describeReason, type CapabilityReason } from '@/lib/calls/capabilities';

/**
 * T17: negativa do navegador → motivo operacional. Os três casos do plano são
 * exatamente os que o agente consegue resolver sozinho: liberar a permissão,
 * plugar um microfone, ou fechar o outro programa que está usando o aparelho.
 * `SecurityError`/`OverconstrainedError`/`AbortError` entram ao lado dos seus
 * pares por serem o mesmo sintoma vindo de navegador diferente.
 */
export function motivoDoMicrofone(err: unknown): CapabilityReason {
  const nome = (err as { name?: string } | null)?.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'mic_blocked';
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'mic_missing';
  if (nome === 'NotReadableError' || nome === 'AbortError') return 'mic_busy';
  return 'unknown';
}

/** Uma sondagem bem-sucedida vale por este tempo (ver `garantirMicrofone`). */
const VALIDADE_CONFERENCIA_MS = 3000;

/**
 * T17: o microfone é conferido **antes** de discar/atender. Sem isto a negativa
 * caía no `catch` do adapter e virava "Erro ao ligar" genérico — o agente não
 * sabia se era permissão, aparelho faltando ou outro programa usando o mic.
 */
export function useMicrophoneGuard() {
  const [micReason, setMicReason] = useState<CapabilityReason | null>(null);
  const motivoRef = useRef<CapabilityReason | null>(null);
  const conferidoEmRef = useRef(0);

  const sondar = useCallback(async (silencioso: boolean): Promise<boolean> => {
    // jsdom e navegador antigo não têm `mediaDevices`: não invento bloqueio —
    // se for o caso, o próprio SIP falha com mensagem própria.
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Sondar não é usar: sem parar as tracks o microfone fica quente (e com o
      // indicador do navegador aceso) durante toda a ligação.
      stream.getTracks().forEach((track) => track.stop());
      motivoRef.current = null;
      conferidoEmRef.current = Date.now();
      setMicReason(null);
      return true;
    } catch (err) {
      const motivo = motivoDoMicrofone(err);
      // Uma negativa NÃO é memorizada: a próxima tentativa pergunta de novo.
      motivoRef.current = motivo;
      conferidoEmRef.current = 0;
      setMicReason(motivo);
      if (!silencioso) toast.error(describeReason(motivo) ?? 'Microfone indisponível');
      return false;
    }
  }, []);

  // O provider confere antes de despachar o `DIAL` e o funil confere de novo
  // (quem chama o SIP direto não passa pelo provider): sem esta validade curta
  // seriam dois `getUserMedia` por discagem.
  const garantirMicrofone = useCallback(async (): Promise<boolean> => {
    if (Date.now() - conferidoEmRef.current < VALIDADE_CONFERENCIA_MS) return true;
    return sondar(false);
  }, [sondar]);

  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return;
    // T17: só re-sonda quem tinha problema. Perguntar sem motivo abriria o
    // prompt de permissão a cada troca de aparelho (headset, dock, webcam).
    const reavaliar = () => { if (motivoRef.current) void sondar(true); };
    devices.addEventListener('devicechange', reavaliar);
    return () => devices.removeEventListener('devicechange', reavaliar);
  }, [sondar]);

  return { micReason, garantirMicrofone };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import {
  parseSupabaseStorageObjectUrl,
  PRIVATE_MEDIA_BUCKETS,
} from '@/lib/storage_object_reference';
import { log } from '@/lib/logger';
import {
  findMessageIdByMediaUrl,
  isRecoveryExhausted,
  markRecoveryExhausted,
  recoverMessageMedia,
  recoveryAttemptsLeft,
  registerRecoveryAttempt,
  replaceMediaUrlInCache,
} from '@/services/mediaRecovery';

const STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;
const DEFAULT_TTL_SECONDS = 3600;
const REFRESH_COOLDOWN_MS = 5_000;
/** Estado final da recuperação: o consumidor já mostra a indisponibilidade a partir do erro. */
const MEDIA_UNAVAILABLE_MESSAGE = 'Mídia indisponível';

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface ResolvedStorageUrlState {
  source: string;
  /**
   * Assinatura em lote que originou a URL exibida (`null` quando o hook assinou sozinho).
   * Faz parte da identidade do estado: uma assinatura reemitida pela consulta assume no lugar
   * da antiga, e a URL renovada pelo `refresh` continua valendo.
   */
  seedUrl: string | null;
  url: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Assinatura em lote ja emitida para o MESMO objeto (etapa 10). Entra como URL de leitura
 * sem pedir outra assinatura; o `source` continua sendo o locator durável, entao `refresh`
 * sempre tem de onde renovar (R2-INB-059).
 */
export interface ResolvedStorageUrlSeed {
  signedUrl?: string | null;
  /** Epoch (ms) de expiração da assinatura em lote; ausente = vale ate o `<img>` falhar. */
  signedUrlExpiresAt?: number | null;
}

/** Assinatura em lote utilizável agora: presente e, se a expiração for conhecida, no futuro. */
function usableSeedUrl(seed: ResolvedStorageUrlSeed | undefined): string | null {
  const candidate = seed?.signedUrl?.trim();
  if (!candidate) return null;
  const expiresAt = seed?.signedUrlExpiresAt;
  if (typeof expiresAt === 'number' && expiresAt <= Date.now()) return null;
  return candidate;
}

function initialState(source: string, seedUrl: string | null): ResolvedStorageUrlState {
  const needsSigning = Boolean(parseSupabaseStorageObjectUrl(
    source,
    PRIVATE_MEDIA_BUCKETS,
    STORAGE_ORIGINS
  ));
  if (!needsSigning) return { source, seedUrl: null, url: source, isLoading: false, error: null };
  // Etapa 10: a assinatura em lote ja e uma URL de leitura valida — nao assina de novo agora.
  if (seedUrl) return { source, seedUrl, url: seedUrl, isLoading: false, error: null };
  return { source, seedUrl: null, url: '', isLoading: true, error: null };
}

/** Resolves durable private-bucket locators and legacy signed URLs on demand. */
export function useResolvedStorageUrl(
  source: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  seed?: ResolvedStorageUrlSeed,
) {
  const reference = useMemo(() => parseSupabaseStorageObjectUrl(
    source,
    PRIVATE_MEDIA_BUCKETS,
    STORAGE_ORIGINS
  ), [source]);
  const seedUrl = useMemo(
    () => usableSeedUrl(seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só os campos do seed importam.
    [seed?.signedUrl, seed?.signedUrlExpiresAt]
  );
  const [state, setState] = useState<ResolvedStorageUrlState>(() =>
    initialState(source, usableSeedUrl(seed)));
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const lastRefreshAtRef = useRef(0);
  /** Cancela a chamada da Edge quando a mídia troca ou o componente desmonta. */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Source vigente do hook a cada render. A guarda da recuperação lê este ref (e não
   * `current.source === source` no `setState`): quando a source troca de A para B sem passar
   * pelo caminho do Storage, o estado interno continua parado em A e o `setState` funcional
   * descartaria o resultado de B. O ref diz se a recuperação ainda é da source atual.
   */
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  const activeState = state.source === source && state.seedUrl === seedUrl
    ? state
    : initialState(source, seedUrl);

  const resolve = useCallback(async (): Promise<string> => {
    if (!reference) return source;
    const { data, error } = await supabase.storage
      .from(reference.bucket)
      .createSignedUrl(reference.path, ttlSeconds);
    if (error || !data?.signedUrl) {
      throw error || new Error('Failed to sign private storage object');
    }
    return data.signedUrl;
  }, [reference, source, ttlSeconds]);

  /** O locator permanente que a Edge gravou ainda precisa de assinatura se for bucket privado. */
  const resolveRecoveredLocator = useCallback(async (locator: string): Promise<string> => {
    const recovered = parseSupabaseStorageObjectUrl(locator, PRIVATE_MEDIA_BUCKETS, STORAGE_ORIGINS);
    if (!recovered) return locator;
    const { data, error } = await supabase.storage
      .from(recovered.bucket)
      .createSignedUrl(recovered.path, ttlSeconds);
    if (error || !data?.signedUrl) {
      throw error || new Error('Failed to sign recovered storage object');
    }
    return data.signedUrl;
  }, [ttlSeconds]);

  /**
   * Caminho da mídia vencida do WhatsApp: a `source` não é objeto do Storage, então não há
   * assinatura a renovar — o que falta é o arquivo. O par (url → id da mensagem) sai do cache
   * de mídia e a Edge `recover-message-media` rebaixa a mídia e grava o locator permanente.
   * O teto de tentativas (memória do módulo) fecha o laço: passado ele, o estado vira
   * indisponível e a Edge não é mais chamada para o mesmo objeto.
   */
  const recoverExpiredMedia = useCallback(async (): Promise<string | null> => {
    const messageId = findMessageIdByMediaUrl(source);
    if (!messageId) return source;
    // Aqui a `source` não é objeto do Storage, então o seed nunca participa do estado inicial:
    // a identidade que importa é a própria mídia (source), não a assinatura em lote.
    // A guarda é o ref da source vigente (atualizado a cada render): o estado interno pode
    // estar parado em outra source (troca A → B sem passar pelo Storage) e o `setState`
    // funcional com `current.source === source` descartaria o resultado de B. Quando a
    // recuperação ainda é da source atual, o estado é gravado COMPLETO (sem `...current`),
    // para o resultado chegar à tela mesmo com o estado parado em outra source.
    const isLiveRecovery = () => sourceRef.current === source;

    if (recoveryAttemptsLeft(source) <= 0 || isRecoveryExhausted(source)) {
      if (isLiveRecovery()) {
        setState({
          source, seedUrl, url: '', isLoading: false, error: new Error(MEDIA_UNAVAILABLE_MESSAGE),
        });
      }
      return null;
    }

    const controller = abortRef.current;
    registerRecoveryAttempt(source);
    if (isLiveRecovery()) {
      setState({ source, seedUrl, url: source, isLoading: true, error: null });
    }

    try {
      const outcome = await recoverMessageMedia(messageId, controller?.signal);
      if ((outcome.status === 'ok' || outcome.status === 'ja_permanente') && outcome.mediaUrl) {
        // O locator permanente que a Edge gravou entra no cache ANTES de assinar: se só a
        // assinatura falhar, o locator não se perde e nenhuma tentativa nova do teto é gasta.
        replaceMediaUrlInCache(messageId, outcome.mediaUrl);
        const url = await resolveRecoveredLocator(outcome.mediaUrl);
        if (isLiveRecovery()) {
          setState({ source, seedUrl, url, isLoading: false, error: null });
        }
        return url;
      }
      if (outcome.status === 'negado') markRecoveryExhausted(source);
      log.warn('Private media recovery unavailable', { status: outcome.status });
      if (isLiveRecovery()) {
        setState({
          source, seedUrl, url: '', isLoading: false, error: new Error(MEDIA_UNAVAILABLE_MESSAGE),
        });
      }
      return null;
    } catch (cause) {
      // Desmontou ou a mídia trocou: o sinal abortado é esperado, não é falha de recuperação.
      if (controller?.signal.aborted) return null;
      log.warn('Private media recovery failed', { message: messageOf(cause) });
      if (isLiveRecovery()) {
        setState({
          source, seedUrl, url: '', isLoading: false, error: new Error(MEDIA_UNAVAILABLE_MESSAGE),
        });
      }
      return null;
    }
  }, [resolveRecoveredLocator, seedUrl, source]);

  const refresh = useCallback(async (): Promise<string | null> => {
    // Sem locator do Storage não há assinatura a renovar: pode ser mídia de CDN vencida.
    if (!reference) return recoverExpiredMedia();
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    if (Date.now() - lastRefreshAtRef.current < REFRESH_COOLDOWN_MS) {
      return null;
    }

    lastRefreshAtRef.current = Date.now();
    const isCurrentRefreshState = (current: ResolvedStorageUrlState) =>
      current.source === source && current.seedUrl === seedUrl;
    setState((current) => (isCurrentRefreshState(current)
      ? { source, seedUrl, url: current.url, isLoading: true, error: null }
      : current));
    let pending: Promise<string | null> | null = null;
    pending = resolve()
      .then((url) => {
        setState((current) => (isCurrentRefreshState(current)
          ? { source, seedUrl, url, isLoading: false, error: null }
          : current));
        return url;
      })
      .catch((cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        log.warn('Private storage URL refresh failed', {
          bucket: reference.bucket,
          pathLength: reference.path.length,
          message: error.message,
        });
        setState((current) => (isCurrentRefreshState(current)
          ? { source, seedUrl, url: '', isLoading: false, error }
          : current));
        return null;
      })
      .finally(() => {
        if (refreshPromiseRef.current === pending) refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = pending;
    return pending;
  }, [recoverExpiredMedia, reference, resolve, seedUrl, source]);

  useEffect(() => {
    let active = true;
    refreshPromiseRef.current = null;
    lastRefreshAtRef.current = 0;
    const controller = new AbortController();
    abortRef.current = controller;
    // Assinatura em lote valida ja entrega a imagem: nada de pedido individual no mount.
    if (!reference || seedUrl) {
      return () => { active = false; controller.abort(); };
    }

    void resolve()
      .then((url) => {
        if (active) setState({ source, seedUrl: null, url, isLoading: false, error: null });
      })
      .catch((cause) => {
        if (!active) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        log.warn('Private storage URL resolution failed', {
          bucket: reference.bucket,
          pathLength: reference.path.length,
          message: error.message,
        });
        setState({ source, seedUrl: null, url: '', isLoading: false, error });
      });
    return () => { active = false; controller.abort(); };
  }, [reference, resolve, seedUrl, source]);

  return { ...activeState, refresh };
}

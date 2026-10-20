import { log } from '@/lib/logger';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';

export interface TtsPlayback {
  promise: Promise<void>;
  stop: () => void;
}

export interface PlayTtsOptions {
  onLoadingChange?: (loading: boolean) => void;
  onError?: (error: Error) => void;
  onAutoplayBlocked?: () => void;
}

const TTS_REQUEST_TIMEOUT_MS = 60000;
const TTS_CHUNK_MAX_LENGTH = 220;

function splitLongTtsSegment(segment: string, maxLength: number): string[] {
  if (segment.length <= maxLength) return [segment];

  const commaParts = segment.split(/(?<=[,;:])\s+/).filter(Boolean);
  if (commaParts.length > 1) {
    return commaParts.flatMap((part) => splitLongTtsSegment(part.trim(), maxLength));
  }

  const words = segment.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }

      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    current = word;
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitTextIntoTtsChunks(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [normalized];

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const parts = splitLongTtsSegment(sentence, TTS_CHUNK_MAX_LENGTH);

    for (const part of parts) {
      const candidate = currentChunk ? `${currentChunk} ${part}` : part;
      if (!currentChunk || candidate.length <= TTS_CHUNK_MAX_LENGTH) {
        currentChunk = candidate;
        continue;
      }

      chunks.push(currentChunk);
      currentChunk = part;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

export function playTtsAudio(
  text: string,
  supabaseUrl: string,
  supabaseKey: string,
  options?: PlayTtsOptions
): TtsPlayback {
  const controller = new AbortController();
  let stopped = false;
  const objectUrls = new Set<string>();
  const chunkPromises = new Map<number, Promise<string>>();
  const textChunks = splitTextIntoTtsChunks(text);

  // Create Audio element SYNCHRONOUSLY in the user gesture context
  // This is critical for browser autoplay policy compliance
  const audioElement = new Audio();
  audioElement.preload = 'auto';

  const cleanup = () => {
    audioElement.onended = null;
    audioElement.onerror = null;
    audioElement.pause();
    audioElement.removeAttribute('src');
    audioElement.load();

    objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    objectUrls.clear();
  };

  const playWithBrowserSpeech = (remainingText: string) =>
    new Promise<void>((resolve, reject) => {
      if (!remainingText.trim()) {
        resolve();
        return;
      }

      try {
        if (!('speechSynthesis' in window)) {
          reject(new Error('Browser speech unavailable'));
          return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(remainingText);
        utterance.lang = 'pt-BR';
        utterance.onend = () => resolve();
        utterance.onerror = () => reject(new Error('Browser speech failed'));
        window.speechSynthesis.speak(utterance);
      } catch {
        reject(new Error('Browser speech failed'));
      }
    });

  const fetchChunkAudio = (chunkText: string) => {
    const timeout = setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);

    // A edge roda requireAuth: bearer = token da sessao (supabaseKey so como fallback).
    return edgeAuthHeaders().then((auth) => fetch(`${supabaseUrl}/functions/v1/elevenlabs-tts-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...auth,
        apikey: auth.apikey || supabaseKey,
      },
      body: JSON.stringify({ text: chunkText }),
      signal: controller.signal,
    }))
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          if (response.status === 401 || response.status === 403) {
            log.warn('[TTS] ElevenLabs API key invalid — falling back to browser speech');
            throw new Error('TTS_UNAUTHORIZED');
          }

          throw new Error(`TTS error: ${response.status} ${errorBody.substring(0, 100)}`);
        }

        const blob = await response.blob();
        if (stopped) throw new Error('TTS_STOPPED');

        const objectUrl = URL.createObjectURL(blob);
        objectUrls.add(objectUrl);
        return objectUrl;
      })
      .finally(() => clearTimeout(timeout));
  };

  const ensureChunkAudio = (chunkIndex: number) => {
    const existingPromise = chunkPromises.get(chunkIndex);
    if (existingPromise) return existingPromise;

    const promise = fetchChunkAudio(textChunks[chunkIndex]);
    chunkPromises.set(chunkIndex, promise);
    return promise;
  };

  const playObjectUrl = (objectUrl: string) =>
    new Promise<void>((resolve, reject) => {
      if (stopped) {
        resolve();
        return;
      }

      const resetHandlers = () => {
        audioElement.onended = null;
        audioElement.onerror = null;
      };

      audioElement.onended = () => {
        resetHandlers();
        resolve();
      };

      audioElement.onerror = () => {
        resetHandlers();
        reject(new Error('Audio playback error'));
      };

      audioElement.src = objectUrl;
      audioElement.play().catch((playErr) => {
        resetHandlers();
        if (playErr?.name === 'NotAllowedError') {
          options?.onAutoplayBlocked?.();
        }
        reject(playErr);
      });
    });

  const promise = (async () => {
    let currentChunkIndex = 0;

    try {
      if (textChunks.length === 0) return;

      options?.onLoadingChange?.(true);

      void ensureChunkAudio(0);
      if (textChunks.length > 1) void ensureChunkAudio(1);

      for (currentChunkIndex = 0; currentChunkIndex < textChunks.length; currentChunkIndex += 1) {
        if (stopped) return;

        const nextChunkIndex = currentChunkIndex + 1;
        if (nextChunkIndex < textChunks.length) {
          void ensureChunkAudio(nextChunkIndex);
        }

        const objectUrl = await ensureChunkAudio(currentChunkIndex);
        if (stopped) return;

        if (currentChunkIndex === 0) {
          options?.onLoadingChange?.(false);
        }

        await playObjectUrl(objectUrl);
      }
    } catch (err) {
      if (stopped || controller.signal.aborted) return;
      log.warn('[TTS] Chunked playback failed, falling back to browser speech:', err);
      options?.onLoadingChange?.(false);
      const realErr = err instanceof Error ? err : new Error(String(err));
      if (realErr.name === 'NotAllowedError' || realErr.message?.includes('NotAllowedError')) {
        options?.onAutoplayBlocked?.();
        options?.onError?.(new Error('AUTOPLAY_BLOCKED'));
      } else {
        options?.onError?.(realErr);
        const remainingText = textChunks.slice(currentChunkIndex).join(' ') || text;
        await playWithBrowserSpeech(remainingText);
      }
    } finally {
      options?.onLoadingChange?.(false);
      cleanup();
    }
  })();

  const stop = () => {
    stopped = true;
    controller.abort();
    window.speechSynthesis?.cancel();
    cleanup();
  };

  return { promise, stop };
}

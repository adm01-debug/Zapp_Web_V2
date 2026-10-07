export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  created_at: string;
  caption: string | null;
}

/**
 * O `message_type` do banco e a fonte dos contadores da galeria (`useContactMediaCounts`),
 * entao ele manda sobre a extensao. Antes, `.webm`/`.mp4` venciam por estarem listados em
 * video, e um audio WebM (voz do WhatsApp — o `ChatService` grava `.webm`) aparecia em
 * "Videos" enquanto o chip contava em "Audio" (#309 / R2-INB-012).
 */
export const getMediaType = (url: string, messageType: string): MediaItem['type'] => {
  if (messageType === 'image') return 'image';
  if (messageType === 'video') return 'video';
  if (messageType === 'audio' || messageType === 'ptt') return 'audio';

  // Sem tipo explicito, cai na extensao (registros legados). URL relativa/malformada:
  // new URL lanca e sobra o href inteiro, entao corta query e hash na mao — senao
  // '/foto.jpg?token=...' vira extensao 'jpg?token=...'
  let pathname = url;
  try { pathname = new URL(url).pathname; } catch { pathname = url.split(/[?#]/)[0]; }
  const extension = pathname.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'opus'].includes(extension)) return 'audio';
  return 'document';
};

export const notifyDownloadBlocked = async (): Promise<void> => {
  const { toast } = await import('sonner');
  toast.error('🔒 Download bloqueado por política de segurança', {
    description: 'O download de arquivos está desabilitado para proteção de dados.',
  });
};

export const getFilename = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.split('/').pop() || 'arquivo';
  } catch {
    return url.split('/').pop() || 'arquivo';
  }
};

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  created_at: string;
  caption: string | null;
}

export const getMediaType = (url: string, messageType: string): MediaItem['type'] => {
  let pathname = url;
  // URL relativa/malformada: new URL lanca e sobra o href inteiro, entao corta
  // query e hash na mao — senao '/foto.jpg?token=...' vira extensao 'jpg?token=...'
  try { pathname = new URL(url).pathname; } catch { pathname = url.split(/[?#]/)[0]; }
  const extension = pathname.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension) || messageType === 'image') return 'image';
  if (['mp4', 'webm', 'mov', 'avi'].includes(extension) || messageType === 'video') return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'opus'].includes(extension) || messageType === 'audio' || messageType === 'ptt') return 'audio';
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

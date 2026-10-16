import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';
import { convertAudioToMp3 } from '@/utils/audioToMp3';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';

const log = getLogger('useAudioMemes');

export interface AudioMemeItem {
  id: string;
  name: string;
  audio_url: string;
  category: string;
  duration_seconds: number | null;
  is_favorite: boolean;
  use_count: number;
}

export interface PendingUpload {
  file: File;
  audioUrl: string;
  storagePath: string;
  duration: number | null;
  aiCategory: string;
  selectedCategory: string;
  name: string;
}

export function useAudioMemes(open: boolean) {
  const [memes, setMemes] = useState<AudioMemeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * R2-INB-041 — cleanup do bind de volume (subscribers do store + ganho WebAudio) do
   * player de prévia vigente. É guardado numa ref porque o `detach` devolvido por
   * `attachMediaVolume` se perdia dentro do `onended`: pausar, trocar de prévia,
   * fechar o picker ou desmontar descartava o Audio mantendo a inscrição no store.
   */
  const detachPreviewRef = useRef<(() => void) | null>(null);

  /**
   * R2-INB-041 — solta o player de prévia corrente de modo idempotente: pausa, tira o
   * handler e executa o `detach` (que remove listeners, a inscrição no store e o ganho).
   * Não mexe em estado React para poder rodar também no cleanup de unmount.
   */
  const releasePreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onended = null;
    }
    audioRef.current = null;
    detachPreviewRef.current?.();
    detachPreviewRef.current = null;
  }, []);

  const stopPreview = useCallback(() => {
    releasePreview();
    setPlayingId(null);
  }, [releasePreview]);

  // R2-INB-043: o objeto já está no bucket `audio-memes` antes de existir preview e a
  // linha em `audio_memes` só nasce no Salvar. Estes refs permitem desfazer (rollback) o
  // upload não confirmado ao fechar/desmontar o picker e invalidar uma conclusão tardia,
  // que antes recriava o preview fora do ciclo aberto deixando o objeto órfão.
  const pendingUploadRef = useRef<PendingUpload | null>(null);
  const uploadEpochRef = useRef(0);
  const confirmingRef = useRef(false);

  const discardUnconfirmedUpload = useCallback(async (clearState: boolean) => {
    // Invalida qualquer upload em voo desta abertura: conclusão após o fechamento
    // não recria o preview e limpa o objeto que ela mesma acabou de enviar.
    uploadEpochRef.current += 1;
    const pending = pendingUploadRef.current;
    // Salvar em andamento conserva o objeto — a linha está nascendo na confirmação.
    if (!pending || confirmingRef.current) return;
    pendingUploadRef.current = null;
    if (clearState) setPendingUpload(null);
    const { error } = await supabase.storage.from('audio-memes').remove([pending.storagePath]);
    if (error) log.error('[AudioMeme] Falha ao limpar upload não confirmado:', error);
  }, []);

  // Desmontagem do picker: remove o objeto não confirmado sem mexer em estado de um
  // componente que está saindo.
  useEffect(() => () => { void discardUnconfirmedUpload(false); }, [discardUnconfirmedUpload]);

  const fetchMemes = useCallback(async () => {
    setLoading(true);
    // Uses the per-user RPC so `is_favorite` reflects the logged-in agent
    const { data, error } = await supabase.rpc('fn_list_audio_memes_for_user', {
      p_category: undefined,
      p_only_favs: false,
      p_search: undefined,
    });
    if (!error && data) setMemes(data as AudioMemeItem[]);
    else if (error) log.error('[AudioMeme] List error:', error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Adiado p/ microtask: evita setState síncrono no corpo do effect (react-hooks/set-state-in-effect)
    let active = true;
    if (open) queueMicrotask(() => { if (active) fetchMemes(); });
    // Fechamento normal do picker (clique externo/controle): desfaz o upload não confirmado.
    else queueMicrotask(() => { void discardUnconfirmedUpload(true); });
    return () => {
      active = false;
      // R2-INB-041 — fechar o picker ou desmontar descarta o player: solta o bind dele.
      releasePreview();
    };
  }, [open, fetchMemes, releasePreview, discardUnconfirmedUpload]);

  const handlePreview = useCallback((meme: AudioMemeItem) => {
    if (playingId === meme.id) {
      stopPreview();
      return;
    }
    // R2-INB-041 — a prévia anterior sai de cena: solta o bind antes de criar a nova.
    releasePreview();
    const audio = new Audio(meme.audio_url);
    // E36 — prévia do áudio meme é mídia de conversa: respeita o volume global.
    const detachMediaVolume = attachMediaVolume(audio);
    detachPreviewRef.current = detachMediaVolume;
    // R2-INB-041 — ended, pause, troca e unmount passam pelo MESMO caminho de liberação
    // (idempotente), em vez de o detach viver só dentro deste handler.
    audio.onended = () => stopPreview();
    void audio.play();
    audioRef.current = audio;
    setPlayingId(meme.id);
  }, [playingId, releasePreview, stopPreview]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast.error('Arquivo não é um áudio válido');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo excede 5MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const epoch = ++uploadEpochRef.current;
    setUploading(true);
    try {
      // Padroniza em MP3 (audio/mpeg) — reprodução universal iOS/Android/desktop.
      // Fallback: se o browser não decodificar o formato, usa o arquivo original.
      const converted = await convertAudioToMp3(file, file.name);
      if (converted.ok && converted.blob.size > 5 * 1024 * 1024) {
        toast.error('O áudio convertido em MP3 excede 5MB. Use um áudio mais curto.');
        return;
      }
      const payload: File | Blob = converted.ok ? converted.blob : file;
      const contentType = converted.ok ? 'audio/mpeg' : (file.type || 'audio/mpeg');
      const ext = converted.ok ? 'mp3' : getFileExtensionWithDefault(file.name, 'mp3');
      const storagePath = `meme_${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('audio-memes')
        .upload(storagePath, payload, { contentType, cacheControl: '31536000' });

      if (uploadError) { toast.error('Erro ao enviar arquivo'); return; }

      const { data: urlData } = supabase.storage.from('audio-memes').getPublicUrl(storagePath);

      // Fechou/desmontou (ou um envio mais novo superou este) enquanto o upload estava em
      // voo: não recria o preview fora do ciclo ativo e devolve o objeto recém-enviado
      // para limpeza, em vez de deixá-lo órfão (R2-INB-043).
      if (epoch !== uploadEpochRef.current) {
        const { error } = await supabase.storage.from('audio-memes').remove([storagePath]);
        if (error) log.error('[AudioMeme] Falha ao limpar upload superado:', error);
        return;
      }

      // duração: preferir a calculada localmente do MP3 CBR (sem depender de rede)
      let duration: number | null = converted.ok ? converted.durationSeconds : null;
      if (duration === null) {
        try {
          // Probe de metadados (nunca é reproduzido): fora do `mediaVolumeStore` —
          // não há áudio saindo daqui, só a leitura da duração.
          const tempAudio = new Audio(urlData.publicUrl);
          await new Promise<void>((resolve) => {
            tempAudio.onloadedmetadata = () => {
              duration = isFinite(tempAudio.duration) ? Math.round(tempAudio.duration * 100) / 100 : null;
              resolve();
            };
            tempAudio.onerror = () => resolve();
            setTimeout(resolve, 3000);
          });
        } catch (err) { log.error('Unexpected error in useAudioMemes:', err); }
      }

      let aiCategory = 'outros';
      try {
        toast.info('🔍 Classificando com IA...');
        const { data: classifyData, error: classifyErr } = await supabase.functions.invoke('classify-audio-meme', {
          body: { audio_url: urlData.publicUrl, file_name: file.name },
        });
        if (!classifyErr && classifyData?.category) aiCategory = classifyData.category;
      } catch (err) { log.error('Unexpected error in useAudioMemes:', err); }

      if (epoch !== uploadEpochRef.current) {
        const { error } = await supabase.storage.from('audio-memes').remove([storagePath]);
        if (error) log.error('[AudioMeme] Falha ao limpar upload superado:', error);
        return;
      }

      const pending: PendingUpload = {
        file, audioUrl: urlData.publicUrl, storagePath, duration,
        aiCategory, selectedCategory: aiCategory,
        name: file.name.replace(/\.[^.]+$/, ''),
      };
      pendingUploadRef.current = pending;
      setPendingUpload(pending);
    } catch {
      toast.error('Erro ao processar áudio');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleConfirmUpload = useCallback(async (pending: PendingUpload) => {
    // Enquanto a linha nasce, um fechamento do picker NÃO pode desfazer o objeto (R2-INB-043).
    confirmingRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from('audio_memes').insert({
        name: pending.name, audio_url: pending.audioUrl,
        category: pending.selectedCategory, duration_seconds: pending.duration,
        uploaded_by: user?.id || null,
      });
      if (insertError) {
        log.error('[AudioMeme] Insert error:', insertError);
        toast.error('Erro ao salvar áudio meme no banco de dados');
        return;
      }
      toast.success(`Áudio salvo como "${pending.selectedCategory}"!`);
      pendingUploadRef.current = null;
      setPendingUpload(null);
      fetchMemes();
    } finally {
      confirmingRef.current = false;
    }
  }, [fetchMemes]);

  const handleCancelUpload = useCallback(async () => {
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    setPendingUpload(null);
    if (pending) {
      const { error } = await supabase.storage.from('audio-memes').remove([pending.storagePath]);
      if (error) log.error('[AudioMeme] Falha ao remover upload cancelado:', error);
    }
  }, []);

  const handleSend = useCallback(async (meme: AudioMemeItem, onSend: (url: string) => void, onClose: () => void) => {
    // R2-INB-041 — enviar descarta a prévia: solta o bind dela, não só a pausa.
    stopPreview();
    onSend(meme.audio_url);
    onClose();
    // Atomic increment via SECURITY DEFINER RPC (avoids race conditions on use_count)
    await supabase.rpc('fn_send_audio_meme', { p_meme_id: meme.id });
    setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, use_count: (m.use_count || 0) + 1 } : m));
  }, [stopPreview]);

  const toggleFavorite = useCallback(async (e: React.MouseEvent, meme: AudioMemeItem) => {
    e.stopPropagation();
    const newVal = !meme.is_favorite;
    setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, is_favorite: newVal } : m));
    // Per-user favorite (audio_meme_favorites table)
    const { error } = await supabase.rpc('fn_toggle_user_meme_favorite', { p_meme_id: meme.id });
    if (error) {
      log.error('[AudioMeme] Toggle favorite error:', error);
      // Revert optimistic update
      setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, is_favorite: !newVal } : m));
    }
  }, []);

  const handleCategoryChange = useCallback(async (meme: AudioMemeItem, newCategory: string) => {
    const categoriaAnterior = meme.category;
    setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, category: newCategory } : m));

    // R2-INB-042 — a escrita só é sucesso com `error` nulo E ao menos 1 linha afetada: o
    // `.select('id')` devolve as linhas que o RLS deixou passar, então `data` vazio/null é
    // FALHA mesmo sem `error` (o RLS filtra sem devolver erro).
    const { data: linhasAtualizadas, error } = await supabase
      .from('audio_memes')
      .update({ category: newCategory })
      .eq('id', meme.id)
      .select('id');

    if (error || !linhasAtualizadas?.length) {
      log.error('[AudioMeme] Falha ao alterar categoria:', error ?? 'nenhuma linha afetada (RLS?)');
      // Reverte só este item; o meme continua disponível para uma nova tentativa.
      setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, category: categoriaAnterior } : m));
      toast.error('Não foi possível alterar a categoria');
      return;
    }

    toast.success(`Categoria alterada`);
  }, []);

  const handleDelete = useCallback(async (e: React.MouseEvent, meme: AudioMemeItem) => {
    e.stopPropagation();
    const posicaoAnterior = memes.findIndex(m => m.id === meme.id);
    setMemes(prev => prev.filter(m => m.id !== meme.id));

    // R2-INB-042 — LINHA primeiro, objeto depois: se a linha não saiu (erro ou 0 linhas) o
    // arquivo do bucket continua no lugar e o item volta à lista. Nunca deixamos uma linha
    // apontando para um objeto já removido (o refetch devolveria uma entrada sem áudio).
    const { data: linhasRemovidas, error: erroDaExclusao } = await supabase
      .from('audio_memes')
      .delete()
      .eq('id', meme.id)
      .select('id');

    if (erroDaExclusao || !linhasRemovidas?.length) {
      log.error('[AudioMeme] Falha ao excluir a linha:', erroDaExclusao ?? 'nenhuma linha afetada (RLS?)');
      setMemes(prev => {
        if (prev.some(m => m.id === meme.id)) return prev;
        const restaurada = [...prev];
        restaurada.splice(
          posicaoAnterior < 0 ? restaurada.length : Math.min(posicaoAnterior, restaurada.length),
          0,
          meme,
        );
        return restaurada;
      });
      toast.error('Não foi possível remover o áudio meme');
      return;
    }

    const path = meme.audio_url.split('/audio-memes/')[1];
    if (path) {
      const { error: erroDoObjeto } = await supabase.storage.from('audio-memes').remove([path]);
      if (erroDoObjeto) {
        // A linha já saiu: não é sucesso pleno — o arquivo ficou órfão no bucket.
        log.error('[AudioMeme] Objeto do bucket não removido (ficou órfão):', erroDoObjeto);
        toast.error('O áudio saiu da lista, mas o arquivo não pôde ser apagado do armazenamento');
        return;
      }
    }

    toast.success('Áudio meme removido');
  }, [memes]);

  const cleanup = useCallback(() => {
    // R2-INB-041 — descartar o estado do picker também solta o bind do player.
    stopPreview();
    // R2-INB-043 — fechar o Popover desfaz o upload não confirmado (objeto já no
    // Storage, linha ainda não criada) em vez de só descartar a referência.
    void discardUnconfirmedUpload(true);
  }, [stopPreview, discardUnconfirmedUpload]);

  return {
    memes, loading, uploading, playingId, pendingUpload,
    audioRef, fileInputRef,
    handlePreview, handleFileSelect, handleConfirmUpload,
    handleCancelUpload, handleSend, toggleFavorite,
    handleCategoryChange, handleDelete, cleanup,
  };
}

export const formatDuration = (seconds: number | null) => {
  if (!seconds) return '--';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

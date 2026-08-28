import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';

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

  const fetchMemes = useCallback(async () => {
    setLoading(true);
    // Uses the per-user RPC so `is_favorite` reflects the logged-in agent
    const { data, error } = await supabase.rpc('fn_list_audio_memes_for_user', {
      p_category: null,
      p_only_favs: false,
      p_search: null,
    });
    if (!error && data) setMemes(data as AudioMemeItem[]);
    else if (error) log.error('[AudioMeme] List error:', error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchMemes();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [open, fetchMemes]);

  const handlePreview = useCallback((meme: AudioMemeItem) => {
    if (playingId === meme.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(meme.audio_url);
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(meme.id);
  }, [playingId]);

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

    setUploading(true);
    try {
      const ext = getFileExtensionWithDefault(file.name, 'mp3');
      const storagePath = `meme_${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('audio-memes')
        .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });

      if (uploadError) { toast.error('Erro ao enviar arquivo'); return; }

      const { data: urlData } = supabase.storage.from('audio-memes').getPublicUrl(storagePath);

      let duration: number | null = null;
      try {
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

      let aiCategory = 'outros';
      try {
        toast.info('🔍 Classificando com IA...');
        const { data: classifyData, error: classifyErr } = await supabase.functions.invoke('classify-audio-meme', {
          body: { audio_url: urlData.publicUrl, file_name: file.name },
        });
        if (!classifyErr && classifyData?.category) aiCategory = classifyData.category;
      } catch (err) { log.error('Unexpected error in useAudioMemes:', err); }

      setPendingUpload({
        file, audioUrl: urlData.publicUrl, storagePath, duration,
        aiCategory, selectedCategory: aiCategory,
        name: file.name.replace(/\.[^.]+$/, ''),
      });
    } catch {
      toast.error('Erro ao processar áudio');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleConfirmUpload = useCallback(async (pending: PendingUpload) => {
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
    setPendingUpload(null);
    fetchMemes();
  }, [fetchMemes]);

  const handleCancelUpload = useCallback(async () => {
    if (pendingUpload) {
      await supabase.storage.from('audio-memes').remove([pendingUpload.storagePath]);
    }
    setPendingUpload(null);
  }, [pendingUpload]);

  const handleSend = useCallback(async (meme: AudioMemeItem, onSend: (url: string) => void, onClose: () => void) => {
    if (audioRef.current) { audioRef.current.pause(); setPlayingId(null); }
    onSend(meme.audio_url);
    onClose();
    // Atomic increment via SECURITY DEFINER RPC (avoids race conditions on use_count)
    await supabase.rpc('fn_send_audio_meme', { p_meme_id: meme.id });
    setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, use_count: (m.use_count || 0) + 1 } : m));
  }, []);

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
    setMemes(prev => prev.map(m => m.id === meme.id ? { ...m, category: newCategory } : m));
    await supabase.from('audio_memes').update({ category: newCategory }).eq('id', meme.id);
    toast.success(`Categoria alterada`);
  }, []);

  const handleDelete = useCallback(async (e: React.MouseEvent, meme: AudioMemeItem) => {
    e.stopPropagation();
    setMemes(prev => prev.filter(m => m.id !== meme.id));
    const path = meme.audio_url.split('/audio-memes/')[1];
    if (path) await supabase.storage.from('audio-memes').remove([path]);
    await supabase.from('audio_memes').delete().eq('id', meme.id);
    toast.success('Áudio meme removido');
  }, []);

  const cleanup = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); setPlayingId(null); }
    setPendingUpload(null);
  }, []);

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

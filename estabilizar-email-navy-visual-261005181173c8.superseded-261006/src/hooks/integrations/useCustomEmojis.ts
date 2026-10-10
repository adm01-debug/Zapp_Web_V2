import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CATEGORY_LABELS } from '@/components/inbox/emojiConstants';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';

import { getLogger } from '@/lib/logger';
const log = getLogger('useCustomEmojis');

export interface CustomEmoji {
  id: string;
  name: string;
  image_url: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
}

export interface PendingEmojiUpload {
  file: File;
  imageUrl: string;
  storagePath: string;
  aiCategory: string;
  selectedCategory: string;
  name: string;
}

export function useCustomEmojis(open: boolean) {
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingEmojiUpload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmojis = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('custom_emojis')
      .select('*')
      .order('use_count', { ascending: false })
      .limit(500);
    if (!error && data) setEmojis(data as unknown as CustomEmoji[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchEmojis();
  }, [open, fetchEmojis]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Arquivo não é uma imagem válida');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error('Arquivo excede 512KB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const ext = getFileExtensionWithDefault(file.name, 'png');
      const storagePath = `emoji_${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('custom-emojis')
        .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });

      if (uploadError) { toast.error('Erro ao enviar arquivo'); return; }

      const { data: urlData } = supabase.storage.from('custom-emojis').getPublicUrl(storagePath);

      let aiCategory = 'outros';
      try {
        toast.info('🔍 Classificando emoji com IA...');
        const { data: classifyData, error: classifyErr } = await supabase.functions.invoke('classify-emoji', {
          body: { image_url: urlData.publicUrl, file_name: file.name },
        });
        if (!classifyErr && classifyData?.category) aiCategory = classifyData.category;
      } catch (err) { log.error('Unexpected error in useCustomEmojis:', err); }

      setPendingUpload({
        file, imageUrl: urlData.publicUrl, storagePath,
        aiCategory, selectedCategory: aiCategory,
        name: file.name.replace(/\.[^.]+$/, ''),
      });
    } catch {
      toast.error('Erro ao processar emoji');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleConfirmUpload = useCallback(async (pending: PendingEmojiUpload) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('custom_emojis').insert({
      name: pending.name, image_url: pending.imageUrl,
      category: pending.selectedCategory, is_favorite: false,
      use_count: 0, uploaded_by: user?.id || null,
    });
    if (error) { toast.error('Erro ao salvar emoji'); return; }
    toast.success(`Emoji salvo como "${CATEGORY_LABELS[pending.selectedCategory]?.label || pending.selectedCategory}"!`);
    setPendingUpload(null);
    fetchEmojis();
  }, [fetchEmojis]);

  const handleCancelUpload = useCallback(async () => {
    if (pendingUpload) {
      await supabase.storage.from('custom-emojis').remove([pendingUpload.storagePath]);
    }
    setPendingUpload(null);
  }, [pendingUpload]);

  const handleSend = useCallback(async (emoji: CustomEmoji, onSendEmoji: (url: string) => void, onClose: () => void) => {
    onSendEmoji(emoji.image_url);
    onClose();
    await supabase.from('custom_emojis').update({ use_count: (emoji.use_count || 0) + 1 }).eq('id', emoji.id);
  }, []);

  const toggleFavorite = useCallback(async (e: React.MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    const newVal = !emoji.is_favorite;
    setEmojis(prev => prev.map(em => em.id === emoji.id ? { ...em, is_favorite: newVal } : em));
    await supabase.from('custom_emojis').update({ is_favorite: newVal }).eq('id', emoji.id);
  }, []);

  const handleCategoryChange = useCallback(async (emoji: CustomEmoji, newCategory: string) => {
    setEmojis(prev => prev.map(em => em.id === emoji.id ? { ...em, category: newCategory } : em));
    await supabase.from('custom_emojis').update({ category: newCategory }).eq('id', emoji.id);
    toast.success(`Categoria alterada para "${CATEGORY_LABELS[newCategory]?.label || newCategory}"`);
  }, []);

  const handleDelete = useCallback(async (e: React.MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    setEmojis(prev => prev.filter(em => em.id !== emoji.id));
    const path = emoji.image_url.split('/custom-emojis/')[1];
    if (path) await supabase.storage.from('custom-emojis').remove([path]);
    await supabase.from('custom_emojis').delete().eq('id', emoji.id);
    toast.success('Emoji removido');
  }, []);

  return {
    emojis, loading, uploading, pendingUpload, fileInputRef,
    handleFileSelect, handleConfirmUpload, handleCancelUpload,
    handleSend, toggleFavorite, handleCategoryChange, handleDelete,
    setPendingUpload,
  };
}

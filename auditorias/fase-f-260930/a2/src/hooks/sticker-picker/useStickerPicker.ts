import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type StickerItem, type PendingUpload, CATEGORY_LABELS } from '@/components/inbox/stickers/StickerTypes';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';

const log = getLogger('StickerPicker');
const RECENT_LIMIT = 8;

export function useStickerPicker(onSendSticker: (url: string) => void) {
  const [open, setOpen] = useState(false);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchStickers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('stickers').select('*').order('use_count', { ascending: false }).limit(1000);
    if (!error && data) setStickers(data as StickerItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { fetchStickers(); setTimeout(() => searchInputRef.current?.focus(), 100); }
  }, [open, fetchStickers]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); setOpen(prev => !prev); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) processFile(file); }, []);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Arquivo não é uma imagem válida'); return; }
    if (file.size > 500 * 1024) { toast.error('Arquivo excede 500KB.'); return; }
    setUploading(true);
    try {
      const ext = getFileExtensionWithDefault(file.name, 'webp');
      const storagePath = `sticker_${Date.now()}_${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('stickers').upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });
      if (uploadError) { toast.error('Erro ao enviar arquivo'); return; }
      const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(storagePath);
      let aiCategory = 'enviadas';
      try {
        toast.info('🔍 Classificando figurinha com IA...');
        const { data: classifyData, error: classifyErr } = await supabase.functions.invoke('classify-sticker', { body: { image_url: urlData.publicUrl } });
        if (!classifyErr && classifyData?.category) aiCategory = classifyData.category;
      } catch (err) { log.error('Unexpected error in useStickerPicker:', err); }
      setPendingUpload({ file, imageUrl: urlData.publicUrl, storagePath, aiCategory, selectedCategory: aiCategory, name: file.name.replace(/\.[^.]+$/, '') });
    } catch { toast.error('Erro ao processar figurinha'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) processFile(file); };

  const handleConfirmUpload = async (pending: PendingUpload) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('stickers').insert({ name: pending.name, image_url: pending.imageUrl, category: pending.selectedCategory, is_favorite: false, use_count: 0, uploaded_by: user?.id || null });
    if (insertError) { log.error('[StickerPicker] Insert error:', insertError); toast.error('Erro ao salvar figurinha'); return; }
    toast.success(`✅ Figurinha "${pending.name}" salva como "${CATEGORY_LABELS[pending.selectedCategory]?.label}"!`);
    setPendingUpload(null); fetchStickers();
  };

  const handleCancelUpload = async () => { if (pendingUpload) await supabase.storage.from('stickers').remove([pendingUpload.storagePath]); setPendingUpload(null); };

  const handleSend = async (sticker: StickerItem) => {
    onSendSticker(sticker.image_url); setOpen(false);
    await supabase.from('stickers').update({ use_count: (sticker.use_count || 0) + 1 }).eq('id', sticker.id);
  };

  const toggleFavorite = async (e: React.MouseEvent, sticker: StickerItem) => {
    e.stopPropagation(); const newVal = !sticker.is_favorite;
    setStickers(prev => prev.map(s => s.id === sticker.id ? { ...s, is_favorite: newVal } : s));
    await supabase.from('stickers').update({ is_favorite: newVal }).eq('id', sticker.id);
    toast.success(newVal ? '⭐ Adicionada aos favoritos' : 'Removida dos favoritos');
  };

  const handleCategoryChange = async (sticker: StickerItem, newCategory: string) => {
    setStickers(prev => prev.map(s => s.id === sticker.id ? { ...s, category: newCategory } : s));
    await supabase.from('stickers').update({ category: newCategory }).eq('id', sticker.id);
    toast.success(`Categoria: "${CATEGORY_LABELS[newCategory]?.label || newCategory}"`);
  };

  const handleDelete = async (e: React.MouseEvent, sticker: StickerItem) => {
    e.stopPropagation(); setStickers(prev => prev.filter(s => s.id !== sticker.id));
    if (sticker.image_url.includes('/whatsapp-media/')) { const path = sticker.image_url.split('/whatsapp-media/')[1]; if (path) await supabase.storage.from('whatsapp-media').remove([path]); }
    else { const path = sticker.image_url.split('/stickers/')[1]; if (path) await supabase.storage.from('stickers').remove([path]); }
    await supabase.from('stickers').delete().eq('id', sticker.id); toast.success('Figurinha removida');
  };

  const filtered = useMemo(() => {
    let result = stickers;
    if (search) { const term = search.toLowerCase(); result = result.filter(s => s.name?.toLowerCase().includes(term) || s.category?.toLowerCase().includes(term) || CATEGORY_LABELS[s.category]?.label.toLowerCase().includes(term)); }
    if (showRecent) result = [...result].sort((a, b) => (b.use_count || 0) - (a.use_count || 0)).slice(0, RECENT_LIMIT);
    else if (showFavorites) result = result.filter(s => s.is_favorite);
    else if (activeCategory) result = result.filter(s => s.category === activeCategory);
    return result;
  }, [stickers, search, showFavorites, showRecent, activeCategory]);

  const cycleGridSize = () => setGridSize(prev => prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm');

  return {
    open, setOpen, stickers, filtered, loading, search, setSearch, uploading, activeCategory, setActiveCategory,
    showFavorites, setShowFavorites, showRecent, setShowRecent, pendingUpload, setPendingUpload,
    gridSize, isDragOver, fileInputRef, searchInputRef,
    handleDragOver, handleDragLeave, handleDrop, handleFileSelect,
    handleConfirmUpload, handleCancelUpload, handleSend, toggleFavorite, handleCategoryChange, handleDelete, cycleGridSize,
  };
}

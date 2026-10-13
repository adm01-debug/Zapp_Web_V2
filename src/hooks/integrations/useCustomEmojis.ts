import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CATEGORY_LABELS } from '@/components/inbox/emojiConstants';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';

import { getLogger } from '@/lib/logger';
const log = getLogger('useCustomEmojis');

/** Tamanho de uma página da lista. A lista era cortada em 500 sem aviso nem "carregar mais". */
export const CUSTOM_EMOJIS_PAGE_SIZE = 500;

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
  const [loadingMore, setLoadingMore] = useState(false);
  // Há mais páginas? A tela usa para mostrar "Carregar mais" e some quando acaba.
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  // A mensagem de falha do envio precisa viver no estado (não só no toast), porque
  // quem exibe a mensagem com a ação "Tentar novamente" é a tela.
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingEmojiUpload | null>(null);
  // Exclusão com confirmação: `handleDelete` marca o alvo e nada é removido antes
  // de `confirmDelete`. Antes a linha sumia da tela e do banco no primeiro clique.
  const [pendingDelete, setPendingDelete] = useState<CustomEmoji | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // R2-API-053: caminhos de Storage cuja remoção foi recusada depois de a linha já ter
  // saído. Ficam registrados como etapa pendente e a limpeza é retomada na próxima leitura.
  const pendingStorageRemovals = useRef<string[]>([]);
  // Último arquivo que passou na validação: permite repetir o envio em "Tentar novamente".
  const lastAttemptedFile = useRef<File | null>(null);
  // Trava de reentrada do "carregar mais" (a tela pode disparar dois cliques).
  const loadingMoreRef = useRef(false);

  const flushPendingStorageRemovals = useCallback(async () => {
    if (pendingStorageRemovals.current.length === 0) return;
    const paths = pendingStorageRemovals.current;
    pendingStorageRemovals.current = [];
    const { error } = await supabase.storage.from('custom-emojis').remove(paths);
    if (error) pendingStorageRemovals.current = [...paths, ...pendingStorageRemovals.current];
  }, []);

  const fetchEmojis = useCallback(async () => {
    setLoading(true);
    await flushPendingStorageRemovals();
    const { data, error } = await supabase
      .from('custom_emojis')
      .select('*')
      .order('use_count', { ascending: false })
      // Desempate determinístico: sem ele, emojis com o mesmo use_count trocam de
      // lugar entre leituras e a paginação por `.range()` repete/pula linhas.
      .order('id', { ascending: true })
      .range(0, CUSTOM_EMOJIS_PAGE_SIZE - 1);
    if (!error && data) {
      const rows = data as unknown as CustomEmoji[];
      setEmojis(rows);
      setHasMore(rows.length === CUSTOM_EMOJIS_PAGE_SIZE);
    }
    setLoading(false);
  }, [flushPendingStorageRemovals]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const from = emojis.length;
    const { data, error } = await supabase
      .from('custom_emojis')
      .select('*')
      .order('use_count', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + CUSTOM_EMOJIS_PAGE_SIZE - 1);
    if (!error && data) {
      const chunk = data as unknown as CustomEmoji[];
      setEmojis((prev) => {
        const known = new Set(prev.map((em) => em.id));
        return [...prev, ...chunk.filter((em) => !known.has(em.id))];
      });
      setHasMore(chunk.length === CUSTOM_EMOJIS_PAGE_SIZE);
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [emojis.length, hasMore]);

  useEffect(() => {
    if (open) fetchEmojis();
  }, [open, fetchEmojis]);

  const uploadFile = useCallback(async (file: File) => {
    lastAttemptedFile.current = file;
    setUploadError(null);
    setUploading(true);
    try {
      const ext = getFileExtensionWithDefault(file.name, 'png');
      const storagePath = `emoji_${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('custom-emojis')
        .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });

      if (uploadError) {
        setUploadError('Não foi possível enviar o arquivo. Tente novamente.');
        toast.error('Erro ao enviar arquivo');
        return;
      }

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
    } catch (err) {
      log.error('Unexpected error in useCustomEmojis:', err);
      setUploadError('Não foi possível processar o emoji. Tente novamente.');
      toast.error('Erro ao processar emoji');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

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

    await uploadFile(file);
  }, [uploadFile]);

  /** Repete o envio do último arquivo validado — usado pelo botão "Tentar novamente". */
  const retryUpload = useCallback(async () => {
    const file = lastAttemptedFile.current;
    if (!file) return;
    await uploadFile(file);
  }, [uploadFile]);

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
    setUploadError(null);
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
    const { error } = await supabase.from('custom_emojis').update({ is_favorite: newVal }).eq('id', emoji.id);
    if (error) {
      // O estado otimista volta ao valor persistido; nada de sucesso silencioso.
      setEmojis(prev => prev.map(em => em.id === emoji.id ? { ...em, is_favorite: emoji.is_favorite } : em));
      toast.error('Não foi possível atualizar o favorito', { description: error.message });
    }
  }, []);

  const handleCategoryChange = useCallback(async (emoji: CustomEmoji, newCategory: string) => {
    const previousCategory = emoji.category;
    setEmojis(prev => prev.map(em => em.id === emoji.id ? { ...em, category: newCategory } : em));
    const { error } = await supabase.from('custom_emojis').update({ category: newCategory }).eq('id', emoji.id);
    if (error) {
      setEmojis(prev => prev.map(em => em.id === emoji.id ? { ...em, category: previousCategory } : em));
      toast.error('Não foi possível alterar a categoria', { description: error.message });
      return;
    }
    toast.success(`Categoria alterada para "${CATEGORY_LABELS[newCategory]?.label || newCategory}"`);
  }, []);

  /** Só marca o alvo: nada é removido antes de `confirmDelete`. */
  const handleDelete = useCallback((e: React.MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    setPendingDelete(emoji);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    const emoji = pendingDelete;
    if (!emoji) return;
    const snapshot = emojis;
    setPendingDelete(null);
    setEmojis(prev => prev.filter(em => em.id !== emoji.id));

    // 1) A linha é a referência durável: sai primeiro e é ela que decide o resultado.
    const { error: deleteError } = await supabase.from('custom_emojis').delete().eq('id', emoji.id);
    if (deleteError) {
      setEmojis(snapshot);
      toast.error('Não foi possível remover o emoji', { description: deleteError.message });
      return;
    }

    // 2) O arquivo é a etapa de limpeza. Falha aqui deixa um órfão no Storage (nunca uma
    // referência quebrada) e entra na fila de retomada — sem anunciar sucesso.
    const path = emoji.image_url.split('/custom-emojis/')[1];
    if (path) {
      const { error: storageError } = await supabase.storage.from('custom-emojis').remove([path]);
      if (storageError) {
        pendingStorageRemovals.current.push(path);
        toast.warning('Emoji removido, mas o arquivo não pôde ser apagado', {
          description: 'A limpeza será tentada de novo na próxima vez que o seletor abrir.',
        });
        return;
      }
    }

    toast.success('Emoji removido');
  }, [emojis, pendingDelete]);

  return {
    emojis, loading, loadingMore, hasMore, loadMore,
    uploading, uploadError, retryUpload, pendingUpload, pendingDelete,
    fileInputRef,
    handleFileSelect, handleConfirmUpload, handleCancelUpload,
    handleSend, toggleFavorite, handleCategoryChange,
    handleDelete, confirmDelete, cancelDelete,
    setPendingUpload,
  };
}

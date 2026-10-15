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
  const [saving, setSaving] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingEmojiUpload | null>(null);
  // Ponto 1 da recusa: erro de envio visível NA TELA (não só toast). Toda falha
  // de handleFileSelect preenche uploadError; o seletor mostra com "Tentar novamente".
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Ponto 2 da recusa: paginação além de 500. Página atual (0 = primeira) e se há mais.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Trava de reentrância do Salvar: o estado só reflete no próximo render, então dois
  // cliques no mesmo tick veriam `saving === false` e criariam duas linhas.
  const savingRef = useRef(false);
  // R2-API-053: caminhos de Storage cuja remoção foi recusada depois de a linha já ter
  // saído. Ficam registrados como etapa pendente e a limpeza é retomada na próxima leitura.
  const pendingStorageRemovals = useRef<string[]>([]);

  const flushPendingStorageRemovals = useCallback(async () => {
    if (pendingStorageRemovals.current.length === 0) return;
    const paths = pendingStorageRemovals.current;
    pendingStorageRemovals.current = [];
    const { error } = await supabase.storage.from('custom-emojis').remove(paths);
    if (error) pendingStorageRemovals.current = [...paths, ...pendingStorageRemovals.current];
  }, []);

  // Tamanho da página do seletor (antes: limit(500) fixo, sem como passar disso).
  const PAGE_SIZE = 500;

  // Ordem estável: mais usados primeiro, desempate pelo id (antes só use_count,
  // então empates trocavam de posição a cada abertura).
  const buildEmojiQuery = useCallback(() => supabase
    .from('custom_emojis')
    .select('*')
    .order('use_count', { ascending: false })
    .order('id', { ascending: true }), []);

  const fetchEmojis = useCallback(async () => {
    setLoading(true);
    pageRef.current = 0;
    await flushPendingStorageRemovals();
    const { data, error } = await buildEmojiQuery().range(0, PAGE_SIZE - 1);
    if (!error && data) {
      setEmojis(data as unknown as CustomEmoji[]);
      pageRef.current = 1;
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [flushPendingStorageRemovals, buildEmojiQuery]);

  // "Carregar mais": anexa a próxima página. Trava síncrona (ref) contra toques
  // duplos; erro aqui não limpa a lista, só avisa.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const from = pageRef.current * PAGE_SIZE;
      const { data, error } = await buildEmojiQuery().range(from, from + PAGE_SIZE - 1);
      if (!error && data) {
        setEmojis(prev => [...prev, ...(data as unknown as CustomEmoji[])]);
        pageRef.current += 1;
        setHasMore(data.length === PAGE_SIZE);
      } else if (error) {
        toast.error('Não foi possível carregar mais emojis');
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [buildEmojiQuery]);

  useEffect(() => {
    if (open) fetchEmojis();
  }, [open, fetchEmojis]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Nova tentativa começa sem o erro anterior na tela.
    setUploadError(null);

    const falhar = (mensagem: string) => {
      toast.error(mensagem);
      setUploadError(mensagem);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (!file.type.startsWith('image/')) {
      falhar('Arquivo não é uma imagem válida');
      return;
    }
    if (file.size > 512 * 1024) {
      falhar('Arquivo excede 512KB');
      return;
    }

    setUploading(true);
    try {
      // Item 226: a policy de INSERT do bucket exige admin/supervisor OU a pasta do
      // PRÓPRIO usuário (`(storage.foldername(name))[1] = auth.uid()`). Subir na raiz
      // funciona só para admin — o atendente comum recebia erro de permissão.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { falhar('Sessão não identificada; entre novamente para enviar emojis'); return; }

      const ext = getFileExtensionWithDefault(file.name, 'png');
      const storagePath = `${user.id}/emoji_${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('custom-emojis')
        .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });

      if (storageError) { falhar('Erro ao enviar arquivo'); return; }

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
      falhar('Erro ao processar emoji');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleConfirmUpload = useCallback(async (pending: PendingEmojiUpload) => {
    // Duplo clique: a trava é síncrona (ref), então o segundo clique morre aqui mesmo
    // antes do primeiro `await` — uma linha só.
    if (savingRef.current) return;
    const name = pending.name.trim();
    if (!name) { toast.error('Dê um nome ao emoji'); return; }

    savingRef.current = true;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('custom_emojis').insert({
        name, image_url: pending.imageUrl,
        category: pending.selectedCategory, is_favorite: false,
        use_count: 0, uploaded_by: user?.id || null,
      });
      if (error) { toast.error('Erro ao salvar emoji'); return; }
      toast.success(`Emoji salvo como "${CATEGORY_LABELS[pending.selectedCategory]?.label || pending.selectedCategory}"!`);
      setPendingUpload(null);
      fetchEmojis();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
    // PB-35: o UPDATE direto em `use_count` atinge 0 linhas quando o emoji é de OUTRO
    // dono (a policy de UPDATE é do dono/admin) — sem erro e sem contador. A RPC
    // `increment_custom_emoji_use` (SECURITY DEFINER) grava no lugar do atendente.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova (PB-35), types.ts ainda não sincronizado
    const { error } = await (supabase as any).rpc('increment_custom_emoji_use', { p_emoji_id: emoji.id });
    if (error) toast.error('Não foi possível registrar o uso do emoji');
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

  const handleDelete = useCallback(async (e: React.MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    const snapshot = emojis;
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
  }, [emojis]);

  // Limpa o erro da tela (botão "Tentar novamente" do seletor limpa e reabre
  // a escolha do arquivo; nova tentativa bem-sucedida também limpa ao começar).
  const clearUploadError = useCallback(() => setUploadError(null), []);

  return {
    emojis, loading, uploading, saving, pendingUpload, fileInputRef,
    uploadError, clearUploadError,
    hasMore, loadingMore, loadMore,
    handleFileSelect, handleConfirmUpload, handleCancelUpload,
    handleSend, toggleFavorite, handleCategoryChange, handleDelete,
    setPendingUpload,
  };
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { SUPABASE_URL } from '@/config/supabase';
import { parseSupabaseStorageObjectUrl } from '@/lib/storage_object_reference';
import { toast } from 'sonner';
import { type StickerItem, type PendingUpload, CATEGORY_LABELS } from '@/components/inbox/stickers/StickerTypes';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';

const log = getLogger('StickerPicker');
const RECENT_LIMIT = 8;

// Origem do próprio projeto: só um locator emitido por ele pode ser objeto físico da biblioteca.
const STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;
// Único bucket cujo objeto pode ser removido junto da entrada. `whatsapp-media` guarda a mídia
// original da conversa: excluir a figurinha da biblioteca NUNCA pode apagar aquele objeto.
const DELETABLE_STICKER_BUCKETS = ['stickers'] as const;

export function useStickerPicker(onSendSticker: (url: string) => void) {
  const [open, setOpenState] = useState(false);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [pendingUpload, setPendingUploadState] = useState<PendingUpload | null>(null);
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // R2-INB-043: a imagem já está no bucket `stickers` antes de existir preview e a linha
  // só nasce no Salvar. Estes refs permitem desfazer (rollback) o upload não confirmado ao
  // fechar/desmontar o picker e invalidar uma conclusão tardia, que antes recriava o
  // preview fora do ciclo aberto deixando o objeto órfão.
  const openRef = useRef(false);
  const pendingUploadRef = useRef<PendingUpload | null>(null);
  const uploadEpochRef = useRef(0);
  const confirmingRef = useRef(false);

  const discardUnconfirmedUpload = useCallback(async (clearState: boolean) => {
    // Invalida qualquer upload em voo desta abertura: conclusão após o fechamento não
    // recria o preview e limpa o objeto que ela mesma acabou de enviar.
    uploadEpochRef.current += 1;
    // Salvar em andamento conserva o objeto e o preview — a linha está nascendo.
    if (confirmingRef.current) return;
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (clearState) setPendingUploadState(null);
    if (pending) {
      const { error } = await supabase.storage.from('stickers').remove([pending.storagePath]);
      if (error) log.error('[StickerPicker] Falha ao limpar objeto não confirmado:', error);
    }
  }, []);

  // `setPendingUpload` é exposto ao consumidor (o picker zera o preview ao fechar): mantém o
  // ref espelhado e, ao descartar, passa pelo mesmo rollback — nada de estado fora do ref.
  const setPendingUpload = useCallback((next: PendingUpload | null) => {
    if (next === null) { void discardUnconfirmedUpload(true); return; }
    pendingUploadRef.current = next;
    setPendingUploadState(next);
  }, [discardUnconfirmedUpload]);

  // Fechar o picker (clique externo, atalho Ctrl+Shift+S ou envio) desfaz o upload não
  // confirmado: o wrapper roda o rollback no MESMO gesto, antes de o preview ser descartado.
  const setOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(openRef.current) : next;
    openRef.current = value;
    setOpenState(value);
    if (!value) void discardUnconfirmedUpload(true);
  }, [discardUnconfirmedUpload]);

  // Desmontagem: remove o objeto não confirmado sem mexer em estado de componente saindo.
  useEffect(() => () => { void discardUnconfirmedUpload(false); }, [discardUnconfirmedUpload]);

  const fetchStickers = useCallback(async () => {
    setLoading(true);
    // #344 (R2-INB-051): um `select('*').limit(1000)` fixava o catálogo nas 1000 figurinhas mais
    // usadas — busca, favoritas e categorias filtravam dentro desse recorte, sem caminho até o
    // resto. A leitura percorre TODAS as páginas (`fetchAllRows`), com o `id` como desempate
    // estável da ordenação por uso; se a leitura falhar, o catálogo anterior fica de pé em vez de
    // virar uma lista menor sem aviso.
    const { rows, error, incomplete } = await fetchAllRows<StickerItem>(async (from, to) => {
      const { data, error: pageError } = await supabase
        .from('stickers')
        .select('*')
        .order('use_count', { ascending: false })
        .order('id')
        .range(from, to);
      return { data: (data as StickerItem[] | null) ?? null, error: pageError ?? null };
    });
    if (error) log.error('[StickerPicker] Falha ao carregar figurinhas:', error);
    else {
      if (incomplete) log.warn('[StickerPicker] Leitura parou no teto de páginas: catálogo carregado é uma amostra');
      setStickers(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { fetchStickers(); setTimeout(() => searchInputRef.current?.focus(), 100); }
  }, [open, fetchStickers]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); setOpen(prev => !prev); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) void processFile(file); }, []);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Arquivo não é uma imagem válida'); return; }
    if (file.size > 500 * 1024) { toast.error('Arquivo excede 500KB.'); return; }
    const epoch = ++uploadEpochRef.current;
    setUploading(true);
    try {
      const ext = getFileExtensionWithDefault(file.name, 'webp');
      const storagePath = `sticker_${Date.now()}_${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('stickers').upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });
      if (uploadError) { toast.error('Erro ao enviar arquivo'); return; }
      const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(storagePath);
      // Fechou/desmontou (ou um envio mais novo superou este) enquanto o upload estava em
      // voo: não recria o preview fora do ciclo ativo e devolve o objeto recém-enviado
      // para limpeza, em vez de deixá-lo órfão (R2-INB-043).
      if (epoch !== uploadEpochRef.current) {
        const { error } = await supabase.storage.from('stickers').remove([storagePath]);
        if (error) log.error('[StickerPicker] Falha ao limpar upload superado:', error);
        return;
      }
      let aiCategory = 'enviadas';
      try {
        toast.info('🔍 Classificando figurinha com IA...');
        const { data: classifyData, error: classifyErr } = await supabase.functions.invoke('classify-sticker', { body: { image_url: urlData.publicUrl } });
        if (!classifyErr && classifyData?.category) aiCategory = classifyData.category;
      } catch (err) { log.error('Unexpected error in useStickerPicker:', err); }
      if (epoch !== uploadEpochRef.current) {
        const { error } = await supabase.storage.from('stickers').remove([storagePath]);
        if (error) log.error('[StickerPicker] Falha ao limpar upload superado:', error);
        return;
      }
      const pending: PendingUpload = { file, imageUrl: urlData.publicUrl, storagePath, aiCategory, selectedCategory: aiCategory, name: file.name.replace(/\.[^.]+$/, '') };
      pendingUploadRef.current = pending;
      setPendingUploadState(pending);
    } catch { toast.error('Erro ao processar figurinha'); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void processFile(file); };

  const handleConfirmUpload = async (pending: PendingUpload) => {
    // Enquanto a linha nasce, um fechamento do picker NÃO pode desfazer o objeto (R2-INB-043).
    confirmingRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from('stickers').insert({ name: pending.name, image_url: pending.imageUrl, category: pending.selectedCategory, is_favorite: false, use_count: 0, uploaded_by: user?.id || null });
      if (insertError) { log.error('[StickerPicker] Insert error:', insertError); toast.error('Erro ao salvar figurinha'); return; }
      toast.success(`✅ Figurinha "${pending.name}" salva como "${CATEGORY_LABELS[pending.selectedCategory]?.label}"!`);
      pendingUploadRef.current = null;
      setPendingUploadState(null); fetchStickers();
    } finally {
      confirmingRef.current = false;
    }
  };

  const handleCancelUpload = async () => {
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    setPendingUploadState(null);
    if (pending) {
      const { error } = await supabase.storage.from('stickers').remove([pending.storagePath]);
      if (error) log.error('[StickerPicker] Falha ao remover upload cancelado:', error);
    }
  };

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
    // A linha do catálogo sempre sai; o objeto físico só sai quando o locator é reconhecidamente
    // do bucket próprio `stickers`. URL de outro bucket (whatsapp-media), de outra origem ou
    // malformada é fail-safe: preserva o objeto e apenas remove a entrada.
    const object = parseSupabaseStorageObjectUrl(sticker.image_url, DELETABLE_STICKER_BUCKETS, STORAGE_ORIGINS);
    if (object) await supabase.storage.from(object.bucket).remove([object.path]);
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

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StickerItem } from '@/components/inbox/stickers/StickerTypes';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';
import { log } from '@/lib/logger';

export function usePersonalStickers() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // R2-API-051 (item 225): a identidade NÃO pode ser pedida com `.single()` sem
  // filtro — administradores/supervisores enxergam várias linhas de `profiles`
  // pela policy, o PostgREST devolve erro de cardinalidade e a pasta do próprio
  // usuário ficava vazia. Resolve-se pelo `user_id` do usuário autenticado, com
  // `.maybeSingle()`, e o loading/erro dessa resolução é exposto ao componente.
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ['my-profile-stickers'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('Sessão não encontrada');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Perfil do usuário não encontrado');
      return data;
    },
  });

  const { data: stickers = [], isLoading } = useQuery({
    queryKey: ['personal-stickers', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase.from('stickers').select('*').eq('owner_id', profile.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as StickerItem[];
    },
    enabled: !!profile?.id,
  });

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !profile?.id) return;
    setUploading(true);
    let uploadedCount = 0;
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} não é uma imagem`); continue; }
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} excede 10MB`); continue; }
        const ext = getFileExtensionWithDefault(file.name, 'png');
        const path = `pessoal/${profile.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('stickers').upload(path, file, { contentType: file.type });
        if (uploadError) { toast.error(`Erro ao enviar ${file.name}: ${uploadError.message}`); continue; }
        const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(path);
        const stickerName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        const { error: insertError } = await supabase.from('stickers').insert({ name: stickerName, image_url: urlData.publicUrl, category: 'pessoal', owner_id: profile.id, uploaded_by: profile.id });
        if (insertError) { toast.error(`Erro ao salvar ${file.name}`); continue; }
        uploadedCount++;
      }
      if (uploadedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['personal-stickers'] });
        toast.success(`${uploadedCount} figurinha${uploadedCount > 1 ? 's' : ''} adicionada${uploadedCount > 1 ? 's' : ''}! 📸`);
      }
    } catch { toast.error('Erro inesperado ao enviar'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, [profile?.id, queryClient]);

  const toggleFavorite = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await supabase.from('stickers').update({ is_favorite: !sticker.is_favorite }).eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personal-stickers'] }),
  });

  const deleteSticker = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const url = sticker.image_url;
      const storagePrefix = '/storage/v1/object/public/stickers/';
      const idx = url.indexOf(storagePrefix);
      if (idx !== -1) { await supabase.storage.from('stickers').remove([url.substring(idx + storagePrefix.length)]); }
      const { error } = await supabase.from('stickers').delete().eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['personal-stickers'] }); toast.success('Figurinha removida'); },
  });

  // R2-API-055 (item 485): o contador de uso era escrito com o builder do PostgREST
  // DESCARTADO — `supabase.from('stickers').update(...).eq(...)` sem consumo. O builder do
  // supabase-js é THENABLE LAZY: a requisição só é despachada quando alguém consome a
  // promessa (await/then). Montar a cadeia e jogá-la fora faz a figurinha ser enviada e o
  // `use_count` NUNCA subir. Aqui a operação é CONSUMIDA e o erro é tratado:
  //  - o evento contado é o ENVIO (PersonalStickers.handleSend chama uma vez por clique);
  //  - `stickers.use_count` é nullable no banco e chega por cast — `?? 0` evita NaN;
  //  - UPDATE de 0 linhas (RLS filtrou sem erro) NÃO é sucesso e não recarrega a lista;
  //  - falha não fabrica contagem: nada é somado no cliente, o erro vai para o log.
  const incrementUseCount = useCallback(async (sticker: StickerItem) => {
    try {
      const { data, error } = await supabase
        .from('stickers')
        .update({ use_count: (sticker.use_count ?? 0) + 1 })
        .eq('id', sticker.id)
        .select('id');
      if (error) {
        log.error('[PersonalStickers] falha ao registrar o uso da figurinha:', error);
        return;
      }
      if (!data || data.length === 0) {
        log.warn('[PersonalStickers] uso não contado: nenhuma linha de stickers atualizada:', sticker.id);
        return;
      }
      // A lista recarrega com o contador novo; sem isso o próximo envio partia do valor
      // carregado (velho) e gravava o mesmo número outra vez.
      queryClient.invalidateQueries({ queryKey: ['personal-stickers'] });
    } catch (error) {
      // O envio já aconteceu: o contador é best-effort e o chamador é fire-and-forget.
      // Resolver em vez de rejeitar evita uma Promise rejeitada solta no app.
      log.error('[PersonalStickers] erro ao registrar o uso da figurinha:', error);
    }
  }, [queryClient]);

  return { profile, profileLoading, profileError, stickers, isLoading, uploading, fileInputRef, handleUpload, toggleFavorite, deleteSticker, incrementUseCount };
}

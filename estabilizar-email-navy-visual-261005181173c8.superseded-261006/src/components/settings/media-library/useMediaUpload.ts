import { useCallback, useRef, useState } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MediaType, MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB, getBucket } from './useMediaLibrary';
import { convertAudioToMp3 } from '@/utils/audioToMp3';

const log = getLogger('useMediaUpload');

export function useMediaUpload(type: MediaType, onComplete: () => void) {
  const [bulkUploading, setBulkUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bucket = getBucket(type);
  const acceptTypes = type === 'audio_memes' ? 'audio/*' : 'image/webp,image/png,image/gif,image/jpeg';

  const handleBulkUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const acceptedTypes = type === 'audio_memes'
      ? (f: File) => f.type.startsWith('audio/')
      : (f: File) => f.type.startsWith('image/');
    const validFiles = fileList.filter(acceptedTypes);
    if (validFiles.length === 0) {
      toast.error('Nenhum arquivo válido selecionado');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const oversizedFiles = validFiles.filter(f => f.size > MAX_UPLOAD_SIZE_BYTES);
    if (oversizedFiles.length > 0) {
      toast.error(`${oversizedFiles.length} arquivo(s) excedem ${MAX_UPLOAD_SIZE_MB}MB e serão ignorados`);
    }
    const sizedFiles = validFiles.filter(f => f.size <= MAX_UPLOAD_SIZE_BYTES);
    if (sizedFiles.length === 0) {
      toast.error('Nenhum arquivo com tamanho válido');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setBulkUploading(true);
    setUploadProgress(0);
    const { data: { user } } = await supabase.auth.getUser();
    let successCount = 0;

    for (let i = 0; i < sizedFiles.length; i++) {
      const file = sizedFiles[i];
      try {
        // Áudio: padroniza em MP3 antes do upload (reprodução universal).
        const converted = type === 'audio_memes' ? await convertAudioToMp3(file, file.name) : null;
        if (converted && converted.ok && converted.blob.size > MAX_UPLOAD_SIZE_BYTES) {
          log.error(`Conversão MP3 de ${file.name} excede ${MAX_UPLOAD_SIZE_MB}MB — ignorado`);
          continue;
        }
        const payload: File | Blob = converted?.ok ? converted.blob : file;
        const contentType = converted?.ok ? 'audio/mpeg' : (file.type || 'application/octet-stream');
        const ext = converted?.ok ? 'mp3' : (file.name.split('.').pop() || (type === 'audio_memes' ? 'mp3' : 'webp'));
        const storagePath = `bulk_${Date.now()}_${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket).upload(storagePath, payload, { contentType, cacheControl: '31536000' });
        if (uploadError) { log.error(`Upload error for ${file.name}:`, uploadError); continue; }
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
        const name = file.name.replace(/\.[^.]+$/, '');
        let aiCategory = 'outros';
        try {
          const fnName = type === 'audio_memes' ? 'classify-audio-meme' : type === 'stickers' ? 'classify-sticker' : 'classify-emoji';
          const body = type === 'audio_memes'
            ? { audio_url: urlData.publicUrl, file_name: file.name }
            : { image_url: urlData.publicUrl };
          const { data: classifyData } = await supabase.functions.invoke(fnName, { body });
          if (classifyData?.category) aiCategory = classifyData.category;
        } catch (err) { log.error('Unexpected error in useMediaUpload:', err); }
        const insertData: Record<string, unknown> = {
          name, category: aiCategory, is_favorite: false, use_count: 0, uploaded_by: user?.id || null,
        };
        if (type === 'audio_memes') insertData.audio_url = urlData.publicUrl;
        else insertData.image_url = urlData.publicUrl;
        const { error: insertError } = await (supabase as unknown as { from: (t: string) => { insert: (d: Record<string, unknown>) => Promise<{ error: unknown }> } }).from(type).insert(insertData);
        if (!insertError) successCount++;
      } catch (err) { log.error(`Unexpected error uploading ${file.name}:`, err); }
      setUploadProgress(Math.round(((i + 1) / sizedFiles.length) * 100));
    }

    setBulkUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast.success(`${successCount}/${sizedFiles.length} arquivos importados com classificação IA`);
    onComplete();
  }, [type, bucket, onComplete]);

  return { bulkUploading, uploadProgress, fileInputRef, acceptTypes, handleBulkUpload };
}

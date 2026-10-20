import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { validateFile, FileValidationResult } from '@/utils/whatsappFileTypes';
import { compressImage, formatCompressionInfo } from '@/utils/imageCompression';
import { sendOutboundMessage, type OutboundMessageType } from '@/services/outbound-message.service';
import {
  createStorageObjectId,
  removeStoredObjectBestEffort,
  sanitizeStorageFileName,
} from '@/lib/storage_object_upload';

interface FileMessageData {
  mediaUrl?: string;
  messageType?: string;
  [key: string]: unknown;
}

interface FilePreview {
  file: File;
  validation: FileValidationResult;
  preview?: string;
}

interface UploadedPrivateObject {
  locatorUrl: string;
  storagePath: string;
}

interface PendingMediaUpload extends UploadedPrivateObject {
  /** Id de idempotencia estavel mantido entre o envio e o retry do mesmo arquivo. */
  clientMessageId: string;
}

interface QueuedFile extends FilePreview {
  id: string;
  status: 'pending' | 'uploading' | 'sending' | 'done' | 'error';
  progress: number;
  error?: string;
}

const categoryOrder: Record<string, number> = { image: 0, video: 1, audio: 2, document: 3, sticker: 4 };
const MAX_FILES = 10;

/**
 * Reconciliacao da fila por `(contact_id, client_message_id)` — mesmo contrato de
 * `useForwardMedia`: `true` = existe linha apontando para o objeto; `false` = provado
 * ausente (objeto orfao); `null` = estado indeterminado (a consulta falhou). Somente
 * `false` autoriza remover o objeto do Storage (R2-INB-006).
 */
async function outboundRowExists(contactId: string, clientMessageId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('contact_id', contactId)
      .eq('client_message_id', clientMessageId)
      .limit(1);
    if (error) return null;
    return (data?.length ?? 0) > 0;
  } catch {
    return null;
  }
}

/**
 * Identidade do envio de um arquivo (contato + arquivo escolhido + papel na mensagem).
 * Mantem o MESMO objeto no Storage e o MESMO id logico enquanto o resultado da entrega
 * for incerto: o retry nao pode refazer o upload (URL novo mudaria a actionKey) nem criar
 * outra acao (R2-INB-006).
 */
function mediaActionKey(contactId: string, file: File, category: string | undefined): string {
  return JSON.stringify([contactId, category ?? null, file.name, file.size, file.lastModified]);
}

export type { FileMessageData, FilePreview, QueuedFile };

export function useFileUploadLogic(opts: {
  instanceName?: string;
  recipientNumber?: string;
  contactId?: string;
  connectionId?: string;
  onFileSelect?: (file: File, category: string) => void;
  onFileSent?: (messageData: FileMessageData) => void;
  /**
   * Ref do `<input type="file">` escondido, de propriedade de quem renderiza o
   * componente. Fica FORA do objeto devolvido pelo hook de proposito: um objeto de
   * retorno que carrega uma ref e tratado como ref-like pelo compilador do React e
   * qualquer leitura de propriedade dele durante o render vira `react-hooks/refs`
   * (eram 75 achados so neste arquivo, SL-202).
   */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { contactId, connectionId, onFileSelect, onFileSent, fileInputRef } = opts;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'uploading' | 'sending' | null>(null);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  // Objetos ja gravados + id logico por arquivo, ate a entrega confirmar. Sem isso o
  // retry refazia o upload (novo locator -> nova actionKey) e apagava o objeto que uma
  // linha ja enfileirada referencia (R2-INB-006).
  const pendingUploadsRef = useRef(new Map<string, PendingMediaUpload>());

  const apiLoading = false;

  const processFilesToQueue = useCallback((files: File[]): QueuedFile[] => {
    const processed = files.slice(0, MAX_FILES).map((file, index) => {
      const validation = validateFile(file);
      let preview: string | undefined;
      if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf')) {
        preview = URL.createObjectURL(file);
      }
      return { id: `${Date.now()}-${index}`, file, validation, preview, status: 'pending' as const, progress: 0 };
    });
    return processed.sort((a, b) => (categoryOrder[a.validation.category || 'document'] ?? 99) - (categoryOrder[b.validation.category || 'document'] ?? 99));
  }, []);

  const uploadFileToStorage = useCallback(async (file: File): Promise<UploadedPrivateObject> => {
    if (!contactId) throw new Error('Selecione uma conversa antes de enviar um arquivo.');

    let fileToUpload = file;
    if (file.type.startsWith('image/') && file.type !== 'image/gif') {
      try {
        const result = await compressImage(file);
        if (result.wasCompressed) {
          log.debug('Image compressed:', formatCompressionInfo(result.originalSize, result.compressedSize));
          fileToUpload = result.file;
        }
      } catch (err) { log.warn('Image compression failed:', err); }
    }
    const safeFileName = sanitizeStorageFileName(fileToUpload.name);
    // Escopado por contato: isola os arquivos de cada conversa no bucket
    // (antes era uma única pasta uploads/ compartilhada por todo mundo) e
    // torna qualquer limpeza/auditoria rastreável até o contato de origem.
    const filePath = `${contactId}/${createStorageObjectId()}-${safeFileName}`;

    const { error } = await supabase.storage.from('whatsapp-media').upload(filePath, fileToUpload, { cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`Erro ao fazer upload: ${error.message}`);

    const { data: locatorData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
    if (!locatorData?.publicUrl) {
      await removeStoredObjectBestEffort('whatsapp-media', filePath);
      throw new Error('Erro ao gerar referência durável do arquivo');
    }
    return { locatorUrl: locatorData.publicUrl, storagePath: filePath };
  }, [contactId]);

  const handleClose = useCallback(() => {
    if (filePreview?.preview) URL.revokeObjectURL(filePreview.preview);
    fileQueue.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFilePreview(null);
    setFileQueue([]);
    setIsMultiMode(false);
    setCaption('');
    setCurrentQueueIndex(0);
    setIsDialogOpen(false);
  }, [filePreview, fileQueue]);

  const sendFileViaApi = useCallback(async (file: File, category: string | undefined, cap?: string) => {
    if (!contactId) throw new Error('Selecione uma conversa antes de enviar um arquivo.');
    const actionKey = mediaActionKey(contactId, file, category);

    // Retry de resultado incerto reaproveita o objeto ja gravado e o id logico:
    // reenviar o arquivo criaria outro objeto/locator e outra acao (R2-INB-006).
    let pending = pendingUploadsRef.current.get(actionKey);
    if (!pending) {
      const uploaded = await uploadFileToStorage(file);
      pending = { ...uploaded, clientMessageId: createStorageObjectId() };
      pendingUploadsRef.current.set(actionKey, pending);
    }
    const { locatorUrl, storagePath, clientMessageId } = pending;

    const messageContent = category === 'document' ? file.name : `[${category === 'image' ? 'Imagem' : category === 'video' ? 'Vídeo' : category === 'audio' ? 'Áudio' : category === 'sticker' ? 'Sticker' : 'Arquivo'}]`;
    const messageType: OutboundMessageType = category === 'image' || category === 'video' || category === 'audio' || category === 'sticker'
      ? category
      : 'document';
    try {
      const result = await sendOutboundMessage({
        contactId, content: messageContent, messageType, mediaUrl: locatorUrl,
        caption: cap?.trim() || null, whatsappConnectionId: connectionId ?? null,
        clientMessageId,
      });
      pendingUploadsRef.current.delete(actionKey);
      return { result, mediaUrl: locatorUrl, category: messageType };
    } catch (error) {
      // `sendOutboundMessage` grava a linha ANTES de despachar: a falha depois do enqueue
      // nao prova que o objeto ficou orfao. So remove quando a reconciliacao responder
      // ZERO linhas; linha encontrada ou consulta falhando (estado indeterminado) mantem
      // o objeto e o id para o retry (R2-INB-006).
      const rowExists = await outboundRowExists(contactId, clientMessageId);
      if (rowExists === false) {
        await removeStoredObjectBestEffort('whatsapp-media', storagePath);
        pendingUploadsRef.current.delete(actionKey);
      }
      throw error;
    }
  }, [contactId, connectionId, uploadFileToStorage]);

  const handleSendFile = useCallback(async () => {
    if (!filePreview || !filePreview.validation.valid) return;
    if (!contactId) {
      onFileSelect?.(filePreview.file, filePreview.validation.category || 'document');
      handleClose();
      return;
    }
    const file = filePreview.file;
    const category = filePreview.validation.category;
    const currentCaption = caption;
    handleClose();
    toast.info('Enviando arquivo...', { id: 'file-upload', duration: 30000 });
    try {
      const sent = await sendFileViaApi(file, category, currentCaption);
      toast.success('Arquivo enviado!', { id: 'file-upload' });
      if (sent) onFileSent?.({ ...sent.result, mediaUrl: sent.mediaUrl, messageType: sent.category });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error sending file:', error);
      toast.error(error.message || 'Erro ao enviar arquivo', { id: 'file-upload' });
    }
  }, [filePreview, contactId, caption, handleClose, sendFileViaApi, onFileSelect, onFileSent]);

  const sendSingleQueueFile = useCallback(async (queuedFile: QueuedFile, index: number): Promise<boolean> => {
    if (!queuedFile.validation.valid || !contactId) return false;
    setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'uploading', progress: 0 } : f));
    try {
      const sent = await sendFileViaApi(queuedFile.file, queuedFile.validation.category, undefined);
      setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'done', progress: 100 } : f));
      if (sent) onFileSent?.({ ...sent.result, mediaUrl: sent.mediaUrl, messageType: sent.category });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      log.error('Error sending queued file:', error);
      setFileQueue(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', error: error.message } : f));
      return false;
    }
  }, [contactId, sendFileViaApi, onFileSent]);

  const handleSendAllFiles = useCallback(async () => {
    if (fileQueue.length === 0) return;
    setUploading(true);
    let successCount = 0, errorCount = 0;
    for (let i = 0; i < fileQueue.length; i++) {
      setCurrentQueueIndex(i);
      if (fileQueue[i].validation.valid) {
        const success = await sendSingleQueueFile(fileQueue[i], i);
        if (success) successCount++;
        else errorCount++;
        if (i < fileQueue.length - 1) await new Promise(r => setTimeout(r, 500));
      } else { errorCount++; }
    }
    setUploading(false);
    if (successCount > 0) toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
    if (errorCount > 0) toast.error(`${errorCount} arquivo(s) falharam ao enviar`);
    setTimeout(handleClose, 1000);
  }, [fileQueue, sendSingleQueueFile, handleClose]);

  const handleExternalFile = useCallback((file: File) => {
    const validation = validateFile(file);
    let preview: string | undefined;
    if (validation.valid && (validation.category === 'image' || file.type === 'application/pdf')) preview = URL.createObjectURL(file);
    setFilePreview({ file, validation, preview });
    setIsMultiMode(false);
    setFileQueue([]);
    setCaption('');
    setIsDialogOpen(true);
  }, []);

  const handleExternalFiles = useCallback((files: File[]) => {
    if (files.length > MAX_FILES) toast.warning(`Limite de ${MAX_FILES} arquivos por vez.`);
    if (files.length === 1) {
      handleExternalFile(files[0]);
    } else {
      setFileQueue(processFilesToQueue(files));
      setIsMultiMode(true);
      setFilePreview(null);
    }
    setCaption('');
    setCurrentQueueIndex(0);
    setIsDialogOpen(true);
  }, [handleExternalFile, processFilesToQueue]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // O input nativo e `multiple`: aproveita TODOS os arquivos escolhidos pelo mesmo
    // pipeline do drag/paste/chip (`handleExternalFiles`). Antes so `files[0]` entrava
    // no preview/envio e o resto era descartado em silencio (R2-INB-011).
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0) return;
    handleExternalFiles(files);
  }, [handleExternalFiles, fileInputRef]);

  const removeFromQueue = useCallback((id: string) => {
    setFileQueue(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  const canSend = !!contactId;
  const validFilesCount = fileQueue.filter(f => f.validation.valid).length;
  const totalQueueProgress = fileQueue.length > 0 ? Math.round(fileQueue.reduce((acc, f) => acc + f.progress, 0) / fileQueue.length) : 0;

  return {
    isDialogOpen, filePreview, fileQueue, isMultiMode, caption, setCaption,
    uploading, uploadProgress, uploadStage, currentQueueIndex,
    apiLoading, canSend, validFilesCount, totalQueueProgress,
    handleClose, handleSendFile, handleSendAllFiles, handleFileChange,
    handleExternalFile, handleExternalFiles, removeFromQueue,
  };
}

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Paperclip, Image as ImageIcon, FileVideo, FileAudio, FileText,
  X, Upload, AlertCircle, Check, Send,
} from 'lucide-react';
import { getFileInputAccept, formatFileSize, WHATSAPP_FILE_TYPES } from '@/utils/whatsappFileTypes';
import { useFileUploadLogic, type QueuedFile } from './useFileUploadLogic';

interface FileMessageData {
  mediaUrl?: string;
  messageType?: string;
  [key: string]: unknown;
}

interface FileUploaderProps {
  instanceName?: string;
  recipientNumber?: string;
  contactId?: string;
  connectionId?: string;
  onFileSelect?: (file: File, category: string) => void;
  onFileSent?: (messageData: FileMessageData) => void;
  disabled?: boolean;
}

export interface FileUploaderRef {
  handleExternalFile: (file: File) => void;
  handleExternalFiles: (files: File[]) => void;
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'image': return <ImageIcon className="w-5 h-5" />;
    case 'video': return <FileVideo className="w-5 h-5" />;
    case 'audio': return <FileAudio className="w-5 h-5" />;
    default: return <FileText className="w-5 h-5" />;
  }
}

function QueueFileItem({ queuedFile, onRemove, disabled }: { queuedFile: QueuedFile; onRemove: () => void; disabled: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={cn(
        "relative border rounded-lg p-3 bg-muted/30",
        queuedFile.status === 'done' && "border-success/50 bg-success/10",
        queuedFile.status === 'error' && "border-destructive/50 bg-destructive/10",
        !queuedFile.validation.valid && "border-destructive/50 bg-destructive/10"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {queuedFile.preview ? (
            <img src={queuedFile.preview} alt="Preview" className="w-12 h-12 object-cover rounded"  loading="lazy" decoding="async"/>
          ) : (
            <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center text-primary">
              {getCategoryIcon(queuedFile.validation.category || 'document')}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{queuedFile.file.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{formatFileSize(queuedFile.file.size)}</span>
            {queuedFile.validation.valid ? (
              <Badge variant="outline" className="text-3xs py-0 h-5 bg-success/10 text-success border-success/20">{queuedFile.validation.category}</Badge>
            ) : (
              <Badge variant="destructive" className="text-3xs py-0 h-5">Inválido</Badge>
            )}
            {queuedFile.status === 'uploading' && <Badge variant="secondary" className="text-3xs py-0 h-5">Enviando...</Badge>}
            {queuedFile.status === 'done' && <Badge variant="outline" className="text-3xs py-0 h-5 bg-success/10 text-success border-success/20"><Check className="w-3 h-3 mr-1" />Enviado</Badge>}
            {queuedFile.status === 'error' && <Badge variant="destructive" className="text-3xs py-0 h-5"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>}
          </div>
          {(queuedFile.status === 'uploading' || queuedFile.status === 'sending') && <Progress value={queuedFile.progress} className="h-1 mt-2" />}
        </div>
        <Button variant="ghost" size="icon" className="flex-shrink-0 h-7 w-7" onClick={onRemove} disabled={disabled}><X className="w-3 h-3" /></Button>
      </div>
    </motion.div>
  );
}

export const FileUploader = forwardRef<FileUploaderRef, FileUploaderProps>(({
  instanceName, recipientNumber, contactId, connectionId, onFileSelect, onFileSent, disabled,
}, ref) => {
  // O `<input type="file">` escondido e a ref que o abre pertencem ao COMPONENTE: o hook
  // recebe a ref e a usa nos handlers, mas nao a devolve. Devolver a ref no objeto do
  // hook fazia o compilador do React tratar TODO o resultado como ref-like e marcar cada
  // leitura de propriedade do hook no render como `react-hooks/refs` (75 achados, SL-202).
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isDialogOpen, filePreview, fileQueue, isMultiMode, caption, setCaption,
    uploading, uploadProgress, uploadStage, currentQueueIndex,
    apiLoading, canSend, validFilesCount, totalQueueProgress,
    handleClose, handleSendFile, handleSendAllFiles, handleFileChange,
    handleExternalFile, handleExternalFiles, removeFromQueue,
  } = useFileUploadLogic({ instanceName, recipientNumber, contactId, connectionId, onFileSelect, onFileSent, fileInputRef });

  useImperativeHandle(ref, () => ({
    handleExternalFile,
    handleExternalFiles,
  }));

  return (
    <>
      <input ref={fileInputRef} type="file" accept={getFileInputAccept()} onChange={handleFileChange} className="hidden" disabled={disabled || uploading} multiple />

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => fileInputRef.current?.click()} disabled={disabled || uploading} aria-label="Anexar arquivo">
              <Paperclip className="w-5 h-5" />
            </Button>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top">Anexar arquivo</TooltipContent>
      </Tooltip>

      <Dialog open={isDialogOpen} onOpenChange={handleClose}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              {isMultiMode ? `Enviar ${fileQueue.length} Arquivos` : 'Enviar Arquivo'}
            </DialogTitle>
            <DialogDescription>
              {isMultiMode ? `${validFilesCount} de ${fileQueue.length} arquivos válidos` : 'Formatos suportados: imagens, vídeos, áudios e documentos'}
            </DialogDescription>
          </DialogHeader>

          {isMultiMode && fileQueue.length > 0 && (
            <div className="flex-1 overflow-y-auto space-y-3 py-2 max-h-[40vh]">
              {fileQueue.map((qf) => (
                <QueueFileItem key={qf.id} queuedFile={qf} onRemove={() => removeFromQueue(qf.id)} disabled={uploading} />
              ))}
            </div>
          )}

          {!isMultiMode && filePreview && (
            <div className="space-y-4">
              {filePreview.preview && filePreview.file.type === 'application/pdf' && (
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <iframe src={`${filePreview.preview}#toolbar=0&navpanes=0`} className="w-full h-[280px] border-0" title="PDF Preview" />
                </div>
              )}
              <div className="relative border rounded-lg p-4 bg-muted/50">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {filePreview.preview && filePreview.file.type !== 'application/pdf' ? (
                      <img src={filePreview.preview} alt="Preview" className="w-20 h-20 object-cover rounded-lg"  loading="lazy" decoding="async"/>
                    ) : (
                      <div className="w-20 h-20 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                        {getCategoryIcon(filePreview.validation.category || 'document')}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{filePreview.file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatFileSize(filePreview.file.size)}</p>
                    {filePreview.validation.valid ? (
                      <Badge variant="outline" className="mt-2 text-xs bg-success/10 text-success border-success/20"><Check className="w-3 h-3 mr-1" />{filePreview.validation.category}</Badge>
                    ) : (
                      <Badge variant="destructive" className="mt-2 text-xs"><AlertCircle className="w-3 h-3 mr-1" />Inválido</Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={handleClose} disabled={uploading}><X className="w-4 h-4" /></Button>
                </div>
                {!filePreview.validation.valid && (
                  <div className="mt-3 p-3 bg-destructive/10 rounded-lg">
                    <p className="text-sm text-destructive flex items-start gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{filePreview.validation.error}</p>
                  </div>
                )}
              </div>
              {filePreview.validation.valid && ['image', 'video', 'document'].includes(filePreview.validation.category || '') && (
                <div className="space-y-2">
                  <Label htmlFor="caption">Legenda (opcional)</Label>
                  <Input id="caption" placeholder="Adicione uma legenda..." value={caption} onChange={(e) => setCaption(e.target.value)} disabled={uploading} />
                </div>
              )}
              <AnimatePresence>
                {uploading && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      {uploadStage === 'uploading' ? `Fazendo upload... ${uploadProgress}%` : `Enviando via WhatsApp... ${uploadProgress}%`}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            <p className="font-medium mb-2">Limites de tamanho do WhatsApp:</p>
            <ul className="space-y-1">
              <li>• Imagens: até {WHATSAPP_FILE_TYPES.image.maxSizeMB}MB (JPG, PNG, WebP)</li>
              <li>• Vídeos: até {WHATSAPP_FILE_TYPES.video.maxSizeMB}MB (MP4, 3GP)</li>
              <li>• Áudios: até {WHATSAPP_FILE_TYPES.audio.maxSizeMB}MB (AAC, MP3, OGG, OPUS)</li>
              <li>• Documentos: até {WHATSAPP_FILE_TYPES.document.maxSizeMB}MB (PDF, DOC, XLS, etc)</li>
            </ul>
          </div>

          {!canSend && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <p className="text-sm text-warning flex items-center gap-2"><AlertCircle className="w-4 h-4" />Selecione uma conversa para enviar o arquivo via WhatsApp</p>
            </div>
          )}

          {isMultiMode && uploading && (
            <div className="space-y-2">
              <Progress value={totalQueueProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Enviando arquivo {currentQueueIndex + 1} de {fileQueue.length}...</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancelar</Button>
            <Button
              onClick={isMultiMode ? handleSendAllFiles : handleSendFile}
              disabled={(isMultiMode ? validFilesCount === 0 : !filePreview?.validation.valid) || uploading || apiLoading}
              className="bg-whatsapp hover:bg-whatsapp-dark"
            >
              {uploading ? 'Enviando...' : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {isMultiMode ? `Enviar ${validFilesCount} arquivo${validFilesCount !== 1 ? 's' : ''}` : canSend ? 'Enviar' : 'Selecionar'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

FileUploader.displayName = 'FileUploader';

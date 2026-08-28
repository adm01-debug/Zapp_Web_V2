import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { getFileExtensionWithDefault } from '@/utils/fileExtensions';

const log = getLogger('TeamFileUploader');
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Paperclip, Image as ImageIcon, FileText, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TeamFileUploaderProps {
  conversationId: string;
  onFileSent: (mediaUrl: string, mediaType: string, fileName: string) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPT_TYPES = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

function getMediaType(file: File): string {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function TeamFileUploader({ conversationId, onFileSent, disabled }: TeamFileUploaderProps) {
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    if (file.size === 0) {
      toast.error('Arquivo vazio não pode ser enviado.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview({ file, url });

    // Reset input
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleUpload = useCallback(async () => {
    if (!preview || !profile || uploading) return;

    setUploading(true);
    try {
      const { file } = preview;
      const ext = getFileExtensionWithDefault(file.name, 'bin');
      const path = `${profile.id}/${conversationId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('team-chat-files')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('team-chat-files')
        .getPublicUrl(path);

      const mediaType = getMediaType(file);
      onFileSent(urlData.publicUrl, mediaType, file.name);
      
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    } catch (err) {
      log.error('Upload error:', err);
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }, [preview, profile, conversationId, onFileSent, uploading]);

  const handleCancel = useCallback(() => {
    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
  }, [preview]);

  // Close preview on Escape key
  useEffect(() => {
    if (!preview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) handleCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [preview, uploading, handleCancel]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_TYPES}
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Selecionar arquivo para enviar"
      />
      
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Enviar arquivo"
      >
        <Paperclip className="w-4 h-4" />
      </Button>

      {/* Preview overlay */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card rounded-xl p-4 max-w-sm w-full mx-4 space-y-3 shadow-xl border border-border" role="dialog" aria-label="Preview do arquivo">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Enviar arquivo</h4>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancel}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="rounded-lg overflow-hidden bg-muted/30 border border-border/30">
              {preview.file.type.startsWith('image/') ? (
                <img src={preview.url} alt="Preview" className="max-h-48 w-full object-contain"  loading="lazy" decoding="async"/>
              ) : (
                <div className="flex items-center gap-3 p-4">
                  {preview.file.type.startsWith('video/') ? (
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  ) : (
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{preview.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(preview.file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={uploading}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleUpload} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

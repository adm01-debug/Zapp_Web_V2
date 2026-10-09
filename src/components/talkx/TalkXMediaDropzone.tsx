import React, { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Link2, Loader2, Music, Upload, Video, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  TALKX_MEDIA_ACCEPT,
  mediaDisplayLine,
  mediaTypeFromFileName,
  talkxMediaObjectPathFromUrl,
  useTalkXMediaUpload,
  validateTalkxMediaFile,
  type TalkxMediaType,
  type TalkxMediaValue,
} from './useTalkXMediaUpload';

/**
 * X095 (V4) — envio de arquivo do template do Talk X no lugar do campo de URL.
 *
 * Componente CONTROLADO (`value`/`onChange`): quem grava é o editor de template.
 * A validação (16 MB e a lista de tipos de CAP-059), a leitura das dimensões e o
 * envio ao bucket `talkx-media` saem daqui pelo MESMO módulo
 * (`useTalkXMediaUpload`) que o wizard (X129) usa.
 *
 * Enquanto o bucket e as colunas de metadados não existem no banco (X061/X083),
 * o componente ainda não está montado em nenhuma tela: o valor que sai daqui é
 * exatamente o que o editor vai persistir quando a trilha de banco fechar.
 *
 * "Usar link" é a alternativa secundária para os templates antigos que já
 * guardam uma URL `https://`.
 */

const ZONE =
  'w-full flex flex-col items-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-2xs text-foreground-secondary hover:text-foreground hover:border-primary/40 motion-safe:transition-colors';
const ICON_BUTTON =
  'h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:text-destructive motion-safe:transition-colors';

function MediaTypeIcon({ type }: { type: TalkxMediaType | null }) {
  const Icon = type === 'image' ? ImageIcon : type === 'video' ? Video : type === 'audio' ? Music : FileText;
  return <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
}

export interface TalkXMediaDropzoneProps {
  /** Mídia atual do template; `null` = sem mídia. */
  value: TalkxMediaValue | null;
  onChange: (value: TalkxMediaValue | null) => void;
  disabled?: boolean;
  className?: string;
}

export function TalkXMediaDropzone({ value, onChange, disabled = false, className }: TalkXMediaDropzoneProps) {
  const { upload, remove } = useTalkXMediaUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  // Id do envio em curso: um resultado que chega com id antigo é de um envio
  // cancelado ou substituído e não pode tocar no estado nem virar mídia.
  const uploadIdRef = useRef(0);
  const cancelledUploadsRef = useRef(new Set<number>());
  // Caminhos enviados ao bucket NESTA sessão do componente: só eles podem ser
  // apagados na hora. Um valor inicial/persistido nunca entra aqui — remover
  // antes de o editor salvar destruiria a mídia já gravada.
  const sessionObjectsRef = useRef(new Set<string>());

  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [useLink, setUseLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  /** Apaga do bucket só um objeto enviado nesta sessão; valor persistido fica intacto. */
  async function removeIfSessionObject(target: TalkxMediaValue) {
    const objectPath = talkxMediaObjectPathFromUrl(target.media_url);
    if (!objectPath || !sessionObjectsRef.current.has(objectPath)) return;
    sessionObjectsRef.current.delete(objectPath);
    await remove(target);
  }

  /** Recusa tipo/tamanho ANTES do Storage; arquivo aceito vira um objeto no bucket. */
  async function handleFile(file: File) {
    const check = validateTalkxMediaFile(file);
    if (!check.ok) {
      setError(check.error ?? 'Arquivo não aceito.');
      return;
    }
    setError(null);
    const uploadId = ++uploadIdRef.current;
    setUploading(true);
    setUploadName(file.name);
    try {
      const next = await upload(file);
      if (uploadId !== uploadIdRef.current || cancelledUploadsRef.current.has(uploadId)) {
        // Envio cancelado ou substituído: o objeto que chegou é apagado como
        // limpeza deste envio e não vira mídia nem mexe no estado do envio novo.
        cancelledUploadsRef.current.delete(uploadId);
        await remove(next);
        if (uploadId === uploadIdRef.current) setError('Envio cancelado.');
        return;
      }
      const objectPath = talkxMediaObjectPathFromUrl(next.media_url);
      if (objectPath) sessionObjectsRef.current.add(objectPath);
      const previous = value;
      onChange(next);
      if (previous) await removeIfSessionObject(previous);
    } catch (uploadError) {
      if (uploadId === uploadIdRef.current) {
        setError(uploadError instanceof Error ? uploadError.message : 'Falha ao enviar o arquivo. Tente novamente.');
      }
    } finally {
      if (uploadId === uploadIdRef.current) {
        setUploading(false);
        setUploadName('');
      }
    }
  }

  function cancelUpload() {
    cancelledUploadsRef.current.add(uploadIdRef.current);
    setUploading(false);
  }

  /** Zera os 6 campos; apaga do bucket só o que esta sessão enviou. */
  function clearValue() {
    const previous = value;
    onChange(null);
    setError(null);
    if (previous) void removeIfSessionObject(previous);
  }

  function toggleLink() {
    const next = !useLink;
    setUseLink(next);
    if (next) {
      setLinkUrl(value && !talkxMediaObjectPathFromUrl(value.media_url) ? value.media_url : '');
      if (value) {
        onChange(null);
        void removeIfSessionObject(value);
      }
    } else {
      setLinkUrl('');
      if (value) onChange(null);
    }
  }

  function applyLink(url: string) {
    setLinkUrl(url);
    const trimmed = url.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    onChange({
      media_url: trimmed,
      media_type: mediaTypeFromFileName(trimmed),
      media_file_name: null,
      media_size_bytes: null,
      media_width: null,
      media_height: null,
    });
  }

  const showZone = !value && !uploading && !useLink;

  return (
    <section className={cn('space-y-2', disabled && 'opacity-60', className)} data-testid="talkx-media-dropzone">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-foreground-secondary">Mídia (opcional)</Label>
        <button
          type="button"
          onClick={toggleLink}
          disabled={disabled || uploading}
          aria-pressed={useLink}
          data-testid="talkx-media-link-toggle"
          className="flex h-7 items-center gap-1 rounded-md border border-border/70 px-2 text-2xs font-medium text-muted-foreground hover:border-primary/40 disabled:opacity-50 motion-safe:transition-colors"
        >
          <Link2 className="h-3 w-3" aria-hidden /> Usar link
        </button>
      </div>

      {showZone && (
        <div
          data-testid="talkx-media-zone"
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer?.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn('rounded-xl border border-dashed p-0', dragOver ? 'border-primary/60 bg-primary/5' : 'border-transparent')}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            data-testid="talkx-media-input"
            accept={TALKX_MEDIA_ACCEPT}
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className={ZONE}>
            <Upload className="h-5 w-5" aria-hidden />
            Adicionar mídia — Imagem, vídeo ou documento (até 16MB)
          </button>
        </div>
      )}

      {uploading && (
        <div
          role="status"
          data-testid="talkx-media-status"
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-foreground-secondary"
        >
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Enviando {uploadName}…</span>
          <button
            type="button"
            onClick={cancelUpload}
            data-testid="talkx-media-cancel"
            className="h-6 rounded border border-border/70 px-2 text-2xs hover:border-primary/40 motion-safe:transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {!uploading && value && (
        <div
          data-testid="talkx-media-file"
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
        >
          <MediaTypeIcon type={value.media_type} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-foreground">{value.media_file_name ?? value.media_url}</p>
            <p className="text-2xs text-muted-foreground tabular-nums">{mediaDisplayLine(value) || '—'}</p>
          </div>
          <button
            type="button"
            onClick={clearValue}
            disabled={disabled}
            aria-label="Remover mídia"
            data-testid="talkx-media-remove"
            className={ICON_BUTTON}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {useLink && (
        <Input
          data-testid="talkx-media-link-input"
          value={linkUrl}
          disabled={disabled}
          placeholder="https://…/catalogo.pdf"
          onChange={(event) => applyLink(event.target.value)}
          className="h-9 bg-input/40 border-border/70 text-xs"
        />
      )}

      {!uploading && value?.media_type === 'audio' && (
        <p role="status" data-testid="talkx-media-audio-warning" className="text-2xs text-warning">
          O texto da mensagem não é enviado junto com o áudio.
        </p>
      )}

      {error && (
        <p role="alert" data-testid="talkx-media-error" className="text-2xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

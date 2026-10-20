import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Megaphone, Loader2 } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';

export type TargetType = 'all' | 'tag' | 'queue' | 'groups' | 'custom';
export type MessageType = 'text' | 'image' | 'video' | 'document';

/**
 * R2-MOD-005 — imagem, vídeo e documento só fazem sentido com a mídia anexada;
 * sem a URL a campanha ficava "pronta" descrevendo uma mensagem que não existe.
 */
const MEDIA_MESSAGE_TYPES: MessageType[] = ['image', 'video', 'document'];

/** R2-MOD-005 — cada público exige o dado que o especifica. */
const TARGET_FIELD: Record<Exclude<TargetType, 'all'>, { label: string; placeholder: string }> = {
  tag: { label: 'Etiqueta', placeholder: 'Ex: vip' },
  queue: { label: 'Fila', placeholder: 'Ex: comercial' },
  groups: { label: 'Grupo do WhatsApp', placeholder: 'Ex: promocoes-2026' },
  custom: { label: 'IDs dos contatos', placeholder: 'Ex: 3f2a1c..., 9c1b4d...' },
};

function requiresMedia(messageType: MessageType): boolean {
  return MEDIA_MESSAGE_TYPES.includes(messageType);
}

function requiresTargetValue(targetType: TargetType): boolean {
  return targetType !== 'all';
}

/**
 * R2-MOD-005 — materializa (no payload) a seleção feita no formulário: sem
 * isso a campanha era gravada com o tipo de público escolhido e sem nada que o
 * identificasse, e o consumidor não tinha como montar a audiência.
 */
function buildTargetFilter(targetType: TargetType, rawValue: string): Record<string, unknown> | null {
  const value = rawValue.trim();
  if (!requiresTargetValue(targetType) || value === '') return null;
  if (targetType === 'custom') {
    const contactIds = value.split(',').map(part => part.trim()).filter(Boolean);
    return contactIds.length > 0 ? { contact_ids: contactIds } : null;
  }
  if (targetType === 'queue') return { queue: value };
  if (targetType === 'groups') return { group: value };
  return { tag: value };
}

interface FormData {
  name: string;
  description: string;
  message_content: string;
  message_type: MessageType;
  media_url: string;
  target_type: TargetType;
  target_value: string;
  send_interval_seconds: number;
}

const INITIAL_FORM: FormData = {
  name: '', description: '', message_content: '', message_type: 'text', media_url: '',
  target_type: 'all', target_value: '', send_interval_seconds: 5,
};

interface CampaignCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createCampaign: UseMutationResult<any, Error, any, unknown>;
}

export function CampaignCreateDialog({ open, onOpenChange, createCampaign }: CampaignCreateDialogProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);

  const needsMedia = requiresMedia(form.message_type);
  const needsTargetValue = requiresTargetValue(form.target_type);
  const missingMedia = needsMedia && form.media_url.trim() === '';
  const missingTargetValue = needsTargetValue && form.target_value.trim() === '';
  const canSubmit = form.name.trim() !== '' && form.message_content.trim() !== ''
    && !missingMedia && !missingTargetValue && !createCampaign.isPending;

  const handleCreate = useCallback(() => {
    if (missingMedia || missingTargetValue) return;
    const payload = {
      name: form.name,
      description: form.description,
      message_content: form.message_content,
      message_type: form.message_type,
      send_interval_seconds: form.send_interval_seconds,
      media_url: needsMedia ? form.media_url.trim() : null,
      target_filter: needsTargetValue ? buildTargetFilter(form.target_type, form.target_value) : null,
      target_type: form.target_type,
    };
    createCampaign.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        setForm(INITIAL_FORM);
      },
    });
  }, [form, needsMedia, needsTargetValue, missingMedia, missingTargetValue, createCampaign, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Nova Campanha
          </DialogTitle>
          <DialogDescription>Configure sua campanha de broadcast</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="campaign-name">Nome da campanha</Label>
            <Input id="campaign-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Black Friday 2024" />
          </div>
          <div>
            <Label htmlFor="campaign-description">Descrição</Label>
            <Input id="campaign-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Breve descrição..." />
          </div>
          <div>
            <Label htmlFor="campaign-message">Mensagem</Label>
            <Textarea id="campaign-message" value={form.message_content} onChange={e => setForm(f => ({ ...f, message_content: e.target.value }))}
              placeholder="Conteúdo da mensagem..." rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de mensagem</Label>
              <Select value={form.message_type} onValueChange={(v: string) => setForm(f => ({ ...f, message_type: v as MessageType }))}>
                <SelectTrigger aria-label="Tipo de mensagem"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Público-alvo</Label>
              <Select value={form.target_type} onValueChange={(v: string) => setForm(f => ({ ...f, target_type: v as TargetType, target_value: '' }))}>
                <SelectTrigger aria-label="Público-alvo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os contatos</SelectItem>
                  <SelectItem value="tag">Por etiqueta</SelectItem>
                  <SelectItem value="queue">Por fila</SelectItem>
                  <SelectItem value="groups">Grupos WhatsApp</SelectItem>
                  <SelectItem value="custom">Seleção manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsMedia && (
            <div>
              <Label htmlFor="campaign-media-url">URL da mídia</Label>
              <Input id="campaign-media-url" type="url" aria-required="true" value={form.media_url}
                onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
                placeholder="https://..." />
              {missingMedia && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  Informe a URL da mídia: mensagem de imagem, vídeo ou documento não é criada sem ela.
                </p>
              )}
            </div>
          )}

          {needsTargetValue && (
            <div>
              <Label htmlFor="campaign-target-value">{TARGET_FIELD[form.target_type as Exclude<TargetType, 'all'>].label}</Label>
              <Input id="campaign-target-value" aria-required="true" value={form.target_value}
                onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                placeholder={TARGET_FIELD[form.target_type as Exclude<TargetType, 'all'>].placeholder} />
              {missingTargetValue && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  Informe {TARGET_FIELD[form.target_type as Exclude<TargetType, 'all'>].label.toLowerCase()}: a campanha não é criada com o público escolhido e sem ele.
                </p>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="campaign-interval">Intervalo entre envios (segundos)</Label>
            <Input id="campaign-interval" type="number" value={form.send_interval_seconds}
              onChange={e => setForm(f => ({ ...f, send_interval_seconds: Number(e.target.value) }))}
              min={1} max={60} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {createCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

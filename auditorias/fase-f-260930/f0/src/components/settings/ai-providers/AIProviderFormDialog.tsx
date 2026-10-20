import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderFormData, ProviderType } from './types';
import { USE_FOR_OPTIONS } from './types';

interface AIProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProviderFormData;
  setForm: React.Dispatch<React.SetStateAction<ProviderFormData>>;
  editingId: string | null;
  isPending: boolean;
  onSave: () => void;
  toggleUseFor: (val: string) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {message}
    </p>
  );
}

function isValidUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function AIProviderFormDialog({
  open, onOpenChange, form, setForm, editingId, isPending, onSave, toggleUseFor,
}: AIProviderFormDialogProps) {
  const { errors, isValid } = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Nome é obrigatório.';
    if (form.provider_type !== 'lovable_ai') {
      if (!form.api_endpoint?.trim()) {
        errs.api_endpoint = 'Endpoint é obrigatório para provedores externos.';
      } else if (!isValidUrl(form.api_endpoint)) {
        errs.api_endpoint = 'URL inválida. Use o formato https://...';
      }
    }
    if (form.use_for.length === 0) errs.use_for = 'Selecione ao menos uma funcionalidade.';
    return { errors: errs, isValid: Object.keys(errs).length === 0 };
  }, [form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Provedor' : 'Novo Provedor de IA'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Gemini Pro, Agente de Vendas"
              className={cn('rounded-xl', errors.name && 'border-destructive focus-visible:ring-destructive')}
            />
            <FieldError message={errors.name} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={form.description || ''}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Descrição breve do provedor"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de Provedor *</Label>
            <Select
              value={form.provider_type}
              onValueChange={v => setForm(p => ({ ...p, provider_type: v as ProviderType }))}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lovable_ai">Lovable AI (Integrado)</SelectItem>
                <SelectItem value="openai_compatible">API OpenAI Compatível</SelectItem>
                <SelectItem value="google_gemini">Google Gemini</SelectItem>
                <SelectItem value="custom_webhook">Webhook Customizado</SelectItem>
                <SelectItem value="custom_agent">Agente IA Externo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.provider_type !== 'lovable_ai' && (
            <>
              <div className="space-y-1.5">
                <Label>Endpoint da API *</Label>
                <Input
                  value={form.api_endpoint || ''}
                  onChange={e => setForm(p => ({ ...p, api_endpoint: e.target.value }))}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className={cn('rounded-xl', errors.api_endpoint && 'border-destructive focus-visible:ring-destructive')}
                />
                <FieldError message={errors.api_endpoint} />
                {!errors.api_endpoint && (
                  <p className="text-xs text-muted-foreground">
                    URL completa do endpoint de chat/completions da API.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Nome do Secret da API Key</Label>
                <Input
                  value={form.api_key_secret_name || ''}
                  onChange={e => setForm(p => ({ ...p, api_key_secret_name: e.target.value }))}
                  placeholder="OPENAI_API_KEY"
                  className="rounded-xl font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Nome do secret configurado no backend. A chave será lida automaticamente.
                </p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Input
              value={form.model || ''}
              onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
              placeholder={form.provider_type === 'lovable_ai' ? 'google/gemini-3-flash-preview' : 'gpt-4o'}
              className="rounded-xl font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Prompt de Sistema</Label>
            <Textarea
              value={form.system_prompt || ''}
              onChange={e => setForm(p => ({ ...p, system_prompt: e.target.value }))}
              placeholder="Instruções personalizadas para o modelo..."
              rows={3}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Será adicionado como prefixo ao prompt de sistema de cada funcionalidade.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Usar para *</Label>
            <div className="flex flex-wrap gap-3">
              {USE_FOR_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.use_for.includes(opt.value)}
                    onCheckedChange={() => toggleUseFor(opt.value)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            <FieldError message={errors.use_for} />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))}
              />
              <span className="text-sm">Ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={form.is_default}
                onCheckedChange={v => setForm(p => ({ ...p, is_default: v }))}
              />
              <span className="text-sm">Provedor Padrão</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={!isValid || isPending}
            className="rounded-xl"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {editingId ? 'Salvar' : 'Criar Provedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

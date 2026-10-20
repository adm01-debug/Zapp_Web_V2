import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

// ─── Settings Tab ──────────────────────────────────────────

interface SettingsItem {
  key: string;
  label: string;
  desc: string;
}

interface SettingsTabProps {
  settingsData: Record<string, boolean | string>;
  settingsItems: readonly SettingsItem[];
  onChange: (key: string, value: boolean | string) => void;
  onSave: () => void;
  isLoading: boolean;
}

export function SettingsTabContent({ settingsData, settingsItems, onChange, onSave, isLoading }: SettingsTabProps) {
  return (
    <div className="space-y-4 mt-4">
      {settingsItems.map(({ key, label, desc }) => (
        <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border/20 hover:bg-muted/10 transition-colors">
          <div><Label className="text-sm font-medium">{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
          <Switch checked={settingsData[key] as boolean} onCheckedChange={(checked) => onChange(key, checked)} />
        </div>
      ))}
      {settingsData.rejectCall && (
        <div className="p-3 rounded-lg border border-border/20">
          <Label>Mensagem ao rejeitar</Label>
          <Input value={settingsData.msgCall as string} onChange={(e) => onChange('msgCall', e.target.value)} placeholder="Não posso atender. Envie mensagem." className="mt-1" />
        </div>
      )}
      <Button onClick={onSave} disabled={isLoading} className="w-full">
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar Configurações
      </Button>
    </div>
  );
}

// ─── Privacy Tab ──────────────────────────────────────────

interface PrivacyItem { key: string; label: string; }
interface PrivacyOption { value: string; label: string; }

interface PrivacyTabProps {
  privacy: Record<string, string>;
  privacyItems: readonly PrivacyItem[];
  privacyOptions: PrivacyOption[];
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  isLoading: boolean;
}

export function PrivacyTabContent({ privacy, privacyItems, privacyOptions, onChange, onSave, isLoading }: PrivacyTabProps) {
  return (
    <div className="space-y-4 mt-4">
      {privacyItems.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border/20">
          <Label className="text-sm">{label}</Label>
          <select value={privacy[key]} onChange={(e) => onChange(key, e.target.value)} className="text-sm bg-background border border-border rounded-md px-2 py-1">
            {privacyOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      ))}
      <Button onClick={onSave} disabled={isLoading} className="w-full">
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar Privacidade
      </Button>
    </div>
  );
}

// ─── Labels Tab ──────────────────────────────────────────

interface LabelsTabProps {
  labels: { id: string; name: string; color: string }[];
  loading: boolean;
}

export function LabelsTabContent({ labels, loading }: LabelsTabProps) {
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (labels.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma etiqueta encontrada. Etiquetas são criadas no WhatsApp Business.</div>;
  return (
    <div className="space-y-2 mt-4">
      {labels.map((label) => (
        <div key={label.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/20">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: label.color }} />
          <span className="text-sm font-medium flex-1">{label.name}</span>
          <span className="text-xs text-muted-foreground">ID: {label.id}</span>
        </div>
      ))}
    </div>
  );
}

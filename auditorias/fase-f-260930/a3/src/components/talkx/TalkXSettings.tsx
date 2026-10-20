import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertCard, ModuleHeader, KpiCardSkeleton } from './talkxShared';
import { useTalkXSettings, useTalkXSettingUpdate } from '@/hooks/integrations/useTalkXSettings';
import { Settings, Save, RotateCcw } from 'lucide-react';

function displayValue(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v ?? '');
}

const BOOL_KEYS = new Set(['ai_insights']);

export function TalkXSettings() {
  const { data: settings, isLoading, error } = useTalkXSettings();
  const update = useTalkXSettingUpdate();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  if (isLoading) return <div className="space-y-3"><KpiCardSkeleton /><KpiCardSkeleton /></div>;
  if (error || !settings) return <AlertCard tone="danger">Erro ao carregar configurações: {error?.message}</AlertCard>;

  function handleSave(key: string) {
    const raw = edits[key];
    if (raw === undefined) return;
    update.mutate(
      { key, raw },
      {
        onSuccess: () => {
          setSaved(key);
          setTimeout(() => setSaved(null), 2000);
          setEdits((prev) => { const n = { ...prev }; delete n[key]; return n; });
        },
      }
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <ModuleHeader
        icon={Settings}
        title="Configurações Talk X"
        subtitle="Parâmetros globais do módulo de campanhas"
      />

      <div className="divide-y rounded-lg border">
        {settings.map((row) => {
          const currentRaw = edits[row.key] ?? displayValue(row.value);
          const isBool = BOOL_KEYS.has(row.key);
          const boolVal = row.value === true || row.value === 'true';
          const isDirty = edits[row.key] !== undefined;

          return (
            <div key={row.key} className="flex items-start gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-foreground">{row.key}</code>
                  {saved === row.key && (
                    <span className="text-3xs text-emerald-600 font-medium">Salvo!</span>
                  )}
                </div>
                {row.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                )}
              </div>

              {isBool ? (
                <div className="flex items-center gap-2 pt-0.5">
                  <Switch
                    checked={boolVal}
                    onCheckedChange={(v) => update.mutate({ key: row.key, raw: String(v) })}
                  />
                  <Label className="text-xs">{boolVal ? 'Ativo' : 'Inativo'}</Label>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={currentRaw}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    className="h-7 text-xs font-mono w-48"
                  />
                  {isDirty && (
                    <>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        aria-label="Descartar alteração"
                        onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[row.key]; return n; })}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon" variant="default" className="h-7 w-7"
                        aria-label="Salvar"
                        disabled={update.isPending}
                        onClick={() => handleSave(row.key)}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plug, Eye, EyeOff, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface KeyField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
}

const INTEGRATION_KEYS: KeyField[] = [
  {
    key: 'elevenlabs_api_key',
    label: 'ElevenLabs API Key',
    description: 'Chave para geração de voz (TTS), efeitos sonoros e conversão de voz',
    placeholder: 'xi-...',
  },
];

export function IntegrationKeysSection() {
  const { isLoading, getSetting, addSetting } = useGlobalSettings();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const toggleVisibility = (key: string) => {
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (key: string, value: string) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    const value = editValues[key];
    if (!value || value.trim() === '') {
      toast.error('Insira um valor válido');
      return;
    }
    setSavingKey(key);
    try {
      await addSetting(key, value.trim(), INTEGRATION_KEYS.find(k => k.key === key)?.description);
      setEditValues(prev => ({ ...prev, [key]: '' }));
      toast.success('Chave salva com sucesso');
    } catch {
      toast.error('Erro ao salvar chave');
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-secondary/20 bg-card">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-primary" />
          Chaves de Integração
        </CardTitle>
        <CardDescription>
          Gerencie as API Keys de serviços externos integrados ao sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {INTEGRATION_KEYS.map(({ key, label, description, placeholder }) => {
          const currentValue = getSetting(key);
          const isConfigured = !!currentValue && currentValue.trim() !== '';
          const editValue = editValues[key] ?? '';
          const isVisible = visibleKeys[key];
          const isSaving = savingKey === key;

          return (
            <div key={key} className="p-4 rounded-lg border border-border/30 space-y-3 hover:bg-muted/10 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">{label}</Label>
                  {isConfigured ? (
                    <Badge variant="outline" className="text-xs gap-1 text-success border-success/30">
                      <CheckCircle2 className="w-3 h-3" />
                      Configurada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1 text-warning border-warning/30">
                      <AlertCircle className="w-3 h-3" />
                      Não configurada
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>

              {isConfigured && (
                <div className="flex items-center gap-2">
                  <Input
                    type={isVisible ? 'text' : 'password'}
                    value={currentValue}
                    readOnly
                    className="h-8 text-sm font-mono bg-muted/30"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => toggleVisibility(key)}
                  >
                    {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={editValue}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder={isConfigured ? 'Nova chave para substituir...' : placeholder}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  className="h-8 gap-1 shrink-0"
                  disabled={!editValue.trim() || isSaving}
                  onClick={() => handleSave(key)}
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

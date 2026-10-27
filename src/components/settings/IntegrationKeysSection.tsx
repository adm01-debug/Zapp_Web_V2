import { useState } from 'react';
import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';
import { useUserRole } from '@/hooks/system/useUserRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plug, Save, Info, AlertCircle } from 'lucide-react';
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
    description: 'Registro local da chave ElevenLabs; a usada pelas funções de voz é a variável de ambiente ELEVENLABS_API_KEY do servidor',
    placeholder: 'xi-...',
  },
];

// Data em que a chave foi registrada, para confirmar a substituição sem expor o
// valor. Retorna null quando não há data utilizável (a tela mostra só "Configurada").
function dataRegistradaEm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString('pt-BR');
}

export function IntegrationKeysSection() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { settings, isLoading, getSetting, addSetting } = useGlobalSettings();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  if (roleLoading || isLoading) {
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

  // Chave secreta: só o admin vê e substitui. Supervisor não recebe a linha no
  // banco (policy de global_settings) e não renderiza a seção aqui.
  if (!isAdmin) {
    return null;
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
        <Alert className="border-warning/30 bg-warning/10">
          <Info className="h-4 w-4 !text-warning" />
          {/* Sem nível de título: o CardTitle (h3) seguido do h5 do AlertTitle
              quebrava `heading-order` do axe. O Alert já tem role="alert". */}
          <p className="mb-1 font-medium leading-none tracking-tight text-warning">Chave registrada não é a chave usada</p>
          <AlertDescription>
            A autoridade efetiva da integração de voz é a variável de ambiente do servidor
            ELEVENLABS_API_KEY, consumida pelas Edge Functions de voz. A chave salva nesta tela
            fica apenas registrada em global_settings e não é consultada por nenhuma função deste
            repositório.
          </AlertDescription>
        </Alert>

        {INTEGRATION_KEYS.map(({ key, label, description, placeholder }) => {
          const currentValue = getSetting(key);
          const isConfigured = !!currentValue && currentValue.trim() !== '';
          const registradaEm = dataRegistradaEm(
            settings.find(s => s.key === key)?.updated_at,
          );
          const editValue = editValues[key] ?? '';
          const isSaving = savingKey === key;

          return (
            <div key={key} className="p-4 rounded-lg border border-border/30 space-y-3 hover:bg-muted/10 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">{label}</Label>
                  {isConfigured ? (
                    <Badge variant="outline" className="text-xs gap-1 text-warning border-warning/30">
                      <Info className="w-3 h-3" />
                      Registrada (não usada pelo TTS)
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
                <p className="text-xs text-muted-foreground" data-testid={`chave-${key}-registrada`}>
                  {registradaEm ? `Configurada em ${registradaEm}` : 'Configurada'}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={editValue}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder={isConfigured ? 'Nova chave para substituir...' : placeholder}
                  className="h-8 text-sm"
                  aria-label={`Nova chave para ${label}`}
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

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, Mic, AlertTriangle } from 'lucide-react';
import { AutoCloseSettings } from '@/components/settings/AutoCloseSettings';
import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';
import { motion } from '@/components/ui/motion';
import { toast } from 'sonner';

// Contrato versionado real: `handleAudioTranscription`
// (supabase/functions/_shared/evolution-webhook-messages.ts) le
// `global_settings.auto_transcription_enabled` e transcreve sempre que o valor
// for DIFERENTE de 'false'. A leitura do switch segue a mesma regra, senao a
// tela mostraria um estado que o executor nao pratica.
const CHAVE_TRANSCRICAO = 'auto_transcription_enabled';

export function AutomationSettings() {
  const { getSetting, updateSetting, isLoading } = useGlobalSettings();

  const transcricaoLigada = getSetting(CHAVE_TRANSCRICAO) !== 'false';

  const handleTranscricaoChange = async (ligada: boolean) => {
    try {
      await updateSetting(CHAVE_TRANSCRICAO, ligada ? 'true' : 'false');
      toast.success('Transcrição automática atualizada');
    } catch {
      // A escrita falhou: nada muda de estado (o hook so atualiza apos o
      // banco aceitar) e o usuario ve o erro, em vez de um "salvo" falso.
      toast.error('Não foi possível salvar a transcrição automática. Tente novamente.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-whatsapp" />
            Atribuição Automática
          </CardTitle>
          <CardDescription>Recurso não implementado neste sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border-warning/30 bg-warning/10">
            <AlertTriangle className="h-4 w-4 !text-warning" />
            <AlertTitle className="text-warning">Integração pendente</AlertTitle>
            <AlertDescription>
              A distribuição automática de chats entre atendentes não existe neste sistema: nenhum
              executor versionado lê esta preferência, então nada é distribuído automaticamente e
              nada é gravado aqui. O roteamento em uso hoje está na aba Roteamento.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-whatsapp" />
            Transcrição de Áudio
          </CardTitle>
          <CardDescription>Configure a transcrição automática de mensagens de áudio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-transcription-toggle" className="text-base">Transcrição automática</Label>
                  <p className="text-sm text-muted-foreground">Transcreve automaticamente áudios recebidos para texto</p>
                </div>
                <Switch
                  id="auto-transcription-toggle"
                  aria-label="Transcrição automática"
                  checked={transcricaoLigada}
                  onCheckedChange={handleTranscricaoChange}
                />
              </div>
              {transcricaoLigada && (
                <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  💡 Os áudios serão transcritos automaticamente assim que chegarem, facilitando a busca e análise por IA.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-sm text-muted-foreground">
        O fechamento automático por inatividade é definido no cartão Auto-fechamento de Conversas abaixo, que grava a configuração auto_close_config lida pelo executor.
      </p>

      <div className="mt-4">
        <AutoCloseSettings />
      </div>
    </motion.div>
  );
}

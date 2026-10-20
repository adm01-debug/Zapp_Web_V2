import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Mic } from 'lucide-react';
import { AutoCloseSettings } from '@/components/settings/AutoCloseSettings';
import { motion } from '@/components/ui/motion';

interface AutomationSettingsProps {
  settings: {
    auto_assignment_enabled: boolean;
    auto_assignment_method: string;
    inactivity_timeout: number;
    auto_transcription_enabled: boolean;
  };
  updateSettings: (updates: Partial<AutomationSettingsProps['settings']>) => void;
}

export function AutomationSettings({ settings, updateSettings }: AutomationSettingsProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-whatsapp" />
            Atribuição Automática
          </CardTitle>
          <CardDescription>Configure como os chats são distribuídos entre os atendentes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Habilitar atribuição automática</Label>
              <p className="text-sm text-muted-foreground">Distribui chats automaticamente entre os atendentes online</p>
            </div>
            <Switch
              checked={settings.auto_assignment_enabled}
              onCheckedChange={(checked) => updateSettings({ auto_assignment_enabled: checked })}
            />
          </div>

          {settings.auto_assignment_enabled && (
            <div className="space-y-2">
              <Label>Método de distribuição</Label>
              <Select value={settings.auto_assignment_method} onValueChange={(value) => updateSettings({ auto_assignment_method: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="roundrobin">Round-robin (sequencial)</SelectItem>
                  <SelectItem value="random">Aleatório</SelectItem>
                  <SelectItem value="least-busy">Menor carga</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tempo de inatividade (minutos)</Label>
            <p className="text-sm text-muted-foreground">Fechar chat automaticamente após inatividade</p>
            <Input
              type="number"
              value={settings.inactivity_timeout}
              onChange={(e) => updateSettings({ inactivity_timeout: parseInt(e.target.value) || 0 })}
              min={0} max={1440}
            />
          </div>
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
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Transcrição automática</Label>
              <p className="text-sm text-muted-foreground">Transcreve automaticamente áudios recebidos para texto</p>
            </div>
            <Switch
              checked={settings.auto_transcription_enabled}
              onCheckedChange={(checked) => updateSettings({ auto_transcription_enabled: checked })}
            />
          </div>
          {settings.auto_transcription_enabled && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
              💡 Os áudios serão transcritos automaticamente assim que chegarem, facilitando a busca e análise por IA.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
        <AutoCloseSettings />
      </div>
    </motion.div>
  );
}

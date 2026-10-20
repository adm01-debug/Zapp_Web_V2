import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Timer, Save } from 'lucide-react';
import { useAutoCloseConversations } from '@/hooks/inbox/useAutoCloseConversations';

export function AutoCloseSettings() {
  const { config, isLoading, updateConfig } = useAutoCloseConversations();
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(24);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (config) {
      setEnabled(config.is_enabled);
      setHours(config.inactivity_hours);
      setMessage(config.close_message || '');
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate({
      is_enabled: enabled,
      inactivity_hours: hours,
      close_message: message || null,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Timer className="w-5 h-5 text-primary" />
          Auto-fechamento de Conversas
        </CardTitle>
        <CardDescription>
          Feche automaticamente conversas sem atividade após um período configurável.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="auto-close-toggle" className="font-medium">
            Ativar auto-fechamento
          </Label>
          <Switch
            id="auto-close-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inactivity-hours">Horas de inatividade</Label>
          <Input
            id="inactivity-hours"
            type="number"
            min={1}
            max={168}
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value) || 24)}
            disabled={!enabled}
          />
          <p className="text-xs text-muted-foreground">
            A conversa será fechada após {hours}h sem novas mensagens.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="close-message">Mensagem de encerramento</Label>
          <Textarea
            id="close-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Conversa encerrada automaticamente por inatividade."
            rows={2}
            disabled={!enabled}
          />
        </div>

        <Button onClick={handleSave} disabled={updateConfig.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {updateConfig.isPending ? 'Salvando...' : 'Salvar Configuração'}
        </Button>
      </CardContent>
    </Card>
  );
}

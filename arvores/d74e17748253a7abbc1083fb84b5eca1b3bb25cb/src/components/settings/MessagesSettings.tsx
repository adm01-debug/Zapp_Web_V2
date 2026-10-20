import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { motion } from '@/components/ui/motion';

interface MessagesSettingsProps {
  settings: {
    welcome_message: string;
    away_message: string;
    closing_message: string;
  };
  updateSettings: (updates: Partial<MessagesSettingsProps['settings']>) => void;
}

export function MessagesSettings({ settings, updateSettings }: MessagesSettingsProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle>Mensagem de Boas-Vindas</CardTitle>
          <CardDescription>Enviada automaticamente ao início de um novo atendimento</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Mensagem de Boas-Vindas"
            value={settings.welcome_message}
            onChange={(e) => updateSettings({ welcome_message: e.target.value })}
            rows={4}
            placeholder="Olá! Como podemos ajudar?"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Variáveis disponíveis: {"{{nome}}"}, {"{{saudacao}}"}, {"{{protocolo}}"}
          </p>
        </CardContent>
      </Card>

      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle>Mensagem de Ausência</CardTitle>
          <CardDescription>Enviada fora do horário de atendimento</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Mensagem de Ausência"
            value={settings.away_message}
            onChange={(e) => updateSettings({ away_message: e.target.value })}
            rows={4}
            placeholder="No momento estamos fora do horário de atendimento..."
          />
        </CardContent>
      </Card>

      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle>Mensagem de Encerramento</CardTitle>
          <CardDescription>Enviada ao finalizar um atendimento</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Mensagem de Encerramento"
            value={settings.closing_message}
            onChange={(e) => updateSettings({ closing_message: e.target.value })}
            rows={4}
            placeholder="Obrigado pelo contato!"
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

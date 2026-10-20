import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { useBusinessHours, type AwayMessage, type BusinessHour } from '@/hooks/business/useBusinessHours';
import { useConnectionsManager } from '@/hooks/inbox/useConnectionsManager';

/**
 * #273-B (R2-AUTH-049) — a aba Mensagens edita o contrato VERSIONADO da conexão,
 * não a linha pessoal `user_settings`.
 *  - Mensagem de Ausência: `away_messages` por conexão (whatsapp_connection_id,
 *    content, is_enabled), pelo hook `useBusinessHours(connectionId)`.
 *  - Boas-Vindas e Encerramento: nenhum executor versionado lê ou envia esses
 *    campos; aparecem como integração pendente e não são mais gravados aqui.
 *
 * A lista de conexões vem do hook que já é dono dela (`useConnectionsManager`):
 * componente não importa o client do Supabase (guarda `no-restricted-imports` +
 * ratchet de lint — importar direto deixaria `zapp-verify` vermelho).
 */
export function MessagesSettings() {
  const { connections, loading: loadingConnections } = useConnectionsManager();

  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const preferredConnection = connections.find((c) => c.is_default) ?? connections[0];
  const connectionId = selectedConnectionId || preferredConnection?.id || '';

  const { awayMessage, isLoading: loadingAway, isSaving, saveSettings } = useBusinessHours(connectionId);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card className="border border-secondary/20 bg-card hover:border-secondary/30 transition-all">
        <CardHeader>
          <CardTitle>Mensagem de Ausência</CardTitle>
          <CardDescription>
            Fica gravada no contrato da conexão escolhida (tabela away_messages). Nenhum executor
            versionado envia esta mensagem automaticamente hoje.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingConnections ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando conexões...
            </div>
          ) : !connectionId ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conexão de WhatsApp cadastrada. Cadastre uma conexão para definir a mensagem
              de ausência dela.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="away-connection">Conexão</Label>
                <Select value={connectionId} onValueChange={setSelectedConnectionId}>
                  <SelectTrigger id="away-connection">
                    <SelectValue placeholder="Selecione a conexão" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A mensagem de ausência é por conexão: trocar acima carrega a mensagem da conexão
                  escolhida.
                </p>
              </div>

              {loadingAway ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando a mensagem desta conexão...
                </div>
              ) : (
                // Chaveado pela conexão: trocar de conexão remonta o formulário com
                // o que o contrato dela devolveu (sem efeito que reescreve estado).
                <AwayMessageForm
                  key={connectionId}
                  connectionId={connectionId}
                  awayMessage={awayMessage}
                  isSaving={isSaving}
                  onSave={saveSettings}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <PendingIntegrationCard
        title="Mensagem de Boas-Vindas"
        where="a jornada real de boas-vindas hoje está nas variáveis do Chatbot L1 (aba Chatbot L1)"
      />

      <PendingIntegrationCard
        title="Mensagem de Encerramento"
        where="o encerramento real está no Auto-fechamento (aba Automação), no campo da mensagem de encerramento"
      />
    </motion.div>
  );
}

interface AwayMessageFormProps {
  connectionId: string;
  awayMessage: AwayMessage;
  isSaving: boolean;
  onSave: (hours: BusinessHour[], away: AwayMessage) => Promise<void>;
}

function AwayMessageForm({ connectionId, awayMessage, isSaving, onSave }: AwayMessageFormProps) {
  const [content, setContent] = useState(awayMessage.content ?? '');
  const [isEnabled, setIsEnabled] = useState(awayMessage.is_enabled ?? true);

  const handleSave = () => {
    // O save é o do hook (não editamos o hook): grava `away_messages` com
    // onConflict whatsapp_connection_id. A lista de horários vai vazia porque
    // esta aba não edita `business_hours` — o usuário não vê horário aqui e não
    // pode regravá-lo por este caminho (inclusive semear o padrão do hook em
    // conexão que ainda não tem horário configurado). O erro do upsert é
    // anunciado pelo toast do próprio hook.
    void onSave([], {
      whatsapp_connection_id: connectionId,
      content,
      is_enabled: isEnabled,
    }).catch(() => { /* o hook já mostra o erro na tela */ });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label htmlFor="away-enabled">Mensagem ativa</Label>
          <p className="text-xs text-muted-foreground">
            Marcada, a mensagem fica habilitada no contrato da conexão.
          </p>
        </div>
        <Switch
          id="away-enabled"
          checked={isEnabled}
          onCheckedChange={setIsEnabled}
          aria-label="Mensagem de ausência ativa"
        />
      </div>

      <Textarea
        aria-label="Mensagem de Ausência"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="No momento estamos fora do horário de atendimento..."
      />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Mensagem de Ausência
        </Button>
      </div>
    </>
  );
}

interface PendingIntegrationCardProps {
  title: string;
  where: string;
}

function PendingIntegrationCard({ title, where }: PendingIntegrationCardProps) {
  return (
    <Card className="border border-secondary/20 bg-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* `--warning` é cor de PREENCHIMENTO; como TEXTO sobre card claro ela dá
            2,1:1 (tokens.css:155-168). O par de texto é `--warning-text`, sem
            classe Tailwind — mesmo uso de EmailComposer.tsx:460. */}
        <Alert className="border-warning/30 bg-warning/10 text-[hsl(var(--warning-text))]">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Integração pendente
          </AlertTitle>
          <AlertDescription>
            Nenhum executor versionado lê ou envia esta mensagem hoje, então nada é disparado por
            esta tela e nada é gravado aqui. Onde a jornada existe hoje: {where}.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

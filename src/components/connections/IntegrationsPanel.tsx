import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { toast } from 'sonner';
import { Loader2, Bot, Brain, Workflow, MessageSquare, Zap, Boxes } from 'lucide-react';

import { getLogger } from '@/lib/logger';
const log = getLogger('IntegrationsPanel');

interface IntegrationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  connectionName: string;
}

function IntegrationForm({
  title,
  icon: Icon,
  fields,
  values,
  onChange,
  onSave,
  onDelete,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSave: () => void;
  onDelete: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/20 bg-muted/10">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <Label className="font-medium">{title}</Label>
        </div>
        <Switch
          checked={Boolean(values.enabled)}
          onCheckedChange={(checked) => onChange('enabled', checked)}
        />
      </div>

      {Boolean(values.enabled) && (
        <>
          {fields.map(({ key, label, type = 'text', placeholder }) => (
            <div key={key}>
              <Label className="text-sm">{label}</Label>
              {type === 'boolean' ? (
                <div className="flex items-center gap-2 mt-1">
                  <Switch
                    checked={Boolean(values[key])}
                    onCheckedChange={(checked) => onChange(key, checked)}
                  />
                  <span className="text-sm text-muted-foreground">{values[key] ? 'Ativado' : 'Desativado'}</span>
                </div>
              ) : (
                <Input
                  type={type}
                  value={String(values[key] ?? '')}
                  onChange={(e) => onChange(key, type === 'number' ? Number(e.target.value) : e.target.value)}
                  placeholder={placeholder}
                  className="mt-1"
                />
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <Button onClick={onSave} disabled={isLoading} className="flex-1">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={isLoading}>
              Remover
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function IntegrationsPanel({
  open,
  onOpenChange,
  instanceName,
  connectionName,
}: IntegrationsPanelProps) {
  const api = useEvolutionApi();

  const [typebot, setTypebot] = useState<Record<string, unknown>>({ enabled: false });
  const [openai, setOpenai] = useState<Record<string, unknown>>({ enabled: false });
  const [dify, setDify] = useState<Record<string, unknown>>({ enabled: false });
  const [flowise, setFlowise] = useState<Record<string, unknown>>({ enabled: false });
  const [chatwoot, setChatwoot] = useState<Record<string, unknown>>({ enabled: false });
  const [evolutionBot, setEvolutionBot] = useState<Record<string, unknown>>({ enabled: false });

  useEffect(() => {
    if (open && instanceName) loadAll();
  }, [open, instanceName]);

  const loadAll = async () => {
    const load = async (getter: (n: string) => Promise<unknown>, setter: (v: Record<string, unknown>) => void) => {
      try {
        const data = await getter(instanceName);
        if (data && typeof data === 'object') setter({ enabled: true, ...(data as Record<string, unknown>) });
      } catch (err) { log.error('Unexpected error in IntegrationsPanel:', err); }
    };
    await Promise.allSettled([
      load(api.getTypebot, setTypebot),
      load(api.getOpenAI, setOpenai),
      load(api.getDify, setDify),
      load(api.getFlowise, setFlowise),
      load(api.getChatwoot, setChatwoot),
      load(api.getEvolutionBot, setEvolutionBot),
    ]);
  };

  const typebotFields = [
    { key: 'url', label: 'URL do Typebot', placeholder: 'https://typebot.io' },
    { key: 'typebot', label: 'Slug do Bot', placeholder: 'meu-bot' },
    { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
    { key: 'keywordFinish', label: 'Palavra para encerrar', placeholder: '#sair' },
    { key: 'delayMessage', label: 'Delay (ms)', type: 'number' },
    { key: 'unknownMessage', label: 'Mensagem para desconhecidos', placeholder: 'Não entendi' },
    { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
    { key: 'stopBotFromMe', label: 'Parar bot ao responder', type: 'boolean' },
  ];

  const openaiFields = [
    { key: 'openAiApiKey', label: 'API Key OpenAI', placeholder: 'sk-...' },
    { key: 'model', label: 'Modelo', placeholder: 'gpt-4o' },
    { key: 'systemMessage', label: 'System Prompt', placeholder: 'Você é um assistente...' },
    { key: 'maxTokens', label: 'Max Tokens', type: 'number' },
    { key: 'temperature', label: 'Temperatura', type: 'number' },
    { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
    { key: 'keywordFinish', label: 'Palavra para encerrar', placeholder: '#humano' },
    { key: 'speechToText', label: 'Speech to Text', type: 'boolean' },
    { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
    { key: 'stopBotFromMe', label: 'Parar ao responder', type: 'boolean' },
  ];

  const difyFields = [
    { key: 'apiUrl', label: 'URL do Dify', placeholder: 'https://api.dify.ai/v1' },
    { key: 'apiKey', label: 'API Key', placeholder: 'app-...' },
    { key: 'botType', label: 'Tipo (chatBot/textGenerator/agent/workflow)', placeholder: 'chatBot' },
    { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
    { key: 'keywordFinish', label: 'Palavra para encerrar' },
    { key: 'speechToText', label: 'Speech to Text', type: 'boolean' },
    { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
  ];

  const flowiseFields = [
    { key: 'apiUrl', label: 'URL do Flowise', placeholder: 'https://flowise.empresa.com' },
    { key: 'apiKey', label: 'API Key (opcional)' },
    { key: 'chatflowId', label: 'Chatflow ID', placeholder: 'uuid-do-chatflow' },
    { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
  ];

  const chatwootFields = [
    { key: 'url', label: 'URL do Chatwoot', placeholder: 'https://chatwoot.empresa.com' },
    { key: 'accountId', label: 'Account ID', placeholder: '1' },
    { key: 'token', label: 'Token', placeholder: 'seu-token' },
    { key: 'nameInbox', label: 'Nome da Inbox', placeholder: 'WhatsApp' },
    { key: 'signMsg', label: 'Assinar mensagens', type: 'boolean' },
    { key: 'reopenConversation', label: 'Reabrir conversas', type: 'boolean' },
    { key: 'importContacts', label: 'Importar contatos', type: 'boolean' },
    { key: 'importMessages', label: 'Importar mensagens', type: 'boolean' },
  ];

  const evolutionBotFields = [
    { key: 'apiUrl', label: 'URL do Bot', placeholder: 'https://bot.empresa.com' },
    { key: 'apiKey', label: 'API Key (opcional)' },
    { key: 'expire', label: 'Expirar sessão (min)', type: 'number' },
    { key: 'keywordFinish', label: 'Palavra para encerrar' },
    { key: 'unknownMessage', label: 'Mensagem desconhecida' },
    { key: 'delayMessage', label: 'Delay (ms)', type: 'number' },
    { key: 'listeningFromMe', label: 'Ouvir minhas mensagens', type: 'boolean' },
    { key: 'stopBotFromMe', label: 'Parar ao responder', type: 'boolean' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-primary" />
            Integrações — {connectionName}
          </DialogTitle>
          <DialogDescription>
            Configure integrações de IA e automação para esta instância
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="typebot">
          <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full">
            <TabsTrigger value="typebot" className="text-xs"><Bot className="w-3 h-3 mr-1" /> Typebot</TabsTrigger>
            <TabsTrigger value="openai" className="text-xs"><Brain className="w-3 h-3 mr-1" /> OpenAI</TabsTrigger>
            <TabsTrigger value="dify" className="text-xs"><Workflow className="w-3 h-3 mr-1" /> Dify</TabsTrigger>
            <TabsTrigger value="flowise" className="text-xs"><Zap className="w-3 h-3 mr-1" /> Flowise</TabsTrigger>
            <TabsTrigger value="chatwoot" className="text-xs"><MessageSquare className="w-3 h-3 mr-1" /> Chatwoot</TabsTrigger>
            <TabsTrigger value="evbot" className="text-xs"><Bot className="w-3 h-3 mr-1" /> Ev.Bot</TabsTrigger>
          </TabsList>

          <TabsContent value="typebot" className="mt-4">
            <IntegrationForm
              title="Typebot"
              icon={Bot}
              fields={typebotFields}
              values={typebot}
              onChange={(k, v) => setTypebot(prev => ({ ...prev, [k]: v }))}
              onSave={async () => {
                try { await api.setTypebot({ instanceName, ...typebot } as Parameters<typeof api.setTypebot>[0]); toast.success('Typebot configurado!'); } catch { toast.error('Erro'); }
              }}
              onDelete={async () => {
                try { await api.deleteTypebot(instanceName); setTypebot({ enabled: false }); toast.success('Typebot removido'); } catch { toast.error('Erro'); }
              }}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="openai" className="mt-4">
            <IntegrationForm
              title="OpenAI"
              icon={Brain}
              fields={openaiFields}
              values={openai}
              onChange={(k, v) => setOpenai(prev => ({ ...prev, [k]: v }))}
              onSave={async () => {
                try { await api.setOpenAI({ instanceName, ...openai } as Parameters<typeof api.setOpenAI>[0]); toast.success('OpenAI configurado!'); } catch { toast.error('Erro'); }
              }}
              onDelete={async () => {
                try { await api.deleteOpenAI(instanceName); setOpenai({ enabled: false }); toast.success('OpenAI removido'); } catch { toast.error('Erro'); }
              }}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="dify" className="mt-4">
            <IntegrationForm
              title="Dify"
              icon={Workflow}
              fields={difyFields}
              values={dify}
              onChange={(k, v) => setDify(prev => ({ ...prev, [k]: v }))}
              onSave={async () => {
                try { await api.setDify({ instanceName, ...dify } as Parameters<typeof api.setDify>[0]); toast.success('Dify configurado!'); } catch { toast.error('Erro'); }
              }}
              onDelete={async () => {
                try { await api.deleteDify(instanceName); setDify({ enabled: false }); toast.success('Dify removido'); } catch { toast.error('Erro'); }
              }}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="flowise" className="mt-4">
            <IntegrationForm
              title="Flowise"
              icon={Zap}
              fields={flowiseFields}
              values={flowise}
              onChange={(k, v) => setFlowise(prev => ({ ...prev, [k]: v }))}
              onSave={async () => {
                try { await api.setFlowise({ instanceName, ...flowise } as Parameters<typeof api.setFlowise>[0]); toast.success('Flowise configurado!'); } catch { toast.error('Erro'); }
              }}
              onDelete={async () => {
                try { await api.deleteFlowise(instanceName); setFlowise({ enabled: false }); toast.success('Flowise removido'); } catch { toast.error('Erro'); }
              }}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="chatwoot" className="mt-4">
            <IntegrationForm
              title="Chatwoot"
              icon={MessageSquare}
              fields={chatwootFields}
              values={chatwoot}
              onChange={(k, v) => setChatwoot(prev => ({ ...prev, [k]: v }))}
              onSave={async () => {
                try { await api.setChatwoot({ instanceName, ...chatwoot } as Parameters<typeof api.setChatwoot>[0]); toast.success('Chatwoot configurado!'); } catch { toast.error('Erro'); }
              }}
              onDelete={async () => {
                try { await api.deleteChatwoot(instanceName); setChatwoot({ enabled: false }); toast.success('Chatwoot removido'); } catch { toast.error('Erro'); }
              }}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="evbot" className="mt-4">
            <IntegrationForm
              title="Evolution Bot"
              icon={Bot}
              fields={evolutionBotFields}
              values={evolutionBot}
              onChange={(k, v) => setEvolutionBot(prev => ({ ...prev, [k]: v }))}
              onSave={async () => {
                try { await api.setEvolutionBot({ instanceName, ...evolutionBot } as Parameters<typeof api.setEvolutionBot>[0]); toast.success('Evolution Bot configurado!'); } catch { toast.error('Erro'); }
              }}
              onDelete={async () => {
                try { await api.deleteEvolutionBot(instanceName); setEvolutionBot({ enabled: false }); toast.success('Evolution Bot removido'); } catch { toast.error('Erro'); }
              }}
              isLoading={api.isLoading}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

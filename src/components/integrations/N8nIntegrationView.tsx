import { motion } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Zap, FlaskConical } from 'lucide-react';

/**
 * n8n — tela sem integração real nesta versão.
 *
 * Não existe servidor n8n, webhook configurado, persistência nem validação de URL. Antes esta tela
 * simulava "Conectado" e "testado com sucesso" a partir de campos de texto locais (e um `setTimeout`),
 * sem nada sair do navegador. Nada disso confirma um fluxo real, então a tela não oferece conectar
 * nem testar: ela declara explicitamente que a integração não está disponível.
 */
export function N8nIntegrationView() {
  return (
    <div className="space-y-6 pt-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Integração n8n</h1>
            <p className="text-muted-foreground text-sm">Conecte workflows de automação via webhooks</p>
          </div>
          <Badge variant="warning" className="ml-auto">
            Demonstração
          </Badge>
        </div>
      </motion.div>

      <Alert className="border-warning/30 bg-warning/10">
        <FlaskConical className="h-4 w-4 !text-warning" />
        <AlertTitle className="text-warning">Integração não disponível nesta versão</AlertTitle>
        <AlertDescription>
          A conexão com um servidor n8n e o disparo de workflows ainda não foram implementados. Esta tela
          não conecta, não testa webhooks e não salva configuração — nenhum dado é enviado para fora deste
          navegador.
        </AlertDescription>
      </Alert>

      {/* Connection Config */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Configuração de Conexão</CardTitle>
          <CardDescription>URL base da sua instância n8n</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="n8n-url">URL Base n8n</Label>
              <Input
                id="n8n-url"
                placeholder="https://seu-n8n.example.com"
                value={webhookBaseUrl}
                onChange={e => setWebhookBaseUrl(e.target.value)}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mt-auto inline-block" tabIndex={0} aria-disabled="true">
                  <Button onClick={handleConnect} disabled style={{ background: 'var(--gradient-primary)' }}>
                    {isConnected ? <RefreshCw className="w-4 h-4 mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                    {isConnected ? 'Reconectar' : 'Conectar'}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Integração real com n8n ainda não está disponível — em desenvolvimento.</TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      {/* Workflows */}
      {isConnected && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Workflows Configurados</h2>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Workflow
            </Button>
          </div>

          {showAddForm && (
            <Card className="border-primary/30">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input placeholder="Meu Workflow" value={newWorkflow.name} onChange={e => setNewWorkflow(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Webhook URL</Label>
                    <Input placeholder="https://n8n../webhook/..." value={newWorkflow.webhookUrl} onChange={e => setNewWorkflow(p => ({ ...p, webhookUrl: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Evento Gatilho</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={newWorkflow.triggerEvent} onChange={e => setNewWorkflow(p => ({ ...p, triggerEvent: e.target.value }))}>
                      {triggerEvents.map(te => <option key={te.value} value={te.value}>{te.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleAddWorkflow}>Salvar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {workflows.length === 0 ? (
            <Card className="border-dashed border-secondary/50">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Nenhum workflow configurado</p>
                <p className="text-xs mt-1">Adicione um workflow para começar a automatizar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {workflows.map(wf => (
                <Card key={wf.id} className="border-secondary/30">
                  <CardContent className="py-3 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {wf.isActive ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                      <Switch checked={wf.isActive} onCheckedChange={() => toggleWorkflow(wf.id)} aria-label={`Ativar ${wf.name}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{wf.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{wf.webhookUrl}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{triggerEvents.find(t => t.value === wf.triggerEvent)?.label}</Badge>
                    {wf.lastTriggered && <span className="text-xs text-muted-foreground">Último: {new Date(wf.lastTriggered).toLocaleTimeString('pt-BR')}</span>}
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Testar ${wf.name}`} onClick={() => testWorkflow(wf)}><Play className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remover ${wf.name}`} onClick={() => removeWorkflow(wf.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WebhookTestResult, WebhookConfig, DiagnosticResult } from './types';

export function useMonitoringActions(fetchData: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const [webhookTest, setWebhookTest] = useState<WebhookTestResult>({ status: 'idle' });
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [reconfiguring, setReconfiguring] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const runHealthCheck = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('connection-health-check', { method: 'POST', body: {} });
      if (error) throw error;
      toast.success(`Health check: ${data?.connections?.length || 0} conexões verificadas`);
      await fetchData();
    } catch { toast.error('Erro ao executar health check'); }
    finally { setRefreshing(false); }
  }, [fetchData]);

  const testWebhookDelivery = useCallback(async (instanceId: string) => {
    setWebhookTest({ status: 'testing' });
    const testId = `MONITOR_TEST_${Date.now()}`;
    const start = performance.now();
    try {
      const { error } = await supabase.functions.invoke('evolution-webhook', {
        method: 'POST',
        body: { event: 'messages.upsert', instance: instanceId, data: {
          key: { remoteJid: '5500000000000@s.whatsapp.net', fromMe: false, id: testId },
          pushName: '🔧 Monitor Test', messageTimestamp: Math.floor(Date.now() / 1000),
          message: { conversation: `[TESTE MONITOR] ${new Date().toLocaleString('pt-BR')}` },
        }},
      });
      const latency = Math.round(performance.now() - start);
      if (error) throw error;
      await new Promise(r => setTimeout(r, 1000));
      const { data: msg } = await supabase.from('messages').select('id').eq('external_id', testId).maybeSingle();
      if (msg) await supabase.from('messages').delete().eq('id', msg.id);
      setWebhookTest({ status: msg ? 'success' : 'error', message: msg ? `Webhook processou em ${latency}ms` : 'Mensagem não persistida', latencyMs: latency });
    } catch (err) { setWebhookTest({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' }); }
  }, []);

  const checkWebhookConfig = useCallback(async (instanceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api/get-webhook', { method: 'POST', body: { instanceName: instanceId } });
      if (error) throw error;
      const wh = data?.webhook || data;
      setWebhookConfig({ url: wh?.url || wh?.webhookUrl, events: wh?.events || [], configured: !!(wh?.url || wh?.webhookUrl) });
    } catch { setWebhookConfig({ configured: false }); toast.error('Erro ao verificar webhook'); }
  }, []);

  const reconfigureWebhook = useCallback(async (instanceId: string) => {
    setReconfiguring(true);
    try {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
      const { error } = await supabase.functions.invoke('evolution-api/set-webhook', { method: 'POST', body: {
        instanceName: instanceId, webhook: { url: webhookUrl, webhookByEvents: false, webhookBase64: true, events: [
          'MESSAGES_UPSERT','MESSAGES_UPDATE','MESSAGES_DELETE','MESSAGES_SET','SEND_MESSAGE',
          'CONTACTS_UPSERT','CONTACTS_UPDATE','CONTACTS_SET','PRESENCE_UPDATE',
          'CHATS_UPSERT','CHATS_UPDATE','CHATS_DELETE','CHATS_SET','CONNECTION_UPDATE',
          'LABELS_EDIT','LABELS_ASSOCIATION','GROUPS_UPSERT','GROUP_PARTICIPANTS_UPDATE','CALL','QRCODE_UPDATED',
        ]},
      }});
      if (error) throw error;
      toast.success('Webhook reconfigurado!');
      await checkWebhookConfig(instanceId);
    } catch (err) { toast.error('Erro: ' + (err instanceof Error ? err.message : 'desconhecido')); }
    finally { setReconfiguring(false); }
  }, [checkWebhookConfig]);

  const runDiagnostic = useCallback(async (autoFix = false) => {
    setDiagnosing(true);
    try {
      const { data, error } = await supabase.functions.invoke('webhook-diagnostic', { method: 'POST', body: { action: autoFix ? 'auto-fix' : 'full-diagnostic' } });
      if (error) throw error;
      setDiagnostic(data as DiagnosticResult);
      toast.success(autoFix ? 'Diagnóstico + auto-fix concluído!' : 'Diagnóstico concluído!');
      if (autoFix) await fetchData();
    } catch { toast.error('Erro no diagnóstico'); }
    finally { setDiagnosing(false); }
  }, [fetchData]);

  return { refreshing, webhookTest, webhookConfig, reconfiguring, diagnostic, diagnosing, runHealthCheck, testWebhookDelivery, checkWebhookConfig, reconfigureWebhook, runDiagnostic };
}

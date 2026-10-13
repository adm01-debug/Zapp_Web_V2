import { useState, useCallback } from 'react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WebhookTestResult, WebhookConfig, DiagnosticResult } from './types';

/** Estado de uma etapa do autoteste executado no servidor. */
export type WebhookStageState = 'ok' | 'fail' | 'skipped';

export interface WebhookTestStage {
  id: 'signature' | 'delivery' | 'persistence';
  label: string;
  state: WebhookStageState;
  detail: string;
}

/**
 * Resultado do autoteste do webhook (PE-67): o round-trip é feito NO SERVIDOR
 * (ação `selftest` do webhook-diagnostic) e volta por etapa, além do motivo
 * quando algo falha. O navegador não simula `messages.upsert` nem apaga nada.
 */
export interface WebhookTestState extends WebhookTestResult {
  /** Instância que gerou este resultado — o painel lista várias conexões. */
  instance?: string;
  /** Motivo devolvido pelo servidor (`sem-credencial`, `falha-de-rede`, ...). */
  reason?: string;
  stages: WebhookTestStage[];
}

/**
 * Config do webhook como o servidor a descreve no diagnóstico, já com a lista
 * de eventos esperada pelo flavor ativo (GO x v2) — o painel não decide mais
 * quais eventos "deveriam" existir.
 */
export interface WebhookConfigView extends WebhookConfig {
  expectedEvents?: string[];
  presentCount?: number;
  urlCorrect?: boolean;
}

interface SelftestResponse {
  action?: string;
  instance?: string;
  ok?: boolean;
  status?: number;
  latencyMs?: number;
  reason?: string;
  error?: string;
}

interface DiagnosticWebhookView {
  url?: string;
  events?: string[];
  expectedEvents?: string[];
  presentCount?: number;
  urlCorrect?: boolean;
  error?: string;
}

const STAGE_SIGNATURE = 'Assinatura (credencial da instância)';
const STAGE_DELIVERY = 'Entrega ao webhook';
const STAGE_PERSISTENCE = 'Gravação';
const PERSISTENCE_NOTE = 'Evento reservado: nenhum contato ou mensagem é gravado';

const CATEGORY_ORDER = ['Mensagens', 'Conexão', 'Contatos', 'Chats', 'Grupos', 'Outros'];

/** Agrupa um nome de evento do Evolution na categoria exibida (serve aos dois flavors). */
export function categoryOfEvent(event: string): string {
  const e = event.toUpperCase();
  if (e === 'MESSAGE' || e.startsWith('MESSAGES') || e === 'READRECEIPT' || e === 'SENDMESSAGE' || e === 'SEND_MESSAGE' || e === 'SEND_MESSAGE_UPDATE') return 'Mensagens';
  if (e.startsWith('CONNECTION') || e === 'QRCODE_UPDATED' || e.startsWith('APPLICATION')) return 'Conexão';
  if (e.startsWith('CONTACT')) return 'Contatos';
  if (e.startsWith('CHAT')) return 'Chats';
  if (e.startsWith('GROUP')) return 'Grupos';
  return 'Outros';
}

/** Agrupa a lista esperada devolvida pelo servidor para o diff visual por categoria. */
export function groupExpectedEvents(expected: string[]): Array<{ label: string; events: string[] }> {
  const groups = new Map<string, string[]>();
  for (const e of expected) {
    const label = categoryOfEvent(e);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  return CATEGORY_ORDER.filter((l) => groups.has(l)).map((label) => ({ label, events: groups.get(label)! }));
}

function stagesFor(outcome: 'ok' | 'sem-credencial' | 'entrega-falhou' | 'sem-rede', status?: number): WebhookTestStage[] {
  const signatureOk: WebhookTestStage = { id: 'signature', label: STAGE_SIGNATURE, state: 'ok', detail: 'Credencial presente' };
  const deliveryOk: WebhookTestStage = { id: 'delivery', label: STAGE_DELIVERY, state: 'ok', detail: `Webhook respondeu HTTP ${status ?? 200}` };
  const persistence: WebhookTestStage = { id: 'persistence', label: STAGE_PERSISTENCE, state: 'ok', detail: PERSISTENCE_NOTE };

  if (outcome === 'sem-credencial') {
    return [
      { id: 'signature', label: STAGE_SIGNATURE, state: 'fail', detail: 'Credencial ausente — o webhook responderia 401' },
      { id: 'delivery', label: STAGE_DELIVERY, state: 'skipped', detail: 'Não executada: sem credencial não há o que entregar' },
      { id: 'persistence', label: STAGE_PERSISTENCE, state: 'skipped', detail: 'Não executada' },
    ];
  }
  if (outcome === 'entrega-falhou') {
    return [
      signatureOk,
      { id: 'delivery', label: STAGE_DELIVERY, state: 'fail', detail: `Webhook respondeu HTTP ${status ?? '—'}` },
      { id: 'persistence', label: STAGE_PERSISTENCE, state: 'skipped', detail: 'Não executada: a entrega falhou' },
    ];
  }
  if (outcome === 'sem-rede') {
    return [
      { id: 'signature', label: STAGE_SIGNATURE, state: 'skipped', detail: 'Autoteste não chegou a rodar no servidor' },
      { id: 'delivery', label: STAGE_DELIVERY, state: 'fail', detail: 'Falha ao chamar o autoteste no servidor' },
      { id: 'persistence', label: STAGE_PERSISTENCE, state: 'skipped', detail: 'Não executada' },
    ];
  }
  return [signatureOk, deliveryOk, persistence];
}

export function useMonitoringActions(fetchData: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const [webhookTest, setWebhookTest] = useState<WebhookTestState>({ status: 'idle', stages: [] });
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfigView | null>(null);
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

  // PE-67: o "Testar E2E" é uma AÇÃO NO SERVIDOR (`webhook-diagnostic`/`selftest`).
  // Antes o navegador invocava `evolution-webhook` com um `messages.upsert` de
  // exemplo — sem HMAC/instanceToken levava 401 e, se passasse, criava contato e
  // mensagem REAIS e ainda os apagava com DELETE. Aqui só lemos o resultado por
  // etapa; nenhum INSERT nem DELETE sai do cliente.
  const testWebhookDelivery = useCallback(async (instanceId: string) => {
    setWebhookTest({ status: 'testing', instance: instanceId, stages: [] });
    try {
      const { data, error } = await supabase.functions.invoke('webhook-diagnostic', {
        method: 'POST',
        body: { action: 'selftest', instanceName: instanceId },
      });
      if (error) throw error;
      const res = data as SelftestResponse | null;
      if (!res || res.action !== 'selftest') throw new Error('Resposta inesperada do autoteste no servidor.');
      const latencyMs = typeof res.latencyMs === 'number' ? res.latencyMs : undefined;

      if (res.reason === 'sem-instancia') {
        setWebhookTest({
          status: 'error', instance: instanceId, reason: res.reason, stages: stagesFor('sem-rede'),
          message: res.error || 'Instância não informada ao autoteste.',
        });
        return;
      }
      if (res.reason === 'sem-credencial') {
        setWebhookTest({
          status: 'error', instance: instanceId, reason: res.reason, latencyMs, stages: stagesFor('sem-credencial'),
          message: 'A instância não tem credencial gravada — o webhook responderia 401. Grave o token no Vault e teste de novo.',
        });
        return;
      }
      if (!res.ok) {
        setWebhookTest({
          status: 'error', instance: instanceId, reason: res.reason ?? 'falha', latencyMs, stages: stagesFor('entrega-falhou', res.status),
          message: res.error || `Webhook respondeu HTTP ${res.status ?? '—'}`,
        });
        return;
      }
      setWebhookTest({
        status: 'success', instance: instanceId, reason: 'ok', latencyMs, stages: stagesFor('ok', res.status),
        message: `Round-trip completo no servidor${latencyMs != null ? ` em ${latencyMs}ms` : ''} — nenhum dado real foi criado.`,
      });
    } catch (err) {
      setWebhookTest({
        status: 'error', instance: instanceId, reason: 'falha-de-rede', stages: stagesFor('sem-rede'),
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }, []);

  // A config vem do DIAGNÓSTICO do servidor: além da URL e dos eventos já
  // inscritos, ele devolve a lista esperada e a contagem do flavor ativo
  // (GO x v2). Antes o painel comparava tudo com a lista fixa do v2.
  const checkWebhookConfig = useCallback(async (instanceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('webhook-diagnostic', {
        method: 'POST',
        body: { action: 'full-diagnostic', instanceName: instanceId },
      });
      if (error) throw error;
      const diag = (data as { diagnostics?: Array<{ instance: string; webhook?: DiagnosticWebhookView }> } | null)
        ?.diagnostics?.find(d => d.instance === instanceId);
      const wh = diag?.webhook;
      if (!wh || wh.error) {
        setWebhookConfig({ configured: false });
        toast.error(wh?.error || 'O diagnóstico não retornou a configuração do webhook.');
        return;
      }
      setWebhookConfig({
        url: wh.url,
        events: wh.events ?? [],
        expectedEvents: wh.expectedEvents ?? [],
        presentCount: wh.presentCount ?? 0,
        urlCorrect: wh.urlCorrect,
        configured: !!wh.url,
      });
    } catch (err) {
      setWebhookConfig({ configured: false });
      toast.error(err instanceof Error ? err.message : 'Erro ao verificar webhook');
    }
  }, []);

  // `set-webhook` do servidor é ciente do flavor: na GO vira `/instance/connect`
  // com subscribe ALL; na v2 usa a lista default do servidor. Por isso o painel
  // NÃO manda mais uma lista de eventos própria (era a do v2 e não casava com o
  // GO nem com a lista esperada do diagnóstico).
  const reconfigureWebhook = useCallback(async (instanceId: string) => {
    setReconfiguring(true);
    try {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;
      const { data, error } = await supabase.functions.invoke('evolution-api/set-webhook', { method: 'POST', body: {
        instanceName: instanceId,
        webhook: { url: webhookUrl, webhookByEvents: false, webhookBase64: true },
      }});
      if (error) throw error;
      // A edge devolve erro de negócio como 200 + {error:true, message}; sem este
      // check, um bloqueio (ex.: instância sem credencial no Vault) virava
      // "Webhook reconfigurado!" — sucesso falso.
      if (data?.error === true) throw new Error(data.message || 'Erro ao reconfigurar o webhook');
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

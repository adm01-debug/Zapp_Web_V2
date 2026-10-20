import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { getLogger } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { claimNotificationEvent } from '@/lib/notificationDedupe';
import { openContactChat } from '@/components/catalog/useSendProduct';
import { slaStatusForDuration, SLA_RISK_RATIO } from '@/lib/slaTimeline';

const log = getLogger('SLANotifications');

/** O mesmo alerta não se repete para a mesma linha de SLA dentro de 24h. */
export const SLA_ALERT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
/** Tempo de exibição: aviso de risco 6s, estouro 10s (pedido do produto). */
export const SLA_WARNING_TOAST_MS = 6000;
export const SLA_BREACH_TOAST_MS = 10000;
/** Sem configuração apontada na linha, vale o padrão do sistema — mesmo fallback de `useApplicableSLA`. */
const FALLBACK_FIRST_RESPONSE_MINUTES = 5;

/**
 * Contrato do payload do Realtime em `conversation_sla`.
 *
 * O canal recebe o que o banco tiver (payload de `postgres_changes` não é tipado pelo cliente), então
 * o contrato é validado aqui: campo faltando, id que não é UUID ou variação de forma derrubavam o
 * handler com erro fora de qualquer try/catch. `contact_id` é anulável na tabela e é o que dá
 * identidade à conversa — sem ele o alerta não tem para onde levar o usuário.
 */
const slaRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  first_message_at: z.string(),
  first_response_at: z.string().nullable(),
  first_response_breached: z.boolean().nullable(),
  sla_configuration_id: z.string().uuid().nullable().optional(),
});

type SlaRow = z.infer<typeof slaRowSchema>;
/** Linha já validada pelo contrato: `contact_id` existe (o alerta sempre tem para onde levar o usuário). */
type SlaRowAlerta = Omit<SlaRow, 'contact_id'> & { contact_id: string };

/** Lê o payload pelo contrato; fora dele devolve `null` (nunca lança). */
function parseSlaRow(raw: unknown): SlaRowAlerta | null {
  const parsed = slaRowSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('payload de conversation_sla fora do contrato — ignorado');
    return null;
  }
  const { contact_id, ...resto } = parsed.data;
  if (!contact_id) {
    log.warn('linha de SLA sem contato — ignorada');
    return null;
  }
  return { ...resto, contact_id };
}

/**
 * Contrato do que interessa de uma regra de SLA para o alerta: o escopo (para a hierarquia) e o
 * `metadata` com `notify_on_warning`/`escalation_notes`. Regra fora do contrato é ignorada.
 */
const slaRuleScopeSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  company: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  contact_type: z.string().nullable().optional(),
  queue_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
  metadata: z
    .object({
      notify_on_warning: z.boolean().nullish(),
      escalation_notes: z.string().nullish(),
    })
    .nullish(),
});

/** Política de alerta que sobrevive à hierarquia de regras. */
export interface SlaAlertPolicy {
  notifyOnWarning: boolean;
  escalationNotes: string | null;
}

/**
 * Sem regra aplicável o sistema avisa e não inventa nota — é o comportamento de sempre. É também o
 * resultado quando a leitura das regras falha (por RLS, por exemplo): o alerta nunca é engolido por
 * uma política que não deu para ler.
 */
export const DEFAULT_SLA_ALERT_POLICY: SlaAlertPolicy = Object.freeze({
  notifyOnWarning: true,
  escalationNotes: null,
});

/** Atributos crus do contato que a hierarquia usa para escolher a regra. */
export interface SlaRuleScopeAttrs {
  contactId: string;
  company: string | null;
  jobTitle: string | null;
  contactType: string | null;
  queueId: string | null;
  agentId: string | null;
}

/**
 * Regra aplicável → política de alerta.
 *
 * Mesma hierarquia e mesmos desempates de `useApplicableSLA`
 * (contato > empresa > cargo > tipo de contato > fila > agente, com as regras já ordenadas por
 * prioridade decrescente): a primeira regra de cada nível fecha o nível e o mais específico vence.
 * A ordem é replicada porque a linha de `conversation_sla` aponta a configuração de prazo, não a
 * regra — e só a regra carrega `notify_on_warning`/`escalation_notes`. Regra fora do contrato é
 * ignorada em vez de derrubar o alerta.
 */
export function pickRuleAlertPolicy(rules: unknown[], attrs: SlaRuleScopeAttrs): SlaAlertPolicy {
  let doContato: SlaAlertPolicy | undefined;
  let daEmpresa: SlaAlertPolicy | undefined;
  let doCargo: SlaAlertPolicy | undefined;
  let doTipo: SlaAlertPolicy | undefined;
  let daFila: SlaAlertPolicy | undefined;
  let doAgente: SlaAlertPolicy | undefined;

  for (const raw of rules) {
    const parsed = slaRuleScopeSchema.safeParse(raw);
    if (!parsed.success) continue;
    const rule = parsed.data;
    const policy = (): SlaAlertPolicy => ({
      notifyOnWarning: rule.metadata?.notify_on_warning ?? true,
      escalationNotes: (rule.metadata?.escalation_notes ?? '').trim() || null,
    });

    if (rule.contact_id && rule.contact_id === attrs.contactId && !doContato) {
      doContato = policy();
      break; // o nível mais específico já foi encontrado
    }
    if (!rule.contact_id && rule.company && rule.company === attrs.company && !daEmpresa) {
      daEmpresa = policy();
    }
    if (
      !rule.contact_id && !rule.company &&
      rule.job_title && rule.job_title === attrs.jobTitle && !doCargo
    ) {
      doCargo = policy();
    }
    if (
      !rule.contact_id && !rule.company && !rule.job_title &&
      rule.contact_type && rule.contact_type === attrs.contactType && !doTipo
    ) {
      doTipo = policy();
    }
    if (!rule.contact_id && rule.queue_id && rule.queue_id === attrs.queueId && !daFila) {
      daFila = policy();
    }
    if (!rule.contact_id && rule.agent_id && rule.agent_id === attrs.agentId && !doAgente) {
      doAgente = policy();
    }
  }

  return doContato ?? daEmpresa ?? doCargo ?? doTipo ?? daFila ?? doAgente ?? DEFAULT_SLA_ALERT_POLICY;
}

/**
 * Política de alerta da regra aplicável ao contato. Nunca lança: falha de leitura cai no padrão.
 * A leitura é por alerta (e não de uma vez) para que uma regra ajustada valha no próximo aviso.
 */
async function resolveAlertPolicy(
  attrs: SlaRuleScopeAttrs,
): Promise<SlaAlertPolicy> {
  try {
    const { data, error } = await supabase
      .from('sla_rules')
      .select('contact_id, company, job_title, contact_type, queue_id, agent_id, metadata')
      .eq('is_active', true)
      .order('priority', { ascending: false });
    if (error || !data) return DEFAULT_SLA_ALERT_POLICY;
    return pickRuleAlertPolicy(data, attrs);
  } catch (error) {
    // Regra ilegível não pode silenciar aviso: cai no padrão.
    log.warn('falha ao ler as regras de SLA — política padrão', { error });
    return DEFAULT_SLA_ALERT_POLICY;
  }
}

/**
 * Prazo de primeira resposta da própria linha: uma consulta por chave primária.
 *
 * Resolver a hierarquia de regras (contato > empresa > cargo > tipo > fila > agente) aqui duplicaria
 * `useApplicableSLA`; a linha já aponta a configuração aplicada e, sem ela, vale o padrão do sistema.
 */
async function resolveFirstResponseMinutes(configurationId: string | null): Promise<number> {
  if (!configurationId) return FALLBACK_FIRST_RESPONSE_MINUTES;
  const { data, error } = await supabase
    .from('sla_configurations')
    .select('first_response_minutes')
    .eq('id', configurationId)
    .maybeSingle();
  if (error || !data) return FALLBACK_FIRST_RESPONSE_MINUTES;
  return data.first_response_minutes ?? FALLBACK_FIRST_RESPONSE_MINUTES;
}

/**
 * Avisa (toast + som + notificação do navegador) quando o SLA de primeira resposta entra em risco
 * ou estoura, com a ação "Abrir conversa" levando ao contato alertado.
 *
 * Dedupe por linha de SLA com TTL de 24h em `claimNotificationEvent`: o mesmo alerta não repete nem
 * entre abas/consultas concorrentes, e expira para o próximo ciclo do SLA poder avisar de novo.
 */
export function useSLANotifications(): void {
  const { user } = useAuth();
  const { settings: painelSettings, isQuietHours } = useNotificationSettings();
  const userId = user?.id ?? null;

  // Ajustes do painel em ref: o handler lê o valor do momento em que o alerta chega. Sem isso os
  // objetos de `useNotificationSettings` entram nas dependências do efeito e o canal do Realtime é
  // derrubado e recriado a cada render (a assinatura do Supabase ia e voltava sem parar).
  const settingsRef = useRef(painelSettings);
  const quietHoursRef = useRef(isQuietHours);
  useEffect(() => {
    settingsRef.current = painelSettings;
    quietHoursRef.current = isQuietHours;
  }, [painelSettings, isQuietHours]);

  /** Avisos de risco agendados: id da linha de SLA → timer do limiar (70% do prazo). */
  const riskTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!userId) return;
    // Marca o desmonte: um `handleRow` em voo (consulta do prazo) não pode agendar timer nem
    // apresentar alerta depois que a tela saiu.
    let cancelled = false;
    const timers = riskTimers.current;

    const clearRisk = (slaId: string): void => {
      const timer = timers.get(slaId);
      if (timer === undefined) return;
      clearTimeout(timer);
      timers.delete(slaId);
    };

    const presentAlert = async (
      severity: 'warning' | 'breach',
      slaId: string,
      contactId: string,
    ): Promise<void> => {
      if (cancelled) return;

      // Uma leitura por alerta: identidade do contato (nome/telefone) e os atributos crus que a
      // hierarquia de regras usa. A decisão de avisar sai daí, antes de consumir o dedupe.
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('name, phone, company, job_title, contact_type, queue_id, assigned_to')
        .eq('id', contactId)
        .maybeSingle();
      if (cancelled) return;
      // Sem o contato o alerta ainda vale (só sai sem o nome): erro de leitura não engole o aviso.
      if (contactError) {
        log.warn('falha ao ler o contato do alerta — segue sem o nome', { error: contactError });
      }

      // Show browser notification if enabled
      if (settings.browserNotifications) {
        showBrowserNotification(title, description, {
          tag: `sla-${severity}-first-response-${slaId}`,
        });
      }
    };

    /** Agenda o aviso de risco para o instante em que a linha cruza 70% do prazo. */
    const scheduleRiskWarning = (row: SlaRowAlerta, limitMinutes: number): void => {
      clearRisk(row.id);
      const startedAt = new Date(row.first_message_at).getTime();
      if (!Number.isFinite(startedAt)) return;
      const riskAt = startedAt + limitMinutes * 60_000 * SLA_RISK_RATIO;
      // +1ms: o limiar em `slaStatusForDuration` é estrito (no limite exato ainda é "no prazo").
      const timer = setTimeout(
        () => {
          timers.delete(row.id);
          if (cancelled) return;
          if (slaStatusForDuration(Date.now() - startedAt, limitMinutes) === 'ok') return;
          // O callback do timer está fora do try/catch do handler: falha aqui não pode virar
          // rejeição solta.
          void presentAlert('warning', row.id, row.contact_id).catch((error) => {
            log.error('falha no aviso de risco agendado', { error });
          });
        },
        Math.max(0, riskAt - Date.now() + 1),
      );
      timers.set(row.id, timer);
    };

    const handleRow = async (
      rawNew: unknown,
      previous: unknown,
      event: 'INSERT' | 'UPDATE',
    ): Promise<void> => {
      try {
        const row = parseSlaRow(rawNew);
        if (!row) return;

        const alreadyBreached =
          (previous as { first_response_breached?: boolean | null } | null | undefined)
            ?.first_response_breached === true;

        if (row.first_response_breached === true) {
          clearRisk(row.id);
          // Só é novidade no INSERT ou quando o estouro acabou de ser marcado.
          if (event === 'INSERT' || !alreadyBreached) {
            await presentAlert('breach', row.id, row.contact_id);
          }
          return;
        }

        // Respondida (ou resolvida): o relógio do risco para aqui.
        if (row.first_response_at) {
          clearRisk(row.id);
          return;
        }

        const limitMinutes = await resolveFirstResponseMinutes(row.sla_configuration_id ?? null);
        // A consulta pode terminar depois do desmonte: sem agendar timer nem alerta órfão.
        if (cancelled) return;
        const elapsedMs = Date.now() - new Date(row.first_message_at).getTime();
        if (slaStatusForDuration(elapsedMs, limitMinutes) !== 'ok') {
          // Já chegou em risco (linha antiga/replay): avisa agora, sem agendar.
          await presentAlert('warning', row.id, row.contact_id);
          return;
        }
        scheduleRiskWarning(row, limitMinutes);
      } catch (error) {
        // Falha ao notificar nunca derruba o handler do Realtime (o log não carrega dado pessoal).
        log.error('falha ao tratar mudança de conversation_sla', { error });
      }
    };

    const channel = supabase
      .channel(uniqueRealtimeTopic('sla-breaches'))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_sla' },
        (payload) => {
          void handleRow(payload.new, payload.old, 'UPDATE');
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_sla' },
        (payload) => {
          void handleRow(payload.new, null, 'INSERT');
        },
      )
      .subscribe((status) => {
        log.debug('Subscription status', { status });
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [userId]);
}

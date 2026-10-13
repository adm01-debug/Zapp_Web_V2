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

/** Lê o payload pelo contrato; fora dele devolve `null` (nunca lança). */
function parseSlaRow(raw: unknown): SlaRow | null {
  const parsed = slaRowSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('payload de conversation_sla fora do contrato — ignorado');
    return null;
  }
  if (!parsed.data.contact_id) {
    log.warn('linha de SLA sem contato — ignorada');
    return null;
  }
  return parsed.data;
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
  const { settings, isQuietHours } = useNotificationSettings();
  const userId = user?.id ?? null;

  // Ajustes do painel em ref: o handler lê o valor do momento em que o alerta chega. Sem isso os
  // objetos de `useNotificationSettings` entram nas dependências do efeito e o canal do Realtime é
  // derrubado e recriado a cada render (a assinatura do Supabase ia e voltava sem parar).
  const settingsRef = useRef(settings);
  const quietHoursRef = useRef(isQuietHours);
  useEffect(() => {
    settingsRef.current = settings;
    quietHoursRef.current = isQuietHours;
  }, [settings, isQuietHours]);

  /** Avisos de risco agendados: id da linha de SLA → timer do limiar (70% do prazo). */
  const riskTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!userId) return;
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
      const prefix = severity === 'breach' ? 'sla-breach' : 'sla-warning';
      if (!claimNotificationEvent(`${prefix}:${slaId}`, SLA_ALERT_DEDUPE_TTL_MS)) return;

      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', contactId)
        .maybeSingle();
      // Nome (ou telefone) só aparece na tela do agente; nada disso vai para log.
      const quem = contact?.name || contact?.phone || null;

      const title =
        severity === 'breach'
          ? '⚠️ SLA de Primeira Resposta Violado'
          : '⚠️ SLA de Primeira Resposta em Risco';
      const description =
        severity === 'breach'
          ? quem
            ? `O contato ${quem} não recebeu resposta no prazo.`
            : 'Um contato não recebeu resposta dentro do prazo de SLA.'
          : quem
            ? `O contato ${quem} está perto de estourar o prazo de primeira resposta.`
            : 'Um contato está perto de estourar o prazo de primeira resposta.';

      // sonner é o mesmo caminho dos alertas do chat: suporta a ação "Abrir conversa".
      const emit = severity === 'breach' ? toast.error : toast.warning;
      emit(title, {
        description,
        duration: severity === 'breach' ? SLA_BREACH_TOAST_MS : SLA_WARNING_TOAST_MS,
        action: { label: 'Abrir conversa', onClick: () => openContactChat(contactId) },
      });

      const current = settingsRef.current;
      if (current.soundEnabled && current.slaBreachSound && !quietHoursRef.current()) {
        playNotificationSound('sla_breach', current.slaSoundType, current.soundVolume);
      }
      if (current.browserNotifications && current.desktopAlerts) {
        showBrowserNotification(title, description, {
          tag: `sla-${severity}-first-response-${slaId}`,
        });
      }
    };

    /** Agenda o aviso de risco para o instante em que a linha cruza 70% do prazo. */
    const scheduleRiskWarning = (row: SlaRow, limitMinutes: number): void => {
      clearRisk(row.id);
      const startedAt = new Date(row.first_message_at).getTime();
      if (!Number.isFinite(startedAt)) return;
      const riskAt = startedAt + limitMinutes * 60_000 * SLA_RISK_RATIO;
      // +1ms: o limiar em `slaStatusForDuration` é estrito (no limite exato ainda é "no prazo").
      const timer = setTimeout(
        () => {
          timers.delete(row.id);
          if (slaStatusForDuration(Date.now() - startedAt, limitMinutes) === 'ok') return;
          void presentAlert('warning', row.id, row.contact_id as string);
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
            await presentAlert('breach', row.id, row.contact_id as string);
          }
          return;
        }

        // Respondida (ou resolvida): o relógio do risco para aqui.
        if (row.first_response_at) {
          clearRisk(row.id);
          return;
        }

        const limitMinutes = await resolveFirstResponseMinutes(row.sla_configuration_id ?? null);
        const elapsedMs = Date.now() - new Date(row.first_message_at).getTime();
        if (slaStatusForDuration(elapsedMs, limitMinutes) !== 'ok') {
          // Já chegou em risco (linha antiga/replay): avisa agora, sem agendar.
          await presentAlert('warning', row.id, row.contact_id as string);
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
      supabase.removeChannel(channel);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [userId]);
}

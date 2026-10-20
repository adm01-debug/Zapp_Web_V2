/**
 * talkx-resume-policy.ts — quem a retomada automática PODE retomar.
 *
 * Problema real (V03): a pausa automática gravava a campanha como 'paused' sem
 * dizer por que, e o talkx-scheduler retomava qualquer 'paused' que tivesse
 * janela configurada. Consequência: campanha pausada À MÃO pelo operador voltava
 * a enviar sozinha no minuto seguinte (se tivesse janela), e campanha pausada
 * por queda de conexão voltava a enviar sem a conexão estar de pé.
 *
 * Aqui ficam o vocabulário dos motivos e a decisão, usados pelos DOIS lados:
 *   - talkx-send, ao pausar sozinho  -> pauseReasonForWindow(...)
 *   - talkx-scheduler, ao retomar    -> selectResumableCampaigns(...)
 *
 * Fica em _shared porque cada edge function é empacotada separadamente: importar
 * de supabase/functions/talkx-scheduler/ para dentro de talkx-send quebraria o
 * deploy (e o `deno check` do CI). Mesmo motivo pelo qual talkx-window.ts mora
 * aqui.
 */

import { deliveryWindowStatus, type ScheduleGuardCampaign } from "./talkx-window.ts";

/** Motivos que autorizam retomada automática. Qualquer outro valor (texto livre
 *  do usuário, nulo, motivo desconhecido) significa pausa manual/diagnóstica e
 *  NUNCA é retomado por robô. */
export const AUTO_RESUME_REASONS = ["send_window", "business_hours", "connection_lost"] as const;
export type AutoResumeReason = (typeof AUTO_RESUME_REASONS)[number];

/**
 * Converte a recusa da janela no motivo gravado na pausa.
 * `invalid_schedule_timezone` (e qualquer motivo novo) é gravado como veio: fica
 * registrado para o operador diagnosticar, mas fora da lista de retomada — uma
 * campanha com fuso inválido precisa de gente, não de retomada automática.
 */
export function pauseReasonForWindow(status: { allowed: boolean; reason?: string }): string | null {
  if (status.allowed) return null;
  if (status.reason === "outside_send_window") return "send_window";
  if (status.reason === "outside_business_hours") return "business_hours";
  return status.reason ?? "unknown";
}

export type PausedCampaignRow = ScheduleGuardCampaign & {
  id: string;
  name?: string | null;
  pause_reason?: string | null;
  whatsapp_connection_id?: string | null;
};

export type ResumeDecision = {
  id: string;
  name: string | null;
  resume: boolean;
  /** Motivo da pausa (cru, como está no banco). */
  pauseReason: string | null;
  /** Por que retomou ou por que NÃO retomou — vai para o log, não para o banco. */
  because: string;
};

/**
 * Monta o resolvedor de status de conexão do talkx-scheduler.
 *
 * Fica AQUI, e não inline na edge function, porque foi exatamente onde a
 * auditoria de 2026-09-29 achou a lacuna: trocar o `null` do caso "campanha sem
 * whatsapp_connection_id" por `"connected"` — retomar campanha órfã sem saber se
 * a conexão está de pé — sobrevivia às DUAS camadas de teste, porque a fiação
 * morava dentro do scheduler e nenhum teste a alcançava.
 *
 * Sem id (ou id não-string) devolve null, NUNCA "connected". Id conhecido devolve
 * o status da tabela; id ausente da resposta também devolve null.
 */
export function connectionStatusResolver(
  statusById: ReadonlyMap<string, string | null>,
): (campaign: PausedCampaignRow) => string | null {
  return (campaign) => {
    const connectionId = campaign.whatsapp_connection_id;
    if (typeof connectionId !== "string") return null;
    return statusById.get(connectionId) ?? null;
  };
}

/**
 * Decide, para cada campanha pausada, se a retomada automática pode agir.
 * Não faz I/O: recebe as linhas e uma função que devolve o status da conexão
 * WhatsApp da campanha, para ser testável sem banco e sem rede.
 */
export function selectResumableCampaigns(
  rows: PausedCampaignRow[],
  connectionStatus: (campaign: PausedCampaignRow) => string | null,
  now = new Date(),
): ResumeDecision[] {
  return rows.map((campaign) => {
    const pauseReason = typeof campaign.pause_reason === "string" ? campaign.pause_reason : "";
    const base = { id: campaign.id, name: campaign.name ?? null, pauseReason: pauseReason || null };

    if (!(AUTO_RESUME_REASONS as readonly string[]).includes(pauseReason)) {
      return {
        ...base,
        resume: false,
        because: pauseReason
          ? `motivo '${pauseReason}' não é de pausa automática (pausa do operador): não retomar`
          : "pausa sem motivo registrado (anterior à V03 ou manual): não retomar",
      };
    }

    if (pauseReason === "connection_lost") {
      const status = connectionStatus(campaign);
      if (status !== "connected") {
        return {
          ...base,
          resume: false,
          because: `conexão WhatsApp '${status ?? "desconhecida"}' — só retoma com a conexão de pé`,
        };
      }
      return { ...base, resume: true, because: "conexão restabelecida" };
    }

    if (!deliveryWindowStatus(campaign, now).allowed) {
      return { ...base, resume: false, because: "ainda fora da janela de envio" };
    }

    return {
      ...base,
      resume: true,
      because: pauseReason === "business_hours" ? "horário comercial aberto" : "dentro da janela de envio",
    };
  });
}

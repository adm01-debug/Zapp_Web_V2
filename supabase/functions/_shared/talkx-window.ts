/**
 * talkx-window.ts — Helper compartilhado de janela de envio Talk X
 * Usado por talkx-send (mid-loop auto-pausa) e talkx-scheduler (retomada automática).
 * Fuso-horário fixo America/Sao_Paulo (Brasília).
 */

export interface SendWindowConfig {
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean;
}

/**
 * Retorna true se o momento atual (hora de Brasília) está dentro
 * da janela de envio configurada na campanha.
 * Sem janela configurada, retorna sempre true.
 */
export function isWithinSendWindow(campaign: SendWindowConfig): boolean {
  const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hBR = nowBR.getHours();
  const mBR = nowBR.getMinutes();
  const dowBR = nowBR.getDay(); // 0 = Dom, 6 = Sáb
  const hmBR = hBR * 60 + mBR;

  if (campaign.send_window_start && campaign.send_window_end) {
    const [wsh, wsm] = campaign.send_window_start.split(":").map(Number);
    const [weh, wem] = campaign.send_window_end.split(":").map(Number);
    if (hmBR < wsh * 60 + wsm || hmBR >= weh * 60 + wem) return false;
  }

  if (campaign.business_hours_only) {
    // Seg–Sex (1–5), 08:00–18:00 Brasília
    if (dowBR === 0 || dowBR === 6 || hBR < 8 || hBR >= 18) return false;
  }

  return true;
}

import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

/**
 * TL-151: formata a parede local como selo da Tela 10.
 * Entrada: parede local YYYY-MM-DDTHH:mm (saida de utcToLocalInTimezone).
 * Saida: dd/mm com ponto medio HH:mm. Entrada vazia ou invalida vira traco.
 * Extracao unica dos dois ramos (agendado e rascunho local).
 */
export function formatTalkXScheduleLabel(local: string): string {
  if (!local) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return '—';
  return `${m[3]}/${m[2]} • ${m[4]}:${m[5]}`;
}

/**
 * X120 — pendências que BLOQUEIAM o envio, com a mesma regra que a revisão do
 * wizard usa: linha WhatsApp ativa, público com contatos elegíveis e mensagem
 * escrita. Função pura sobre dados que a tela já tem (campanha + estado real
 * da conexão lido por `useTalkXConnectionStatus`); enquanto o status ainda
 * está sendo lido (`connectionLoading`) ele não conta como pendência — não se
 * inventa bloqueio com dado ainda não carregado.
 */
export function campaignBlockingChecks(
  campaign: Pick<TalkXCampaign, 'whatsapp_connection_id' | 'total_recipients' | 'message_template'>,
  connectionStatus: string | null,
  connectionLoading: boolean,
): string[] {
  const problemas: string[] = [];
  if (!campaign.whatsapp_connection_id) {
    problemas.push('Nenhuma linha WhatsApp selecionada.');
  } else if (!connectionLoading && connectionStatus && connectionStatus !== 'connected') {
    const rotulo = connectionStatus === 'disconnected' ? 'desconectada'
      : connectionStatus === 'pending' ? 'pendente'
      : connectionStatus;
    problemas.push(`A linha WhatsApp está ${rotulo}.`);
  }
  if ((campaign.total_recipients ?? 0) <= 0) problemas.push('O público não tem contatos elegíveis.');
  if (!campaign.message_template?.trim()) problemas.push('A mensagem da campanha está vazia.');
  return problemas;
}

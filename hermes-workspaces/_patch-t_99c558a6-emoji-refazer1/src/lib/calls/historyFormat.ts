import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Data e hora curtas do histórico (T51): "02 out · 14:35".
 *
 * O ptBR do date-fns devolve a abreviação do mês com ponto final ("out."). O plano
 * pede mês minúsculo e sem ruído, então o ponto é removido e o resto fica como veio
 * (o locale já entrega minúsculo).
 */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  const dia = format(data, 'dd', { locale: ptBR });
  const mes = format(data, 'MMM', { locale: ptBR }).replace(/\.$/, '').toLowerCase();
  const hora = format(data, 'HH:mm', { locale: ptBR });
  return `${dia} ${mes} · ${hora}`;
}

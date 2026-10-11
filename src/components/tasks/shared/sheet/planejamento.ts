/**
 * Regras de apresentação da seção "Planejamento" do painel de detalhes
 * (etapas 137–140 do plano de Tarefas).
 *
 * Mora fora do componente de propósito: a validação do lembrete (etapa 138) e o
 * rótulo da data de criação (etapa 140) são regra única, provada por teste
 * unitário — não uma classe CSS nem um texto montado dentro do JSX.
 */
import { MES_CURTO_PT_BR } from '@/hooks/tasks/workItemFormat';

/** Tom do aviso do lembrete — cada um casa com um par de TEXTO do design (D12). */
export type TomAviso = 'success' | 'warning' | 'destructive';

export interface AvisoLembrete {
  tom: TomAviso;
  texto: string;
}

/** Rótulo do lembrete em dia — o mesmo que a linha de ações repete (etapa 139). */
export const TEXTO_AGENDADO = 'Agendado';

/**
 * Etapa 138 — o lembrete combina com o prazo?
 *  - lembrete no passado: vermelho (não há mais o que avisar);
 *  - lembrete depois do prazo: âmbar (chega depois da entrega);
 *  - antes do prazo, ou sem prazo: verde, "Agendado".
 * Sem lembrete marcado não há aviso (`null`).
 */
export function avaliarLembrete(
  remindAtIso: string | null,
  dueIso: string | null,
  agora: Date = new Date(),
): AvisoLembrete | null {
  if (!remindAtIso) return null;
  const lembrete = new Date(remindAtIso).getTime();
  if (Number.isNaN(lembrete)) return null;

  if (lembrete < agora.getTime()) {
    return { tom: 'destructive', texto: 'Lembrete no passado' };
  }
  if (dueIso) {
    const prazo = new Date(dueIso).getTime();
    if (!Number.isNaN(prazo) && lembrete > prazo) {
      return { tom: 'warning', texto: 'Lembrete depois do prazo' };
    }
  }
  return { tom: 'success', texto: TEXTO_AGENDADO };
}

/**
 * Etapa 140 — "Criada em 9 out. 2026": dia sem zero à esquerda, mês curto
 * pt-BR e ano. O mês vem do mesmo mapa do módulo (`MES_CURTO_PT_BR`), para não
 * nascer uma segunda lista de meses no código (D21/B-4).
 */
export function formatCriadaEm(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Criada em ${d.getDate()} ${MES_CURTO_PT_BR[d.getMonth()]} ${d.getFullYear()}`;
}

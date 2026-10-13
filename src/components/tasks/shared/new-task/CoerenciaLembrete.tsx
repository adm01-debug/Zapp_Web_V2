/**
 * Etapa 163 — mensagens de coerência prazo × lembrete do modal Nova tarefa.
 *
 * Plano, seção 3.4 (imagem 04), linha 443:
 *   | 163 | iris | Mensagens de coerência. "Lembrete programado para antes do
 *     prazo." em verde e avisos âmbar/vermelho nos outros casos, com "Ajustar
 *     para 1 h antes do prazo". |
 * (mesma linha da tabela 3.4, item "Confirmação verde \"Lembrete programado
 *  para antes do prazo.\" | FALTA | 162–163")
 *
 * A CLASSIFICAÇÃO não nasce aqui: vem de `checkRemindCoherence` (etapa 162, em
 * `workItemPresets.ts`), a mesma função pura que já traz mensagem e estado.
 * Aqui só se decide a APRESENTAÇÃO de cada estado (par de texto AA, ícone,
 * papel de leitura) e o atalho de ajuste — cujo alvo também passa por
 * `checkRemindCoherence` antes de virar botão, para não oferecer um atalho que
 * não resolve (prazo já vencido, por exemplo).
 *
 * Tokens (definidos em `src/styles/tokens.css`, mapeados em `tailwind.config.ts`):
 * `text-success` (o verde JÁ é o próprio par de texto) e
 * `text-[hsl(var(--warning-text))]` / `text-[hsl(var(--destructive-text))]`
 * (`tokens.css` linhas 158/159 no claro e 476/477 no escuro) — o par de TEXTO da
 * etapa 80. O modal nasce em PORTAL, fora do `[data-testid="tasks-module"]`,
 * então o remap de `utilities.css` não o alcança.
 */
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  checkRemindCoherence,
  type RemindCoherenceState,
} from '@/hooks/tasks/workItemPresets';

export interface CoerenciaLembreteProps {
  /** ISO de `remind_at`; `null` = sem lembrete (nada a conferir). */
  remindAt: string | null;
  /** ISO de `due_date`; `null` = sem prazo para comparar. */
  dueDate: string | null;
  /** Relógio da conferência; injetável nos testes. Padrão: agora. */
  now?: Date;
  /** Recebe o ISO do lembrete ajustado ("Ajustar para 1 h antes do prazo"). */
  onAjustar: (iso: string) => void;
}

interface Visual {
  /** Par de texto AA + tinta/borda de aviso de cada estado. */
  classe: string;
  icone: LucideIcon;
  /** `role` do bloco: `alert` no que exige ação, `status` no informativo. */
  papel: 'status' | 'alert';
}

/** Verde = coerente; âmbar = aviso; vermelho = erro. */
const VISUAL: Record<RemindCoherenceState, Visual> = {
  ok: {
    classe: 'border-success/30 bg-success/10 text-success',
    icone: CheckCircle2,
    papel: 'status',
  },
  in_past: {
    classe: 'border-destructive/30 bg-destructive/10 text-[hsl(var(--destructive-text))]',
    icone: AlertCircle,
    papel: 'alert',
  },
  after_due: {
    classe: 'border-warning/30 bg-warning/10 text-[hsl(var(--warning-text))]',
    icone: AlertTriangle,
    papel: 'alert',
  },
  no_due: {
    classe: 'border-warning/30 bg-warning/10 text-[hsl(var(--warning-text))]',
    icone: AlertCircle,
    papel: 'status',
  },
};

/** O ajuste oferecido pelo atalho: uma hora antes do prazo. */
const UMA_HORA_MS = 3_600_000;

/** Instante válido a partir de ISO/data; `null` quando ausente ou inválido. */
function comoData(value: string | Date | null): Date | null {
  if (value === null) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ISO do lembrete 1 h antes do prazo — ou `null` quando esse alvo NÃO deixa a
 * dupla coerente (sem prazo, prazo inválido ou prazo já vencido). A conferência
 * reusa `checkRemindCoherence`, então o botão só aparece quando ele resolve.
 * Interna de propósito: o arquivo exporta só o componente (fast refresh).
 */
function ajusteUmaHoraAntes(
  dueDate: string | Date | null,
  now: Date,
): string | null {
  const prazo = comoData(dueDate);
  if (!prazo) return null;
  const candidato = new Date(prazo.getTime() - UMA_HORA_MS).toISOString();
  return checkRemindCoherence(candidato, dueDate, now).state === 'ok' ? candidato : null;
}

export function CoerenciaLembrete({
  remindAt,
  dueDate,
  now = new Date(),
  onAjustar,
}: CoerenciaLembreteProps) {
  const { state, message } = checkRemindCoherence(remindAt, dueDate, now);
  // Sem lembrete não há o que conferir: a função devolve `ok` com mensagem vazia.
  if (!message) return null;

  const { classe, icone: Icone, papel } = VISUAL[state];
  // Coerente não tem o que ajustar; nos demais estados só oferece o atalho se
  // ele levar a `ok` (o próprio `ajusteUmaHoraAntes` confere).
  const ajuste = state === 'ok' ? null : ajusteUmaHoraAntes(dueDate, now);

  return (
    <div
      data-testid="nt-coerencia"
      data-state={state}
      role={papel}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 ${classe}`}
    >
      <Icone aria-hidden className="h-4 w-4 shrink-0" />
      <span className="text-xs font-medium">{message}</span>
      {ajuste !== null && (
        <button
          type="button"
          data-testid="nt-coerencia-ajustar"
          onClick={() => onAjustar(ajuste)}
          className={
            'ml-auto h-10 shrink-0 rounded-lg px-3 text-xs font-semibold ' +
            'underline-offset-2 hover:underline focus-visible:outline-none ' +
            'focus-visible:ring-2 focus-visible:ring-ring'
          }
        >
          Ajustar para 1 h antes do prazo
        </button>
      )}
    </div>
  );
}

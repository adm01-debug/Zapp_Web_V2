import { z } from 'zod/v3';

/**
 * Schemas do formulário de regra de SLA — o primeiro formulário do app validado
 * por schema (`zodResolver` do react-hook-form), em vez de `validate()` escrito
 * à mão dentro do componente.
 *
 * A API vem de `zod/v3` de propósito. O projeto tem `@hookform/resolvers@3`
 * (3.10.0), e o `zodResolver` dele monta os erros de campo lendo
 * `error.errors` do ZodError; o zod v4 renomeou esse campo para
 * `error.issues`, então um schema do v4 faz o resolver ESTOURAR o ZodError em
 * vez de devolver `{ errors }` (medido em 08/10/2026: node 24, zod 4.6.5,
 * @hookform/resolvers 3.10.0). `zod/v3` faz parte do pacote `zod` já instalado
 * — não é dependência nova — e devolve o formato de erro que o resolver
 * entende. Ver `SLARuleFormDialog.zodResolver.test.tsx`.
 */

/** Teto do nome da regra: o mesmo número vale no `maxLength` do input e no schema. */
export const SLA_RULE_NAME_MAX = 120;

/** Teto das notas de escalação (o `Textarea` já usava 500). */
export const SLA_RULE_NOTES_MAX = 500;

/**
 * O escopo é escolhido em select/lista, não digitado, e a mensagem dele cita o
 * rótulo do escopo aberto ("Selecione um(a) empresa") — por isso o schema é
 * montado por escopo em vez de ser uma constante única.
 */
export function slaRuleFormSchema(scopeLabel: string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(SLA_RULE_NAME_MAX, `Nome deve ter no máximo ${SLA_RULE_NAME_MAX} caracteres`),
    scope: z.string().min(1, `Selecione um(a) ${scopeLabel.toLowerCase()}`),
    priority: z.number().int(),
    metadata: z
      .object({
        notify_on_warning: z.boolean().optional(),
        escalation_notes: z
          .string()
          .max(SLA_RULE_NOTES_MAX, `Notas devem ter no máximo ${SLA_RULE_NOTES_MAX} caracteres`)
          .optional(),
      })
      .optional(),
  });
}

export type SLARuleFormValues = z.infer<ReturnType<typeof slaRuleFormSchema>>;

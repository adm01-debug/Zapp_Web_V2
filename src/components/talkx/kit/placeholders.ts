/**
 * Gramática de placeholders do Talk X — fonte única do front.
 *
 * Módulo PURO (sem React nem imports) para poder ser importado pela prévia
 * (`kit/personalize.ts`), pela extração do resumo (`kit/format.ts`) e pela
 * validação do editor (`TalkXMessageEditor`). As três pontas precisam ler o
 * MESMO token do MESMO jeito, senão o aviso contradiz o texto que será enviado.
 *
 * Regra (idêntica à do envio real, `supabase/functions/_shared/messaging/personalize.ts`):
 *   - a forma é `{{ ... }}` (um ou mais caracteres que não `}`);
 *   - o PRIMEIRO `|` separa a CHAVE do PADRÃO de fallback: `{{nome|cliente}}`
 *     tem chave `nome` e padrão `cliente`;
 *   - a chave é trimada e comparada sem caixa: `{{ Nome }}` ≡ `nome`;
 *   - a chave aceita dígito e underscore: `custom_1` é uma variável válida
 *     (a extração antiga só aceitava `[a-z_]` e a descartava).
 *
 * R2-MOD-062.
 */

export type Placeholder = {
  /** O token inteiro, como aparece no texto: `{{nome|cliente}}`. */
  raw: string;
  /** A chave normalizada (trim + caixa baixa): `nome`. */
  key: string;
  /** O padrão depois do primeiro `|`, ou `null` quando não há. */
  fallback: string | null;
};

/** Separa chave e padrão de um token — aceita o token com ou sem o invólucro externo `{{ }}`. */
export function parsePlaceholder(raw: string): { key: string; fallback: string | null } {
  const inner = raw.trim().replace(/^\{\{/, '').replace(/\}\}$/, '');
  const pipeIndex = inner.indexOf('|');
  const key = (pipeIndex === -1 ? inner : inner.slice(0, pipeIndex)).trim().toLowerCase();
  return { key, fallback: pipeIndex === -1 ? null : inner.slice(pipeIndex + 1) };
}

/** Todos os placeholders do texto, na ordem de aparição (com repetição). */
export function parsePlaceholders(template: string): Placeholder[] {
  const found: Placeholder[] = [];
  for (const match of template.matchAll(/\{\{([^}]+)\}\}/g)) {
    found.push({ raw: match[0], ...parsePlaceholder(match[1]) });
  }
  return found;
}

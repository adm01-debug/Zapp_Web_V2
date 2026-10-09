export type ViolacaoA11y = {
  id: string;
  impact: string;
  nos: number;
};

const IMPACTOS_BLOQUEANTES = new Set(['serious', 'critical']);

export function filtrarViolacoesBloqueantes(violacoes: ViolacaoA11y[]): ViolacaoA11y[] {
  return violacoes.filter((violacao) => IMPACTOS_BLOQUEANTES.has(violacao.impact));
}

/**
 * Regras puras do painel de dedupe entre abas (`CrossTabDedupePanel`).
 *
 * Ficam fora do `.tsx` porque o lint do projeto exige que arquivo de componente
 * só exporte componente (react-refresh/only-export-components): constantes,
 * tipos e funções ajudantes moram aqui. Nada aqui toca React nem o DOM.
 */

/** Linhas exibidas ao mesmo tempo: o painel é um diagnóstico vivo, não um log. */
export const MAX_ACOES_DISPUTADAS = 50;

/** Teto de rótulos guardados (mapa chave -> "Ação #n"); o mais antigo sai antes. */
export const MAX_ROTULOS = 200;

export interface AcaoDisputada {
  /** Rótulo anônimo e estável da ação (a chave real carrega conteúdo). */
  rotulo: string;
  /** Quantas reivindicações de outra aba foram vistas para esta ação. */
  reivindicacoes: number;
  ultimaEm: number;
}

/** Só reivindicação da versão 1 interessa; liberação e payload estranho ficam de fora. */
export function ehReivindicacaoRival(dado: unknown): dado is { key: string } {
  if (!dado || typeof dado !== 'object') return false;
  const mensagem = dado as Record<string, unknown>;
  return (
    mensagem.version === 1 &&
    mensagem.type === 'CLAIM' &&
    typeof mensagem.key === 'string' &&
    mensagem.key.length > 0
  );
}

/**
 * Rótulo anônimo e estável para a chave da ação, com teto de memória: quando o
 * mapa passa de `MAX_ROTULOS` o rótulo mais antigo é descartado. Assim o painel
 * não guarda uma entrada por chave vista desde que a aba abriu.
 */
export function rotular(
  key: string,
  mapa: Map<string, string>,
  contador: { current: number },
): string {
  const existente = mapa.get(key);
  if (existente) return existente;

  if (mapa.size >= MAX_ROTULOS) {
    const maisAntiga = mapa.keys().next().value;
    if (maisAntiga !== undefined) mapa.delete(maisAntiga);
  }

  contador.current += 1;
  const novo = `Ação #${contador.current}`;
  mapa.set(key, novo);
  return novo;
}

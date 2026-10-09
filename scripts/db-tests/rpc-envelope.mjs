/**
 * scripts/db-tests/rpc-envelope.mjs
 *
 * Contrato da resposta do RPC `public.mcp_exec` (o mesmo que o gateway MCP usa para
 * rodar SQL) — consumido pelo runner da suite de regressao de banco.
 *
 * O RPC devolve UM jsonb, nunca um array:
 *   - com conjunto de resultado:  { rows: [...], row_count: n, truncated: bool, ms: n }
 *   - comando sem result set:     { ok: true, rows_affected: n, ms: n }
 * Cada assertiva e uma linha de `rows` com `test` (id) e `result` em PASS/FAIL/SKIP.
 *
 * Fonte do contrato: supabase/migrations/20260829020000_mcp_exec_functions_harden.sql
 * e 20261003272707_reconcile_local_replay_with_canonical.sql (CREATE OR REPLACE
 * FUNCTION public.mcp_exec(sql text, max_rows integer DEFAULT 200) RETURNS jsonb).
 *
 * Este modulo e puro (sem rede, sem disco) para que a suite possa provar o
 * contrato sem banco. Ver run-all.unit.mjs.
 */

/** Resultados que uma linha de assertiva pode declarar. */
export const RESULTADOS = new Set(['PASS', 'FAIL', 'SKIP']);

/** Descreve um valor recebido numa mensagem de erro, sem despejar o payload inteiro. */
export function descreverValor(valor) {
  if (valor === null) return 'null';
  if (valor === undefined) return 'undefined';
  if (Array.isArray(valor)) return `array(${valor.length})`;
  const tipo = typeof valor;
  if (tipo === 'string') return `string ${JSON.stringify(valor.length > 40 ? `${valor.slice(0, 40)}...` : valor)}`;
  if (tipo === 'object') {
    const chaves = Object.keys(valor);
    return `objeto {${chaves.slice(0, 6).join(', ') || 'sem chaves'}}`;
  }
  return `${tipo} ${String(valor)}`;
}

/**
 * Decodifica a resposta do RPC. Devolve `{ assertivas, rowCount }` ou lanca erro
 * explicando por que a resposta nao serve como prova (envelope de outro formato,
 * resposta truncada, envelope inconsistente, linha sem id ou sem PASS/FAIL).
 *
 * @param {unknown} payload corpo JSON devolvido por POST /rest/v1/rpc/mcp_exec
 * @param {string} [arquivo] nome do .sql, para a mensagem de erro
 */
export function decodificarResposta(payload, arquivo = '') {
  const onde = arquivo ? ` (${arquivo})` : '';

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(
      `resposta${onde} nao e o envelope de mcp_exec: esperado objeto com 'rows', recebido ${descreverValor(payload)}`,
    );
  }

  if (!Array.isArray(payload.rows)) {
    if (payload.ok === true) {
      throw new Error(
        `resposta${onde} veio sem linhas: mcp_exec executou comando sem conjunto de resultado `
        + `(rows_affected=${payload.rows_affected ?? '?'}); o arquivo nao devolveu nenhuma assertiva`,
      );
    }
    throw new Error(
      `resposta${onde} nao tem 'rows' (chaves: ${Object.keys(payload).join(', ') || 'nenhuma'})`,
    );
  }

  if (payload.truncated === true) {
    throw new Error(
      `resposta${onde} truncada: ${payload.rows.length} de ${payload.row_count ?? '?'} linhas; `
      + 'resultado parcial nao vale como prova',
    );
  }

  if (typeof payload.row_count === 'number' && payload.row_count !== payload.rows.length) {
    throw new Error(
      `envelope${onde} inconsistente: row_count=${payload.row_count} != rows=${payload.rows.length}`,
    );
  }

  const assertivas = payload.rows.map((linha, i) => {
    if (linha === null || typeof linha !== 'object' || Array.isArray(linha)) {
      throw new Error(`linha ${i}${onde} nao e um objeto de assertiva: ${descreverValor(linha)}`);
    }
    const id = typeof linha.test === 'string' && linha.test.trim() !== '' ? linha.test.trim() : null;
    const status = typeof linha.result === 'string' ? linha.result.trim().toUpperCase() : null;
    if (!id) {
      throw new Error(`linha ${i}${onde} sem identificador ('test'): ${descreverValor(linha)}`);
    }
    if (!RESULTADOS.has(status)) {
      throw new Error(
        `linha ${i}${onde} (${id}) sem resultado PASS/FAIL/SKIP: result=${descreverValor(linha.result)}`,
      );
    }
    return {
      id,
      status,
      detail: linha.detail === null || linha.detail === undefined ? '' : String(linha.detail),
    };
  });

  return { assertivas, rowCount: typeof payload.row_count === 'number' ? payload.row_count : payload.rows.length };
}

/**
 * Consolida o resultado de cada arquivo. Recebe `[{ arquivo, assertivas }]` ou
 * `[{ arquivo, erro }]` (arquivo que nao provou nada). Zero assertiva executada
 * NAO e sucesso: entra em `erros`.
 */
export function resumirSuite(porArquivo) {
  const resumo = { arquivos: porArquivo.length, pass: 0, fail: 0, skip: 0, total: 0, erros: [] };

  for (const resultado of porArquivo) {
    if (resultado.erro) {
      resumo.erros.push({ arquivo: resultado.arquivo, motivo: resultado.erro });
      continue;
    }
    for (const assertiva of resultado.assertivas ?? []) {
      // SKIP e "nao deu para provar" (ex.: sem dado no banco): conta, mas nao e prova.
      if (assertiva.status === 'PASS') resumo.pass += 1;
      else if (assertiva.status === 'FAIL') resumo.fail += 1;
      else resumo.skip += 1;
    }
  }

  resumo.total = resumo.pass + resumo.fail;

  if (resumo.total === 0) {
    resumo.erros.push({
      arquivo: '(suite)',
      motivo: `nenhuma assertiva executada (${resumo.arquivos} arquivo(s), ${resumo.skip} SKIP): zero nao e sucesso`,
    });
  }

  return resumo;
}

/** Codigo de saida da suite: 0 so com alguma prova e nenhuma falha. */
export function codigoDeSaida(resumo) {
  return resumo.erros.length === 0 && resumo.fail === 0 ? 0 : 1;
}

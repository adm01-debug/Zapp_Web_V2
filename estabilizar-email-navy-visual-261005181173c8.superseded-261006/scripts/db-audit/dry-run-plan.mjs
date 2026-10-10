import { readFileSync } from 'node:fs';

// E63 (auditoria de GitHub Actions, 2026-10-01): o passo "Dry-run oficial do
// Supabase CLI" roda `supabase db push --include-all --skip-vault --dry-run
// --yes` e NINGUEM le a saida. O dry-run existe para provar quais migrations
// seriam aplicadas -- se ele anuncia outra migration alem do alvo autorizado, o
// apply roda igual e o operador so' descobre depois (ou nunca).
//
// Formato da saida, medido na fonte upstream e nao inventado aqui -- issue
// supabase/cli#776 registra a saida real:
//
//   DRY RUN: migrations will *not* be pushed to the database.
//   Would push migration 20230108110451_this_should_fail.sql...
//
// A forma de lista ("Would push these migrations: a.sql") tambem e' aceita
// porque aparece em material da propria Supabase. Qualquer saida que nao se
// encaixe em nenhuma das duas e' recusada, nunca ignorada.

export const CABECALHO_DRY_RUN = /^DRY RUN: migrations will \*not\* be pushed to the database\.\s*$/;
const LINHA_UNITARIA = /^Would push migration (\S+)\.\.\.\s*$/;
const LINHA_LISTA = /^Would push these migrations:\s*(.+)$/;

/**
 * Le a saida do dry-run. Devolve as migrations anunciadas em ordem, com version
 * e nome derivados do nome do arquivo.
 */
export function parseDryRunPlan(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/);
  const cabecalhoReconhecido = linhas.some((l) => CABECALHO_DRY_RUN.test(l.trim()));
  const arquivos = [];
  for (const linha of linhas) {
    const l = linha.trim();
    const unitaria = LINHA_UNITARIA.exec(l);
    if (unitaria) {
      arquivos.push(unitaria[1]);
      continue;
    }
    const lista = LINHA_LISTA.exec(l);
    if (lista) {
      for (const item of lista[1].trim().split(/\s+/)) {
        if (item) arquivos.push(item);
      }
    }
  }
  const migracoes = arquivos.map((arquivo) => {
    const semSufixo = arquivo.replace(/\.sql$/, '');
    const corte = semSufixo.indexOf('_');
    return {
      arquivo,
      version: corte === -1 ? semSufixo : semSufixo.slice(0, corte),
      nome: corte === -1 ? '' : semSufixo.slice(corte + 1),
    };
  });
  return { cabecalhoReconhecido, migracoes };
}

/**
 * Decide se o plano anunciado pelo dry-run e' exatamente o autorizado.
 *
 * - Sem bundle: exatamente UMA migration, e e' a version alvo. E' este o caso
 *   que a E63 pede: duas versions anunciadas -> recusa.
 * - Com bundle autorizado: qualquer quantidade, desde que em ordem estrita de
 *   version e que o alvo esteja entre elas. "Autorizado" continua sendo decisao
 *   do preflight (apply_bundle), nao deste parser.
 */
export function avaliarPlanoDoDryRun({ texto, esperado, permitirBundle = false }) {
  const { cabecalhoReconhecido, migracoes } = parseDryRunPlan(texto);
  if (!cabecalhoReconhecido) {
    return { ok: false, motivo: 'saida do dry-run nao reconhecida (falta o cabecalho "DRY RUN: migrations will *not* be pushed to the database.")' };
  }
  if (migracoes.length === 0) {
    return { ok: false, motivo: 'o dry-run nao anunciou nenhuma migration' };
  }
  if (!permitirBundle) {
    if (migracoes.length !== 1) {
      return {
        ok: false,
        motivo: `o dry-run anunciou ${migracoes.length} migrations (${migracoes.map((m) => m.version).join(', ')}); o alvo autorizado e' so' ${esperado}`,
      };
    }
    if (migracoes[0].version !== esperado) {
      return { ok: false, motivo: `o dry-run anunciou ${migracoes[0].version}, mas o alvo autorizado e' ${esperado}` };
    }
    return { ok: true, migracoes };
  }
  const versions = migracoes.map((m) => m.version);
  for (let i = 1; i < versions.length; i += 1) {
    if (versions[i] <= versions[i - 1]) {
      return { ok: false, motivo: `bundle fora de ordem estrita: ${versions[i - 1]} antes de ${versions[i]}` };
    }
  }
  if (!versions.includes(esperado)) {
    return { ok: false, motivo: `o bundle anunciado nao inclui o alvo ${esperado}` };
  }
  return { ok: true, migracoes };
}

export function mensagemDoPlano({ migracoes }) {
  return migracoes.map((m) => `  - ${m.version} (${m.arquivo})`).join('\n');
}

// --- CLI (usado pelo passo do workflow) -----------------------------------
if (process.argv[1]?.endsWith('dry-run-plan.mjs')) {
  const args = process.argv.slice(2);
  const valor = (nome) => {
    const i = args.indexOf(nome);
    return i === -1 ? undefined : args[i + 1];
  };
  const arquivo = valor('--arquivo');
  const esperado = valor('--esperado');
  const permitirBundle = args.includes('--bundle');
  if (!arquivo || !/^\d{14}$/.test(String(esperado ?? ''))) {
    console.error('uso: node scripts/db-audit/dry-run-plan.mjs --arquivo <saida-do-dry-run> --esperado <version> [--bundle]');
    process.exit(2);
  }
  const resultado = avaliarPlanoDoDryRun({ texto: readFileSync(arquivo, 'utf8'), esperado, permitirBundle });
  if (!resultado.ok) {
    console.error(`::error::Dry-run recusado: ${resultado.motivo}`);
    process.exit(1);
  }
  console.log(`OK: o dry-run anuncia exatamente o autorizado (${resultado.migracoes.length} migration(s)):`);
  console.log(mensagemDoPlano(resultado));
}

// E62: executor generico do contrato de runtime.
//
// O passo "Provar estado runtime antes do push" do db-migrate.yml tinha um braco de
// `case` por versao (12 contratos, ~275 linhas uteis embutidas). Este executor
// substitui os bracos: para a versao alvo, le o contrato em
// `scripts/db-audit/contracts/<versao>.sql`, roda pelo mesmo cliente (psql-safe.mjs,
// os mesmos flags) e imprime o resultado, que o workflow compara ao
// CONFIRM_RUNTIME_SHA256 (composicao da E64).
//
// W28: assercoes inline por versao movidas para scripts/db-audit/contracts/<versao>.expect.json,
// lidas por lerExpect/avaliarContraExpect. O NODE heredoc de ~640 linhas do db-migrate.yml
// foi substituido por uma chamada: node scripts/db-audit/run-runtime-contract.mjs
//
// FAIL-CLOSED semantica (W29):
//   - sem arquivo dedicado  → lerContratoComFallback devolve o contrato generico;
//     proof.contract === 'generic' no output. O executor usa sempre esse caminho.
//   - arquivo dedicado vazio → falha fechado (exit 2): arquivo vazio e um engano.
//   - arquivo dedicado com conteudo → executa o contrato dedicado.
//
// lerContrato (exportada para testes) mantém o comportamento antigo (throw se ausente)
// para nao quebrar os testes de E62 que verificam as 12 contratos historicos.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { sha256DeTexto, comporHashConfirmacao } from './confirm-hash.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATOS = join(AQUI, 'contracts');
const PSQL_SAFE = join(AQUI, 'psql-safe.mjs');
const GENERIC_SQL = join(AQUI, 'generic-migration-runtime.sql');

export function caminhoDoContrato(versao, dir = CONTRATOS) {
  const v = String(versao ?? '').trim();
  if (!/^\d{14}$/.test(v)) {
    throw new Error(`versao alvo invalida: "${versao}" (esperado 14 digitos)`);
  }
  return join(dir, `${v}.sql`);
}

// Comportamento original: throw se nao existe. Mantido para compatibilidade
// com os testes E62 que verificam os 12 contratos historicos.
export function lerContrato(versao, dir = CONTRATOS) {
  const arquivo = caminhoDoContrato(versao, dir);
  if (!existsSync(arquivo)) {
    throw new Error(`contrato de runtime ausente para a versao ${versao}: ${arquivo}`);
  }
  const sql = readFileSync(arquivo, 'utf8');
  if (!sql.trim()) throw new Error(`contrato vazio para a versao ${versao}: ${arquivo}`);
  return sql;
}

// W29: sem contrato dedicado → fallback para generic-migration-runtime.sql.
// Fail-closed so para arquivo dedicado VAZIO (engano explicito).
export function lerContratoComFallback(versao, dir = CONTRATOS) {
  const arquivo = caminhoDoContrato(versao, dir);
  if (!existsSync(arquivo)) {
    // W29: sem contrato dedicado → generico.
    return { sql: readFileSync(GENERIC_SQL, 'utf8'), tipo: 'generic' };
  }
  const sql = readFileSync(arquivo, 'utf8');
  // Arquivo dedicado vazio e um engano: fail-closed.
  if (!sql.trim()) throw new Error(`contrato vazio para a versao ${versao}: ${arquivo}`);
  return { sql, tipo: 'dedicado' };
}

// W28: carrega o arquivo .expect.json para a versao alvo. Retorna null se nao existir.
export function lerExpect(versao, dir = CONTRATOS) {
  const v = String(versao ?? '').trim();
  if (!/^\d{14}$/.test(v)) throw new Error(`versao alvo invalida: "${versao}"`);
  const arquivo = join(dir, `${v}.expect.json`);
  if (!existsSync(arquivo)) return null;
  const conteudo = readFileSync(arquivo, 'utf8').trim();
  if (!conteudo) throw new Error(`expect vazio para ${versao}: ${arquivo}`);
  return JSON.parse(conteudo);
}

// W28: testa um campo do proof contra o valor esperado do .expect.json.
// Retorna null se passou, ou string de motivo se falhou.
export function testarCampo(campo, valor, esperado) {
  if (esperado === null || esperado === undefined) return null;
  if (typeof esperado === 'object' && !Array.isArray(esperado)) {
    if ('$regex' in esperado) {
      const re = new RegExp(esperado.$regex);
      if (!re.test(String(valor))) return `${campo}: "${valor}" nao casa com ${esperado.$regex}`;
      return null;
    }
    if ('$min' in esperado || '$max' in esperado) {
      const n = Number(valor);
      if ('$min' in esperado && n < esperado.$min) return `${campo}: ${valor} < minimo ${esperado.$min}`;
      if ('$max' in esperado && n > esperado.$max) return `${campo}: ${valor} > maximo ${esperado.$max}`;
      return null;
    }
    if ('$any' in esperado) {
      if (!esperado.$any.includes(valor)) return `${campo}: ${JSON.stringify(valor)} nao esta em ${JSON.stringify(esperado.$any)}`;
      return null;
    }
    if ('$eq_field' in esperado) {
      // Tratado em avaliarContraExpect com acesso ao proof completo
      return null;
    }
  }
  if (valor !== esperado) {
    return `${campo}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(valor)}`;
  }
  return null;
}

// W28: compara o proof (objeto parseado do JSON do contrato SQL) contra as
// expectativas do .expect.json. needsApply=true → secao "before"; false → "after".
// Retorna { ok: true } ou { ok: false, falhas: string[] }.
export function avaliarContraExpect(proof, expect, needsApply) {
  const falhas = [];
  function verificarSecao(secao) {
    if (!secao) return;
    for (const [campo, esperado] of Object.entries(secao)) {
      if (typeof esperado === 'object' && !Array.isArray(esperado) && esperado !== null && '$eq_field' in esperado) {
        const outroValor = proof[esperado.$eq_field];
        if (proof[campo] !== outroValor) {
          falhas.push(`${campo}: esperado igual a "${esperado.$eq_field}" (${JSON.stringify(outroValor)}), obtido ${JSON.stringify(proof[campo])}`);
        }
        continue;
      }
      const motivo = testarCampo(campo, proof[campo], esperado);
      if (motivo) falhas.push(motivo);
    }
  }
  verificarSecao(expect.always);
  verificarSecao(needsApply ? expect.before : expect.after);
  if (falhas.length > 0) return { ok: false, falhas };
  return { ok: true };
}

async function principal() {
  // Suporta versao como argv[2] (modo test legado) ou TARGET_VERSION (modo YAML novo)
  const versao = process.argv[2] || process.env.TARGET_VERSION;
  const needsApply = process.env.NEEDS_APPLY === 'true';

  let contrato;
  try {
    contrato = lerContratoComFallback(versao);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(2);
  }

  // Detecta delegacao: contrato.sql com "-f <arquivo.sql>" e um script shell, nao SQL puro
  const delegacaoMatch = contrato.sql.match(/-f\s+(\S+\.sql)/);
  let r;
  if (delegacaoMatch) {
    const sqlRelativo = delegacaoMatch[1];
    const sqlAbsoluto = resolve(process.cwd(), sqlRelativo);
    r = spawnSync(process.execPath, [PSQL_SAFE, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', sqlAbsoluto], {
      encoding: 'utf8',
    });
  } else {
    r = spawnSync(process.execPath, [PSQL_SAFE, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', contrato.sql], {
      encoding: 'utf8',
    });
  }

  if (r.status !== 0) {
    console.error(r.stderr || `::error::psql-safe saiu com ${r.status}`);
    process.exit(r.status ?? 1);
  }

  // Parse do JSON de proof
  let proof;
  try {
    proof = JSON.parse(r.stdout.trim());
  } catch {
    // Nao e JSON (contrato generico ou saida textual) — apenas imprimir e sair
    process.stdout.write(r.stdout);
    return;
  }

  // Verificacoes comuns (server_major, database, runtime_sha256)
  const errosComuns = [];
  if (proof.server_major !== undefined && proof.server_major !== 17) {
    errosComuns.push(`server_major: esperado 17, obtido ${proof.server_major}`);
  }
  if (proof.runtime_sha256 !== undefined && !/^[a-f0-9]{64}$/.test(String(proof.runtime_sha256))) {
    errosComuns.push(`runtime_sha256: formato invalido: "${proof.runtime_sha256}"`);
  }
  if (errosComuns.length > 0) {
    for (const e of errosComuns) console.error(`::error::${e}`);
    process.exit(1);
  }

  // Verificacao contra .expect.json (se existir)
  const expect = lerExpect(versao);
  if (expect) {
    const resultado = avaliarContraExpect(proof, expect, needsApply);
    if (!resultado.ok) {
      for (const f of resultado.falhas) console.error(`::error::W28 expect falhou: ${f}`);
      process.exit(1);
    }
    console.log(`OK: ${resultado.ok ? 'todas as expectativas passaram' : ''} (versao=${versao}, needsApply=${needsApply})`);
  }

  // Hash de confirmacao (so no CI, quando GITHUB_SHA disponivel)
  if (process.env.GITHUB_SHA && proof.runtime_sha256) {
    const arquivoSha256 = sha256DeTexto(JSON.stringify(proof));
    try {
      comporHashConfirmacao({
        runtimeSha256: proof.runtime_sha256,
        arquivoSha256,
        commitSha: process.env.GITHUB_SHA,
      });
    } catch (e) {
      console.error(`::error::hash de confirmacao: ${e.message}`);
      process.exit(1);
    }
  }

  process.stdout.write(r.stdout);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) principal();

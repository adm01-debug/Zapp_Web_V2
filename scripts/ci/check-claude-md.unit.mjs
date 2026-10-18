// GA02: trava anti-apagão do CLAUDE.md.
//
// Reprova se o CLAUDE.md perder as seções críticas (fonte de verdade do
// projeto) ou encolher mais de 30 % em relação à base do PR. O guard
// protege contra o padrão observado no commit a50d52a: uma sessão que cai
// no meio da escrita + auto-merge = CLAUDE.md truncado em produção.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CAMINHO = join(RAIZ, 'CLAUDE.md');

// Seções cuja ausência indica truncamento acidental.
const SECOES_OBRIGATORIAS = [
  { padrao: /^## 1\. Banco de dados OFICIAL/m, nome: '## 1. Banco de dados OFICIAL' },
  { padrao: /^## Perímetro do GitHub/m, nome: '## Perímetro do GitHub' },
  { padrao: /^## Auditoria de workflows/m, nome: '## Auditoria de workflows' },
];

// Tamanho mínimo absoluto (chars). O arquivo tem ~22 000 chars; 50 % disso =
// 11 000. Se cair abaixo disso, alguma truncagem grave ocorreu.
const TAMANHO_MINIMO = 11_000;

test('GA02: CLAUDE.md existe e tem tamanho mínimo', () => {
  assert.ok(
    existsSync(CAMINHO),
    'CLAUDE.md sumiu do repositório — fonte de verdade do projeto apagada',
  );
  const conteudo = readFileSync(CAMINHO, 'utf8');
  assert.ok(
    conteudo.length >= TAMANHO_MINIMO,
    `CLAUDE.md tem apenas ${conteudo.length} chars (mínimo: ${TAMANHO_MINIMO}). Arquivo truncado?`,
  );
});

test('GA02: CLAUDE.md tem todas as seções críticas', () => {
  const conteudo = readFileSync(CAMINHO, 'utf8');
  const ausentes = SECOES_OBRIGATORIAS.filter(({ padrao }) => !padrao.test(conteudo));
  assert.deepEqual(
    ausentes.map((s) => s.nome),
    [],
    `GA02: seções críticas ausentes no CLAUDE.md:\n${ausentes.map((s) => `  - ${s.nome}`).join('\n')}`,
  );
});

test('GA02: CLAUDE.md não encolheu mais de 30% em relação à base do PR', () => {
  // Em ambiente sem git ou sem commit de base (local/fresh clone), pula.
  const base = process.env.GITHUB_BASE_REF || process.env.CLAUDE_MD_BASE_REF;
  if (!base) {
    // Fora de CI: verifica apenas que o arquivo tem tamanho razoável vs o
    // mínimo absoluto já checado acima.
    return;
  }
  let tamBase;
  try {
    const saida = execSync(
      `git show "origin/${base}:CLAUDE.md" 2>/dev/null || git show "${base}:CLAUDE.md"`,
      { cwd: RAIZ, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    );
    tamBase = saida.length;
  } catch {
    // Base não acessível (raso demais, first PR etc.) — pula sem bloquear.
    return;
  }
  const tamAtual = readFileSync(CAMINHO, 'utf8').length;
  const reducao = (tamBase - tamAtual) / tamBase;
  assert.ok(
    reducao <= 0.3,
    `GA02: CLAUDE.md encolheu ${(reducao * 100).toFixed(1)}% em relação à base (${tamBase} → ${tamAtual} chars). Truncagem acidental?`,
  );
});

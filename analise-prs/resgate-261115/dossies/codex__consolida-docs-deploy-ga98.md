# Dossiê — `codex/consolida-docs-deploy-ga98`

- Ref: `origin/codex/consolida-docs-deploy-ga98` · tip `dc65649ad` · merge-base `c3669c901` (2026-10-28, 1 commit à frente) · PRs: nenhuma.
- Commit único: `dc65649ad fix(docs): preserva descrições multilinha de não é bug da pasta B`.
- `git diff --stat c3669c901 origin/codex/consolida-docs-deploy-ga98`: 2 arquivos, +38/-0.

## Propósito
Endurecer o gerador `scripts/ci/render-workflow-docs.mjs` (W96, gera `docs/ci/README.md` a partir dos blocos `# docs:` / `# nao-e-bug:` dos workflows): (1) linha de comentário mais indentada (`#     texto`) continua a descrição do item `nao-e-bug` anterior em vez de encerrar o bloco; (2) exporta `extrairDocs`/`extrairNaoEBug` e protege o corpo do script com guarda "só roda como main" para o parser poder ser importado em testes; (3) novo teste `render-workflow-docs.multiline.unit.mjs` (2 casos).

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `scripts/ci/render-workflow-docs.mjs` | MAIN_UNCHANGED_SINCE_BASE / ABSENT_APPLIES_CLEAN | **PERDIDA**. Main é byte-idêntica à merge-base (blob `3fddd64f0`; `git log c3669c901..origin/main -- scripts/ci/render-workflow-docs.mjs` vazio). Em `origin/main:scripts/ci/render-workflow-docs.mjs:89-96` o loop de `extrairNaoEBug` ainda só aceita `#   - chave: desc` ou `#` vazio e dá `break` em qualquer outra linha; não há `export` (grep `extrairNaoEBug` na main só acha definição em :77 e uso em :135) nem guarda de main. | `git show origin/main:scripts/ci/render-workflow-docs.mjs` |
| `scripts/ci/render-workflow-docs.multiline.unit.mjs` | NEW_FILE_ABSENT_IN_MAIN | **PERDIDA**. Não existe na main nem equivalente (`git ls-tree origin/main scripts/ci/` não tem `render-workflow-docs*.unit.mjs`; `git grep GA98 origin/main -- scripts` sem hits). Seria executado pelo CI: `ci.yml:166 node --test scripts/ci/*.unit.mjs`. | `git ls-tree`, `git grep` |

## Necessidade hoje na main
- Varredura dos 4 workflows da main com bloco `# nao-e-bug:` (`ci.yml`, `contexto.yml`, `crm-sync-worker.yml`, `types-sync.yml`): **nenhuma** linha de continuação `#     ...` dentro do bloco (todas as descrições estão em linha única; o primeiro `# ====` ou texto solto encerra o bloco). Mesmo resultado na merge-base. Ou seja: o bug que a branch corrige não ocorre com os YAMLs atuais; é proteção para o dia em que alguém quebrar uma descrição longa em duas linhas (hoje a segunda linha seria descartada silenciosamente e o `--check` não detecta).
- "Pasta B" = coleta de 28/10 da consolidação (`docs/_arquivo/docs/consolidacao/PLANO.md:35`); o commit nasceu nesse esforço, não de um workflow quebrado.

## Veredito
**PERDIDA_TOTAL**, valor **baixo** (tooling de docs do CI; sem efeito em produto, WhatsApp, inbox ou banco). Aplica limpo na main (arquivo-alvo inalterado). `apagar_branch_seguro = false` (trabalho útil não está na main).

## Como portar (hunks essenciais)

### `scripts/ci/render-workflow-docs.mjs`
Após a linha 93 da main (`continue;` do `m` em `extrairNaoEBug`), antes de `// Linha de comentário vazia continua...`:
```js
    // Uma linha mais indentada continua a descricao do item anterior (GA98).
    const cont = /^#\s{5,}(\S.*?)\s*$/.exec(linha);
    if (cont && itens.length > 0) {
      itens[itens.length - 1].descricao += ' ' + cont[1];
      continue;
    }
```
Após `nomeDe` (linha 106 da main), envolvendo todo o restante do script (linhas 108-216) e fechando com `}` no fim do arquivo:
```js
export { extrairDocs, extrairNaoEBug };

// O parser pode ser importado nos contratos sem regenerar arquivos.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // ... corpo atual (KPI, leitura dos workflows, montagem do README, --check, writeFile) ...
}
```
Observação para quem portar: `fileURLToPath` já está importado (linha 35); top-level `await` dentro do `if` é válido em ESM. Depois de aplicar, rodar `node scripts/ci/render-workflow-docs.mjs --check` para confirmar que o README continua idêntico (comportamento inalterado para itens de linha única) e `node --test scripts/ci/render-workflow-docs.multiline.unit.mjs`.

### `scripts/ci/render-workflow-docs.multiline.unit.mjs` (novo, íntegro)
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { extrairDocs, extrairNaoEBug } from './render-workflow-docs.mjs';

test('GA98: descricao nao-e-bug continua na linha seguinte', () => {
  const texto = [
    '# docs:',
    '#   gatilho: x',
    '#   prova: y',
    '#   falha: z',
    '#   avisa: w',
    '# nao-e-bug:',
    '#   - item longo: primeira parte',
    '#     segunda parte da mesma descricao',
    '# =================================================',
    'name: X',
  ].join('\n');

  assert.deepEqual(extrairNaoEBug(texto), [
    { chave: 'item longo', descricao: 'primeira parte segunda parte da mesma descricao' },
  ]);
});

test('GA98: bloco docs mantém os quatro campos', () => {
  const texto = '# docs:\n#   gatilho: x\n#   prova: y\n#   falha: z\n#   avisa: w\nname: X\n';
  assert.deepEqual(extrairDocs(texto), { gatilho: 'x', prova: 'y', falha: 'z', avisa: 'w' });
});
```
Ou simplesmente: `git diff c3669c901 origin/codex/consolida-docs-deploy-ga98 | git apply` em branch nova a partir da main (aplica limpo).

## Verificação adversarial

Parecer: **CONCORDO** com a triagem — `PERDIDA_TOTAL`, valor baixo, `apagar_branch_seguro = false`. Tentei refutar por três vias (já está na main / foi removida de propósito / não encaixa mais) e nenhuma se sustentou.

1. **Não está na main (prova forte, não indireta).** O blob de `scripts/ci/render-workflow-docs.mjs` é o *mesmo objeto* na main e na merge-base: `git rev-parse origin/main:scripts/ci/render-workflow-docs.mjs` = `c3669c901:…` = `3fddd64f08f77c926a46a68b4b652c7dd24707f9` (branch: `097e94cff`). Byte-idêntico ⇒ nenhuma das 8 linhas pode estar lá. `git merge-base --is-ancestor dc65649ad origin/main` → falso (tip fora da main). `origin/main:scripts/ci/render-workflow-docs.mjs:98-99` ainda é `if (/^#\s*$/.test(linha)) continue; break;` sem tratar continuação, e o arquivo termina em `console.log(...)` sem `export` nem guarda. `git ls-tree --name-only origin/main scripts/ci/` tem 230 arquivos e nenhum `render-workflow-docs*.unit.mjs`.
2. **Não foi removida de propósito.** `git log c3669c901..origin/main -- scripts/ci/render-workflow-docs.mjs` vazio; o histórico do arquivo na main para em `c9c849285` (#1936) e `6846cb173` (#1859), ambos anteriores à base. `git log -S'export { extrairDocs, extrairNaoEBug }'` e `-S'continua a descricao do item anterior'` na main: zero hits — o código nunca existiu lá, logo não houve revert/desativação.
3. **Não há substituto equivalente.** `git grep "s{5,}\|continuacao" origin/main -- scripts/ci` só acha tratamento de continuação em outros parsers (`implicit-any-ratchet`, `typecheck-ratchet`, `db-migrate-contratos`), nada no gerador de docs de workflow. O gerador segue ativo e obrigatório: `origin/main:.github/workflows/ci.yml:154 node scripts/ci/render-workflow-docs.mjs --check`.
4. **Ainda encaixa e funciona hoje (verificado executando, não lendo).** Copiei os dois arquivos da branch para um sandbox com os `.github/workflows/` e o `docs/ci/README.md` da main (`/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/ga98`): `node --check` passa; `node …/render-workflow-docs.mjs --check` → `OK: docs/ci/README.md bate com os 21 workflows.` (exit 0) ⇒ a guarda `process.argv[1] === fileURLToPath(import.meta.url)` e o top-level `await` dentro do `if` funcionam e o README gerado **não muda**; `node --test …multiline.unit.mjs` → `# pass 2 / # fail 0`. `fileURLToPath` já está importado na main (`:36`).
5. **Risco de regressão do hunk: nenhum nos YAMLs atuais.** Varri os 21 workflows por `^#\s{5,}\S`: há 4 linhas assim (`crm-sync-worker.yml:12,14,17` e `inventario-estado-semanal.yml:17`), mas todas estão **fora** do bloco `nao-e-bug:` — em `crm-sync-worker.yml` o bloco é só a linha 7 e a linha 8 (`# ====…`, um único espaço) já encerra o laço antes; `inventario-estado-semanal.yml` não tem bloco `nao-e-bug:` (só `ci.yml`, `contexto.yml`, `crm-sync-worker.yml` e `types-sync.yml` têm, `git grep -n nao-e-bug origin/main -- .github/workflows`). Confirma a leitura da triagem: hoje é proteção futura, e o `--check` não quebra.
6. **Inventário de testes não cria dívida.** `ci.yml:164-166` roda `node --test scripts/ci/*.unit.mjs` (globo), e `check-test-inventory.mjs` aceita globo citado em bloco `run:` como cobertura — o teste novo entra sem registro manual em ALLOWLIST.

Nenhuma lacuna adicional além das duas já listadas. Ressalva de porte (não altera o veredito): portar os dois arquivos no mesmo commit — o teste importa `{ extrairDocs, extrairNaoEBug }` do gerador, que só passa a exportar com o primeiro hunk.

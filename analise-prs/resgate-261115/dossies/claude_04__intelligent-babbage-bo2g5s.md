# Dossiê — claude_04__intelligent-babbage-bo2g5s (PR #2601)

**Ref:** `origin/claude_04/intelligent-babbage-bo2g5s` · tip `1adaffb06` · merge-base `c4280ef4c` (2026-11-02)
**Commits:** `3fcd40af3 fix(auth): aumentar AUTH_LOGIN_TIMEOUT_MS de 12s para 25s` (+ merge de main `1adaffb06`)
**Stat:** `src/lib/serverLogin.ts | 10 +++++-----` (1 arquivo, 5+/5-)

## Propósito
Subir o teto de espera da edge `auth-login` de 12s para 25s porque a edge levava ~20s no E2E (us-west-2 forçado) e 12s cortava logins legítimos no CI. Só muda a constante `AUTH_LOGIN_TIMEOUT_MS` e o comentário explicativo.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/lib/serverLogin.ts` | **Superado na main**: a mesma necessidade (timeout > 20s para cobrir cold start do Deno) foi resolvida pela PR #2602 com valor **30s**, não 25s. O comentário também foi reescrito. | `git grep -n origin/main -- src/lib/serverLogin.ts` → linha 93: `export const AUTH_LOGIN_TIMEOUT_MS = 30_000;`; comentário (linhas 87-90): "30s cobre cold starts do Deno (medidos em 15-25s)... continua FECHADA ... lockout segue sendo aplicado". `git log -S'AUTH_LOGIN_TIMEOUT_MS = 30_000' --oneline origin/main -- src/lib/serverLogin.ts` → `b4a1d8f6f fix(e2e): aumenta AUTH_LOGIN_TIMEOUT_MS 12s→30s para cobrir cold start do Deno (#2602)`. `git merge-base --is-ancestor 3fcd40af3 origin/main` → NÃO é ancestral (o commit da branch em si não entrou; a intenção entrou via #2602). |

As 5 linhas "missing_in_main" são o comentário da branch (texto "25s — a edge levou ~20 s...") e a linha `= 25_000` — ambas substituídas de propósito pela versão 30s de #2602. A main não mantém nenhuma das linhas que a branch removia (`removed_still_in_main = 0`): o valor 12s e o comentário antigo já saíram.

Semântica preservada na main: timeout usado em `setTimeout(() => controller.abort(), AUTH_LOGIN_TIMEOUT_MS)` (linha 126) e expiração cai em `unavailable` (linha 152) — a propriedade "falha fechada, nunca cai no GoTrue direto" que a branch descrevia continua válida.

## Veredito
**OBSOLETA** (confiança alta). A branch e a #2602 atacam o mesmo bug (login legítimo cortado pelo timeout de 12s); a main já tem a solução com margem maior (30s). Portar 25s seria regressão em relação ao que está em produção.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro: **sim** — único arquivo, intenção totalmente coberta por `b4a1d8f6f` (#2602).

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar procurando qualquer hunk útil fora da main; não existe nenhum.

- Superfície total da branch: `git diff c4280ef4c origin/claude_04/intelligent-babbage-bo2g5s --stat` → `src/lib/serverLogin.ts | 10 +++++-----` (1 arquivo, 5+/5-). O merge `1adaffb06` não adiciona nada ao resultado líquido. Não há nada além da constante e do comentário para resgatar.
- Conteúdo exato do hunk: troca `export const AUTH_LOGIN_TIMEOUT_MS = 12_000;` → `25_000` e reescreve 4 linhas de comentário. Zero mudança de lógica, de assinatura, de teste ou de outro arquivo.
- Substituição na main cobre a necessidade (aberto o arquivo na linha citada): `origin/main:src/lib/serverLogin.ts:93` → `export const AUTH_LOGIN_TIMEOUT_MS = 30_000;`, comentário nas linhas 88-91: "30s cobre cold starts do Deno (medidos em 15-25s)... A falha continua FECHADA (nunca cai no GoTrue direto) e o lockout segue sendo aplicado". 30s > 25s: a margem da main é estritamente maior que a da branch para o mesmo cold start de ~20s. Portar 25s seria regressão.
- Não foi remoção proposital contra a branch: `git log -S'AUTH_LOGIN_TIMEOUT_MS = 30_000' --oneline origin/main -- src/lib/serverLogin.ts` → `b4a1d8f6f fix(e2e): aumenta AUTH_LOGIN_TIMEOUT_MS 12s→30s para cobrir cold start do Deno (#2602)`. O commit da branch (`3fcd40af3`) não é ancestral de `origin/main` (`git merge-base --is-ancestor` → falso), mas a intenção entrou por #2602.
- A propriedade de segurança descrita no comentário da branch segue viva na main: `origin/main:src/lib/serverLogin.ts:126` (`setTimeout(() => controller.abort(), AUTH_LOGIN_TIMEOUT_MS)`) e `:152` (expiração vira mensagem de timeout no caminho `unavailable`). Nada do comentário da branch documenta algo que a main perdeu.
- Guarda de teste na main continua válida com 30s: `src/lib/__tests__/serverLogin.test.ts:227` (`expect(AUTH_LOGIN_TIMEOUT_MS).toBeLessThanOrEqual(TETO_DE_ESPERA_MS)`) e `:254`. O valor da main é exercitado pelos testes; não há dívida deixada pela branch.
- `line_check.removed_still_in_main = 0` confere: o valor 12s e o comentário antigo já não existem na main (`git grep -n 'AUTH_LOGIN_TIMEOUT_MS' origin/main` não retorna `12_000`).

**Lacunas adicionais: nenhuma.** Apagar a branch é seguro.

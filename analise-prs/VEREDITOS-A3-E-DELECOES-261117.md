# Veredito do bloco A3 (automação) e do bloco D (deleções) — 17/11/2026

Com este documento, **todos os blocos do inventário da #3192 têm veredito**, menos o bloco C
(a fila de 873 versões distintas).

## Bloco A3 — automação que não existe na `main`

### A contagem mudou: 41, não 38

O inventário dizia 38 caminhos. Remedido com o gate corrigido (`--diff-filter=AMRT`), são
**41**. Os 3 a mais são arquivos-gatilho vazios, criados para forçar o CI a rodar:
`.github/.ci-trigger`, `.github/.keep-ci` e `.github/ci-refresh` (este em 4 branches).
Não são trabalho: são resíduo de tentativa de reexecução.

### O teste decisivo: quem invoca?

Comparar nome de script com nome de script não decide — há muito arquivo de auditoria no
repositório com nome parecido, e a primeira tentativa por semelhança de nome só produziu ruído.
A pergunta que decide é outra: **algum workflow ou script da `main` invoca este arquivo?**

- Se **sim** e o arquivo não está na `main`, há referência pendente — e isso é defeito.
- Se **não**, o script existe só dentro da branch, sem consumidor: órfão.

Medido em `.github/`, `scripts/` e `package.json` da `main`:

| | |
|---|---|
| órfãos, sem consumidor nenhum na `main` | **38** |
| citados pela `main` | **3** |

### Os 38 órfãos

21 em `scripts/ci/`, 12 em `scripts/db-audit/`, 1 em `scripts/db-migrate/`, 1 em
`scripts/inventario/` e os 3 arquivos-gatilho. Nenhum workflow da `main` os chama, nenhum script
da `main` os importa, nenhum script do `package.json` os referencia. Recuperá-los poria no
repositório automação que nada executa. **Obsoletos.**

O mais repetido é `scripts/ci/fila-merge.mjs`, em **7 branches** (e seu teste em 3). Era uma
fila de merge própria. A `main` resolve a mesma necessidade por outro caminho, que não é script:
o comando `.claude/commands/merge-prs.md` e a política de auto-merge do próprio GitHub.

### Os 3 citados, um por um

**1. `scripts/db-audit/verify-ledger-statements.unit.mjs` — está na `main`, em outro diretório.**
A `main` tem `scripts/ci/verify-ledger-statements.unit.mjs` (mais
`scripts/db-audit/verify-ledger-statements.mjs` e `.test.mjs`). Mesmo teste, outra pasta.
**Incorporado.**

**2. `.github/workflows/scorecard.yml` — removido, e a permissão ficou.**
O workflow não está na `main`, mas `ossf/scorecard-action` continua em
`scripts/ci/allowed-actions.json:18`, e os guardas de pin citam o scorecard como **caso
histórico** (`check-workflow-pins-resolvem.mjs:6-7`: "em 15/10/2026 o `scorecard.yml` estava
com dois pins inexistentes"). É análise de segurança do OSSF, não função do produto.
**Workflow → decisão do dono**, prioridade baixa.

**3. `.github/workflows/auto-update-pr-branch.yml` — este faz falta, e a `main` diz isso.**

Dois lugares da `main` falam dele:

- `scripts/ci/arquitetura-sem-desperdicio.unit.mjs:25` tenta lê-lo com `try … catch {}`, ou seja,
  tolera a ausência sem reprovar.
- `scripts/ci/ci-docs-baseline.unit.mjs:178` registra a decisão **E16** textualmente:
  *"apagar `auto-update-pr-branch.yml` | SUPERADA | não é código morto: o cabeçalho do próprio
  arquivo registra reativação em 01/10 para a política `strict=true`"*.

Isto é: a `main` **tem a decisão registrada de que o workflow não é código morto e foi
reativado** — e o arquivo não está na `main`. Com `strict=true` (branch tem de estar atualizada
antes de mergear) e sem quem atualize, toda PR para em `BEHIND` e exige atualização manual.

Não é teoria: **aconteceu com as 4 PRs desta sessão** (#3196, #3197, #3198 e, antes,
#3194), cada uma precisou de um `update-branch` à mão depois de a `main` andar.

**Workflow → decisão do dono por regra.** Mas é o item de maior efeito prático do A3.

## Bloco D — as 12 deleções pendentes

Apagar arquivo também é trabalho, e foi o ponto cego que a revisão da #3192 descobriu. São 12
arquivos que 4 branches apagam e a `main` ainda tem.

**Resultado: 12 de 12 obsoletas. Nenhuma a aplicar. E três delas seriam regressão provada.**

### 1. `claude/chore-remove-hook-morto-talksuppression-261024-1541` — barrada por guarda da própria `main`

A branch apaga `src/hooks/integrations/useTalkXSuppression.ts` e o teste
`useTalkXSuppression.hook-morto.test.ts`. A `main` tem **os dois**, e o módulo está **vivo**:
`TalkXSuppression.tsx:29-32` importa dele `useTalkXSuppressionActivity`,
`useTalkXSuppressionStats` e `SUPPRESSION_ACTIVITY_EVENT_TYPES`, usados em `:305`, `:306` e
`:415`.

O próprio teste da `main` explica, em TL-002, que o guarda tem **dois lados**: o hook de lista
morto não pode voltar, **e** a API viva que a tela consome tem de continuar existindo — porque
*"foi o apagamento do módulo inteiro que quebrou o tipo (TS2307) de quem o importa"*.

A parte útil dessa deleção (tirar o hook morto) **já está na `main`**. A parte restante (apagar o
módulo) é justamente o erro que o guarda existe para impedir. **Obsoleta, e recuperar seria
regressão já nomeada em teste.**

### 2. `claude/confident-bardeen-ndq0ch` — mesma razão

Apaga `src/hooks/integrations/__tests__/useTalkXSuppression.test.tsx`. O módulo testado está
vivo e em uso. Apagar o teste tira cobertura de código que roda. **Obsoleta.**

### 3. `claude/feat-ui-visual-texto-longo-261101-1445` — apagaria baseline visual em uso

Apaga 6 PNG de referência: `e2e/__screenshots__/contacts-{cards,list,table}-{dark,light}-linux.png`.
Nenhum spec os cita **pelo nome** — e nem precisa: o Playwright resolve o baseline pelo nome do
teste. Medido: `e2e/contacts-snapshots.spec.ts` usa `toHaveScreenshot`. Sem os 6 arquivos, o
teste visual perde a referência. **Obsoleta.**

### 4. `claude/wizardly-ride-dimxnt` — repetiria um erro que a `main` registra como já cometido

Apaga `.github/workflows/vercel-env-cleanup.yml` e os dois scripts
(`scripts/ci/vercel-env-cleanup.mjs` e `.unit.mjs`). O cabeçalho do workflow na `main` diz, com
data:

> 14/11/2026: este workflow foi removido por engano e restaurado no mesmo dia. A remocao se
> apoiou em docs/prod-readiness.md (item X24), que dizia haver 8 variaveis e nenhuma da lista.
> Medido direto na API da Vercel (GET /v9/projects/<id>/env) em 14/11: sao 20 variaveis e 12
> estao na lista de remocao, das quais 7 sao SEGREDO DE SERVIDOR no target preview —
> SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_JWT_SECRET, POSTGRES_PASSWORD,
> POSTGRES_URL, POSTGRES_PRISMA_URL e POSTGRES_URL_NON_POOLING. O AGENTS.md proibe segredo de
> servidor na Vercel, entao a limpeza segue pendente.

A deleção proposta é **exatamente** a que já foi feita por engano e revertida. **Obsoleta**, e
nem precisa ir ao dono como decisão: a `main` já decidiu e documentou.

**Mas o que esse cabeçalho diz segue valendo, e é grave:** 7 segredos de servidor na Vercel, no
target preview, contra a regra explícita do `AGENTS.md`, com a limpeza pendente. Não é este
documento que resolve — segredo é item do dono — mas fica registrado aqui porque apareceu na
adjudicação.

## Estado do inventário depois deste documento

| Bloco | O que é | Estado |
|---|---|---|
| A1 | 33 migrations | **fechado** — 33 obsoletas, nenhuma DDL (`VEREDITOS-A1-MIGRATIONS-261117.md`) |
| A2 | 53 caminhos de código | **fechado** — 50 na `main`, 3 features para o dono (`VEREDITOS-A2-CODIGO-261117.md`) |
| A3 | 41 de automação | **fechado** — 38 órfãos, 1 movido, 2 workflows para o dono |
| B | 572 documentos de análise | agregado; preservado pelo SHA no TSV |
| C | 873 versões distintas | **em aberto** — é o que falta |
| D | 12 deleções | **fechado** — 12 obsoletas, 3 seriam regressão |
| remoção de linha | 7 pares | **em aberto** — 2 em migration |

## O que foi verificado de verdade

- a lista do A3 foi **remedida** nas 224 refs remotas com o gate corrigido, não copiada do
  inventário anterior — e por isso a contagem subiu de 38 para 41
- a busca de consumidor rodou sobre `.github/`, `scripts/` e `package.json` da `main`
- cada um dos 4 grupos de deleção foi conferido no código da `main`, com arquivo e linha
- **NÃO VERIFICADO:** se cada um dos 38 órfãos é funcionalmente inútil. A prova é que **nada na
  `main` os invoca**; não li os 38 por dentro. Um órfão pode ter boa ideia dentro — mas, como
  nada o chama, recuperá-lo não muda comportamento nenhum do sistema.
- nada foi fechado, apagado nem alterado em código por esta PR.

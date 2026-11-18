# Resgate preservado — itens que dependem de decisão do dono

Estes 29 arquivos vinham de branches que vão ser fechadas e **não existem em
lugar nenhum da `main`** (ou a `main` tem outra versão). Cada um foi escrito por
outro agente de IA e tem valor que a `main` não tem hoje.

Nenhum deles pode entrar no caminho de produção sem uma decisão que não é do
agente: reescrever o workflow que aplica DDL em **produção**, criar um
**segredo** novo, aplicar **migration** ou **apagar dados**. Pela regra 8 do
`AGENTS.md`, isso é "deixe a PR aberta e chame o dono".

Fechar as branches apagaria esse trabalho. Então ele vem para cá **byte a byte**,
por blob OID, e as branches podem fechar sem perda.

## Por que este diretório, e não o caminho real

Aqui nada executa:

- `scripts/ci/*.unit.mjs` só roda pelo glob `node --test scripts/ci/*.unit.mjs`
  (`.github/workflows/ci.yml:166`), que é relativo à raiz — não alcança
  `analise-prs/`;
- o GitHub Actions só lê `.github/workflows/` da raiz;
- o replay de migrations lê `supabase/migrations/` da raiz.

**Medido, não suposto:** com estes 29 arquivos presentes, o glob inteiro dos
guards deu `# pass 7214 / # fail 0`.

O blob OID é do conteúdo, não do caminho: o arquivo aqui é **o mesmo byte a
byte** que estava na branch. Promover depois é mover, não reescrever.

## O que cada grupo é, e o que falta para promover

### Pipeline de migrations em lote (GA13-GA17)

`.github/workflows/db-migrate.yml`, `scripts/ci/db-migrate-ga13-17.unit.mjs`,
`scripts/ci/db-migrate-contratos.unit.mjs`, `scripts/ci/db-migrate-workflow.unit.mjs`,
`scripts/db-audit/contracts/post-apply.sh`, `scripts/db-audit/calcular-lote.sh`,
`scripts/db-audit/dry-run-plan.mjs`

A versão da branch tem **466 linhas contra as 1493 da `main`** e aplica
migrations em lote, com dois jobs (`preflight` + `apply`) em vez de um. As
ferramentas que ela usa (`provar-lote.sh`, `assert-runtime-proof.mjs`,
`proof-sha.mjs`, `compose-confirm-hash.mjs`) **já estão na `main`**, resgatadas
pelas PRs #3244 e #3245.

**Falta:** sua decisão de trocar o workflow que aplica DDL em produção. Os três
`*.unit.mjs` só passam depois da troca — entrar com eles antes deixa a `main`
vermelha no mesmo minuto.

### Detecção de drift de schema (GA20-GA25)

`scripts/ci/ga20-ga25-contratos.unit.mjs`, `.github/workflows/types-sync.yml`,
`.github/workflows/db-live-guard.yml`, `scripts/ci/allowed-actions.json`

Avisa quando o schema do banco vivo divergiu do que o repositório declara.
`drift-explicado.mjs`, `gate1-pendente.mjs` e `check-deployments-ledger.mjs` **já
estão na `main`** com blob idêntico — o que falta é justamente o workflow que os
chama.

**Falta:** editar `types-sync.yml` e `db-live-guard.yml`.

### Ledger de DDL (GA25)

`scripts/ci/ga25-ddl-check.mjs`, `scripts/db-audit/check-ddl-deployments.mjs`,
`scripts/db-migrate/register-deployments.mjs`

A cadeia está **meio construída na `main`**: o leitor
(`check-deployments-ledger.mjs`) existe e tem teste, e **nenhum workflow o
chama**. O escritor (`register-deployments.mjs`) é o elo que não existe em lugar
nenhum.

**Falta:** corrigir o payload (ele grava `payload.migration_version`, o leitor lê
`payload.versions` — do jeito atual, 100% de falso positivo) e adicionar o step
que o chama no job de apply.

### Limpeza de variáveis no Vercel

`scripts/ci/vercel-env-cleanup-workflow.unit.mjs`, `.github/workflows/vercel-env-cleanup.yml`

O guard exige que o modo `apply` use credencial de escrita própria. Hoje o
workflow usa `VERCEL_READONLY_TOKEN` fixo.

**Falta:** o segredo `VERCEL_WRITE_TOKEN`. Segredo é seu, nunca do agente.

### Fila de merge automática

`.github/workflows/auto-update-pr-branch.yml`

O motivo da remoção em 14/11 foi **custo de Actions** (8.312 execuções), não a
ideia. O `fila-merge.mjs` que ele chama volta pela PR #3231, já **com dois
defeitos corrigidos** (CI cancelada travava a fila para sempre; decisão com lista
de PRs cortada).

**Falta:** sua decisão sobre o custo. O cron de 30 minutos era o problema —
gatilho por evento resolveria.

### Aviso de falha da main no celular

`.github/workflows/main-failure-notify.yml`, `.github/workflows/notifica-falha-main.yml`

Hoje, quando a `main` quebra, você só descobre olhando issue no GitHub. O arquivo
original **não pode entrar como está**: lê `EVOLUTION_INSTANCE_TOKEN` dentro do
Actions (contra `AGENTS.md:76`, que manda `EVOLUTION_*` só nas edges) e tem o
hostname da VPS Hostinger **escrito em repositório público**. Tem ainda um
defeito próprio: o dedup é global por hora, não por workflow, e o próprio run
suprimido termina em `setFailed` — ou seja, nunca cria a âncora de sucesso que o
dedup procura.

**Falta:** sua decisão do canal. O caminho que respeita a regra existe e foi
testado nesta sessão: dedup por workflow dentro do `notifica-falha-main.yml` que
já está na `main`, e o aviso saindo por uma edge function — não pela Action.

### Copiloto: retenção e feedback por insight

`supabase/migrations/20261016193000_copilot_sessions.sql`,
`20261016193100_copilot_insights.sql`, `20261016193200_copilot_feedback.sql`,
`20261016193500_copilot_retention.sql`, `20261108180200_copilot_retention.sql`,
`docs/LGPD-RETENTION-POLICY.md`

A `main` já tem `copilot_feedback` (thumbs e edit distance) e a métrica diária de
retenção. O que **não** tem: feedback por *insight* (usado como está / editado /
descartado / marcado errado) e o **expurgo de retenção** — apagar insight velho e
redigir o texto final depois de 30 dias.

**Falta:** DDL em produção, e a de retenção **apaga dados**
(`DELETE FROM copilot_insights` acima de 90 dias). Nenhuma das duas entra sem
você. A de 2026-10-16 também tem RLS que nasceria quebrada (faz join por
`profiles.id` onde o schema da `main` usa `auth.users(id)`) e não é idempotente.

### Análise multimodal com contexto de venda

`src/hooks/copilot/useMultimodalAnalysis.ts`,
`supabase/functions/ai-multimodal-analysis/index.ts`

O hook foi escrito contra uma versão **mais ambiciosa** da edge, que aceitava
`mediaUrl`/`mediaType` (vídeo e áudio, não só imagem) e devolvia contexto de
venda e próxima ação. A `main` tem a versão reduzida, que só aceita `imageUrl`.

**Falta:** sua decisão de trocar o contrato da edge que está em produção. O
contrato executável atual (`index.test.ts`, 6 casos) teria de mudar junto — e
**enfraquecer teste que já está na `main` é proibido**, então seria substituição
deliberada, não ajuste.

### Contrato de atribuição do Talk X

`scripts/db-audit/talkx-attribution.test.sh`

Parte dele dirige `contact_purchases.source='bitrix24'`, e a produção **recusa
por projeto**. Mas o arquivo também cobre partes do contrato que a produção
aceita e que a `main` não testa: `service_role` obrigatório, limite de valor,
`ON CONFLICT` de duplicado e `occurred_at` no futuro.

**Falta:** separar o que a produção aceita e plugar em `db-guard.yml` — que lista
cada `*.test.sh` por nome, logo exige editar workflow.

### Congelamento de features (regra, não código)

`.claude/CLAUDE.md`

Declara congelamento desde 01/11: só entram bug de fluxo crítico, fix de CI que
impeça verificar esses fluxos, e fix de segurança. A premissa segue viva
(`docs/PRONTO_PRODUCAO.md` ainda marca fluxos 2/3/4 como QUEBRADO), mas a `main`
**contradiz as proibições na prática** desde então: estão mergeados dossiês de 15
e 16/11 e 4 workflows novos.

Agravante: o guard GA02 (`check-claude-md-integrity.mjs`) vigia
`[AGENTS.md, CLAUDE.md] + docs/agentes/*.md`. O `.claude/CLAUDE.md` fica **fora do
guard** — seria uma segunda fonte de regras que nada protege contra
esvaziamento.

**Falta:** você dizer se a regra vale. Se valer, o lugar dela é dentro de
`AGENTS.md`, sob o GA02.

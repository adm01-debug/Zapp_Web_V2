Especialista: worker (sql) (area-sql-banco)

# SYNC20-03 — DB Guard: catálogo stale, por que diverge e plano de regeneração

Cartão de MEDIÇÃO + PLANO (F16/F12). Sem produção, sem migration, sem edição de
guarda de CI. Diff deste cartão: só este relatório. Base: `AG5`
(`docs/audits/sync-ag5-qualidade-2026-10-17.md`, commit f36023c5ed) e `AG4`
(`scripts/db-audit/SYNC-AG4-F14-PLANO-APLICACAO-2026-10-17.md`, commit 43872f46f6).

## 1. Estado medido agora (branch do cartão)

| Artefato | HEAD (d723a90107, dia/2026-10-17) | origin/main (a9b4d6c6fb) |
|---|---|---|
| `supabase/schema-catalog.json` | `generated_at 2026-10-04` — 166 tabelas, 12 views, 251 funções, 64 trigger functions | `generated_at 2026-10-16` — 169 tabelas, 266 funções |
| `supabase/schema-manifest.json` | `generated_at 2026-10-09T16:18:59Z` | `generated_at 2026-10-16T18:17:30Z` |

- `git merge-base HEAD origin/main` = `7a15852791` (2026-10-04). A main tem **79
  commits** que o HEAD não tem; o HEAD tem 1546 commits que a main não tem.
- Entre esses 79 estão **todos os commits de sincronização de artefato**
  (#1898 06/10, #1904 07/10, #1907+#1910 08/10, #1913 09/10, #1967+#1968 16/10).
  O catálogo do HEAD **não é o catálogo da main**: está 12 dias atrás dele.
- Migrations no HEAD depois do retrato do catálogo (2026-10-04): **59** (até
  `20261014014129`). Delas saíram 4 tabelas reais ausentes do catálogo do HEAD
  (`ai_usage_outbox`, `gmail_oauth_states`, `outbox_events`,
  `talkx_storage_purge_queue`) e ~35 funções.

## 2. Por que o catálogo diverge (causa-raiz)

O catálogo/manifesto **não são retrato do código, são retrato de PRODUÇÃO**.
Quem os atualiza é `types-sync.yml` (push na main que toca `supabase/migrations/**`
+ agendado), que roda `catalog.sql`/`manifest.sql` contra `$DESTINO_URL` e abre o
PR "chore(db): sincronizar artefatos derivados do banco" — que **depende de merge
humano** (README de `scripts/db-audit`, as duas fases). Enquanto o PR não entra,
cada migration nova alarga a defasagem. Isso é estrutural, não um defeito de
código.

Nesta branch há uma segunda camada, maior: o HEAD é uma **branch de dia cortada
no merge-base de 04/10** e simplesmente não contém os commits de sincronização da
main. Ou seja, aqui o artefato está defasado por (a) retrato antigo + (b) branch
sem os refreshes.

**Impacto real, medido:** no HEAD o guard offline está **VERDE** —

```
Catalogo: 166 tabelas, 12 views, 251 funcoes, 64 trigger functions (gerado em 2026-10-04); projecao forward-only: 182 relacoes, 284 funcoes
Violacoes totais: 2 | no baseline: 2 | novas: 0
OK: nenhuma violacao nova.   (exit 0)
```

`supabase-usage-guard.mjs` compensa a defasagem com uma **projeção forward-only**:
parte do catálogo e aplica CREATE/remoção/renomeação das migrations com data >=
`generated_at` (166→182 relações, 251→284 funções). Foi assim que as 59 migrations
pós-04/10 não viraram falso positivo. O que a projeção **não** vê: objeto criado
direto em produção, mudança só por ALTER, e objeto cuja migration é anterior ao
retrato mas nunca foi aplicada em produção.

É exatamente esse último caso que derruba a main: no `DB Guard offline`
(AG5 F16, run `38986918645`) o `supabase-usage-guard` acusa **30 violações novas**
mesmo com o catálogo de **16/10**. Logo a divergência que dói não é código×catálogo
— é **código×produção**: a main tem objetos usados pelo código que ainda não
existem no banco oficial, e o `types-sync` confirma `drift = true` em
types/catálogo/manifesto/grants.

Os números do AG4 (**4199 × 207**) são outra medida: retrato do banco **local**
(migrations reaplicadas por `replay-local.sh`/`zapp-db-local` **como
supabase_admin**, o que muda grantor/papéis dos grants) contra o retrato de
produção. É dominado pela diferença de papel do replay e pelas migrations que a
produção ainda não recebeu — **não** é a medida da defasagem do catálogo e não
deve ser usada como meta de "regeneração".

## 3. Plano de regeneração (destinos em `scripts/db-audit`)

Regra dura: **artefato canônico não se regenera localmente**. `check-manifest-fresh.mjs`
chama `validarDestino(process.env.DESTINO_URL, identidade)` e sai **2** quando a
identidade não bate ("nunca atualizar snapshot"). Local só serve para MEDIR.

Ordem correta (cada passo com o dono):

1. **Fechar o gap código×produção antes de tudo.** Aplicar em produção as
   migrations pendentes (`db-migrate.yml`). Sem isso, regenerar o retrato só
   reescreve o arquivo e o guard volta a acusar as mesmas 30. **Dono:** Joaquim
   (autoriza produção).
2. **Regenerar canonicamente** — `types-sync` em `workflow_dispatch` no SHA
   integrado → revisar o PR gerado → merge (duas fases do README). Scripts:
   `catalog.sql`, `manifest.sql`, `check-catalog-fresh.mjs`,
   `check-manifest-fresh.mjs`, `check-remocoes-destrutivas.mjs` (Gate 3).
   **Dono:** worker (ci); merge é do Joaquim.
3. **Alinhar a branch com a main** — decisão de integração, não minha: adotar os
   artefatos de `origin/main` (`schema-catalog.json`, `schema-manifest.json`,
   `grants-baseline.json`, `types.ts`) **depois** do passo 1, porque o HEAD tem
   1546 commits que a main não tem. **Dono:** integrador/portão de saída.
4. **Diagnóstico local opcional (nunca commitado):** `zapp-db-local up` →
   `zapp-db-local psql . <nome> < scripts/db-audit/catalog.sql` e
   `node scripts/db-audit/check-catalog-fresh.mjs` só para ler a divergência.
   **Dono:** worker (sql).

## 4. Os 6 testes órfãos do `check-test-inventory`

Reproduzido agora: `node scripts/ci/check-test-inventory.mjs` → **exit 1**,
"6 teste(s) órfão(s)". Os seis são `.test.sh` de `scripts/db-audit/` que existem
no disco mas **não têm passo em `db-guard.yml` nem entrada na ALLOWLIST**:

```
department-invite-contract-audit-vocabulary.test.sh
ia-usage-outbox-duravel.test.sh
talkx-conversion-defaults.test.sh
team-chat-department-transfer-guards.test.sh
team-chat-media-contract.test.sh
team-direct-conversation-race.test.sh
```

**Causa-raiz (por arquivo, não é genérica):** cada prova nasceu junto com o fix
de banco que ela prova e o autor esqueceu de registrá-la. Origem por commit de
inclusão:

| Teste | Commit que o criou | Data |
|---|---|---|
| `department-invite-contract-audit-vocabulary` | afccdbed71 "fix(db): preserva aceite de convite legado pendente" | 11/10 |
| `talkx-conversion-defaults` | e36f1e64ab "fix(talkx): defaults da conversao por NULL explicito…" (#210) | 11/10 |
| `team-chat-media-contract` | a4265351ca "fix(banco): exige media_type no locator do Team Chat" (#54) | 11/10 |
| `ia-usage-outbox-duravel` | 633050114a "fix(db): cria a outbox durável do log essencial de IA" (#44) | 12/10 |
| `team-chat-department-transfer-guards` | 36525f932a "fix(team-chat): trata DELETE filtrado como erro…" | 12/10 |
| `team-direct-conversation-race` | bff18177fd "fix(db): RPC de conversa direta… criação concorrente" | 12/10 |

O verificador (E48, `scripts/ci/check-test-inventory.mjs`, nascido 02/10) cobra
.yaml **ou** ALLOWLIST com justificativa. Ninguém fez nenhum dos dois → a árvore
fica vermelha.

**Dono:** worker (ci) — `db-guard.yml` e a ALLOWLIST são área dele; o comentário
do próprio arquivo diz "promover pelo dono do workflow (agente não edita
workflow)". worker (sql) entrega a prova de que a promoção é segura.

**Prova de que é seguro promover (rodada agora, uma por vez, com o wrapper do
próprio db-guard):** `bash scripts/db-audit/retry-disposable-postgres-test.sh bash
scripts/db-audit/<teste>.test.sh` → **exit 0 nos seis**, cada um com a linha
`PASS`/`OK` real (ex.: `PASS: item 44 — a outbox durável do log essencial de IA
existe…`; `OK: contrato de mídia do Team Chat conferido (RED antes, GREEN
depois)`). Remediação recomendada (uma linha por teste, no padrão dos passos já
existentes, ex. linha 233):

```yaml
run: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/<teste>.test.sh
```

Alternativa aceita pelo verificador: entrada na ALLOWLIST (`scripts/ci/check-test-inventory.mjs`)
com a justificativa de cada caso — mas promover é melhor: a prova passa a rodar.

## 5. Resumo em uma linha por pergunta

- **Por que o catálogo diverge:** ele retrata PRODUÇÃO e só é atualizado por PR do
  `types-sync` + merge humano; nesta branch soma-se o corte no merge-base de 04/10,
  que deixou o HEAD sem os commits de sincronização da main (catálogo 04/10 × 16/10).
- **Regeneração:** não é local (identidade → exit 2); é `types-sync` no SHA
  integrado contra `$DESTINO_URL`, **depois** de aplicar as migrations pendentes em
  produção; o 4199×207 do AG4 não é meta.
- **6 órfãos:** prova de banco criada junto do fix, sem passo no YAML nem ALLOWLIST;
  dono worker (ci); os seis rodam verdes agora (exit 0).

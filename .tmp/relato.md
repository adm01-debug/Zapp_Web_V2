Especialista: senior (area-edge-api)

CARTÃO: [refazer 2] [refazer 3, final] feat(edge): automation-suggest-reply (sugestão de resposta citando a base de conhecimento) — rodada 2 de 2. Nesta rodada só o relato mudou.
FAIXA DO PAI: commit cb6557bb0 do cartão t_41aa91eb — não é deste cartão (trazido com `git cherry-pick`; é o trabalho anterior, cujo CÓDIGO a recusa deu por correto e recusou só no relato).

## Como resolvi o motivo da retomada (itens 1 a 5 do O QUE CORRIGIR desta recusa)

Ponto 1: resolvido — a frase "10 casos de teste novos medidos pelo juiz" saiu do relato; o número real é 13. `deno test` no arquivo NOVO `supabase/functions/automation-suggest-reply/index.test.ts` dá `ok | 13 passed | 0 failed (33ms)` (bloco F), e os 13 `Deno.test` estão nas linhas 135, 148, 168, 183, 203, 227, 241, 262, 280, 297, 312, 331 e 343 desse arquivo. Responde ao Ponto 4 da recusa anterior.
Ponto 2: resolvido — arquivo:linha do `ESTADO.md`, conferidos no arquivo (bloco D): `ESTADO.md:7` = Base: `dia/2026-10-11`. 82 edges com `index.ts` em `supabase/functions/`; `ESTADO.md:40` = `| A | 55 |`; `ESTADO.md:45` = `| **total** | **82** |`; `ESTADO.md:65` = `| `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |` (esta última é a âncora do hook, que também é o chamador real). Responde ao Ponto 3 da recusa anterior.
Ponto 3: resolvido — dito de forma explícita: a recusa pediu para mover a linha do `ESTADO.md` para a POSIÇÃO ALFABÉTICA da tabela. Antes ela ficava entre `ai-suggest-reply` (`ESTADO.md:60`) e `ai-transcribe-audio` (`ESTADO.md:61`); agora está depois de `auto-close-conversations` (`ESTADO.md:64`) e antes de `batch-fetch-avatars` (`ESTADO.md:66`). A descrição antiga ("o inventário não listava a edge") saiu do relato. O `ESTADO.md` está no diff desde o trabalho anterior (FAIXA DO PAI) e o item 4 desta recusa o mantém no escopo, palavras do cartão: "Manter a explicação de ESTADO.md. O cartão manda mover a linha dele, então ele está no escopo". Responde ao Ponto 1 da recusa anterior.
Ponto 4: resolvido — nenhuma lista de órfãs foi alterada, e a frase "mantendo as 17 órfãs reais da tabela" saiu do relato. O diff do `ESTADO.md` é exatamente 4 inserções e 3 remoções (`git diff --numstat` = `4 3 ESTADO.md`): `ESTADO.md:7` (Base, 81→82), `ESTADO.md:40` (grupo A, 54→55), `ESTADO.md:45` (total, 81→82) e a linha nova em `ESTADO.md:65`. O bloco `## Órfãs (17) — GATE B` (`ESTADO.md:134`) NÃO aparece no diff (bloco E). Responde ao Ponto 2 da recusa anterior.
Ponto 5: resolvido — os 4 pontos da recusa anterior, na ordem em que ELA os numerou: recusa-Ponto 1 (mover a linha para a ordem alfabética) = Ponto 3 desta lista; recusa-Ponto 2 (nenhuma lista de órfãs alterada) = Ponto 4; recusa-Ponto 3 (arquivo:linha do `ESTADO.md`) = Ponto 2; recusa-Ponto 4 (13 casos, não 10) = Ponto 1. A guarda foi rodada de novo e a saída literal está no bloco A. Saída de terminal é texto de relato: por isso ela não aparece no diff, e o cartão mandou não mexer em `index.ts`, `index.test.ts` nem `ESTADO.md`.

## Prova

A) SAÍDA LITERAL — `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` (diff final desta entrega):
✔ ESTADO.md lista exatamente as edges que existem no repositório (2.886267ms)
✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge (4.715086ms)
✔ edge marcada como órfã (grupo E) realmente não tem chamador no repositório (7636.163272ms)
✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D (10537.237514ms)
✔ ESTADO.md mantém totais e lista de órfãs sincronizados com a tabela publicada (1.131671ms)
✔ total de edges do cabeçalho do ESTADO.md bate com a tabela (0.479082ms)
✔ FEATURE_REGISTRY.md lista exatamente as views do ViewRouter (1.10907ms)
✔ FEATURE_REGISTRY.md mantém totais sincronizados com a tabela publicada (0.48906ms)
✔ FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais (11.536728ms)
✔ TESTING_CONVENTION.md aponta só para caminhos que existem (1.287736ms)
✔ TESTING_CONVENTION.md descreve os runners reais (configs, scripts e CI) (3.531871ms)
ℹ tests 11
ℹ suites 0
ℹ pass 9
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18368.289282
✖ failing tests:
✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge (4.715086ms)
  AssertionError [ERR_ASSERTION]: âncora desatualizada: src/hooks/integrations/useKnowledgeBase.ts:99 não cita `ai-kb-ingest`
✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D (10537.237514ms)
  AssertionError [ERR_ASSERTION]: grupo de `create-user` divergiu dos chamadores reais: {"A":[],"B":[],"C":[],"D":[]}

A guarda fecha `pass 9` / `fail 2`. As 2 falhas são de OUTRAS edges e existem na base do dia sem o meu diff:
- `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` → `AssertionError [ERR_ASSERTION]: âncora desatualizada: src/hooks/integrations/useKnowledgeBase.ts:99 não cita `ai-kb-ingest``
- `✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D` → `AssertionError [ERR_ASSERTION]: grupo de `create-user` divergiu dos chamadores reais: {"A":[],"B":[],"C":[],"D":[]}`
O teste que cobre esta entrega — `✔ ESTADO.md lista exatamente as edges que existem no repositório` — passa com o meu diff e fica vermelho sem ele (bloco B). A guarda inteira, na MESMA base, sem a edge e com o `ESTADO.md` da base, dá os mesmos 2 vermelhos e o mesmo `pass 9` / `fail 2` (bloco C): as 2 falhas não são deste cartão.

B) VERMELHO — sem a linha do `ESTADO.md` (edge presente, linha removida do arquivo):
✖ ESTADO.md lista exatamente as edges que existem no repositório (3.37365ms)
✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge (2.23376ms)
✔ edge marcada como órfã (grupo E) realmente não tem chamador no repositório (7511.401564ms)
✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D (10184.568446ms)
✖ ESTADO.md mantém totais e lista de órfãs sincronizados com a tabela publicada (1.67474ms)
✔ total de edges do cabeçalho do ESTADO.md bate com a tabela (0.525874ms)
✔ FEATURE_REGISTRY.md lista exatamente as views do ViewRouter (1.341337ms)
✔ FEATURE_REGISTRY.md mantém totais sincronizados com a tabela publicada (0.579215ms)
✔ FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais (9.093067ms)
✔ TESTING_CONVENTION.md aponta só para caminhos que existem (0.706565ms)
✔ TESTING_CONVENTION.md descreve os runners reais (configs, scripts e CI) (2.916576ms)
ℹ tests 11
ℹ suites 0
ℹ pass 7
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17938.559995
✖ failing tests:
✖ ESTADO.md lista exatamente as edges que existem no repositório (3.37365ms)
✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge (2.23376ms)
✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D (10184.568446ms)
✖ ESTADO.md mantém totais e lista de órfãs sincronizados com a tabela publicada (1.67474ms)
Mensagem literal do vermelho: `AssertionError [ERR_ASSERTION]: ESTADO.md não tem linha para a edge `automation-suggest-reply` (rode a guarda de novo)` (scripts/ci/docs-estado-registry-convention.unit.mjs:148).

C) A MESMA GUARDA NA BASE DO DIA, SEM O MEU DIFF (edge removida e `ESTADO.md` da base):
✔ ESTADO.md lista exatamente as edges que existem no repositório (2.198882ms)
✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge (2.687245ms)
✔ edge marcada como órfã (grupo E) realmente não tem chamador no repositório (7297.5691ms)
✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D (9620.329085ms)
✔ ESTADO.md mantém totais e lista de órfãs sincronizados com a tabela publicada (0.872653ms)
✔ total de edges do cabeçalho do ESTADO.md bate com a tabela (0.376133ms)
✔ FEATURE_REGISTRY.md lista exatamente as views do ViewRouter (0.659363ms)
✔ FEATURE_REGISTRY.md mantém totais sincronizados com a tabela publicada (0.323046ms)
✔ FEATURE_REGISTRY.md descreve componente, arquivo e classificação reais (7.085064ms)
✔ TESTING_CONVENTION.md aponta só para caminhos que existem (0.934335ms)
✔ TESTING_CONVENTION.md descreve os runners reais (configs, scripts e CI) (3.49542ms)
ℹ tests 11
ℹ suites 0
ℹ pass 9
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17109.964653
✖ failing tests:
✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge (2.687245ms)
✖ ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D (9620.329085ms)

D) AS QUATRO LINHAS CITADAS, IMPRESSAS DO ARQUIVO (`awk` por número de linha):
7: Base: `dia/2026-10-11`. 82 edges com `index.ts` em `supabase/functions/`.
40: | A | 55 |
45: | **total** | **82** |
65: | `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |

E) O DIFF DO `ESTADO.md`, LITERAL (`git diff dia/2026-10-15...HEAD -- ESTADO.md`):
diff --git a/ESTADO.md b/ESTADO.md
index b63af75bac..af73753a03 100644
--- a/ESTADO.md
+++ b/ESTADO.md
@@ -4,7 +4,7 @@ Mapa das Edge Functions do Zapp Web V2: **quem chama cada edge** e o que está l
 de verdade no código da ponta do dia. Complementa `docs/architecture/edge-functions.md`
 (que descreve *o que* cada edge faz); aqui a pergunta é *quem a dispara*.
 
-Base: `dia/2026-10-11`. 81 edges com `index.ts` em `supabase/functions/`.
+Base: `dia/2026-10-11`. 82 edges com `index.ts` em `supabase/functions/`.
 
 ## Como manter
 
@@ -37,12 +37,12 @@ Sem nenhum chamador, o grupo é **E** — e a guarda prova a ausência nas quatr
 
 | Grupo | Edges |
 |---|---|
-| A | 54 |
+| A | 55 |
 | B | 1 |
 | C | 3 |
 | D | 6 |
 | E | 17 |
-| **total** | **81** |
+| **total** | **82** |
 
 ## Tabela
 
@@ -62,6 +62,7 @@ Sem nenhum chamador, o grupo é **E** — e a guarda prova a ausência nas quatr
 | `approve-password-reset` | A | `src/components/security/PasswordResetRequestsPanel.tsx:53` · `src/components/security/PasswordResetRequestsPanel.tsx:65` |
 | `auth-login` | A | `src/lib/serverLogin.ts:72` · `supabase/config.toml:39` |
 | `auto-close-conversations` | E | — sem chamador no repositório — |
+| `automation-suggest-reply` | A | `src/hooks/chat/useAutomationSuggestions.ts:192` |
 | `batch-fetch-avatars` | A | `src/hooks/inbox/useInboxBulkActions.ts:143` · `src/hooks/chat/useNewConversation.ts:107` · `src/hooks/chat/useNewConversation.ts:115` · `supabase/migrations/20260828200100_cron_avatars_refresh_hourly.sql:11` · `supabase/migrations/20260902000200_fix_cron_avatars_refresh_key.sql:10` · `supabase/migrations/20260930250000_reschedule_cron_secrets_l5.sql:74` · `supabase/migrations/20260930390000_endurece_l5_contrato_e_jobs.sql:130` · `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql:161` · `supabase/config.toml:26` |
 | `bitrix-api` | A | `src/hooks/integrations/useBitrixApi.ts:33` · `src/components/integrations/BitrixIntegrationView.tsx:29` |
 | `chatbot-l1` | A | `src/components/settings/ChatbotL1Config.tsx:235` |

F) DENO — `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts`:
ok | 13 passed | 0 failed (33ms)

G) TIRANDO O RELATO, O RESTO DA ENTREGA É O TRABALHO ANTERIOR, INTEIRO (nada de código novo nesta rodada):
`git diff cb6557bb0 HEAD -- supabase/functions/automation-suggest-reply/index.ts supabase/functions/automation-suggest-reply/index.test.ts` → 0 bytes (idênticos).
`git diff cb6557bb0 HEAD -- ESTADO.md` → 1 (uma) linha difere, e não é minha: a base do dia já tinha `ai-transcribe-audio` apontando `AudioMessagePlayer.tsx:62` (o `cb6557bb0` tinha `:61`); o cherry-pick não toca essa linha.

H) CRITÉRIO DE PRONTO 2 — `zapp-verify . --rapido` → `OK dependencias 3s`, `OK db_guard 0s`, `OK tipos 114s`, `OK lint 2s`, `OK migrations 1s`; `VERIFY: VERDE SEM BANCO (120s)`.

## Arquivos do diff (4)

`git diff --name-only dia/2026-10-15...HEAD`:
ESTADO.md
.tmp/relato.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts

`git diff --numstat`: 4/3 ESTADO.md · 170/0 .tmp/relato.md · 355/0 supabase/functions/automation-suggest-reply/index.test.ts · 348/0 supabase/functions/automation-suggest-reply/index.ts — 44.436 caracteres no diff inteiro (limite 90.000).

## O que NÃO fiz e por quê

- Não mudei uma linha de `index.ts`, `index.test.ts` nem `ESTADO.md` em relação ao trabalho anterior (bloco G): o cartão mandou mexer só no relato, e a recusa deu o código por correto.
- Não tratei as 2 falhas pré-existentes da guarda (`ai-kb-ingest`, `create-user`): são de outras edges, o cartão fechou o escopo no relato, e `ESTADO.md` está na lista de arquivos que eu não devia mexer.
- Não apaguei nem editei nenhum `.tmp/` de coleta (ficam fora do diff de código).

## Achado fora do escopo (registrado, não corrigido)

- `ESTADO.md:59` — a âncora de `ai-kb-ingest` (`src/hooks/integrations/useKnowledgeBase.ts:99`) está desatualizada e a guarda está vermelha por isso.
- `ESTADO.md` — o grupo publicado de `create-user` divergiu dos chamadores reais (guarda vermelha).

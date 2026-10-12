Especialista: worker (sql) (area-sql-banco)

## O que fiz
Cartão [retomar]: a entrega aprovada de v2/t-eb4a9f87 (commit 669e3f1d2) não entrou e conflitava com dia/2026-10-12. Trouxe-a por `git cherry-pick` sobre a ponta local (merge-base = HEAD = 15929a99c) e resolvi o único conflito.
- supabase/migrations/20261005224959_inbound_message_effects_outbox.sql: migration do outbox inbound #69 com o `-- Rollback:` EXECUTÁVEL (recria a assinatura de 8 args de ingest_inbound_message com corpo anterior + REVOKE/GRANT/COMMENT; dropa as assinaturas 10/11 args e a tabela).
- scripts/db-audit/inbound-effects-replay.test.sh: blocos A (defeito), B (migration aplicada), C (direção fromMe) e D (rollback extraído do arquivo real e executado).
- scripts/ci/check-test-inventory.mjs: 1 linha — era o arquivo do conflito; registra o novo .test.sh na ALLOWLIST (sem ela o inventário do CI reprova o teste como órfão). Fora da lista do cartão, mas parte da entrega aprovada e necessária; também registrado em kanban_comment.

## Contexto medido que mudou desde o cartão
A base do #69 deveria ter sido aplicada por t_1accb485 (done em 07/10). Medi no código ATUAL: `git grep drain_inbound_message_effects` e `git ls-tree` em dia/2026-10-12 não acham nada do outbox — a base nunca entrou. Por isso o cherry-pick traz a migration inteira (não só a correção do rollback), com diff de 49.643 chars, abaixo do teto de 90.000.

AVISO cross-camada: a migration dropa `ingest_inbound_message` de 8 args (linha 78) e a edge supabase/functions/_shared/evolution-webhook-messages.ts ainda chama a RPC com 8 params (linha 460). A base do #69 também mudava essa edge; ela não está na ponta. Quem integrar PRECISA integrar junto o lado edge (passar p_from_me = key.fromMe) e os testes ts do #69, senão o webhook quebra. Fora da minha área — comentado no cartão.

## Ponto a ponto da recusa literal de t_a4bd1b27
Ponto 1: "[2ª opinião GPT discordou] A migration não possui rollback real: o bloco apenas aponta para outra migration e, se executado, remove as novas assinaturas e a tabela sem recriar a função anterior de 8 argumentos."
- Corrigido. O `-- Rollback:` (linhas 2-40) tem SQL executável: DROP drain + assinaturas 10/11 args, CREATE OR REPLACE de ingest_inbound_message de 8 args com o corpo anterior, REVOKE/GRANT/COMMENT dessa assinatura, e DROP da tabela. Não aponta para outra migration.
Ponto 2: "o relato admite que o deployment-manifest ficou stale e fará o CI falhar."
- Medido, não presumido: `node scripts/edge-deploy/generate-manifest.mjs --check` → `Edge manifest OK: 81 functions, 161 source files, sha256=9f7ef3cd...` (exit 0). A migration não toca supabase/functions/**, então o derivado está em sincronia e não vai ao commit — não há diff a versionar. A regra do derivado (integrador/derivados.sh) segue valendo para cartões de edge.

TRUNCATE/DELETE de teste e troca de assinatura ocorreram SÓ em banco descartável: container postgres:17-alpine efêmero (`docker run --rm`, do próprio teste) e no banco LOCAL da tarefa (v2-26101217211e4c) via hermes-db-migrar. Produção nunca é tocada.

## Prova
- vermelho antes: com a versão de rollback-fachada (commit 08fe04d04) o teste falha → `[FAIL] D.1 assinatura antiga de 8 args existe de novo: esperado 't', obtido 'f'` (exit 1).
- verde depois: `bash scripts/db-audit/inbound-effects-replay.test.sh` → `[OK] inbound-effects-replay: todos os checks passaram` (A/B/C/D verdes; D.1..D.9 provam o rollback).
- `hermes-db-migrar supabase/migrations/20261005224959_inbound_message_effects_outbox.sql` → `APLICADA no banco LOCAL 'v2-26101217211e4c'`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard/tipos/lint/migrations OK).
- Critério 5 (manifesto): `generate-manifest.mjs --check` OK (medida acima).

## O que NÃO fiz e por quê
- Não regenerei/versionei supabase/deployment-manifest.json: `--check` já OK (medido), sem drift.
- Não toquei a edge nem os testes ts do #69: fora da lista de arquivos deste cartão; a base é do t_1accb485 (comentário + aviso acima).
- check-test-inventory.mjs já reprova na ponta por 6 órfãos de OUTROS cartões; o teste deste cartão não está entre eles.

## Sobre o aviso "SEM DDL/migration" do fechar (falso positivo)
O fechar acusou "o cartão diz SEM DDL/migration e o seu diff cria a migration ...". É falso positivo: o rodapé REGRAS PERMANENTES colado no corpo do cartão traz a frase de regra de front "Plano de front não traz DDL, Edge Function, migration". Este é um cartão de BANCO (worker sql) cujo entregável É exatamente a migration do outbox inbound #69 — o critério 1..3 do cartão pede a migration com rollback executável. Nada foi tirado; repito o MESMO comando.

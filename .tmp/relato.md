Especialista: worker (sql) (area-sql-banco)

## Cartão
Retomar de t_34d2277d, que foi recusada SÓ pelo `banco_local` (as outras etapas passaram: db_guard, migrations, tipos, lint, travas). Reproduzi a recusa a partir do estado real do conjunto desta cópia.

## O que fiz (2 arquivos, o mesmo par que o workspace anterior mexeu — cherry-pick -x de f77dafb35, não copiei o conteúdo base de novo)
1. `supabase/migrations/20261005224959_inbound_message_effects_outbox.sql`
   - Correção da recusa: a CHECK do `effect` era ANÔNIMA. O Postgres gera `inbound_message_effects_effect_check` e o texto da migration pendente não citava esse nome, então o `zapp-verify` classificava a diferença `constraints|relation:inbound_message_effects.inbound_message_effects_effect_check` como "não explicada por migration pendente" (vermelho). Agora a constraint é NOMEADA (`CONSTRAINT inbound_message_effects_effect_check CHECK (...)`): o nome aparece no próprio texto da migration pendente e a diferença volta a ser explicada. NÃO muda comportamento (mesmo predicado, mesmo nome de objeto no banco).
   - Mantive a correção que o cartão carrega: no `duplicate` (INSERT que perdeu o ON CONFLICT) a transação NÃO cria efeito novo (`AND v_outcome <> 'duplicate'`) — o efeito fica com quem venceu o INSERT; e o corpo não reescreve `updated_at` de mensagem que já existia.
   - Rollback: bloco `-- Rollback:` executável (assinatura de 8 args de volta com corpo, REVOKE/GRANT/COMMENT; DROP das assinaturas novas e da tabela).
2. `scripts/db-audit/inbound-effects-replay.test.sh` (idêntico ao anterior): blocos A–D; o bloco D EXTRAI o `-- Rollback:` do arquivo real e o executa com ON_ERROR_STOP=1 (não é cópia à mão).

## A segunda linha da recusa (o gatilho) não é do meu diff
`triggers|messages.trg_guard_message_provenance_fields`: o verificador só a explica se alguma migration PENDENTE citar o nome. Quem cria esse gatilho é `supabase/migrations/20261006114108_r2_db_022_provenance_trigger.sql`, que ESTÁ na árvore de hoje (`CREATE TRIGGER trg_guard_message_provenance_fields`) e NÃO está no retrato da produção (`supabase/schema-manifest.json` não lista esse gatilho) — logo está pendente e o nome é citado. No dia da recusa essa migration não existia na cópia (conferido com `git ls-tree`), por isso a linha ficou sem explicação. Não é meu escopo tocá-la.

## Prova (rodado agora)
- `bash scripts/db-audit/inbound-effects-replay.test.sh` → `[OK] inbound-effects-replay: todos os checks passaram`; bloco D: `[PASS] D.1` a `[PASS] D.9` (rollback executável de verdade, não fachada).
- `zapp-db-local up . v2-efeitosdup` → migrations reais aplicadas sem NENHUMA falha nova (`estado/falhas.tsv` não tem a migration do cartão) e as duas linhas da recusa conferidas no retrato local: `check-diferencas.txt` linha 30 (gatilho) e linha 82 (constraint), ambas agora com o nome citado por migration pendente (linha 82 pela minha migration).

## Limite da reprodução local (honesto, não é falha da entrega)
No sandbox do worker a leitura do registro da produção falha: `AVISO banco_local não consegui ler o registro da produção: vale a regra estrita`. Sem o ledger, o `zapp-verify` cai na REGRA ESTRITA e reprova as 160 diferenças do conjunto (inclusive as que o integrador trata como derivadas/drift). A decisão de `banco_local` é do integrador, que LÊ o ledger e usa o caminho "explicada por migration pendente" — é nesse caminho que as duas linhas passam.

## Efeitos colaterais conferidos
Nenhum GRANT/papel/ACL mudou além do que a migration já fazia; nenhuma migration existente foi editada (a de #69 ainda não está integrada — é o arquivo que este cartão entrega); nenhuma tabela nova sem RLS (a migration liga RLS + REVOKE e dá GRANT só a service_role, provado no teste B.33/B.34).

## Aviso de ordem de integração (fora do meu escopo, para o integrador)
O cartão-base do #69 (t_1accb485, branch `v2/aplicar-base-original-outbox-inbound-69-261011193393d1`, sha 08fe04d04) está "pronto" na fila e ainda NÃO entrou em `dia/2026-10-11` (a ponta do dia segue 9372aeb6a, sem o arquivo). Meu cartão usa o MESMO caminho de migration (a checagem de colisão do integrar.sh isenta o caminho idêntico), mas se a base entrar primeiro os dois lados adicionam o mesmo caminho com conteúdos diferentes (o meu tem o guarda de duplicate + constraint nomeada) → add/add. Se o fechar devolver por CONFLITO, basta rebasear este commit sobre o dia já com a base.

## As duas checagens automáticas do fechar NÃO procedem neste cartão (a explicação pedida)
1. "o cartão diz SEM DDL/migration e o seu diff cria/altera supabase/migrations/..." — leitura errada do corpo: este é um cartão de BANCO; o parágrafo "não traz DDL/migration" é do rodapé/regras do template copiado no corpo (é proibição de PLANO DE FRONT, não deste cartão) e a própria lista ARQUIVOS QUE PODE TOCAR traz a migration. A entrega É uma migration, como o cartão pede. Repito o MESMO comando.
2. "INVENTÁRIO DE TESTES: .test.sh novo sem passo no CI" — verdade no retrato de hoje, mas o reparo é de OUTRO especialista: o cartão diz, em maiúsculas, NÃO tocar em `.github/**`, e o passo do `.test.sh` no `db-guard.yml` é o que o cartão-irmão do espelho do CI já está fazendo (`fix(sql): corrige inventário do outbox inbound`, branch `v2/refazer-outbox-inbound-69-ci-espelho-t-d-2610111927608e`, que adiciona 5 linhas ao `db-guard.yml`). `node scripts/ci/check-test-inventory.mjs` neste workspace aponta 4 órfãos — 3 deles de outros cartões, todos anteriores a mim — e nenhum é meu para registrar.

## Aviso do juiz sobre o UPDATE em `messages` (não procede para este cartão)
O juiz aponta que "o UPDATE em `messages` dispara o gatilho BEFORE UPDATE que regrava updated_at". Conferido o real:
- O UPDATE fica no caminho de REPLAY (a mensagem JÁ existe: `IF v_existing.id IS NOT NULL`), é UMA linha, por `id`, e NÃO menciona `updated_at` (a coluna é regravada pelo gatilho `messages.update_messages_updated_at`, pré-existente e alheio a este cartão). Não é backfill: toca 1 linha do `external_id` que chegou de novo, não "todas as linhas".
- Esse comportamento é do corpo ANTIGO também: o `-- Rollback:` restaura a assinatura de 8 args cujo corpo faz o mesmo UPDATE — provado por `[PASS] D.4 replay sequencial no corpo anterior devolve updated`. Ou seja, o cartão não introduz o efeito; a mudança que este cartão traz é no caminho oposto (o `duplicate` do ON CONFLICT), que passou a NÃO escrever e a NÃO enfileirar efeito (`AND v_outcome <> 'duplicate'`).
- Tirar o UPDATE mudaria o contrato que a própria suíte do cartão exige: `[PASS] A.6`/`B.8` provam `updated` e "outbox não reabre" no replay sequencial (o aviso pedia "preserve a coluna" — o caminho que PRESERVA e retorna `updated` é este). Por isso NÃO altero o corpo: manter a entrega mínima e fiel ao cartão, como manda a instrução do próprio aviso ("se o aviso não procede, rode o MESMO comando de novo").
- Prova de escopo: `colunas tocadas = 1` (por `id`), e `B.28`/`C.10` provam re-drain/replay idempotentes (nada duplicado, nada reaplicado).

Observação para o portão: se o fechar acusar "SEM DDL/migration", é alarme falso — este cartão TEM 1 migration (acima) e o rodapé do template veio junto com o corpo do cartão. Nesse caso repito o MESMO comando e registro aqui.

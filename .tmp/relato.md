Especialista: semisenior (area-testes-do-produto)
## O que mudou e por quê
- `supabase/tests/gamification_nivel_paridade_rls.sql`: T7 agora afirma o efeito da falha (corpo do gatilho revertido) em vez de só afirmar que a mensagem persistiu; aviso do T6b renomeado para deixar claro que só o não-derrubar está OK. Motivo: recusa da rodada 1 (3 pontos, abaixo).
- `.tmp/relato.md`: este relato do refazer, com a frase da prova por mutação reescrita (ponto 3 da recusa).

## Prova
- Verde depois: `zapp-db-local psql "$PWD" gamifpar1 -v ON_ERROR_STOP=1 < supabase/tests/gamification_nivel_paridade_rls.sql` → `EXIT=0`, com `NOTICE:  T7 OK: com a gamificação forçada a falhar, a mensagem continua gravada e o corpo do gatilho é revertido (messages_sent = 9, message_milestone = 1)` e `NOTICE:  T6b OK (só o não-derrubar): encerramento no marco 10 é gravado (a gamificação não derruba o encerramento)`, terminando em `ROLLBACK`. A linha `WARNING:  gamification error in handle_message_gamification (message_id=...): injecao de falha proposital (T7) [P0001]` mostra o stub no caminho.
- Vermelho do T7 com o stub fora do caminho: cópia temporária do mesmo arquivo sem o bloco do stub (rotina real no lugar) → `EXIT=3` e `ERROR:  T7 FALHOU: a injeção não disparou (messages_sent = 10, esperado 9 = corpo do gatilho revertido)`. A cópia temporária (`.tmp/mut_t7_sem_stub.sql`) não entra no commit; a prova durável são as asserções do T7 no arquivo do commit, que falham sem a injeção.
- Cliente intacto: `npx vitest run src/hooks/gamification/__tests__/levelUtils.test.ts` → `Test Files 1 passed (1); Tests 9 passed (9)` (arquivo não tocado neste refazer).
- `zapp-verify full` no workspace: `VERIFY: VERMELHO em banco_local (151s)` / `EXIT=1` por `ESTRUTURA: 182 diferença(s) em relação ao retrato da produção` — deriva preexistente da branch (ex.: grants de `ai_usage_outbox` de migrations de outros cartões); zero diferenças em objetos de gamificação (`agent_stats`, `agent_achievements`, `calculate_level`, gatilhos). Ver item 1 de "O que NÃO fiz".

## Pontos do revisor (recusa da rodada 1, commit 8d081c87d)
- Ponto 1 (T7 não confirmava que o stub foi chamado): resolvido — `supabase/tests/gamification_nivel_paridade_rls.sql:428-447`: depois do INSERT o T7 lê `messages_sent` (linhas 433-437, `is distinct from 9` para não passar em vacuo com NULL) e conta `message_milestone` (linhas 439-445, esperado 1, só a do T4). Verde com o stub no caminho (saída acima); vermelho `T7 FALHOU: a injeção não disparou (messages_sent = 10, ...)` com o stub fora do caminho (saída acima).
- Ponto 2 (aviso `T6b OK` dividia atenção com o defeito do marco 10): resolvido — `supabase/tests/gamification_nivel_paridade_rls.sql:395`: aviso agora é `T6b OK (só o não-derrubar)`; o `WARNING: T6b PENDENCIA` (marco 10 com `conversations_resolved=9`, esperado 10, `resolution_milestone=0`) continua como estava.
- Ponto 3 (frase ambígua sobre mutação em produção): resolvido neste relato — as mutações da prova foram feitas só em código do workspace e no banco local da tarefa (`gamifpar1`), sempre dentro de transação com `ROLLBACK` (o stub do T7 existe só dentro do arquivo de teste; a mutação do cliente foi restaurada no mesmo arquivo); o banco de produção nunca foi tocado nem lido.

## O que NÃO fiz e por quê
- Não mexi na deriva de estrutura que deixa o `zapp-verify full` vermelho (182 diferenças de migrations de outros cartões da branch; corrigir o retrato é dos donos desses cartões e mexer em manifesto/gate fora do título já me reprovou antes).
- Não alterei migration, código de produto, teste de cliente nem o defeito real do marco 10 (PENDÊNCIA do T6b, registrada em `kanban_comment` pelo cartão original; corrigir a função `grant_agent_achievement` é de outro cartão).
- Não usei `git push`, `gh`, `supabase db push`/deploy nem banco de produção; scripts `hermes-tarefa-*`/`hermes-db-migrar` estão congelados (CONGELADO sem MODO_V2), então trabalhei no workspace da entrega anterior e fecho pelo kanban.

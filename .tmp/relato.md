Especialista: worker (geral)

## O que mudou e por quê
- supabase/migrations/20261011193310_queues_distribution_overflow.sql: na ordenação round_robin de `queue_pick_agent`, troquei `COALESCE(max_evento, max_created_at)` por `GREATEST(max_evento, max_created_at)`. `log_assignment_change` é AFTER UPDATE, então contatos atribuídos por INSERT não geram `conversation_events`; com COALESCE o atendente ficava congelado na data do evento antigo de transferência e continuava parecendo o mais antigo mesmo depois de receber contatos novos por INSERT. GREATEST ignora NULL, então o fallback quando um dos dois lados falta é preservado (só retorna NULL se ambos forem NULL).
- scripts/db-audit/queues-distribution-overflow.test.sh: acrescentei o cenário 2b (fila nova `round-robin-insert`, b1/b2): b1 recebe um contato por UPDATE de queue_id (evento fixado em 2026-03-01) e depois um contato novo por INSERT com created_at recente (2026-09-01, sem evento); b2 tem um contato por INSERT em 2026-06-01. A entrada seguinte na fila deve ir para b2 — o último atendimento real de b1 é o INSERT, não o evento velho.
- scripts/db-audit/queues-distribution-overflow.test.sh: o caso sticky de papel 'agent' (membro 'ad' na fila 012) agora isola o filtro de papel: acrescentei `agent_skills(ad,'vendas',2)` depois dos testes de habilidade anteriores, de modo que só o papel 'agent' (ad é admin) exclui 'ad'; o esperado segue o agente elegível (a1). Sem isso, o filtro de habilidade sozinho já excluía 'ad' e o teste passava mesmo sem o JOIN user_roles (era a recusa).
- .github/workflows/db-guard.yml: já vinha alterado pelo commit trazido (cherry-pick 5e42f6c43) para registrar o novo contrato de banco; está na lista de ARQUIVOS QUE PODE TOCAR do cartão ("só registrar o teste, se a regra exigir") e a regra exige o registro do teste de db-audit. Não fiz mudança nova nele.
- src/integrations/supabase/types.ts: tipo gerado trazido pelo mesmo commit (colunas novas de `queues` que a migration cria). O cartão permite ("só se o tipo gerado mudar por causa da migration"); a mudança de GREATEST não altera tipo.

Diff do commit: 5 arquivos, 1 de teste (`scripts/db-audit/queues-distribution-overflow.test.sh`).

## Pontos do revisor ([refazer])
- Ponto 1: `queue_pick_agent` usa GREATEST no ramo round_robin (arquivo acima). Cenário novo no `.test.sh` (2b); o teste falha com COALESCE e passa com a correção (prova abaixo).
- Ponto 2: o caso sticky de papel deixou de ser resolvido pela habilidade — dei 'ad' a habilidade 'vendas' nível 2 e o esperado continua o agente elegível (a1). Prova por mutação: removendo o filtro de papel o teste falha (escolhe 'ad').

## Conferências do juiz (não procedem / já cobertas)
- UPDATE que regrava `updated_at` em todas as linhas: o transbordo (`queue_overflow_rewrite`) faz `UPDATE public.contacts ... WHERE id = NEW.id AND queue_id = NEW.queue_id` — toca UMA linha só. O contrato prova: `[PASS] transbordo: toca UMA linha de contacts (so o contato movido, sem backfill de updated_at)` (count de `updated_at >= t0` = 1) e `[PASS] transbordo: contato intocado mantem updated_at antigo` (outro contato com `updated_at < t0`). Não desliguei o gatilho porque só uma linha casa o WHERE.
- LOOP sem teto: `queues_prevent_overflow_cycle` tem teto por chamada — `WHILE v_cur IS NOT NULL AND v_depth < 100 LOOP` com `v_depth := v_depth + 1`. Não há drenagem sem teto.

## Prova (comando rodado agora)
- vermelho antes (mutação GREATEST -> COALESCE na migration): `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[FAIL] round_robin: ultimo atendimento por INSERT (sem evento) faz b1 sair da vez: esperado '00000000-...0b2', obtido '00000000-...0b1'` (EXIT=1)
- vermelho do Ponto 2 (mutação `ur.role='agent'` -> `TRUE`): `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[FAIL] sticky: ultimo membro com habilidade mas sem papel agent cai no agente elegivel: esperado '00000000-...a1', obtido '00000000-...ad'` (EXIT=1)
- verde depois (migration restaurada, sem mutação): `bash scripts/db-audit/queues-distribution-overflow.test.sh` -> `[OK] contrato de distribuicao/transbordo de filas provado` (EXIT=0)

## O que NÃO fiz e por quê
- Não afrouxei nenhum teste existente: os casos originais permanecem e passam.

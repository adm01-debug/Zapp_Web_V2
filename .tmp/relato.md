Especialista: workersql
## O que mudou e por quê
- supabase/migrations/20261012135248_lgpd_requests.sql: status do cartão (default aberto, CHECK aberto/em_analise/concluido/recusado); policy de INSERT exige user_id próprio, status aberto e tratamento nulo; GRANT de INSERT só em (user_id, motivo, status) e de UPDATE só em (status, tratado_por, tratado_em, resposta); cabeçalho com uma única linha -- Rollback: seguida do SQL executável.
- scripts/db-audit/lgpd-deletion-queue.test.sh: mesmos status do cartão em todo o teste; casos novos B.2a–B.2e (titular não forja), B.13b–B.13d (user_id/motivo imutáveis), B.20 via service_role, B.25b (privilégios por coluna) e C.0 (uma só linha -- Rollback).
## Prova
- verde depois: `bash scripts/db-audit/lgpd-deletion-queue.test.sh` → `PASS: LGPD — fila de exclusao com RLS (titular cria/ve o seu; admin e supervisor tratam; sem DELETE), historico paginado so do proprio usuario e evento privacy_policy_viewed sem dado pessoal; rollback do cabecalho roda.`
- vermelho antes ponto 1: teste novo contra a migration antiga → `[FAIL] B.2a titular NAO cria pedido ja concluido (status forjado): deveria falhar, mas passou`
- vermelho antes ponto 2: teste antigo contra a migration nova → `[FAIL] B.2 pedido nasceu pending (default da V3): esperado 'pending', obtido 'aberto'`
- vermelho antes ponto 4: prova focada (`/tmp/prova-p4.sh`, não commitada) → `ANTIGA user_id: PASSOU (buraco)`; verde: `ERROR: permission denied for table data_deletion_requests`
- ponto 3: `grep -c '^-- Rollback'` na migration antiga → 3; na nova → 1; bloco C verde (C.1 rollback executou, C.2–C.4 objetos sumiram, C.5 audit_logs com 29 eventos intacto).
## Pontos do revisor
- Ponto 1: resolvido — policy de INSERT exige status aberto e tratamento nulo (migration) + GRANT de INSERT só em (user_id, motivo, status), então prazo forjado cai em permission denied. Desvio da receita: em vez de gatilho que normaliza o prazo (que faria o insert forjado PASSAR normalizado, contra o "todos devem falhar"), o GRANT por coluna faz o insert forjado FALHAR. Testes B.2a (row-level security), B.2b–B.2e (permission denied), B.25b.
- Ponto 2: resolvido — CHECK, default, comment e todo o teste usam aberto/em_analise/concluido/recusado. Não encontrei ordem do dono para a nomenclatura da V3, então vale o cartão. Testes B.2, B.10, B.12, B.14, B.19, B.20 (status pending da V3 recusado pelo CHECK, via service_role para provar o CHECK e não a policy).
- Ponto 3: resolvido — cabeçalho com uma única linha -- Rollback: seguida do SQL executável (convenção da skill de banco, linha 2 da migration); C.0 conta as linhas e o sed extrai dessa linha. Teste C.0–C.5 verde.
- Ponto 4: resolvido — GRANT de UPDATE só em (status, tratado_por, tratado_em, resposta) em vez de gatilho: user_id e motivo viram permission denied até para admin, com uma linha de SQL em vez de função nova. Testes B.13b, B.13c, B.13d (linha intacta), B.25b.
## O que NÃO fiz e por quê
- Não toquei em src/integrations/supabase/types.ts: o status lá é `string` genérico, sem literais da V3 — nada para trocar.
- Não toquei em .github/workflows/db-guard.yml, grants-baseline nem manifestos: o passo de CI do teste já veio na entrega anterior e continua válido; baseline de GRANTs se mede no banco canônico, não nesta migration.
- Não normalizei prazo por gatilho (ver Ponto 1): normalizar faria o caso forjado passar, contra o exigido.

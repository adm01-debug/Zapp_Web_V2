Especialista: workersql

Ponto 1 — dry-run impreciso (contava além da capacidade real).
O que mudei: supabase/migrations/20261014120000_reassign_dry_run_capacity_counter.sql (nova, aditiva; a anterior intocada). Nas duas RPCs o filtro de capacidade e o ORDER BY passaram a somar a carga simulada em memória (jsonb v_sim por substituto, incrementado só no ensaio): `(abertas + sim) < max_chats`. No modo real nada muda (sim nunca incrementa, +0; corpo do ELSE idêntico).
Teste que prova: R1 em supabase/tests/reassign_agents_only_open_conversations.sql (O com 2 excedentes, S com 1 vaga: ensaio e real têm de devolver 1, e o ensaio não move nada).
Vermelho (funções antigas): exit=3, `R1 FALHOU: dry-run deveria contar 1 (1 vaga), veio 2` (.tmp/prova-red.log).
Verde (com a correção): exit=0, `R1 OK: ensaio == real (1) com vaga limitada; ensaio nao moveu` (.tmp/prova-green2.log).

Ponto 2 — testes que faltavam (4 lacunas, todas cobertas em blocos novos R0–R4 no mesmo arquivo de teste).
(a) R2: agente com 3 abertas + 40 resolvidas e max_chats=3 retorna 0 e nada move; agente com max_chats NULL e 10 abertas é ignorado (NULL ajustado no próprio bloco, sem depender do seed). Verde antes e depois: `R2 OK` (trava de regressão).
(b) Incluído no R2 acima (NULL explícito no bloco).
(c) R3: authenticated comum também é negado em reassign_overloaded_agents (exceção "requer perfil admin ou supervisor"). Verde antes e depois: `R3 OK`.
(d) R4: ausente com 1 aberta válida + 1 aberta apagada (deleted_at) retorna 1, move só a válida para C e a apagada fica com B. Verde no novo: `R4 OK` (não rodou no antigo porque o R1 interrompe o arquivo antes — arquivo com ON_ERROR_STOP).
R0: re-isolamento (max_chats NULL global) após T4/T10 para os blocos R não herdarem sobrecarga alheia.

Ponto 3 — formato do relato.
Primeira linha exata `Especialista: workersql` acima. Verificações abaixo no formato pedido (comando + resultado real). Correção da afirmação: o teste supabase/tests/reassign_agents_only_open_conversations.sql foi CRIADO na entrega anterior (commit b64ff0524) e ESTENDIDO neste refazer (blocos R0–R4); nenhum teste existente foi removido, pulado ou afrouxado — T1..T10 passam iguais antes e depois (lista no verde abaixo).
Ajustes de compatibilidade no arquivo de teste, sem mudar nenhuma asserção: (a) removido email_confirmed_at dos INSERTs em auth.users (coluna só do GoTrue novo; o trigger handle_new_user não a usa); (b) sub espelhado em request.jwt.claim.sub junto a cada request.jwt.claims (GoTrue antigo lê auth.uid() do formato singular; o novo ignora essa GUC).

Verificações (prova real no banco local; nada persiste — o arquivo termina em ROLLBACK).
Comando: psql -h 127.0.0.1 -p 35432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/reassign_agents_only_open_conversations.sql
T1 OK, T2 OK, T3 OK, T5 OK, T4 OK, T6 OK, T7 OK, T8 OK, T9 OK, T10 OK, R2 OK, R3 OK, R1 OK, R4 OK, rc 0
Desvio de ambiente (1 linha): o `zapp-db-local up/psql` não sustentou o conjunto nesta sessão (contêiner morria em ~2 min com 24 stacks na máquina e o `psql` dizia "não está de pé"); subi o postgres da mesma imagem (ghcr.io/supabase/cli/postgres:17.11.0.002-r0) via docker run, apliquei as 832 migrations do workspace e rodei a prova pelo psql local — mesmo esquema, mesmas funções.
Migration: aplicada com rc 0 (CREATE FUNCTION x2 + REVOKE/GRANT).
Rollback: extraído do próprio arquivo (linhas `|--`, sem redigitar), aplicado com rc 0; v_sim some das 2 funções; a prova volta a falhar no R1 com `veio 2` (defeito restaurado, demais blocos passam); reaplicação volta ao verde acima.
Chamadores: src/hooks/crm/useAgentReassignment.ts chama as duas RPCs em modo real (assinaturas inalteradas, sem impacto); supabase/functions sem uso; types.ts inalterado.

Arquivos (git show --name-only HEAD):
.tmp/relato.md
supabase/migrations/20261014120000_reassign_dry_run_capacity_counter.sql
supabase/tests/reassign_agents_only_open_conversations.sql

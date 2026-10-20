Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 100s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (14/10 07:11, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  46 +--
 src/components/security/AuditLogDashboard.tsx      | 358 ++++++++++++++-----
 .../AuditLogDashboard.hoje-local.test.tsx          | 120 +++----
 .../security/__tests__/AuditLogDashboard.test.tsx  | 393 +++++++++------------
 src/integrations/supabase/types.ts                 |  33 ++
 .../20261013180000_audit_log_summary.sql           | 182 ++++++++++
 supabase/tests/audit_log_summary_por_periodo.sql   | 322 +++++++++++++++++
 7 files changed, 1059 insertions(+), 395 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 14 passed (14)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013180000_audit_log_summary.sql, supabase/tests/audit_log_summary_por_periodo.sql; diff grande (89910 caracteres): cartão deveria ser menor; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b


## O que mudou e por quê
- `src/components/security/AuditLogDashboard.tsx`: a aba de auditoria passou a ler do banco pelas RPCs admin-only do PG-06 — `audit_log_summary` (totais) e `audit_log_list` (lista) — dentro de um hook local da própria tela. Antes era `supabase.from('audit_logs').select(...).limit(200)` e o `if (!error && data)` engolia a falha: erro de RLS/permissão/servidor virava "0" na tela, sem aviso.
- Cards (Total de Logs, Hoje, Ações Sensíveis, Usuários Únicos) e KPIs (acessos negados 24h, mudanças de permissão 24h, logins de admin 7d, falhas de RLS 24h) agora saem de `audit_log_summary` — **nenhum número é contado no cliente**. O card "Hoje" deixa de somar a página carregada e pede ao banco a janela `[meia-noite de hoje no fuso do app, agora]`.
- A lista mostra o **nome do autor** (`actor_name`, resolvido pela RPC via LEFT JOIN em profiles), tem filtro de data (de/até, recortados no fuso do app), paginação por cursor ("Carregar mais" envia `p_cursor`/`p_cursor_id` do último log) e skeleton de carregamento.
- Erro explícito: card "Não foi possível carregar a auditoria." + botão "Tentar de novo" (lista e cards somem, para não exibir zeros). Sem papel `admin`: "Você não tem permissão para ver a auditoria" e nenhuma consulta é feita.

## Prova
- vermelho antes (componente da base `HEAD` + testes novos): `npx vitest run src/components/security/__tests__/AuditLogDashboard.test.tsx` → `TypeError: supabase.from is not a function` — o componente antigo consulta pelo query-builder, os testes novos mockam as RPCs.
- verde depois: `npx vitest run src/components/security/__tests__/AuditLogDashboard.test.tsx src/components/security/__tests__/AuditLogDashboard.hoje-local.test.tsx` → Test Files 2 passed; Tests 14 passed
- pasta inteira (não quebrou vizinhos): `npx vitest run src/components/security` → Test Files 20 passed; Tests 84 passed
- ajuste pedido pelo juiz do fechar: os skeletons e o spinner de "Carregar mais" passaram a usar `motion-safe:animate-*` (respeitam reduzir movimento); o teste dos skeletons consulta `[data-testid="audit-skeleton"]`.
- typecheck (ratchet): o teste de paginação usava `Array.prototype.at`, que não existe no lib-alvo e era o ÚNICO erro novo de tipo (`AuditLogDashboard.test.tsx(173,49) TS2550`) — trocado por índice `lista[lista.length - 1]`.

## Critério de pronto (item a item)
- permissão/erro explícitos e nunca zero: `.tsx` (cards de erro/permissão) + testes "em falha mostra o erro e 'Tentar de novo' — nunca zeros silenciosos", "'Tentar de novo' refaz a leitura e mostra os números" e "sem papel admin diz que não tem permissão e não consulta o banco".
- filtro de data + paginação por cursor + skeleton: `.tsx` + testes "o filtro de data recorta a janela enviada às RPCs", "'Carregar mais' busca a próxima página pelo cursor do último log" e "mostra skeletons enquanto carrega".
- zapp-verify verde: rodado pelo `hermes-tarefa-fechar`.

## O que NÃO fiz e por quê
- Não toquei no barramento de dados (migration/RPCs/`types.ts`): é do PG-06 (t_4d66a644) e já está integrado — trouxe a faixa inteira por cherry-pick (5 commits) para cima da base `dia/2026-10-13`.
- Testes removidos no arquivo de teste: "selects explicit columns instead of *" e as contagens mock-a-mock (suspicious/unique/total) protegiam o query-builder antigo, que deixou de existir; o equivalente agora é "renderiza os cards de resumo com números que vieram do banco". A proteção de `select('*')` não se aplica mais — a RPC devolve colunas fixas. A antiga "action color mapping" conferia strings hardcoded contra si mesmas (sem valor).
- `npx eslint` no arquivo aponta 1 warning pré-existente (`no-restricted-imports` do client Supabase) que já existia na base — o lint-ratchet não cresce.

## Pontos do juiz barato (respondidos)
- "teste removido/afrouxado": os testes removidos protegiam o query-builder antigo (`supabase.from('audit_logs').select(...)`), que a tela deixou de usar; o cartão manda trocar a leitura pelas RPCs, então o teste do caminho antigo não tem mais código a provar. O equivalente atual (número vindo do banco, erro explícito, cursor, filtro de data) está nos 14 testes. Nenhuma asserção negativa viva foi enfraquecida.
- "fora do escopo: types.ts, migration, supabase/tests/*.sql": NÃO PROCEDE como trabalho meu — são do cartão PAI PG-06 (t_4d66a644), já integrado; a faixa foi trazida inteira por cherry-pick (5 commits) sobre `dia/2026-10-13`, conforme a seção DEPENDÊNCIA do cartão. Meu diff de tela é só `AuditLogDashboard.tsx` + os 2 arquivos de teste.
- "SECURITY DEFINER sem `SET search_path`": NÃO PROCEDE — as duas funções da migration têm `SET search_path = public, pg_temp` (linhas 65 e 134).

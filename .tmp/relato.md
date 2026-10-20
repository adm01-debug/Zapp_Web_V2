Especialista: hugo

## Critérios de pronto — resposta direta
1. Totais independem do limite de 200: os quatro cartões saem de contagem no servidor (`select('id', { count: 'exact', head: true })`) e só a lista continua com `.limit(200)`.
2. REALTIME ATIVO: `public.audit_logs` está na publicação `supabase_realtime` pela migration versionada `supabase/migrations/20260828190000_realtime_publish_subscribed_tables.sql` ("ALTER PUBLICATION supabase_realtime ADD TABLE ... public.audit_logs"), então nenhuma migration nova é necessária. O hook assina INSERT nessa tabela no canal `audit-logs-dashboard` e o remove no cleanup.
3. `zapp-verify . --rapido` ficou VERDE: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO`, rc=0.
Concluído: os três critérios estão cumpridos.

## Prova
- verde depois: `npx vitest run src/components/security src/hooks/security` → `Test Files 25 passed (25)`, `Tests 126 passed (126)`, 0 pulados.
- vermelho antes (mesmo comando sobre a base, sem o hook novo): `Test Files 2 failed (25)`, `Tests 3 failed | 122 passed (125)` — os 2 do cálculo de dia local e o de revelar/recolher, que assumia a ordem antiga.

## O que mudou e por quê
- src/hooks/security/useAuditLogDashboard.ts (novo): totais por contagem de servidor com as janelas que o cartão pede — total sem janela; Hoje = últimas 24 h; Ações Sensíveis = `.or('action.like.role_%,action.like.%delete%,action.like.%export%')` nas últimas 24 h, espelho de `isSensitiveAction` da tela; Usuários Únicos = últimos 7 d, paginado por `fetchAllRows`, com `usuariosUnicosIncompleto` marcando quando a leitura não cobriu os 7 dias. Cada carga tem geração própria (`geracaoRef`): resposta atrasada de filtro antigo é descartada, e todo caminho (sucesso, erro, desmontagem) limpa `loading`.
- src/hooks/security/useAuditLogDashboard.ts: lista com desempate determinístico `.order('created_at', {ascending:false}).order('id', {ascending:false})` — `created_at` não é único (lote grava várias linhas no mesmo instante); e a leitura de `profiles` trata `name` nulo (`name ?? ''`), o que zerou o typecheck.
- src/components/security/AuditLogDashboard.tsx: consome o hook; o vocabulário dos filtros continua na tela e chega por props. Cada cartão mostra a janela ("últimas 24 h", "últimos 7 d"); nenhuma string nova além dessas legendas.
- src/test/mocks/auditLogsServer.ts (novo): suporte de teste — servidor PostgREST falso (eq/in/like/or/gte/not, order/limit/range, contagem) e canal Realtime falso. Foi indispensável e é o item "testes" da lista ARQUIVOS QUE PODE TOCAR: fica no diretório de mocks de teste que já existe na base (`src/test/mocks/`, ao lado de `scheduledMessagesServer.ts`, `supabase.ts`, `tarefas.ts`) e não é código de produção.
- src/components/security/__tests__/AuditLogDashboard.test.tsx: os testes existentes rodam sobre o servidor falso com as mesmas expectativas e 9 novos provam os critérios — 500 linhas na base: Total mostra 500 (não as 200 da tela), Hoje 250, Ações Sensíveis 50, Usuários Únicos 4 com o `u9` que só existe fora da página; INSERT no canal atualiza o cartão em menos de 5 s; canal removido ao desmontar; nome do autor vem de `profiles`; erro de leitura vira aviso em vez de zerar.
- src/components/security/__tests__/AuditLogDashboard.hoje-janela24h.test.tsx (renomeado de `AuditLogDashboard.hoje-local.test.tsx`): o arquivo antigo (R3-02, #1392) provava a contagem do dia local sobre as linhas carregadas — cálculo que este cartão removeu — e por isso falhava. O novo prova o mesmo comportamento com a janela de 24 h: o limite pedido ao servidor é `agora - 24 h` em ISO (instante absoluto, não a meia-noite local nem a UTC) e o rótulo diz "últimas 24 h".

## O que NÃO fiz e por quê
- Migration nova: nenhuma precisou.
- RPCs `audit_log_summary`/`audit_log_list` do cartão irmão t_4d66a644: não existem nesta base (procurei em `supabase/` e em `src/integrations/supabase/types.ts`), então os totais saem do `count: 'exact', head: true`, que é o item 1 do O QUE FAZER.
- Nenhum commit de outro cartão entrou por cherry-pick. Edição em massa, exportação, DDL, Edge Function e dependência nova: nada disso entrou.

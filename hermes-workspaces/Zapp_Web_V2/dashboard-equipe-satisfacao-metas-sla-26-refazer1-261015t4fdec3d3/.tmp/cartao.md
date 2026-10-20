Task t_a242b42f: test(dashboard): painel Equipe, Satisfação, Metas, SLA, paginação de CSAT/NPS e previsão de demanda
  status:    running
  assignee:  workertestes
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a242b42f
  max-retries: 2 (default)
  created:   2026-10-13 08:53 by claude
  started:   2026-10-13 15:23

Body:
ESPECIALISTA DA ÁREA: workertestes (testes, e2e e regressão visual). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workertestes`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/16-components-connections-dashboard.md` (telas de conexões e dashboard). Plano e relatórios: `~/arquitetura-v2/paridade-16/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-16/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
Sem testes na V2: `AgentPerformancePanel`, `SatisfactionMetrics`, tela de Metas, `SLAMetricsDashboard`, `useSatisfactionBreakdown` (paginação keyset), `useNPSSurveys`, `DemandPrediction` com dado vazio.

O QUE FAZER
1. Liste o que já existe (36 testes entre connections e dashboard) e escreva só o que falta; PL-08/09/10/11 trazem os casos de metas, equipe, desafios e fuso: deixe `it.todo('PL-xx')` para o que depende deles.
2. Cubra estados de carregando, erro e vazio dos componentes citados.

ARQUIVOS QUE PODE TOCAR
- src/components/dashboard/__tests__/
- src/hooks/**/__tests__/

CRITÉRIO DE PRONTO
1. Cada componente citado tem teste de carregando/erro/vazio.
2. Sem duplicar.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-13 15:54] workertestes: Fora do meu escopo (só testes aqui) — cada um é produção e vira cartão de outro especialista:

1. `src/components/dashboard/SLAMetricsDashboard.tsx:41` — `Math.round(data?.overall.overallRate ?? 100)`: quando a leitura falha ou volta nula (não é o caso de `loading`), o cartão "Taxa Geral SLA" escreve **100%**. O `?? 100` é exatamente o que o irmão `t_c9c4999f` (sla-paineis-sem-dados) foi criado para tirar; a versão dele está na fila (`~/hermes-workspaces/.v2-fila/26101301074fd2.json`, estado "pronto") mas **não está na branch do dia** (`git cat-file`: arquivo `SLAMetricsDashboard.sem-dados-erro.test.tsx` ausente no meu base), então o teste dele ainda depende do commit dele. Não dupliquei: no meu arquivo `SLAMetricsDashboard.kpis.test.tsx` o estado vazio/erro ficou como `it.todo(...)` citando esse cartão.

2. `src/components/dashboard/DemandPrediction.tsx` — com série vazia o painel estoura: `Math.max(...[])` = `-Infinity` e `predictions[predictions.length-1].predicted` = `TypeError` (confirmei a expressão: `node -e` → `Cannot read properties of undefined (reading 'predicted')`). E com leitura falha/banco vazio o hook devolve série zerada, então o cartão diz "Descendo / 0 msgs" como se fosse leitura real. Precisa de produção (estado "Estável" + aviso "sem dados no período") — deixei `it.todo` e não inventei número.

3. `src/hooks/business/useNPSSurveys.ts` — não há estado de erro nem dado vivo do NPS (`createSurvey` existe mas é código morto, o irmão `t_26678352` está mexendo nisso); cobertura de erro da leitura ficou no meu teste, mas a "honestidade" do painel NPS é do cartão irmão.

4. `src/components/dashboard/GoalsDashboard.tsx` / `src/hooks/analytics/useGoalsDashboard.ts` — `useGoalsDashboard` devolve `isLoading` e a tela não usa; não existe estado de erro; o recorte de período/"hoje" (fuso) é PL-08/PL-11. Ficou `it.todo`.

5. Colisão de arquivo: os irmãos criaram/planejam `SatisfactionMetrics.test.tsx`, `SLAMetricsDashboard.sem-dados-erro.test.tsx` e `GoalsDashboard.test.tsx`. Para não colidir no integrador, usei nomes próprios (`*.estados.test.tsx`, `*.kpis.test.tsx`, `*.metas.test.tsx`, `*.equipe.test.tsx`, `*.leitura.test.tsx`).

Events (38):
  [2026-10-13 15:38] [run 12605] heartbeat
  [2026-10-13 15:39] [run 12605] heartbeat
  [2026-10-13 15:40] [run 12605] heartbeat
  [2026-10-13 15:41] [run 12605] heartbeat
  [2026-10-13 15:42] [run 12605] heartbeat {'note': '5 arquivos de teste escritos e verdes (paginação CSAT, NPS, SLA KPIs, previsão de demanda x2); faltam painel Equipe, Satisfação e Metas'}
  [2026-10-13 15:42] [run 12605] heartbeat
  [2026-10-13 15:43] [run 12605] heartbeat
  [2026-10-13 15:44] [run 12605] heartbeat
  [2026-10-13 15:45] [run 12605] heartbeat
  [2026-10-13 15:46] [run 12605] heartbeat
  [2026-10-13 15:47] [run 12605] heartbeat
  [2026-10-13 15:48] [run 12605] heartbeat
  [2026-10-13 15:49] [run 12605] heartbeat
  [2026-10-13 15:50] [run 12605] heartbeat
  [2026-10-13 15:51] [run 12605] heartbeat
  [2026-10-13 15:52] [run 12605] heartbeat
  [2026-10-13 15:53] [run 12605] heartbeat
  [2026-10-13 15:54] [run 12605] heartbeat
  [2026-10-13 15:54] commented {'author': 'workertestes', 'len': 2174}
  [2026-10-13 15:55] [run 12605] heartbeat

Runs (1):
  #12605 running      @workertestes  active  2026-10-13 15:23

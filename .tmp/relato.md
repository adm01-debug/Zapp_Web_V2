Especialista: worker (testes) (area-testes-do-produto)

# O que mudou e por quê
Cartão PL-13 (`t_a242b42f`). Só testes: nenhuma linha de produção foi alterada (`git diff --stat` vazio depois de reverter as mutações).
- `src/hooks/business/__tests__/useSatisfactionBreakdown.paginacao.test.tsx` — paginação keyset do CSAT: para na página vazia, cursor com `created_at.gt."ts",and(created_at.eq."ts",id.gt.id)` (aspas por causa do `:` e do `+`), 3 consultas quando há página cheia + vazia, teto de 50 páginas rejeitando com o total lido, erro da 1ª página e da tabela `queues` subindo (nunca vira lista vazia), e a agregação da janela (CSAT = % de notas >= 4, distribuição 5..1, média por agente/fila com "Agente/Fila removida", timeline de N dias com `null` nos dias sem resposta). O hook é o REAL; a dublagem é só `from()`.
- `src/hooks/business/__tests__/useNPSSurveys.estados.test.tsx` — leitura (`select '*'`, ordenação, limite), estado vazio (métricas zeradas) e erro da leitura (não derruba a tela, loga), NPS 100 ↔ -100 recomputando no `refetch`, e `createSurvey`: `agent_id` sai do perfil do usuário logado (sem usuário → `null`, não inventa), `feedback` nulo quando em branco, `survey_type: 'manual'`, toast de sucesso/erro.
- `src/hooks/business/__tests__/useDemandPrediction.previsao.test.tsx` — a série de 9 pontos (5 reais + 4 previstos) nasce do histórico de 7 dias (7 msgs na hora / 7 dias = 1/hora), a faixa de confiança cresce com o horizonte, pico/média/tendência, e `capacityRisk` só quando o pico PASSA da capacidade.
- `src/components/dashboard/__tests__/SLAMetricsDashboard.kpis.test.tsx` — carregando (`—` nos quatro KPIs), taxa arredondada/no prazo/violações/total vindos do hook, deltas do histórico (`+12%` e `-20%` invertido em violações), sparkline só com 2+ dias de histórico, agentes repassados, e o seletor de período refazendo a leitura.
- `src/components/dashboard/__tests__/DemandPrediction.leitura.test.tsx` — tendência Subindo/Descendo, pico com horário, média arredondada ("5 msgs" de 4.5), "Em Risco" só acima da capacidade, "OK" quando o pico é igual, e a legenda.
- `src/components/dashboard/__tests__/AgentPerformancePanel.equipe.test.tsx` — carregando ("Carregando ranking…"), vazio ("Nenhum dado de performance disponível" / "Sem agentes" / KPIs 0), e com dados: ordem por resolvidas, coluna SLA casada por `profile_id` (quem não casa fica `—`), destaque do dia com o SLA do líder, e a troca de ordenação/período chamando o hook.
- `src/components/dashboard/__tests__/SatisfactionMetrics.estados.test.tsx` — erro com "Tentar novamente" chamando `refetch`, carregando, vazio (3 blocos de vazio e nenhum número inventado) e conteúdo (CSAT arredondado, NPS do período, total, top agente, filas em %/volume, corte em 5, pesquisa fora da janela não entra).
- `src/components/dashboard/__tests__/GoalsDashboard.metas.test.tsx` — sem metas (0% e "0 de 0 metas"), classificação de cada meta na faixa certa com progresso médio, aba Ativas × Concluídas, e os dois botões de configuração pedindo o diálogo.

# Prova
- verde depois (os 8 arquivos novos): `npx vitest run <os 8 arquivos>` → `Test Files 8 passed (8); Tests 56 passed | 6 todo (62)`.
- vermelho antes (mutações temporárias na produção, só revertendo o meu alvo, todas revertidas — `git diff --stat` vazio agora): `npx vitest run <5 arquivos>` → `Tests 8 failed | 39 passed | 4 todo (51)`, com cada falha no teste certo — `id.gte` no cursor (aspas/avanço), `map.get(a.name)` no cruzamento do SLA (coluna + destaque), `score >= 8` nos promotores, `Math.ceil` na taxa do SLA, `>= 40` na faixa do status e `if (false)` no erro do CSAT; e `npx vitest run <2 arquivos da previsão>` → `Tests 3 failed | 6 passed | 2 todo (11)` com `Math.max(7, …)` na variância e os rótulos de tendência trocados.
- O painel do CSAT roda o hook real: as consultas registradas provam `limit(1000)`, `order created_at,id` e o `or` do cursor.
- `zapp-verify . --rapido`: na 1ª rodada o passo `tipos` **morreu por memória** (`tsc` Killed, exit 137; `load average 54`, 353 MB livres) — nada de tipo. Na rodada seguinte o ratchet acusou **4 erros de tipo só nos meus dublês** (`select`/`payload` fora do literal em dois testes e `data: [] as unknown[]` no terceiro): tipados os objetos de registro (`select?`, `payload?`, `single`) e `queues.data` para `unknown`; a suíte continua `8 passed (8); 56 passed | 6 todo (62)` e a verificação de tipos foi reenviada no fechar.

# O que NÃO fiz e por quê
- **Vazio/erro do SLA e a honestidade da previsão ficaram como `it.todo`**, não como teste verde: o estado não existe na produção deste base. `SLAMetricsDashboard.tsx:41` ainda faz `?? 100` (mostra 100% quando a leitura falha ou volta nula) e `DemandPrediction` estoura com série vazia (`Math.max(...[])` = `-Infinity` e `predictions[-1].predicted` = `TypeError`). Escrever teste verde ali seria travar a mentira; a produção é de outro cartão (`t_c9c4999f` para o SLA). Registrei tudo em `kanban_comment`.
- Nomes de arquivo próprios (`*.estados`, `*.kpis`, `*.metas`, `*.equipe`, `*.leitura`) para não colidir com `SatisfactionMetrics.test.tsx`, `SLAMetricsDashboard.sem-dados-erro.test.tsx` e `GoalsDashboard.test.tsx` que os irmãos criaram.
- Nenhum teste existente foi apagado, pulado, enfraquecido ou teve timeout aumentado; o diff só ADICIONA arquivos.

# Critério de pronto: "cada componente citado tem teste de carregando/erro/vazio"
| componente | carregando | erro | vazio | onde |
| --- | --- | --- | --- | --- |
| `AgentPerformancePanel` (Equipe) | `Carregando ranking…` sem tabela | leitura do ranking não expõe erro (só `isLoading`); o SLA já cobre | `Nenhum dado…` + `Sem agentes` + KPIs 0 | `AgentPerformancePanel.equipe.test.tsx` |
| `SatisfactionMetrics` | KPIs `—` | `Erro ao carregar…` + `Tentar novamente` chamando `refetch` | 4 blocos de vazio, sem número inventado | `SatisfactionMetrics.estados.test.tsx` |
| `GoalsDashboard` (Metas) | `useGoalsDashboard` devolve `isLoading` e a tela **não usa** → `it.todo` | não existe estado de erro na tela → `it.todo` | `Nenhuma meta ativa` + `0%`/`0 de 0 metas` | `GoalsDashboard.metas.test.tsx` |
| `SLAMetricsDashboard` (SLA) | `—` nos quatro KPIs | `?? 100` mostra **100%** na falha → é produção (`t_c9c4999f`), `it.todo` | taxa 0 é honesta; o "sem dados" é o mesmo cartão → `it.todo` | `SLAMetricsDashboard.kpis.test.tsx` |
| `DemandPrediction` (previsão) | o painel não tem estado de carregando (o hook devolve série) | leitura falha vira série zerada → produção, `it.todo` | série vazia **estoura** (`Math.max(...[])` = `-Infinity`, `predictions[-1].predicted` = `TypeError`) → produção, `it.todo` | `DemandPrediction.leitura.test.tsx` |

Os seis `it.todo` são os três estados que **não existem na produção deste base**: travar a mentira num teste verde seria pior. Cada um cita o estado e o cartão de produção responsável; o resto (carregando/erro/vazio onde existe) está verde.

# Por que três testes de hook entram aqui (área)
`src/hooks/business/__tests__/useSatisfactionBreakdown.paginacao.test.tsx`, `useNPSSurveys.estados.test.tsx` e `useDemandPrediction.previsao.test.tsx` são a **fonte de dados dos componentes citados** — o estado vazio/erro de `SatisfactionMetrics` nasce em `useSatisfactionBreakdown`/`useNPSSurveys` e o de `DemandPrediction` em `useDemandPrediction`. Sem eles o critério "cada componente citado tem teste de carregando/erro/vazio" não fecha: o componente só repinta o que o hook devolve. E são testes do produto em `src/hooks/business/__tests__/`, que é a área do meu perfil (`worker (testes)`). Nenhuma linha de produção foi tocada.

Concluí o que o cartão pede no que é comprovável neste base; as lacunas que dependem de produção estão listadas como `it.todo` e comentadas no cartão.

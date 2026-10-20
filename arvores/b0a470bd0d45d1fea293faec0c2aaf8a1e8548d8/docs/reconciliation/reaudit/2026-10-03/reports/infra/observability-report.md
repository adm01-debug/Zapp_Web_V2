# Revisão de monitoramento, diagnósticos e desempenho

Fonte fixa: `da307ba5626dce892f0b37cb6762463f55d14a96`. Leitura integral de 27 arquivos primários,4.550 linhas; 37 arquivos no lote incluindo apoios, 32 semânticos integrais e 5 dirigidos. Não houve execução do produto.

## Resultado

Seis achados adicionais: cinco P2 e um P3. Os seis casos sintéticos abaixo sustentam esses seis achados; não são seis descobertas adicionais. As rotas passam pelo gate de papéis/permissões do ViewRouter. Não há alegação de acesso anônimo, incidente de produção ou indisponibilidade real.

| ID | Prioridade | Contrato observado |
|---|---|---|
| R2-INF-026 | P2 | Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis |
| R2-INF-027 | P2 | SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks |
| R2-INF-028 | P2 | Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora |
| R2-INF-029 | P2 | Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g |
| R2-INF-030 | P2 | Limpar snapshots informa remoção mesmo quando DELETE devolve erro |
| R2-INF-031 | P3 | Coletor local rotula agregações incompatíveis como CLS e INP |

## Evidência comportamental delimitada

| Probe | Fonte realmente executada | Fixture e resultado | Limite |
|---|---|---|---|
| INF-OBS-P01 | callback fetchSystemHealth | SELECT/List com error rápido → DB/Storage saudáveis; Realtime constante; Edge.error → degraded no controle | SDK e latência falsos; UI lida no fonte |
| INF-OBS-P02 | fetchData + computeUptime | mesmos dois checks →100% em1h,50% em24h; vazio→100%/0checks | Não mede SLA real |
| INF-OBS-P03 | fetchData e loop de buckets | duas mensagens7d →total2/plot1; seis âncoras1h→duas chaves | Dados completos e UTC explícito |
| INF-OBS-P04 | collectMetrics | memória/rede ausentes→score100; controle observado90%/2g/500ms→63 | Payload capturado, sem INSERT |
| INF-OBS-P05 | clearOldSnapshots | DELETE.error resolvido→sucesso/recarga; rejeição→toast.error | Nenhum DELETE real |
| INF-OBS-P06 | módulo web-vitals completo em VM | CLS0.12 vs referência0.06; INP1000 vs160 em50interações | Coletor próprio local, sem Vercel RUM |

Os sete arquivos executados como texto e o compilador foram verificados por SHA256 antes da importação do compilador. VM recebeu interfaces falsas explícitas; nenhum hook React, SDK, handler Edge ou biblioteca de analytics do produto foi importado. Compilar trechos com transpileModule não é typecheck, build ou suíte completa.

## R2-INF-026 — Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis

fetchSystemHealth mede a duração de consultas de banco e listagem de Storage, mas não inspeciona seus campos error. O status depende apenas de latência; um erro que retorna rápido vira healthy. Realtime é definido diretamente como healthy sem subscribe/ack/status. DiagnosticsView converte isso em Saudável, Canal de tempo real ativo e, quando a Edge também retorna sem erro, Todos os sistemas operacionais.

**Precondições:** Usuário admitido no gate da rota abre diagnósticos. A consulta/listagem resolve com error em menos dos limiares500ms/1000ms, ou o canal Realtime está indisponível sem erro correspondente nas outras consultas.

**Efeito:** O operador pode interpretar falha de permissão/serviço como saúde confirmada; o painel não distingue teste com falha, teste não realizado e sucesso. O achado não presume que todo error prove indisponibilidade global: ele prova que a saúde exibida não é sustentada pela coleta.

**Evidência:**

- `src/hooks/system/useDiagnosticsData.ts:137–167` — Duração usada como status; error ignorado e realtime constante. SHA256 `c665f66b86eb8a1116c77e34150d25fa0554a82e75684dc9c7ed867d4b46628a`.
- `src/hooks/system/useDiagnosticsData.ts:249–275` — Coleta inicial/periódica e refresh. SHA256 `c665f66b86eb8a1116c77e34150d25fa0554a82e75684dc9c7ed867d4b46628a`.
- `src/components/diagnostics/DiagnosticsView.tsx:31–42` — healthy é apresentado como Saudável. SHA256 `9e23c355bbd03e5be2ee5d8102d88b32d551505b8032156d42ae2d862092ed8d`.
- `src/components/diagnostics/DiagnosticsView.tsx:72–86` — Realtime ativo sem medição e hook consumidor. SHA256 `9e23c355bbd03e5be2ee5d8102d88b32d551505b8032156d42ae2d862092ed8d`.
- `src/components/diagnostics/DiagnosticsView.tsx:237–270` — Resumo de todos os sistemas operacionais. SHA256 `9e23c355bbd03e5be2ee5d8102d88b32d551505b8032156d42ae2d862092ed8d`.
- `src/pages/ViewRouter.tsx:129–151` — Gate de autorização precede montagem do painel. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.

**Critérios de aceite:**

- Representar sucesso, falha de coleta e não testado separadamente; só avaliar latência de resultado bem-sucedido.
- Marcar Realtime a partir de estado/ack observado com validade temporal ou mostrar não medido.
- Teste com SELECT/List retornando error rápido não pode produzir Saudável; falha de autorização deve ser distinguida de serviço fora do ar.
- Manter controle existente de error nas Edge Functions e derivar resumo apenas de sinais válidos.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe executa callback real com interfaces falsas; texto da UI foi verificado no fonte, sem renderização React. API001/API037 cobrem autorização e contagens globais da Edge webhook-diagnostic, que são mecanismos separados. Não se alegou acesso anônimo às rotas.

## R2-INF-027 — SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks

useMonitoringData consulta connection_health_logs a partir do período selecionado (padrão12h). computeUptime filtra mais24h sobre esse resultado já reduzido, sem recuperar as horas faltantes, e devolve100% quando não há checks. O mesmo estado abastece Uptime24h e SLA últimas24h; o heatmap7dias recebe os mesmos logs filtrados. Sua grade indica corretamente células sem dados, mas o badge agregado também mostra100% no vazio e o gauge de SLA diz Atingido.

**Precondições:** Há seleção inferior à janela anunciada, ou o conjunto de checks resolvido está vazio. Para o caso numérico, um check saudável está na última hora e outro com falha está oito horas antes, ambos nas últimas24h.

**Efeito:** Sem mudança dos checks, selecionar1h produz uptime100% e selecionar24h produz50%, enquanto o texto de SLA permanece24h. Zero checks resulta SLA atingido. Não é medida observada de disponibilidade ou violação real de contrato de serviço; é inconsistência na janela e na suficiência do dado usado pelo painel.

**Evidência:**

- `src/components/monitoring/hooks/useMonitoringData.ts:9–18` — Filtro adicional24h e default100% sem amostras. SHA256 `2f866d9a0e6d6ea033f64f2063f50feacf684c4a873616e3e0f408a2d079d7ee`.
- `src/components/monitoring/hooks/useMonitoringData.ts:68–83` — Consulta limitada pelo período antes de calcular uptime. SHA256 `2f866d9a0e6d6ea033f64f2063f50feacf684c4a873616e3e0f408a2d079d7ee`.
- `src/components/monitoring/hooks/useEvolutionMonitoring.ts:10–23` — Período inicial12h e encaminhamento da seleção. SHA256 `432cee260294b361c1d943bd2aa7043f60784c08290691ba8928b00692a6ab1d`.
- `src/components/monitoring/MonitoringStatsCards.tsx:83–92` — Título Uptime24h e Sem dados apenas no subtítulo. SHA256 `6329681044c353e56a8cf0041dda9d663e55a3aee50090548caa5fcc59ee6237`.
- `src/components/monitoring/MonitoringSLAPanel.tsx:16–42` — Gauge interpreta100 como SLA atingido. SHA256 `9b0edabce5756c3f769f552641ab09c5fda09c7faa524908e3196122e64b3cee`.
- `src/components/monitoring/MonitoringSLAPanel.tsx:46–69` — Descrição últimas24h e counts. SHA256 `9b0edabce5756c3f769f552641ab09c5fda09c7faa524908e3196122e64b3cee`.
- `src/components/monitoring/EvolutionMonitoringDashboard.tsx:310–328` — Mesmo dataset encaminhado ao SLA e heatmap. SHA256 `97802933f3d40202b9b802b28f0a90c1a671979e46e7aa37e82a04b703fea257`.
- `src/components/monitoring/MonitoringAvailabilityHeatmap.tsx:43–89` — Grade 7 dias, células vazias diferenciadas e agregado vazio100. SHA256 `1aac00d58a918f0ba45d98c3df251108f0fa4c73fb63e99d7a4b03e88741c6b0`.

**Critérios de aceite:**

- Consultar a janela prometida por cada painel ou ajustar seu título, critério e tooltip à seleção efetiva.
- Representar ausência de checks como dado insuficiente, sem sucesso do SLA ou porcentagem100 por default.
- Definir e mostrar janela real/quantidade/cobertura de checks; tratar limite2000 e paginação antes de afirmar completude.
- Fixar teste com check falho fora de1h mas dentro de 24h, e caso zero checks; preservar o estado cinza correto da grade.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe usa duas linhas sintéticas e queries filtradas em memória; nenhum dado real de disponibilidade foi coletado. Porcentagem de checks não é automaticamente disponibilidade ponderada por duração. Esta auditoria não impõe uma nova definição de SLA; exige coerência com a janela/estado anunciados. Rótulos adicionais Checks(7d) sobre últimos50 e Última hora sobre health logs sem cutoff constam da cobertura como extensões de apresentação, sem novos IDs.

## R2-INF-028 — Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora

fetchData calcula buckets de tamanhos variáveis, mas usa chaves de hora civil tanto para a âncora quanto para cada mensagem. Em7d há sete âncoras diárias na hora atual; mensagens de outras horas do dia não encontram chave e são ignoradas no gráfico, embora contem no total. Em1h seis âncoras de10min geram chaves HH:00 repetidas, reduzindo a resolução a uma ou duas entradas.

**Precondições:** Resposta de messages contém linhas válidas dentro do período selecionado; não depende de erro, truncamento de API ou dados malformados. Em7d ao menos uma mensagem está em hora diferente da âncora diária.

**Efeito:** O volume/forma da série apresentados ao operador podem divergir do tráfego consultado. No probe, duas mensagens válidas somam total2 e apenas1 chega à área plotada; em1h seis buckets previstos viram dois.

**Evidência:**

- `src/components/monitoring/hooks/types.ts:3–13` — Duração e quantidade de buckets por período. SHA256 `4564f84805039c7199daca72211a4f91425e6e169bfa2a2f5f3ec941864286c9`.
- `src/components/monitoring/hooks/useMonitoringData.ts:84–104` — Totais e chave por hora incompatível com bucketSize. SHA256 `2f866d9a0e6d6ea033f64f2063f50feacf684c4a873616e3e0f408a2d079d7ee`.
- `src/components/monitoring/EvolutionMonitoringDashboard.tsx:196–206` — Cards e gráfico consomem o mesmo messageStats. SHA256 `97802933f3d40202b9b802b28f0a90c1a671979e46e7aa37e82a04b703fea257`.
- `src/components/monitoring/MonitoringMessageChart.tsx:37–73` — Série e período são apresentados ao usuário. SHA256 `add3ef18394dd94b624f1272a6d528df92316ac76351004105b6013cd50ee4bf`.

**Critérios de aceite:**

- Agrupar por índice temporal floor((timestamp-início)/bucketSize), ou por uma política equivalente explicitamente definida, e formatar o rótulo somente após agrupar.
- Garantir que cada mensagem elegível entre em exatamente um bucket e que soma dos buckets corresponda aos totais do mesmo conjunto.
- Testar limites inicial/final, horas diferentes no mesmo dia em7d, seis intervalos10min em1h e fusos/virada de dia.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe executa o callback real e as funções auxiliares com respostas completas em memória; usa UTC explicitamente. Não inferido volume real, limite efetivo do PostgREST ou comportamento em horário de verão a partir do caso sintético.

## R2-INF-029 — Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g

collectMetrics transforma ausência de performance.memory em0MB/256MB e0% de uso, e ausência de navigator.connection em4g/RTT0. Esses valores recebem status good e entram com o mesmo peso no score; o payload salvo não inclui uma indicação de não medido. Navegação/pintura ausentes também viram0. A UI pode declarar Excelente com parcela relevante dos critérios inventada como default.

**Precondições:** Navegador não fornece memory ou connection (ou entradas de timing ainda não estão disponíveis). Os demais critérios têm valores bons para o exemplo100; gravação real depende de profile.id e sucesso do INSERT.

**Efeito:** O score e o histórico tentado confundem desconhecido com bom. No mesmo fixture de navegação/DOM, APIs ausentes dão100 pontos; memória90%,2g e RTT500 observados dão63. Isso não mede diferença real entre navegadores, apenas demonstra a contribuição indevida dos valores de substituição.

**Evidência:**

- `src/components/performance/PerformanceMonitor.tsx:26–56` — Defaults e critérios good das medições ausentes. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/components/performance/PerformanceMonitor.tsx:70–97` — Score, payload e coleta periódica. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/components/performance/PerformanceMonitor.tsx:165–187` — Texto Excelente e apresentação do score/histórico. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/hooks/analytics/usePerformanceSnapshots.ts:32–55` — Payload segue para INSERT se profile existir. SHA256 `53af871c26874ca6981a66dc74d2926a1f5641c73bd077a577e9c4e4877d43d0`.
- `src/pages/ViewRouter.tsx:80–84` — Rota produtiva de PerformanceMonitor. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.

**Critérios de aceite:**

- Usar estado indisponível/não medido para APIs ou entries ausentes; não fabricar valor numérico normal.
- Calcular score apenas sobre medições válidas e exibir sua cobertura, ou não emitir score quando a amostra for insuficiente.
- Persistir validade/origem das medições para que histórico não trate defaults como observações.
- Teste com memory/connection ausentes deve mostrar cobertura parcial e nenhum4g ou memória livre presumidos; controle com APIs válidas deve manter classificação correspondente.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Callback real executado com objetos de navegador falsos; payload capturado em saveSnapshot falso, sem gravação real. Testes de metricThresholds isolados não provam a coleta: PerformanceMonitor possui thresholds inline; teste de suporte inicial foi lido, não executado como gate.

## R2-INF-030 — Limpar snapshots informa remoção mesmo quando DELETE devolve erro

clearOldSnapshots aguarda a cadeia delete().lt(), mas ignora o resultado com error. Como erro normal de SDK pode resolver a Promise, o catch não roda, o hook dispara Dados antigos removidos e recarrega histórico. O botão Limpar antigos da rota performance chama esse caminho diretamente.

**Precondições:** A chamada DELETE retorna erro por envelope resolvido, em vez de lançar rejeição. Usuário está admitido na rota performance; não se pressupõe qual política/serviço originou o erro.

**Efeito:** Confirmação falsa de uma ação solicitada e nenhuma orientação para tentar novamente ou corrigir a causa. O probe faz o mesmo callback mostrar sucesso para error resolvido e erro para Promise rejeitada.

**Evidência:**

- `src/hooks/analytics/usePerformanceSnapshots.ts:78–90` — Retorno de DELETE ignorado antes da confirmação. SHA256 `53af871c26874ca6981a66dc74d2926a1f5641c73bd077a577e9c4e4877d43d0`.
- `src/components/performance/PerformanceMonitor.tsx:145–161` — Botão produtivo chama clearOldSnapshots. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/hooks/analytics/usePerformanceSnapshots.ts:58–76` — loadHistory verifica seu próprio error, mas não confirma a remoção. SHA256 `53af871c26874ca6981a66dc74d2926a1f5641c73bd077a577e9c4e4877d43d0`.

**Critérios de aceite:**

- Inspecionar error do DELETE antes de anunciar sucesso e propagar causa de falha de forma tratável.
- No erro, preservar estado e avisar que a limpeza não foi confirmada; não converter simples recarga em prova de remoção.
- Cobrir envelope {error} e rejeição, mais controle de sucesso; manter período selecionado ao recarregar.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Nenhuma exclusão real executada e nenhuma inferência de RLS/global delete baseada na ausência de filtro de profile_id. Hook coordenado com revisão de módulos: não há ID duplicado criado por ela para este callback.

## R2-INF-031 — Coletor local rotula agregações incompatíveis como CLS e INP

O observador CLS soma shifts por toda a sessão visível, sem separar janelas; o INP usa o maior duration bruto, sem contar interações ou desconsiderar um pico por 50. As definições atuais usam maior janela de shifts para CLS e descartam um maior valor de interação por 50 no INP. O erro se manifesta no Map/log do coletor próprio inicializado em main, cujo getRating consulta o budget correto sobre um valor agregado incorretamente.

**Precondições:** Navegador fornece entries de layout-shift/event e ocorre flush. CLS: shifts separados por mais de1s; INP:50 interações distintas com um pico isolado.

**Efeito:** Diagnóstico local contra o budget pode classificar estabilidade/responsividade incorretamente. No fixture, dois shifts0.06 separados por2s produzem0.12 em vez de0.06;50 interações com pico1000 e segundo valor160 produzem1000 em vez de160. PrioridadeP3 porque o consumidor confirmado é local/desenvolvimento: info é suprimido em produção e não foi identificado consumidor produtivo adicional de getWebVitalsReport.

**Evidência:**

- `src/lib/web-vitals.ts:34–64` — Threshold correto é aplicado ao valor agregado e salvo no Map/log. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/lib/web-vitals.ts:111–141` — Soma de shifts e máximo bruto de event.duration. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/lib/web-vitals.ts:143–166` — Flush por visibilidade/pagehide. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/lib/web-vitals.ts:185–187` — Export de relatório local. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/main.tsx:30–33` — Coletor próprio e Speed Insights são inicializações separadas. SHA256 `df91ccf7d1d34c0321952a8ac9dcf9849a8b8092190912382d16c3aa9c742a1f`.
- `src/lib/logger.ts:50–64` — info/debug desativados fora de DEV. SHA256 `f45d5ba0fed8fcd36784de3223c995206f9767e7c961d5dab5f4badca8e1666e`.
- `src/lib/__tests__/web-vitals-budget.test.ts:22–49` — Teste verifica targets/rating, sem exercitar observadores ou agregação. SHA256 `3990316d15c353fbc44f021f7e0a3c273fb96e66c9e8b1bf408d231ce15c481e`.

**Critérios de aceite:**

- Usar implementação mantida das métricas ou implementar integralmente janelaCLS e cálculoINP por interação com os limites definidos.
- Preservar o consumo dos thresholds do budget, separado da medição do valor.
- Comparar fixtures de shifts separados/mesma janela e49/50+ interações com referência; incluir visibilidade e BFCache conforme a política adotada.
- Não usar o resultado local como prova de métricas do Speed Insights sem demonstrar a cadeia real de dados.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe executa o módulo completo em VM com PerformanceObserver/DOM/logger falsos e entradas sintéticas; não certifica Web Vitals de browser ou tráfego real. Nenhuma falha atribuída à coleta independente do Speed Insights ou aos gates de tamanho de bundle. P008E36 e P041033 já são PARTIAL; apenas o subcontrato do coletor local recebe evidência adicional.

**Planos:** P008/E36 permanece PARTIAL: Agregação CLS/INP do coletor próprio, sem alterar aceite de budget ou statusPARTIAL.; P041/033 permanece PARTIAL: Coletor local e qualidade do valor; envio/RUM independente continua com limites já registrados.

**Definições primárias consultadas:** [CLS](https://web.dev/articles/cls) e [INP](https://web.dev/articles/inp), consultadas em04/10/2026. A primeira usa a maior janela de shifts; a segunda descarta um pico por 50interações. Essas definições fundamentam somente a referência dos fixtures do coletor local.

## Controles preservados e observações sem novo ID

- O roteador espera papéis/permissões e nega acesso antes de montar views restritas. Os achados de UI pressupõem admissão no gate.
- ConnectionHealthPanel faz polling de dados armazenados com sinal/timeout e usa ação manual para a Edge. Não se atribuiu auto-fix a esse polling.
- A grade do heatmap diferencia corretamente células sem dados. A falha está no agregado/janela anunciados, não na cor de toda célula vazia.
- O cartão Checks(7d) de ConnectionHealthPanel usa os últimos50checks, sem cutoff7d; MonitoringEventTimeline mistura mensagens1h com15healthlogs sem cutoff1h. São extensões do contrato temporal documentadas na cobertura, sem multiplicar o número de mecanismos.
- Conectar/reiniciar trata data.error===true; não foi registrada falha genérica de toast nesses ramos.
- HotRoutePrefetcher está montado, respeita saveData/2g e tem cancel flag para novos imports. Ganho de navegação permanece sem medição, coerente com P008E35.
- OptimizedImage/Avatar, VirtualizedList/Grid e Prefetcher legado tiveram leitura integral, mas a busca de consumidores produtivos só encontrou definições/exports nos caminhos relevantes. Estados de imagem ou callbacks de fim latentes não foram promovidos a problemas de fluxo ativo.
- Testes de threshold/getRating não exercitam automaticamente coleta; o teste web-vitals-budget completo valida a origem dos alvos, não o algoritmo dos observadores.
- SentryIntegrationView, AIProviderHealthPanel, webhook-diagnostic e Shadow Webhooks ficaram com providers; nenhum achado novo deste lote os substitui.
- A assertiva de400–700LIDs está no relatório histórico de replay. Sua descoberta por leitura integral é revalidação de limite conhecido, não novo incidente.

## Cobertura por arquivo

observability-coverage.json contém SHA256, contagem de linhas, faixa lida e avaliação de função/ramo por arquivo. Todos os27 primários estão com 1–EOF. Apoios de rota, main, Index e teste parcial continuam dirigidos. src/hooks/monitoring não existe nesta fonte.

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `src/components/monitoring/MonitoringDiagnosticPanel.tsx` | semantic | 1–202 | Execução manual do diagnóstico, erro/loading, metadados, recomendações e exportação TXT/PDF. Confronto de dados da Edge com os rótulos; autorização/backend e estatística global permanecem API001/API037, sem nova contagem. |
| `src/components/performance/PerformanceMonitor.tsx` | semantic | 1–291 | collectMetrics: Navigation/Paint, memória/rede opcionais, classificação, score, snapshot e timer; histórico/seleção/limpeza e JSX. Ausência de APIs vira valores bons no score; cleanup depende de hook externo. Métricas de cache locais não certificam taxa real. |
| `src/lib/web-vitals.ts` | semantic | 1–187 | Observadores LCP/FID/CLS/INP, inicialização idempotente, Map limitado por nome, visibilidade, TTFB e thresholds do budget. CLS soma shifts sem janela dentro do ciclo visível e INP usa máximo bruto; efeito restrito ao coletor local, separado do Speed Insights. |
| `src/components/diagnostics/DiagnosticsView.tsx` | semantic | 1–324 | Cards de conexões/mensagens, HealthBadge, textos de estado operacional, erros e Refresh; segue o hook useDiagnosticsData. Realtime ativo é afirmado a partir de constante, e erros rápidos da coleta podem virar saudáveis. |
| `src/components/monitoring/MonitoringStatsCards.tsx` | semantic | 1–164 | Indicadores por dados, empty state, ratio e sparkline; uptime anunciado 24h vem do período selecionado. Texto Sem dados preservado no subtítulo, mas valor e estilo ainda vêm de 100% por default. |
| `src/components/monitoring/EvolutionMonitoringDashboard.tsx` | semantic | 1–346 | Composição de período, notificações, conexões, webhook, diagnóstico, SLA, heatmap e loading; rastreado que os mesmos healthLogs filtrados abastecem cartões 24h e grade 7d. LastUpdatedBadge exibe relógio, não reivindicação explícita de última coleta. |
| `src/components/monitoring/MonitoringConnectionsList.tsx` | semantic | 1–135 | QR/conectar/reiniciar por instância, chave de pendência, status/latência e mensagens de erro. Ramos data.error===true são tratados; ausência de QR retorna informação. Nenhum envio real ou reinício executado. |
| `src/hooks/system/useDiagnosticsData.ts` | semantic | 1–288 | Todas as consultas, contagens, erros recentes, saúde DB/Storage/Edge/Realtime, atualização e polling. Retornos error não lançados são ignorados em várias consultas; latência é usada como sucesso e realtime não é testado. |
| `src/components/monitoring/hooks/useMonitoringData.ts` | semantic | 1–115 | computeUptime, uptime por instância, sparkline, consultas por período, limites, totais e formação de buckets. Vazio vira100%, consulta já limita janela e chaves por hora divergem de buckets 10min/1d. Erros e concorrência de fetch ficam explicitados. |
| `src/components/monitoring/MonitoringAvailabilityHeatmap.tsx` | semantic | 1–151 | Grade7d/24h, agrupamento de checks, tooltip, ratio e cores. Células sem dados são corretamente cinzas; agregado vazio=100 e dados recebidos podem ser apenas1h/12h. Não se atribuiu saúde a cada célula vazia. |
| `src/components/performance/OptimizedImage.tsx` | semantic | 1–296 | IntersectionObserver, lazy image, skeleton, src/srcset/error/load, prioridade, estilos e OptimizedAvatar. Estados não reiniciam em troca de src e props podem substituir handlers, mas busca produtiva só encontrou exports/definições: limitações latentes, sem novo achado de fluxo ativo. |
| `src/components/monitoring/MonitoringEventTimeline.tsx` | semantic | 1–209 | Carga de mensagens1h e últimos15 health logs, merge/ordem/corte, filtro, pausa e intervalo15s. Health logs sem filtro1h podem aparecer sob Última hora; tabela deixa sua idade visível. Nenhuma alegação de canal realtime foi inferida de LiveDot. |
| `src/components/diagnostics/ConnectionHealthPanel.tsx` | semantic | 1–270 | Consultas com AbortSignal/timeout, polling visível de dados armazenados, execução manual, resumo/status/histórico. Polled fetch não invoca auto-fix. Checks(7d) usa últimos50 sem filtro temporal; ausência de latência contribui0 na média. |
| `src/components/performance/VirtualizedList.tsx` | semantic | 1–264 | Virtualizer, medições/overscan/keys/scroll, empty/loading/end reached e VirtualizedGrid. Callbacks de fim/guardas de coluna têm contratos latentes; nenhum consumidor JSX produtivo encontrado no escopo de busca. Sem promover export a bug ativo. |
| `src/components/monitoring/MonitoringWebhookPanel.tsx` | semantic | 1–176 | Estado/filtros/eventos esperados, cópia, configuração e verificação manual; erros da API tratados. Configuração única e check por instância foram cruzados com API037; nenhum achado duplicado de tráfego global. |
| `src/components/monitoring/hooks/useMonitoringActions.ts` | semantic | 1–88 | Invocações de obter/configurar/verificar webhook e diagnóstico, estados loading/result, toast e erros retornados/lançados. Somente leitura de fonte; mutações do handler ficam com providers. |
| `src/components/monitoring/MonitoringHealthLogs.tsx` | semantic | 1–124 | Filtro/status/contadores/tabela, metadados, ordem e empty state; todos os cálculos são do dataset recebido. Não há prova de cobertura temporal maior que o fetch. |
| `src/components/monitoring/MonitoringSLAPanel.tsx` | semantic | 1–148 | Meta99.5, attainment, progresso, contagem e detalhe por instância. Afirma últimas24h com stats derivados do período selecionado; zero amostras resulta Atingido por uptime100. |
| `src/components/performance/Prefetcher.tsx` | semantic | 1–187 | Prefetch por hover/delay, hooks/cleanup, loader catch, CriticalRoutePrefetcher e resource hints. Caminhos legados sem consumidor produtivo encontrado; sem inferir ganho de navegação ou bug ativo só por export. |
| `src/components/monitoring/hooks/useMonitoringNotifications.ts` | semantic | 1–70 | Estado anterior, transição de conexão, mute/volume/horário silencioso, áudio e desktop notification. Contextos de áudio e preferências de notificação registrados como fronteira de revisão; sem chamar Notification/áudio reais. |
| `src/components/performance/LazyRoutes.tsx` | semantic | 1–161 | Mapas de imports dinâmicos, fallbacks Suspense, factory/HOC e placeholders. Exports e nomes conferidos; presença de lazy wrapper não é métrica de bundle/runtime. |
| `src/components/performance/HotRoutePrefetcher.tsx` | semantic | 1–59 | Uso ativo pelo Index, política saveData/2g, idle/timer, fila de imports, captura de falha e cancel flag. Cancelamento impede novos imports; não alegado cancelamento de import em andamento. |
| `src/components/monitoring/MonitoringMessageChart.tsx` | semantic | 1–83 | Selecionador de período, toggle enviados/recebidos, área/tooltip e ligação hourlyData. Não reconcilia soma plotada com total consultado; consumidor do defeito de buckets. |
| `src/components/performance/metricThresholds.ts` | semantic | 1–19 | Funções puras de limiares; sem estado desconhecido. PerformanceMonitor duplica limiares inline, portanto testes do helper isolado não provam o ramo de coleta no painel. |
| `src/components/monitoring/hooks/useEvolutionMonitoring.ts` | semantic | 1–57 | Período inicial12h, refetch, interval, listener de conexão, troca de período e exposição de estados/actions. Sem request fence/abort entre períodos; janela de healthLogs é a seleção atual. |
| `src/components/performance/hotRoutePrefetch.ts` | semantic | 1–40 | Tabela das cinco views quentes e decisão por connection/saveData/2g. Nenhum import é executado na declaração; decisão desconhecida permite prefetch. |
| `src/components/monitoring/MonitoringSkeletons.tsx` | semantic | 1–96 | Skeletons acessíveis dos painéis, estrutura, variabilidade visual e nenhum efeito de produto; leitura completa sem achado novo. |
| `src/components/monitoring/hooks/types.ts` | semantic | 1–90 | Tipos de conexão/check/mensagem/uptime, periodMs/bucketCounts e conjunto HEALTHY. Nenhum valor externo validado pelo TypeScript em runtime. |
| `src/components/performance/index.ts` | semantic | 1–16 | Barrel de exports completo; existência de export não promove helper/virtualização a fluxo ativo. |
| `src/hooks/analytics/usePerformanceSnapshots.ts` | semantic | 1–99 | Hook completo: insert de telemetria, query de histórico, auth/profile, janela/limite e clearOldSnapshots. DELETE resolve com error e ainda anuncia sucesso; não inferida RLS/visibilidade global a partir da falta de filtro. |
| `src/lib/logger.ts` | semantic | 1–131 | Logger completo, correlação e filtros DEV. info/debug são suprimidos fora de DEV: resultados do coletor Web Vitals não foram atribuídos a logs de produção ou a Speed Insights. |
| `src/pages/ViewRouter.tsx` | targeted | 1–155 | Mapa das rotas diagnostics/performance/evolution-monitor e gate NavigationService.canAccess após carga de papéis/permissões. Consumo efetivo demonstrado, não alegação de acesso anônimo. |
| `src/pages/lazyViews.ts` | targeted | 1–60 | Bindings lazy dos três painéis e demais exports no trecho. Não promovida leitura das linhas finais não vistas. |
| `src/pages/Index.tsx` | targeted | 20–40, 115–148 | Binding lazy e montagem ativa de HotRoutePrefetcher em Suspense. Trechos restantes fora deste lote. |
| `src/main.tsx` | targeted | 1–50 | Inicialização do coletor manual e import separado de Speed Insights; handlers de erro e preparação do root. Não confundir os dois canais de coleta. |
| `src/components/performance/__tests__/PerformanceMonitor.test.tsx` | targeted | 1–140 | Inspeção inicial do teste/mocks de navegação, memória/rede e painel. Sem execução ou alegação de cobertura dos demais casos não lidos. |
| `src/lib/__tests__/web-vitals-budget.test.ts` | semantic | 1–50 | Teste integral verifica origem dos thresholds via mock e getRating; não alimenta PerformanceObserver nem comprova agregação CLS/INP. |

## Lacunas remanescentes

- Sem observação em browser real, permissões atuais, dados de produção, SDK de navegador ou métricas de usuário.
- Ramos latentes de componentes exportados sem consumidor produtivo não viraram falhas alcançáveis por suposição.
- Não é revisão integral de todos os testes nem de diretórios vizinhos; limites dos apoios permanecem nas faixas por arquivo.

Nenhum pedido de deploy, SQL, credenciais ou teste de produto é necessário para revisar estes resultados. Correções de produção ficam para etapa autorizada própria; a entrega atual preserva a fonte auditada.

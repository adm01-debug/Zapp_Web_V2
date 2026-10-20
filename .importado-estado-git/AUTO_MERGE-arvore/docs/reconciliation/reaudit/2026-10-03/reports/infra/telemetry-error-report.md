# Revisão de telemetria e tratamento de erros

Sete arquivos primários lidos integralmente: 685 linhas. HighContrastToggle já foi fechado como apoio no lote anterior. Há 16 caminhos com apoio: 12 integrais e 4 dirigidos. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`; nenhuma alteração de produto.

## Resultado e prova delimitada

Dois achados, dois casos offline. INF-TE-P01 verifica a falha lançada pela query real com SDK sintético e a apresentação real da página/tabela para um estado documentado de erro. INF-TE-P02 chama somente render do ErrorBoundary. Nenhum caso executa React, TanStack, browser, rede ou reload.

Primeira execução interrompida por guarda do harness: import.meta.env.DEV aparece também em comentário, tornando a contagem textual 2. A substituição foi restringida à expressão JSX exata; os dois casos passaram depois. Nenhuma falha do harness virou achado.

## R2-INF-040 — Falha de leitura da telemetria aparece como sistema com bom desempenho

A queryFn lança o error do SDK, mas AdminTelemetriaPage não consome error/isError/status. Sem dados prévios, o default rows=[] chega à tabela quando a primeira consulta terminou em falha. TelemetryTable usa somente isLoading e rows.length e exibe uma mensagem explícita de bom desempenho, enquanto os cards mostram zero erros e média 0ms.

**Precondições:** Usuário com acesso à view de telemetria. Consulta inicial falha depois das tentativas configuradas e não há dados de sucesso no cache dessa chave; não há configuração externa que faça throwOnError.

**Efeito:** Uma indisponibilidade ou erro de autorização/consulta é apresentada como ausência de consultas lentas e bom desempenho, justamente quando a tela deveria comunicar que não conseguiu medir. O achado não depende de números reais do banco nem afirma exposição a usuários sem acesso.

**Evidência:**

- `src/pages/AdminTelemetriaPage.tsx:37–59` — Estado de erro omitido; queryFn lança SDK error. SHA256 `a84e4f28ce99e418b6d2dc4c8f83960e1bb003fb04ceabd175f20bffb453d65d`.
- `src/pages/AdminTelemetriaPage.tsx:70–98` — Cards calculados do array vazio. SHA256 `a84e4f28ce99e418b6d2dc4c8f83960e1bb003fb04ceabd175f20bffb453d65d`.
- `src/pages/AdminTelemetriaPage.tsx:145–148` — Contador e tabela sem estado de erro. SHA256 `a84e4f28ce99e418b6d2dc4c8f83960e1bb003fb04ceabd175f20bffb453d65d`.
- `src/pages/admin-telemetria/TelemetryTable.tsx:13–28` — Sem dados vira mensagem explícita de bom desempenho. SHA256 `351510648414af0ce45528db1ed08ec743d02894d50e0899083481b885eab0b4`.
- `src/lib/queryClient.ts:9–25` — Configura retries, mas não eleva todo erro de query à ErrorBoundary. SHA256 `5036c273782cf6aca3d756b2ac74710edbd0b5d8fe177a0991e5fdc2a390fac5`.
- `src/pages/ViewRouter.tsx:81–87` — View telemetry é consumidor ativo. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.
- `src/pages/ViewRouter.tsx:129–151` — Gate de acesso presente antes da montagem. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.
- `src/services/navigation.service.ts:142–155` — Telemetria restrita por papel no mapa de navegação. SHA256 `8e128c5cc1aa208f96570c68295d6e4836ca1febed4d7d1e603f648d4c294d48`.

**Aceite:**

- Consumir e apresentar falha da query, separada de carregamento, sucesso vazio e sucesso com registros.
- Não derivar saúde do sistema de ausência de dados por falha; se houver dados de cache, sinalizar atualização falha/defasagem.
- Verificar falha inicial, sucesso vazio, sucesso com alertas e falha de refetch; manter os gates de acesso e o erro já validado pelo cleanup.

**Limites:** Nenhuma query de produto, biblioteca React/TanStack, browser ou retry real executado. Probe usa o queryFn real com SDK sintético e fornece o estado de erro documentado à fronteira do hook; testa as decisões de página/tabela reais. A classe de severidade e o limite de 500 registros não foram convertidos em defeitos adicionais.

Contrato primário: [TanStack Query — Queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries), consultado em 04/10/2026. Estados de erro e sucesso são distintos; a documentação não é captura de execução do produto.

## R2-INF-041 — ErrorBoundary ignora fallback nulo usado para retirar overlays com falha

O contrato de Props aceita fallback ReactNode, mas render verifica seu valor por truthiness. Quando App fornece fallback={null} para os providers diferidos, a condição é falsa e o boundary renderiza a tela padrão de erro, com min-h-screen e role=alert. App documenta expressamente que esse fallback deve retirar silenciosamente a camada opcional.

**Precondições:** O boundary de overlays da aplicação captura uma falha e permanece em hasError. O fallback fornecido é null, como no consumidor atual; para chunk load, após a recuperação automática não ser possível ou já ter sido usada.

**Efeito:** Uma falha de componente opcional produz um painel de erro com altura mínima de uma viewport e anúncio assertivo em vez de desaparecer. AppRoutes continua fora e montado; não se afirma que o roteamento ou toda a aplicação foi derrubado. A ocupação visual foi confirmada como classe/JSX, não medida em navegador.

**Evidência:**

- `src/components/errors/ErrorBoundary.tsx:8–13` — Fallback é ReactNode opcional. SHA256 `fecb028508cd26cc018163f3a21c18093761ffc4fc07eb780ec8b9c940bd18ca`.
- `src/components/errors/ErrorBoundary.tsx:129–142` — if truthy ignora null e cai na UI padrão. SHA256 `fecb028508cd26cc018163f3a21c18093761ffc4fc07eb780ec8b9c940bd18ca`.
- `src/App.tsx:15–24` — Contrato de recuperação silenciosa dos overlays. SHA256 `3e05e3ea5f9c194799d123aa46a8dc80967dc8ef846f8efe7e97e8d96f659220`.
- `src/App.tsx:128–143` — Consumidor real fornece null e mantém AppRoutes fora do boundary. SHA256 `3e05e3ea5f9c194799d123aa46a8dc80967dc8ef846f8efe7e97e8d96f659220`.

**Aceite:**

- Distinguir fallback não fornecido de fallback fornecido como null/false/zero/string vazia; retornar o ReactNode explícito.
- Verificar erro com fallback=null, fallback customizado e ausência de fallback, além do caminho sem erro.
- Manter os wrappers de sessionStorage, limitação de autoreload e isolamento de AppRoutes; validar em browser que a camada opcional desaparece sem deslocar a aplicação.

**Limites:** Probe chama o método render real isolado, com DEV=false e JSX inerte; não executa componentDidCatch, reportClientError ou reload. O comentário de main.tsx sobre um wrapper não montado foi tratado pelo root como observação; não compõe este achado. Os controles de chunk recovery e ocultação de detalhes em produção foram lidos e preservados.

## Controles e adjudicação

Cleanup da telemetria já verifica SDK error. Os períodos de sete dias são deliberadamente de calendário em São Paulo e os testes importam o helper real. O gate de acesso à view foi preservado. Chunk recovery possui wrappers de storage e limitação de recarga; ErrorFallback exportado não foi promovido sem consumidor. Nenhuma tarefa DONE_VERIFIED foi reaberta por semelhança temática.

INF-019 recebeu um locus histórico adicional por revisão compartilhada com root. O script de volume tem baseline, alvo literal, finally e SHA; o achado preserva esses controles e limita a extensão à contagem de qualquer nonzero como PEGA. Não é um terceiro achado deste lote.

## Cobertura por arquivo

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `docs/evidencias/plano-volume-50/mut-plano-volume.py` | targeted | 95–154 | Trechos de apoio da extensão INF-019 revisada integralmente pelo root: baseline, rodar e mutações com finally/SHA. Nonzero indiscriminado continua inadequado para provar assertion alvo; não se executou o script. |
| `infrastructure/preview-egress-proxy/main.go` | semantic | 1–355 | Releitura integral para explicitar a faixa antes implícita: HMAC corpo/timestamp/nonce, retenção até expiração da aceitação, mutex/capacidade, limites de body/time/redirect, validação de todas respostas DNS e dial de IP validado preservando SNI/Host. Erros externos genéricos. Nenhum Go/servidor/rede iniciado. |
| `infrastructure/preview-egress-proxy/main_test.go` | semantic | 1–182 | Releitura integral de assertions: IP/URL privados, autenticação/replay com clock à frente, pin de dial/SNI/Host e rejeição de DNS privado antes do dial. TLS insecure é fixture do httptest; teste inicia serviço local se executado, mas não foi executado nesta auditoria. |
| `src/App.tsx` | targeted | 1–45, 118–150 | Apoio dirigido: contrato e montagem de overlays opcionais com fallback null, AppRoutes irmão fora do boundary. Nenhum handler global foi executado. |
| `src/components/admin/telemetry/TelemetryCharts.tsx` | semantic | 1–187 | Leitura integral de apoio: buckets floor por duração, severidade/contagem/média/máximo e ranking. Usa somente rows filtrado; 500 mais recentes limitam série. Sem chamada ou mutação, sem nova medição fictícia. |
| `src/components/errors/ErrorBoundary.tsx` | semantic | 1–254 | Leitura integral: recuperação de chunks exige storage legível e gravável, flag evita loop; retry/home/reload limpam flag com catch. Detalhes DEV condicionados, render fallback truthy é INF-041. Export ErrorFallback não teve consumidor produtivo localizado além de reexport; sem alegação de exposição desse export. |
| `src/lib/queryClient.ts` | semantic | 1–33 | Leitura integral de apoio: singleton, retries de queries e networkMode online; mutations sem retry. Não configura throwOnError global nem converte toda query em suspense. |
| `src/pages/AdminTelemetriaPage.tsx` | semantic | 1–151 | Leitura integral: queryKey inclui filtros, query limitada a 500 mais recentes com erro lançado; apresentação ignora isError (INF-040). Cleanup verifica SDK error. Calendário custom e polling lidos; truncamento e ausência de datas explícitos como limites, não novo defeito automático. |
| `src/pages/ViewRouter.tsx` | targeted | 75–90, 125–152 | Apoio dirigido: mapeamento ativo telemetry e gate de acesso antes de ViewComponent. Erro de useQuery não é automaticamente exceção de render. |
| `src/pages/admin-telemetria/TelemetryStatsCards.tsx` | semantic | 1–60 | Leitura integral: quatro cards recebem agregados; não buscam dados. Rótulos e zero/média seguem o pai, sustentando efeito de INF-040 sem ID separado. |
| `src/pages/admin-telemetria/TelemetryTable.tsx` | semantic | 1–88 | Leitura integral: loading, sucesso vazio e linhas; vazio afirma bom desempenho sem receber erro do pai (INF-040). Colunas/limiares/labels de data e severidade inspecionados. |
| `src/pages/admin-telemetria/TelemetryTopOffenders.tsx` | semantic | 1–44 | Leitura integral: oculta vazio e exibe até oito grupos recebidos, count/max/média; divisor só ocorre em grupo com linha. Contrato é alertas dos registros carregados, sem query adicional. |
| `src/pages/admin-telemetria/__tests__/telemetryUtils.periodo.test.ts` | semantic | 1–77 | Asserções/fixtures integrais lidas, sem executar: importa helper real; data fixa e Intl São Paulo testam meia-noite, sete dias calendário e horas corridas. Não prova a apresentação de erro da página. |
| `src/pages/admin-telemetria/telemetryTypes.ts` | semantic | 1–18 | Tipos integrais de linha, severidade e período; schema estático não valida dados remotos por si só. |
| `src/pages/admin-telemetria/telemetryUtils.tsx` | semantic | 1–70 | Leitura integral: formatos, badges e agrupamento top oito por frequência; dias de calendário em São Paulo são decisão explícita para 7d, horas corridas preservadas para 1h/6h/24h. |
| `src/services/navigation.service.ts` | targeted | 142–155 | Apoio dirigido: item telemetry com ADMIN_ONLY; não se presume acesso universal. |

## Lacunas


- Nenhum browser, SDK real, banco, TLS, Go runtime ou serviço iniciado.
- Probes usam fonte real e fronteiras inertes; não substituem React/TanStack nem a execução de seus ciclos.
- O limite de 500 registros representa uma amostra recente, não certifica métricas de todo o banco; não foi promovido a um novo mecanismo sem promessa mais específica.
- A leitura integral dos sete arquivos fecha apenas o lote delegado; o roster final de testes permanece em andamento.

# Tipografia e layout — reconciliação das 130 etapas

**Base:** main 2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6, 03/10/2026. Auditoria somente leitura do produto e do GitHub. Arquivos produzidos em audit/modules/layout_type/.

## Cobertura e resultado

Foram reconciliadas **100 etapas de fontes e 30 de layout**, preservando os IDs e os textos de audit/global/tasks.extracted.json. Cada registro tem classificação, justificativa individual, grupo de fontes, PRs de contexto, testes e limite de aceitação. O relatório de 24/09, a paridade tipográfica e o plano anterior de 50 etapas são fontes históricas; não representam novas filas de implementação.

| Classificação | Fontes | Layout | Total |
|---|---:|---:|---:|
| DONE_VERIFIED | 45 | 3 | 48 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 2 | 14 | 16 |
| PARTIAL | 23 | 8 | 31 |
| NOT_IMPLEMENTED | 10 | 1 | 11 |
| SUPERSEDED | 1 | 2 | 3 |
| NEEDS_REVALIDATION | 13 | 1 | 14 |
| PRODUCT_DECISION_REQUIRED | 3 | 0 | 3 |
| NO_LONGER_APPLICABLE | 3 | 0 | 3 |
| VALIDATED_FAIL | 0 | 1 | 1 |
| **Total** | **100** | **30** | **130** |

DONE_VERIFIED significa que o requisito documental, estático ou teste local indicado foi conferido. Não significa validação visual de toda a aplicação. Os 16 registros de implementação com evidência visual pendente são separados. VALIDATED_FAIL é a etapa 27 de layout, cuja execução efetivamente retornou erro; seus cinco apontamentos foram analisados, não promovidos automaticamente a cinco defeitos de tela.

## Verificação local executada

| Verificação | Resultado |
|---|---|
| Medição tipográfica estática | 1.917 arquivos; 4.578 usos nomeados; 311 arbitrários |
| medir-tipografia.cjs --check | Exit 0; todos os oito tetos atendidos |
| Testes unitários do medidor | 10 testes, 10 passaram |
| layout-guard.mjs | Exit 1; cinco apontamentos; 51 arquivos de views analisados |
| Probes independentes dos limites dos guards | Passaram; funções reais executadas com fixtures locais |
| Renderização de viewports, produção e clientes de email | Não executada |

A medição foi repetida com a variável GIT_SHA esperada pelo script para gravar a identidade exata da base. O JSON mantém essa origem. Não foram alterados código, budget, decisões, PRs ou configurações.

## 1. O relatório de fontes de 24/09 ficou histórico

A revisão de execução registrava 47 etapas feitas e quatro PRs ainda abertas. **#590, #593, #596 e #595 foram mergeadas em 24/09.** Depois, **#611** migrou os gráficos restantes, **#801** eliminou o último peso órfão e **#1428** endureceu o tratamento de tokens nomeados acima de 16px. Os horários e SHAs estão em related-prs.json. Não permanece uma fila de merge dessas quatro branches.

As famílias agora têm origem em src/styles/tokens.css; index.css usa a variável sem redeclará-la. Tailwind, code/pre e .text-code apontam para a mesma stack mono. A URL real carrega Jakarta variável 200–800, Outfit 100–900 e JetBrains Mono 400/500. O CSS dark atualmente limita os pesos altos a 800; o relato de um peso órfão 900 já não descreve main.

A afirmação de **17 gráficos com 54 números inline** também foi superada. O medidor encontra **uma ocorrência**, src/components/catalog/catalogShared.tsx:75, de 10px. Ela foi deliberadamente mantida na revisão e é a dívida aceita do budget. Os gráficos usam src/lib/chart-theme.ts.

Duas pendências documentais permanecem: baseline-2026-09-24.json e docs/tipografia/EXCECOES.md não estão no repositório. A própria revisão declarou substituir o relatório de nome originalmente solicitado. A comparação histórica usa o baseline disponível de 22/09 e não inventa a medição ausente de 24/09.

## 2. Guard verde tem um alcance definido

As duas violações residuais contabilizadas são o **120px de NotFound** e o **fontSize 10 de catalogShared**. As demais seis categorias estão em zero. O snapshot do budget registra 307 arbitrários e 1.630 arquivos; a medição atual tem 311 e 1.917. O check compara tetos das oito categorias, não todos os totais do snapshot. A revisão anterior decidiu conscientemente não falhar por qualquer alteração desses totais.

Há **119 usos arbitrários abaixo de 12px**: 3 de 7px, 11 de 8px e 105 de 9px. Somam-se 597 usos do token 3xs e 367 de 2xs. São ocorrências lexicais, não contagem de elementos simultaneamente visíveis. Não foi medida legibilidade, zoom ou área de toque; tamanho de fonte isolado não prova violação normativa de acessibilidade.

O guard ainda deixa passar duas formas relevantes de família literal:

- scanCss exige aspas depois de font-family:; font-family: system-ui não entra no contador.
- scanTsxInline procura fontFamily, não CSS escrito dentro de uma string HTML.

A ocorrência real permanece em **src/hooks/ui/useScreenProtection.ts:128**. O probe reproduz zero achados para esse padrão e detecta corretamente o controle com Arial entre aspas. Logo, o zero do contador não fecha a etapa 64 nem satisfaz integralmente a promessa abrangente da etapa 88.

O scanner de pesos usa uma faixa min/max. Na fixture com pesos estáticos 300/400/500/600/700, não acusa o 450 ausente; o próprio teste do repositório registra essa limitação. Isso não demonstra que a URL variável atual esteja errada. Demonstra que a etapa 89 tem proteção parcial contra regressões futuras para listas estáticas.

## 3. Densidade e tokens fluidos: duas correções ao diagnóstico antigo

Não é mais correto chamar **todo o sistema de densidade de morto**. useDensity seta data-density, a lista virtualizada lê a preferência, e PageTemplate consome --density-padding-x. A pendência específica continua: **--density-text-size tem zero consumidores**.

Também não se deve remover os oito tokens fluidos em bloco. PageTemplate usa quatro deles para título/subtítulo responsivos. Os outros quatro não têm uso lexical detectado. As etapas 43/44 exigem uma decisão sobre a parcela sem uso, preservando a parte viva.

O CSS font-size:revert não é um número tipográfico perdido: em src/styles/components.css:180–185 neutraliza os headings globais da aplicação dentro do email HTML recebido. Sua finalidade foi confirmada no contexto. Não foi proposta remoção.

## 4. Decisões posteriores de Contatos prevalecem

O plano de melhorias de Contatos de 50 etapas está explicitamente encerrado. Sua abertura informa que etapas de redução visual foram revertidas/substituídas e registra **D3 = Navy** como decisão aprovada em 01/10. Os tokens page-title (38px) e kpi-value (34px) têm exceção nomeada no budget. Não são equivalentes a introduzir arbitrários sem controle.

**Em 30/09, #1262 removeu o cabeçalho visual de Contatos**. O código atual mantém um h1 sr-only com “Contatos”. O token de 38px continua no componente compartilhado PageHeader, mas sua presença lexical não significa que um título visual de 38px esteja hoje montado em Contatos. A decisão D3 registrada em 01/10 e essa composição atual precisam ser lidas juntas.

Por isso, as antigas instruções de uniformizar esse header por PageTemplate e de reconstruir a composição de KPIs 3+1/aniversários foram marcadas como superadas. A grade atual está em ContactStatsCards com quatro cartões e 2/4 colunas. Não foi reaberta a redução tipográfica do plano antigo.

## 5. Layout: correção estrutural presente, aceite global ainda incompleto

ViewContainer substitui WithHeader com w-full/min-w-0/flex-1, centraliza o scroller padrão e fornece seu ref a Contatos. ScrollToTopButton observa esse ref, usa limiar 400px e chama scrollTo para o topo. O router deriva full-screen dos metadados de NavigationService. Shell e CSS têm fallback vh mais dvh; a sidebar lê tokens de largura.

Há exceções declaradas: views full-screen, ownScroll=settings e gutters compactos para Dashboard, TalkX, Catálogo e Telefonia. Os tokens atuais também diferem dos números antigos: gutter padrão de 2,25rem, sidebar de 256px e recolhida de 64px. Não se pode exigir cegamente os antigos 24/220/62px.

O guard retornou os seguintes apontamentos:

| Apontamento | Adjudicação |
|---|---|
| TasksModule: h-full sem w-full/flex-1 | Falta literal confirmada. Wrapper do router tem largura completa; só a classe faltante não prova faixa morta no DOM. |
| VoIPPanel sem raiz JSX | Limitação do scanner: arquivo é reexportação de TelefoniaView, cuja raiz contém w-full e min-w-0. |
| TalkX: h-full sem largura | A regex casa a substring em min-h-full. Probe confirma ausência do token exato h-full. |
| TalkX: padding próprio somado ao wrapper | Soma real no código: wrapper compacto e raiz p-3/md:p-4/lg:p-6. Não foi medido o efeito visual. |
| Multiplix: p-6 próprio somado ao wrapper | Soma real no código: gutter padrão mais 24px nominais. Diverge do dono único de padding solicitado. |

A **sidebar ainda usa h-screen com suporte a 100dvh, não h-full**, então a etapa 17 não está implementada literalmente. Não se afirma que ela esteja cortando conteúdo: esse efeito requer medição.

## 6. O teste de largura não testa a faixa morta original

scripts/ui-audit/width-regression.mjs existe, exige sessão e evita medir a tela de login por engano. Mas sua condição é document.documentElement.scrollWidth <= window.innerWidth, em viewport **1280×800**. O plano pedia comparar largura de conteúdo e main em **1920×1080**.

Uma view que ocupe só 1000px de um main de 1920px pode passar no teste atual, porque não há overflow horizontal. Portanto o script não cobre o sintoma original de conteúdo estreito com espaço vazio à direita. Não foi executado navegador nem criada captura para afirmar que o sintoma persiste.

O guard de layout também não aparece como passo do ci.yml; o guard tipográfico aparece na linha 175. CI verde não implica que as cinco saídas do guard local de layout tenham sido resolvidas.

## Arquivos concluídos

- tasks.enriched.json e tasks.audit-ledger.json: os mesmos 130 registros completos, com IDs globais preservados.
- summary.json: contagens e resultados.
- findings.json: achados e limites da revisão.
- source-evidence.json: trechos numerados e hashes das fontes.
- typography-baseline.json, baseline-comparison.json, static-inventory.json, outside-surface-inventory.json.
- Logs dos dois guards e dos dez testes.
- reproduce_guard_limits.mjs, guard-limitations.probe.json e fixtures locais.
- build_ledger.py: reconstrução reprodutível do ledger.

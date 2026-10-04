# Reconciliação SalesView + Journey — 50 etapas

**Baseline:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Plano: `docs/design/PLANO_SALESVIEW_JOURNEY_50_ETAPAS_2026-10-02.md`. Auditoria somente documental e de código/história; nenhum código, banco ou remoto foi alterado.

## Resultado

A fusão foi implementada: SalesView integra resumo comercial, compras e propostas; Journey reúne estatísticas e timeline; os três blocos redundantes saíram do sidebar. Os IDs internos `orders` e `history` permaneceram, conforme a decisão explícita do plano. A afirmação inicial “nenhuma etapa executada” foi superada por cinco PRs de fase e por sucessores posteriores.

Os principais resíduos atuais são semântica de dois rótulos, cobertura incompleta de um teste de compra pendente, matriz visual insuficiente e reconciliação documental. **Não reimplementar a fusão, os percentuais reais, a restauração da aba ou o controle de contraste.** Cada uma dessas entregas tem código posterior rastreável.

## Linhagem que muda a conclusão

| PR | Entrega | Consequência para o plano |
|---|---|---|
| #1608 | Rótulos e navegação | S01–S10 possuem implementação; ids preservados |
| #1613 | SalesView, faixa, Novo, profileId | S11–S20 avançaram; o rótulo Compras concluídas ainda falta |
| #1619 | Journey e estatísticas | S21–S31 implementadas; a amostra do tempo médio precisa de escopo visível |
| #1626 | Remoção das duplicatas laterais | S32–S40 presentes; o gate DOM prévio foi admitido como não executado naquela sessão |
| #1628 | Documentação e fechamento | S44–S49 têm artefatos, com limitações; cinco linhas de fase não são cinquenta aceites |
| #1640 | Variação real e compras via React Query | Percentuais agora vêm de contagens reais de janelas; a contagem antiga de dias foi substituída por conversation_sla |
| #1722, #1745, #1791 | Medições e correções do instrumento | Relatos de 404 e falha de restauração precisam ser lidos na sequência correta |
| #1797, #1807 | Restauração corrigida e período medido | O item 6 foi consertado; o filtro de período chega às consultas, embora o pixel não tenha mudado na amostra |
| #1819, #1829, #1847 | Diagnóstico e correções de contraste | Controle passou a ser montado, media query foi corrigida e preferência do sistema aplica a classe apesar das variáveis inline |

Todos os merge SHAs usados foram conferidos como ancestrais do baseline. Contagens de suíte das PRs são evidência histórica; não foram convertidas em aprovação individual dos 50 requisitos.

## Achados atuais

### SV-001 — Compras concluídas está rotulado apenas como Compras

`CommercialSummaryStrip.tsx:32` usa `Compras (n)`. O agregado em `useContactCrm360.ts:74–96,164–168` conta somente `completed` e `approved`. O plano foi revisado antes da implementação justamente para tornar esse universo explícito, porque Novo cria `pending`. O teste atual espera `Compras (2)` e não contém a terceira compra pending exigida.

O conserto necessário é textual e de teste de contrato; não mudar o status dos registros nem inflar o agregado para fazer o número subir. `profileId` chega ao insert e a atualização dos caches existe, inclusive `contactPurchasesKey` após #1640. Há prova histórica de `created_by` real. Falta o cenário negativo de erro de insert pedido em S15; o teste localizado é positivo.

### SV-002 — Tempo médio amostral não informa o recorte

A Journey diz “Desde o início do relacionamento”, mas `ContactService.fetchStats` ainda calcula tempo médio com as **200 primeiras mensagens**. O tile diz somente “Resposta ao cliente”. S24 e S26 pedem explicitar independência do período e o recorte da amostra. A revisão posterior #1640 melhorou a contagem de atendimentos e acrescentou percentuais reais, mas não ampliou essa consulta do tempo médio.

Os percentuais atuais **não são os números inventados antigos**. São produzidos por queries de contagem dos últimos 30 dias contra os 30 anteriores. Remover qualquer `%` por obediência literal a S25 destruiria trabalho legítimo posterior; a proibição deve ser reconciliada como substituição parcial.

### SV-003 — A matriz visual não é fechada pela quantidade de arquivos

O inventário local tem **14 PNGs**. Todos estão abaixo de 400 KB; dois novos são 1280×1000, os demais 1280×900. Isso não fecha a matriz pedida:

- `02-salesview-vazio.png` e `03-salesview-cheio.png` têm **SHA256 idêntico**; a captura de estado cheio não foi feita.
- `00-antes-barra.png` e `00-antes-sidebar.png` não existem.
- O relatório admite ausência do par escuro e que capturas antigas da Journey mostram erro.
- O relatório de S38 não avalia o accordion recolhido e expandido sem buraco; descreve sobretudo o DOM de SalesView vazio.

Há capturas posteriores que mostram Journey funcional e a aba restaurada. Elas superam diagnósticos antigos no seu escopo, mas não fabricam as combinações visuais faltantes. `image_inventory.json` preserva dimensões, tamanho e SHA por arquivo.

### SV-004 — O placar mistura estados anteriores e posteriores

O plano tem cinco linhas agregadas de fase, apesar de S47 pedir cinquenta linhas. Apêndices ainda dizem que Journey não carrega e a aba não restaura, enquanto o relatório atualizado registra chunk 200, #1797 e medição do item 6. A última explicação atribui os 404 a abas com bundle antigo depois de redeploy; não a um defeito intrínseco atual da Journey.

S43 também mantém o diagnóstico de toggle inexistente e media query inválida. #1829 montou AccessibilitySettings na Sidebar; #1847 integrou a preferência do sistema via JS, porque a simples correção de CSS era vencida pelas variáveis inline. O único aceite de S43 que a PR posterior deixa aberto é **contraste por elemento com a tela saudável**. O rótulo de componente não ser literalmente HighContrastToggle não significa ausência de controle: AccessibilitySettings contém o switch `id=high-contrast`.

## Aceites históricos e limites

S41 tem provas históricas de barra, três blocos, `created_by`, remoção lateral, filtro de período e restauração. O filtro foi medido na query: recortes de 7/90 dias chegaram a cinco fontes, todas com HTTP 200. Os valores da tela ficaram iguais na amostra; o relatório faz corretamente essa ressalva.

O item 7 pede zero erros de console e não foi fechado: o mesmo relatório registra 401 de outro fluxo e 404 de chunks obsoletos. O banner global também foi historicamente medido sobre 44 dos 53 px das abas; o componente atual continua fixed top-0 com z-index 90, mas esta frente não mediu geometria no deploy atual. Tratar isso como risco transversal a revalidar, sem inventar nova ocorrência atual.

A migração de ContactPurchasesPanel para React Query em #1640 melhora cache, mas continua tendo uma query distinta de useContactCrm360. O plano lista evitar leitura duplicada entre seus próximos passos; não afirmar que a simples adoção de React Query eliminou toda consulta duplicada. Também não existe nesta tela o fluxo de mudar pending para approved/completed; isso é evolução de produto separada.

Não houve teste de produção, SQL, criação de compras, disparo de mensagens ou execução de Vitest nesta auditoria. Foram conferidos arquivos, testes e história Git; as comparações binárias de capturas e a validação de estrutura foram executadas localmente. Os 50 registros têm adjudicação específica; qualquer ausência de runtime está declarada, em vez de virar uma nova implementação obrigatória.

## Placar individual

Distribuição: {'NEEDS_REVALIDATION': 7, 'IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE': 11, 'DONE_VERIFIED': 15, 'PARTIAL': 14, 'SUPERSEDED': 1, 'HUMAN_ACCEPTANCE': 1, 'VALIDATED_FAIL': 1}. `DONE_VERIFIED` é restrito à entrega textual, estrutural ou documental explicitada; não certifica toda a fase. `SUPERSEDED` em S25 é parcial, limitado à proibição de percentuais quando agora há fonte real.

| ID | Linha do plano | Status | Reconciliação individual |
|---|---:|---|---|
| S01 | 93 | `NEEDS_REVALIDATION` | A PR #1608 registra a checagem de sobreposição em 02/10 e o merge é ancestral. A sessão e o ponto inicial exato da branch são históricos; não recriar a branch para repetir esse processo. |
| S02 | 98 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | ConversationTabs mantém id orders e renderiza o rótulo SalesView. Existe teste específico de contrato. A suíte não foi reexecutada nesta auditoria. |
| S03 | 103 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | ConversationTabs mantém id history e renderiza Journey. O teste específico afirma o texto sem renomear o id persistido. |
| S04 | 108 | `DONE_VERIFIED` | Os nomes dos Panel são SalesView e Journey; não há Panel name Pedidos ou Histórico no diretório de montagem. Verificação restrita à mudança textual pedida. |
| S05 | 113 | `DONE_VERIFIED` | O comentário do badge foi atualizado para SalesView; a chave orders permanece conforme a decisão D1. |
| S06 | 118 | `DONE_VERIFIED` | Os títulos e subtítulos solicitados estão em SalesViewTab e JourneyTab. A conclusão é textual; geometria e contraste têm aceites separados. |
| S07 | 123 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | Crm360Tab usa Ver no SalesView e Ver na Journey, preservando onTabChange orders/history. Os dois testes de navegação foram atualizados. |
| S08 | 128 | `DONE_VERIFIED` | As duas suítes ConversationTabs usam o vocabulário SalesView/Journey; a varredura não encontra Pedidos ou Histórico nesses arquivos. Os IDs contratuais continuam orders/history. |
| S09 | 133 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | O caso rotula orders como SalesView e history como Journey existe e verifica os textos com within. Não houve execução ou mutação desse teste nesta auditoria. |
| S10 | 138 | `NEEDS_REVALIDATION` | A PR #1608 está mergeada, com gates e deploy historicamente relatados. O print da barra existe. O estado READY do deploy não foi consultado novamente. |
| S11 | 144 | `NEEDS_REVALIDATION` | A PR #1613 é posterior ao merge #1608 e ancestral do baseline. O ponto inicial exato da branch e a lista de sobreposição permanecem evidência histórica de processo. |
| S12 | 148 | `PARTIAL` | SalesViewTab substituiu OrdersTab e a importação lazy aponta ao arquivo novo. O merge squash aparece como delete/create com limiar de similaridade de 90%; não foi comprovado o commit puro de rename exigido. Não renomear novamente por causa dessa lacuna de processo. |
| S13 | 153 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | CommercialSummaryStrip está em tabs e o arquivo anterior saiu. A referência temporária no sidebar foi removida posteriormente pela fase 4, como previsto. |
| S14 | 158 | `PARTIAL` | Os três blocos ficam montados, inclusive Novo no vazio; layout compacto foi preservado durante a transição. Entretanto o tile ainda diz Compras (n), e não Compras concluídas (n), apesar de o agregado contar apenas approved/completed. |
| S15 | 163 | `PARTIAL` | profileId chega ao insert, que invalida contactCrm360Key; #1640 acrescentou contactPurchasesKey. Há teste positivo e prova histórica de created_by real. Não foi localizado o teste negativo de erro de insert exigido. Não prometer aumento do tile de compras concluídas para um registro pending. |
| S16 | 168 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | O badge soma purchases.length e openDeals.length. A evidência de imagem com exatamente uma proposta e nenhuma compra não foi localizada individualmente. |
| S17 | 173 | `DONE_VERIFIED` | O ícone da aba SalesView e o resumo comercial usam CircleDollarSign. A inspeção confirma a mudança estrutural pedida; o aceite visual global continua separado. |
| S18 | 178 | `PARTIAL` | Há quatro casos em SalesViewTab.test.tsx, incluindo Novo e created_by. O teste exige Compras (2), não Compras concluídas (2), e não adiciona a compra pending excluída da contagem pedida. Quantidade de casos não equivale a contrato completo. |
| S19 | 183 | `DONE_VERIFIED` | A nota de 02/10 está no CP3 de INBOX_360_STATUS.md, descrevendo rename, três blocos, ids preservados e profileId. |
| S20 | 188 | `PARTIAL` | A PR #1613 e os artefatos de fase existem, mas 03-salesview-cheio.png é byte a byte igual a 02-salesview-vazio.png. O estado cheio não foi comprovado pela captura exigida. |
| S21 | 194 | `NEEDS_REVALIDATION` | A sequência #1608, #1613, #1619 é serial e os merges são ancestrais; a criação da branch em HEAD exato é afirmação histórica de processo. |
| S22 | 198 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | JourneyTab e seu teste substituem HistoryTab; a importação lazy usa JourneyTab, mantendo history-tab e id history. A separação do rename puro não foi recertificada. |
| S23 | 203 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | ContactStatsStrip está em tabs e o nome antigo saiu. A referência temporária no sidebar foi removida por #1626, conforme a ordem prevista. |
| S24 | 208 | `PARTIAL` | A faixa de estatísticas está antes dos filtros e o KPI por período permanece abaixo. O subtítulo atual é Desde o início do relacionamento, embora o plano tenha corrigido explicitamente para Independe do período abaixo e o tempo médio ainda use 200 mensagens. |
| S25 | 213 | `SUPERSEDED` | Os percentuais constantes e sparklines inventados foram removidos. #1640 acrescentou percentuais reais obtidos por seis head-count queries. A proibição literal de qualquer % foi superada por essa implementação posterior; não remover os percentuais atuais como se fossem mock. |
| S26 | 218 | `PARTIAL` | #1640 substituiu a antiga contagem de dias por conversation_sla e o rótulo agora é Atendimentos/Episódios respondidos. A parte antiga de 500 últimas mensagens foi superada; falta explicitar que Tempo médio continua amostrando as 200 primeiras mensagens. |
| S27 | 223 | `PARTIAL` | No período selecionado existe acima de KpiStrip. A faixa superior ainda usa Desde o início do relacionamento, não o texto de independência do período previsto em S24/S27. |
| S28 | 228 | `DONE_VERIFIED` | Route é usado na barra e no cabeçalho da Journey. O empty state Nenhum evento neste período foi preservado. |
| S29 | 233 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | JourneyTab.test.tsx contém os oito casos, incluindo hook com período 7, argumentos do hook de stats e cargas independentes. #1807 acrescentou medição histórica das consultas de período. A tela com mesmos KPIs não foi apresentada como prova de mudança do valor. |
| S30 | 238 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | ContactStatsStrip.test.tsx possui valores, formatação, CSAT vazio, skeleton e ausência/presença de percentual real. O caso novo de percentual substitui corretamente o teste antigo de ausência absoluta. |
| S31 | 243 | `NEEDS_REVALIDATION` | A PR #1619 foi mergeada; o erro 404 da Journey foi superado por captura posterior do chunk 200. O estado de um deploy anterior não certifica o deploy atual. |
| S32 | 249 | `PARTIAL` | As fases 2 e 3 estão mergeadas antes de #1626. A própria PR #1626 admite ausência de confirmação DOM autenticada antes da remoção; deploy success não prova retrospectivamente aquele gate. Hoje as abas e remoções existem. |
| S33 | 253 | `DONE_VERIFIED` | ContactAccordionSections não contém o bloco commercial-summary nem import CommercialSummaryStrip; a implementação está na aba central. |
| S34 | 258 | `DONE_VERIFIED` | ContactAccordionSections não contém ContactPurchasesPanel nem ShoppingBag; a duplicata Compras & Propostas saiu. |
| S35 | 263 | `DONE_VERIFIED` | ContactAccordionSections não contém ContactStatsStrip nem BarChart3. As estatísticas permanecem na Journey. |
| S36 | 268 | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | Catálogo e defaults não incluem commercial-summary, purchases ou stats. O teste cobre storage misto, só valores removidos e catálogo limpo. Função de sanitização preservada. |
| S37 | 273 | `DONE_VERIFIED` | A varredura dos imports de tabs no diretório contact-details é vazia. Conclusão limitada à direção de dependência pedida; gates históricos permanecem datados. |
| S38 | 278 | `HUMAN_ACCEPTANCE` | O relatório admite que não avaliou visualmente os estados recolhido e expandido sem buraco; usou DOM de SalesView vazio e capturas. Falta o aceite específico do accordion, sem exigir reimplementação. |
| S39 | 283 | `DONE_VERIFIED` | PAINEL_STATUS.md contém nota datada com os três blocos removidos, as abas de destino e novos defaults. |
| S40 | 288 | `NEEDS_REVALIDATION` | #1626 foi mergeada e a ausência dos blocos no DOM foi documentada depois por #1722. Não houve leitura de deploy atual nesta auditoria. |
| S41 | 294 | `PARTIAL` | Itens 1,2,3,5 têm evidência histórica; #1807 mede o período e #1797 corrige/restaura a aba. O item 7 exige zero erros, mas o relatório conserva 401 de outro fluxo e chunks 404 de aba com bundle antigo. Não descrever o 404 como bug atual da Journey; o gate de console não foi cumprido integralmente. |
| S42 | 298 | `VALIDATED_FAIL` | Inventário local confirma 14 PNGs, mas os dois arquivos antes não existem e cheio/vazio têm SHA256 idêntico. O relatório admite que o par escuro não foi produzido e que capturas Journey antigas mostram erro. Ter nove ou mais arquivos não satisfaz a matriz exigida. |
| S43 | 302 | `PARTIAL` | Tema claro foi medido. #1829 montou AccessibilitySettings e corrigiu a media query; #1847 fez a preferência do sistema agir apesar das variáveis inline. A própria PR #1847 mantém pendente contraste por elemento com a tela saudável. Não reabrir os dois defeitos já corrigidos. |
| S44 | 306 | `NEEDS_REVALIDATION` | #1628 registra graphify executado em c97429f0. O grafo é externo ao Git e não foi disponibilizado neste clone; essa medição histórica não prova grafo atualizado no baseline atual. |
| S45 | 310 | `DONE_VERIFIED` | A varredura atual preserva apenas rótulos métricos do CRM externo e teste negativo intencional. Esses Pedidos são explicitamente permitidos no plano e não devem ser renomeados. |
| S46 | 314 | `PARTIAL` | A lição SalesView/Journey existe em CLAUDE.md. Seu alerta contra percentuais inventados continua válido, mas a descrição de inexistência de série precisa apontar a evolução #1640: comparação real de janelas via queries, sem nova RPC. |
| S47 | 318 | `PARTIAL` | A seção 7 contém cinco linhas por fase, não as 50 linhas por tarefa exigidas; também convive com apêndices anteriores contraditórios sobre S41/S43. Falta reconciliação individual; este artefato fornece as 50 linhas sem alterar o plano original. |
| S48 | 322 | `DONE_VERIFIED` | git ls-files docs/design não encontra arquivo de imagem com orders no nome. A referência antiga fora do repositório é histórica e foi preservada como tal. |
| S49 | 327 | `DONE_VERIFIED` | A PR de fechamento #1628 está mergeada e o SHA é ancestral do baseline. Conclusão restrita ao aceite formal PR mergeada; não certifica aceites visuais incompletos. |
| S50 | 331 | `PARTIAL` | Há relatório e PR de fechamento com limitações, e #1640 executou parte dos próximos passos. A mensagem final histórica ao dono não foi consultada; não há prova para classificá-la enviada. Os aceites visuais e de console permanecem parcialmente abertos. |

## Artefatos

`tasks.enriched.json` contém os 50 requisitos originais, adjudicações, caminhos, testes, PRs e commits. `findings.json` contém os quatro achados, evidências de linha e aceites. `image_inventory.json`, `validation.json` e `summary.json` registram as verificações locais. O checkout permaneceu limpo e no SHA fixado.

# Reconciliação de Catálogo, Mapa, Tarefas, Contatos, Email e Arquivos

**Baseline:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. **Escopo:** 7 planos ativos, 600 requisitos individuais. Auditoria documental com inspeção de código, testes versionados, história Git e PRs; nenhuma alteração de código, migration, banco ou remoto.

## Resultado

A maior parte das estruturas previstas está implementada. O estado documental não acompanha essa implementação de maneira uniforme: Email e Arquivos ainda carregam texto de preparação, enquanto relatórios de fechamento usam resultados agregados que não comprovam todos os critérios. A reconciliação preserva o trabalho entregue e localiza as exceções verificáveis.

Os achados de maior prioridade são **encaminhamento que omite selecionados fora do filtro**, **falso sucesso na sincronização Gmail parcial** e **exportação de Catálogo com risco de omissão em nomes empatados**. Também foi confirmada uma regressão de invalidação nas contagens de Arquivos. Esses quatro caminhos foram examinados por um segundo auditor; as reproduções locais estão preservadas.

**600 linhas não significam 600 aceites semânticos comprovados.** Cada linha conserva o requisito original, o status documental, a classificação reconciliada, caminhos de implementação e teste, PRs, commits e limites. As referências de família identificam onde continuar a inspeção; elas estão marcadas expressamente como insuficientes para provar cada cláusula. O campo `review_level` distingue inspeção direta de contrato de reconciliação documental com resolução de caminhos.

Não houve execução de Vitest, Playwright, Gmail, WhatsApp, Storage ou SQL de produção nesta frente. Relatos de runtime existentes foram tratados como históricos, com suas ressalvas. A falta de uma reexecução nesta auditoria não é evidência de que uma função deixou de existir, nem autorização para reimplementar tudo.

## Inventário e classificação

| Plano | Requisitos | Entrega estrita verificada | Parcial | Falha comprovada ou regressão |
|---|---:|---:|---:|---:|
| Catálogo | 100 | 11 | 3 | 5 |
| Mapa | 100 | 8 | 2 | 0 |
| Tarefas | 100 | 1 | 4 | 0 |
| Contatos | 100 | 4 | 4 | 0 |
| Email NAVY | 100 | 0 | 8 | 1 |
| Email Sidebar | 50 | 1 | 3 | 0 |
| Arquivos do chat | 50 | 0 | 4 | 4 |

Há cinco planos de 100 e dois planos de 50: **500 + 100 = 600**. Os planos anteriores e os documentos fora de `main` pertencem à linhagem e ao inventário global; não foram somados novamente aqui.

| Status | Quantidade |
|---|---:|
| `DONE_VERIFIED` | 25 |
| `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | 449 |
| `NEEDS_REVALIDATION` | 48 |
| `PARTIAL` | 28 |
| `VALIDATED_FAIL` | 8 |
| `ACTIVE_REGRESSION` | 2 |
| `NOT_IMPLEMENTED` | 3 |
| `HUMAN_ACCEPTANCE` | 20 |
| `BLOCKED_EXTERNAL` | 9 |
| `PRODUCT_DECISION_REQUIRED` | 1 |
| `SUPERSEDED` | 4 |
| `NO_LONGER_APPLICABLE` | 3 |

`IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` é uma classificação conservadora de reconciliação: há artefatos de implementação da tarefa ou de sua família e evidência histórica, mas o aceite integral não foi reexecutado e nem todo vínculo de arquivo foi revisado semanticamente. **Não são 449 defeitos nem 449 novas implementações necessárias.** A prioridade operacional é a lista de achados e os gates consolidados abaixo. `DONE_VERIFIED` foi usado somente para entregas estreitas de documentação, decisões ou contrato de código diretamente conferido; não deriva da contagem geral de testes de um PR.

## Defeitos e divergências que resistiram à revisão

### 1. Arquivos: seleção anunciada difere do payload

`FilesTab.tsx:167–170` constrói `selectedItems` a partir de `filtered`, enquanto a barra em `263–273` mostra `selection.selectedCount`. `useFilesSelection` preserva os IDs ao mudar o filtro, comportamento que os testes da fase 6 cobrem. O botão oferece “Encaminhar 2” quando somente um dos dois itens está no recorte. Se nenhum estiver visível, `openForward` retorna sem abrir o diálogo.

A reprodução usa a expressão exata e dois itens sintéticos, imagem e PDF. Resultado: **2 anunciados, 1 encaminhado**; com recorte vazio, **2 anunciados, 0 encaminhados**. Não houve envio externo. Corrigir exige alinhar universo selecionado, limites, diálogo e payload; não mudar a persistência da seleção por conveniência. Achado `OTH-001`, P1.

### 2. Arquivos: exclusão não invalida a nova contagem

`useFilesActions.ts:52–55` invalida galeria e badge, mas não `contactMediaCountsKey`. O hook de contagem usa uma chave separada e `staleTime: 30_000`; isso não agenda polling. `queryClient.ts:16–21` desativa refetch ao focar e ao montar. O evento INSERT invalida as três chaves, mas UPDATE e DELETE não fazem isso.

Assim, a introdução de contagens do banco em #1865 deixou o caminho anterior de exclusão incompleto. O requisito é convergência de lista, badge, chips e header sem reload, incluindo falha da mutação e alteração remota. A UI também ignora `isError` da contagem, por isso um erro inicial pode aparecer como zero. Achado `OTH-002`, P2; regressão estática confirmada por outro auditor.

### 3. Email: HTTP 207 vira sucesso visual

`gmail-sync/index.ts:81–88` preserva a falha parcial no backend. `gmailApi.ts:19–29` retorna o payload quando o SDK não traz `error`; `useGmail.ts:176–183` sempre mostra toast de sucesso e não invalida a conta. A reprodução do callback exato mostrou **4 e-mails sincronizados** para payload com **1 falha**. A revisão independente executou também a versão oficial do SDK fixada no lockfile e confirmou que HTTP 207 retorna `error:null`.

O reparo deve interpretar o resultado de domínio, atualizar a conta e oferecer recuperação sem reenvio de e-mails. A implementação do backend existe; a integração da resposta com o operador é que falha. Achado `OTH-003`, P1.

### 4. Catálogo: dedupe não resolve paginação sem ordem total

`promogifts-catalog/index.ts:378–380` usa `.order(order_by)` sem desempate único. `catalogExport.ts:179–189` avança offsets e descarta IDs repetidos. Duas ordenações permitidas de quatro produtos com nomes iguais geraram páginas `[A,B]` e `[B,D]`; a função real retornou `[A,B,D]`, omitindo `C`.

Isso refuta a garantia documental de que ordem por nome mais dedupe evita duplicação e omissão. Não prova incidente no banco atual. A correção precisa estabelecer ordem total e definir consistência para alterações concorrentes. Exportação de uma seleção previamente materializada tem caminho diferente. Achado `OTH-004`, P1.

### 5. Email: paginação local não fecha os contratos de volume e histórico

EN-025 pede filtros no servidor e cursor `last_message_at + id`. O código coleta todas as páginas da conta por offset e filtra localmente. O desempate por ID existe, portanto não se deve confundir este caso com o empate puro do Catálogo; os riscos são custo total da caixa e deslocamento sob alterações concorrentes.

EN-029 e EN-083 também pedem continuação do provider. `syncMessages` devolve `nextPageToken`, mas nenhum parâmetro aceita `pageToken` e o front não o consome. A paginação do **history incremental existe** e foi preservada; ela é diferente de completar o histórico pelo caminho `sync-inbox`. Achados `OTH-005` e `OTH-006`, P2.

EN-088 tem fixtures de mil threads e extremos de anexos, porém faltam as medições exigidas de memória, consultas, iframes, listeners e blobs com orçamento antes/depois. Isso é lacuna de prova, sem alegação de vazamento observado. Achado `OTH-014`.

## Linhagem e correções documentais por módulo

### Catálogo

O plano final de 100 absorve o plano de implementação anterior. O cabeçalho antigo e vários apêndices descrevem estados anteriores aos últimos PRs. **CT-19 teve avanço real**: o limitador compartilhado, as correções de concorrência e as medições posteriores (#1746, #1802, #1822 e #1827) superam o diagnóstico antigo de contador por isolate. Não reabrir essa implementação como ausente.

CT-30 e CT-39 receberam Accordion/Drawer e adição de fotos em #1697. CT-74 recebeu correções de strip e depois de header; a última medição disponível, ainda anterior à correção final do header, é **desempenho 44 / CLS 0,2452**. O status é falha do último aceite medido, com necessidade de nova medição, sem declarar que #1735 foi testada e falhou.

CT-73 foi marcado por medir **81,5 KB por 24 itens**, embora o enunciado exigisse menos de 30 KB e corte se excedesse. Separar medição concluída de meta cumprida. CT-64 permanece implementado apenas como flag `is_new`, sem a alternativa temporal exigida. CT-69 tem alt entregue e última matriz de contraste com 13 de 24 pares abaixo do alvo; revalidar temas atuais antes de inferir permanência exata.

CT-94 já tem 429 histórico demonstrado. O spec atual, entretanto, só exige um status 429 entre as respostas e não verifica o aviso/cooldown da UI. A captura versionada não mostra mensagem de limite. A pendência é essa prova correlacionada, não gerar nova rajada indiscriminada.

O validador de CT-99 foi executado localmente e retorna exit code 1 para E54; também só reconhece caixas `[ ]`. A solução documental deve respeitar o plano histórico substituído, sem inventar subetapas para satisfazer contagem.

Dependências consolidadas: grants e contratos externos do PromoGifts; envio WhatsApp e recebimento real; RLS com duas identidades autorizadas; digest remoto; Sentry; release e limpeza de branches com escopo explícito. Nenhuma foi realizada nesta frente.

### Mapa

O plano de 100 absorve resíduos do Search Box de 50. O encerramento achou a sessão fantasma, mas **#1711 a corrigiu**: a auditoria passa a registrar uso no primeiro request, não na criação da sessão. O teste deixou de ser `it.fails`. O relatório antigo ainda trata o conserto como futuro e precisa de reconciliação; a série de custo tem mudança de significado nesse ponto.

E53 era opcional e registra justificativa de não execução. E89 teve decisão explícita que substituiu o ensaio de revert em preview por prova de reversibilidade/custo; não duplicar deploy só para marcar etapa. E69 registra 5 de 6 mutações detectadas, com sobrevivente dito equivalente; isso não deve virar 6 de 6 sem justificar a equivalência.

Gates reais: E65 precisa do quarto artefato com teclado virtual em aparelho; E90 depende da restrição do token no painel Mapbox; E94 pede recebimento real de localização; o canal de e-mail de E91 tinha 403 por secrets ausentes. E96 contou zero eventos cleared e zero eventos de alteração no total; janela sem exercício não prova eficácia do trigger. O encerramento E100 precisa da tabela individual pedida e atualização pós-#1711.

### Tarefas

A finalização de 100 sucede a fusão de 150. O ledger CP-A a CP-N contém evidência posterior aos checkpoints antigos. **As etapas 96 e 100 não pedem reimplementação**: faltam abertura de tarefa migrada na Lista/Sheet pelo dono e aceite final. A remoção de `reminders_pending` já tem migration e aplicação historicamente registradas (#1516); não criar DDL duplicada.

CP-N fecha os cenários de alarme real que CP-M ainda deixava pendentes. A medição de cores avançou de 8 de 10 para 10 de 10; a versão anterior não deve ser usada para reabrir esse item. Permanecem ressalvas concretas: QA de 24 itens usou chip no lugar do comando literal `/remind`, registrou 503 à parte e abriu o sino em outro contexto; a altura mínima foi corrigida em #1590, mas CP-L não mede novamente o card sem chips com tarefa seedada; as duas contas QA eram supervisor e o cenário literal de dois agentes não privilegiados não foi exercitado.

O ledger registra resíduos fora do escopo entregue, incluindo funcionalidades futuras. Eles não devem ser contados como remoção de trabalho concluído nem implementados automaticamente a partir desta auditoria.

### Contatos

O plano de 100 absorve 24 pendências das melhorias de 50 e resíduos do redesign NAVY de 100. O número documental **99/100** aponta corretamente a falta das linhas canônicas de CLAUDE.md na etapa 94, mas não elimina ressalvas de aceites já marcados.

Na etapa 11, houve decisão posterior de tolerar as funções Sicoob na allowlist de órfãs. **O fonte existe**, em `docs/edge-functions-recovered/*/index.ts.txt`; a busca antiga por `.ts` produziu um falso negativo, corrigido por #1695. As funções continuam publicadas e isso não pode ser descrito como remoção. O log de uso do canal com zero mensagens também não substitui 30 dias de logs da edge.

Na etapa 98, o fluxo padrão passou historicamente depois de #1667 remover o overlay. Com legados ligados, o próprio documento registra **Total 3.095 contra Todos 3.124**, diferença de 29. O achado é histórico, pendente de reprodução; não é nova medição. Na etapa 99, o verde anterior de contagem/guards foi superado por log transversal posterior com 779 arquivos e 781 registros. Não confundir igualdade de contagens com igualdade do conteúdo SQL.

### Email NAVY e Sidebar

O texto “não executado” do plano NAVY é preparatório. As PRs #1712, #1751, #1755, #1762 e #1763 e o relatório de evidências mostram implementação efetiva. **#1793 substitui a paleta local pelo tema global**, sem descartar requisitos de envio, drafts, autorização, anexos, navegação ou contraste. Os 78 de 80 aceites publicados são históricos e não fecham automaticamente os 100 requisitos.

ES50 aprofunda os seis campos empresariais e o contexto do sidebar. #1812 entrega o caminho específico e identidade estável; #1846 acrescenta seleção de empresa e vínculo manual; #1855 resolve `profiles.id` e permissão granular. O texto inicial de 50 caixas abertas está desatualizado. A PR #1636 continua sendo dependência paralela do outro caminho de lookup; ela não foi presumida como mergeada e não torna ausente o novo caminho específico do Email.

O bloqueio de migration descrito em #1855 **não é prova de ausência atual**. O comparador integral do job `111299332677` encontra somente duas fixtures extras no ledger, sem arquivos locais ausentes no banco; isso sugere aplicação posterior das migrations locais, embora o log não imprima cada versão. A pendência é correlacionar a publicação atual, o smoke autenticado e o payload dos seis campos. Preflight e HTTP 401 anônimo não validam uma empresa conhecida com role de atendente.

Faltam dicionário empresarial vivo autorizado, matriz final campo → fonte → teste → captura → runtime, medição de custo e aceite visual com a referência correta. Esses gates são distintos dos defeitos funcionais de Email descritos acima.

### Arquivos

O plano inicial foi implementado em lotes: #1394 (decisões iniciais), #1731 (fundação), #1750 (toolbar/grade), #1772 (lista/tabela), #1780 (thumbs, preview e detalhe/seleção), #1845 (encaminhamento) e #1865 (paginação/contagens). O encaminhamento tem limites, estado por par item/destino e prova SQL descartável; a paginação usa keyset de 60 + 1. Isso impede classificar as 50 etapas como ausentes.

O caminho de Storage.copy precisa de smoke autenticado nos buckets aplicáveis; prova SQL local e merge da policy não substituem esse aceite. A sentinela atual usa viewport como root; a ressalva da própria PR #1865 diz que o preload não se antecipa ao scroll interno do Panel. O cenário com mais de 200 mídias ainda precisa de evidência real de contagens e navegação.

As etapas 47 e 48 têm implementação parcial de acessibilidade, mas faltam checklist executado e tabela de contraste. **Não estão no baseline o spec `e2e/files-tab.spec.ts` e o relatório final da etapa 50.** Há indício posterior de fixtures remotas de mídia, que o trabalho transversal de banco deve reconciliar; isso não certifica a homologação final. Encaminhamento do chat fora da aba, grupos e política de preview das bolhas são próximos passos explicitamente fora deste plano.

## Evidência e reprodução

- `tasks.enriched.json`: 600 registros, requisito original preservado e classificações individuais.
- `task_index.md`: índice legível por módulo, ID, linha, status e PRs.
- `findings.json`: 15 achados com gravidade, escopo, evidências por linha, critério de correção e limites.
- `lineages.json`: 7 relações de sucessão, incluindo substituições parciais.
- `reproductions.json`: resultados controlados de seleção, exportação, callback Gmail e chaves de invalidação.
- `reproduce_findings.py` e `.mjs`: extração das funções/expressões exatas e reprodução offline, sem imports do aplicativo.
- `validation.json`: contagem, IDs únicos, existência de caminhos, ranges, baseline e integridade do checkout.

A revisão independente está em `audit/adversarial/INDEPENDENT_REVIEW_2026-10-03.md` e `cross-module-probes.json`. Para reproduzir os probes desta frente: executar `python audit/modules/other/reproduce_findings.py` e `node audit/modules/other/reproduce_findings.mjs` no workspace. O validador do Catálogo pode ser repetido com `node scripts/catalog/validate-plan.mjs` dentro do clone; o resultado esperado deste baseline é falha documental em E54.

As PRs vinculadas por fase estão identificadas como **evidência de fase, sem prova semântica individual**. Só entram na lista de commits os merge SHAs confirmados como ancestrais do baseline. Os 268 caminhos de código e 175 de testes são localizadores distintos; sua existência não equivale a execução, aprovação de teste ou certificação de produção.

# Auditoria adversarial do resgate — 15/11/2026

Prova de que nenhuma branch ou PR fechada do Zapp Web V2 foi encerrada sem antes ser
examinada em busca de trabalho de agente de IA ainda não incorporado à `main`.

## Método

Para cada uma das 329 entradas de `../vereditos.json`, um agente recebeu a tarefa
**invertida**: provar que o veredito do ledger está ERRADO. Quando ele alegava trabalho
sobrevivente, um segundo agente independente recebia a alegação com a tarefa de **refutá-la**,
procurando o comportamento equivalente na `main` por comportamento e não por caminho de arquivo.
Só sobrevive o que o revisor adversarial não conseguiu derrubar, e cada sobrevivente cita
`arquivo:linha` da `main` provando a ausência.

**Cobertura real do revisor, item a item.** Dos 226 confirmados, **222 trazem o parecer do
revisor** em `motivo_revisor`. Os outros **4 não têm revisão registrada** e não devem ser lidos
como igualmente verificados:

| item | branch | por quê |
|---|---|---|
| Mapa de calor pode trocar domingo por segunda | `claude__fix-talkx-test-suite-261108-2330` | marcado `sem_revisor` no resultado da frente |
| Cartão "Resumo da Campanha" e nome do responsável sem teste | `claude__fix-talkx-test-suite-261108-2330` | marcado `sem_revisor` |
| 2 itens das frentes de lacunas | — | o resultado da frente não gravou o campo |

Os dois primeiros têm equivalente confirmado **com** revisor em outras branches
(`claude__fix-x051-remote-completion-test-261108-2057`), então a lacuna em si está verificada —
o que falta é o parecer daquele registro, não a evidência do problema.

A verdade sobre a `main` foi sempre um checkout limpo em `origin/main`, nunca o checkout de
trabalho — este fica em outra branch e enganaria o agente.

## Frentes

| arquivo | tipo | entradas | veredito mantido | derrubado | alegados | refutados | confirmados |
|---|---|---|---|---|---|---|---|
| `apagadas-9.json` | veredito | 9 | 9 | 0 | 1 | 1 | 0 |
| `incorp-c1-65.json` | veredito | 65 | 61 | 4 | 12 | 7 | 5 |
| `incorp-c2-65.json` | veredito | 65 | 63 | 2 | 9 | 6 | 3 |
| `obs-lote1.json` | veredito | 23 | 22 | 1 | 8 | 7 | 1 |
| `obs-lote3.json` | veredito | 23 | 21 | 2 | 13 | 8 | 5 |
| `obs-lote4.json` | veredito | 23 | 18 | 5 | 10 | 3 | 7 |
| `obs-wdnl8q6md.json` | veredito | 23 | 19 | 4 | 14 | 7 | 7 |
| `obs-wtw0p5nzz.json` | veredito | 92 | 79 | 13 | 74 | 54 | 20 |
| `pend-lote1.json` | lacunas | 65 | - | - | 65 | 20 | 45 |
| `pend-lote2.json` | lacunas | 173 | - | - | 173 | 40 | 133 |
| `prs-incorporada-23.json` | veredito | 23 | 23 | 0 | 0 | 0 | 0 |
| `prs-obsoleta-13.json` | veredito | 13 | 13 | 0 | 0 | 0 | 0 |

> **226 é a contagem de EVIDÊNCIAS confirmadas, não de tarefas distintas.** A mesma lacuna
> aparece em várias branches com redação diferente, e o agrupamento mecânico por palavras não
> as junta justamente por isso. O sinal está nos arquivos: **24 itens apontam para o mesmo
> `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx`**, 11 para
> `.github/workflows/ci.yml` e 10 para `.github/workflows/types-sync.yml`. Quem for planejar
> trabalho a partir desta lista deve agrupar por arquivo antes de contar.

Vereditos do ledger derrubados pela auditoria: **31**. 
Alegações refutadas pelo revisor adversarial: **153**. 
Itens confirmados: **226** (226 após deduplicar por branch e título).

`obs-wtw0p5nzz.json` é uma passada independente sobre as MESMAS 92 branches OBSOLETA dos
quatro lotes `obs-lote*`. A redundância foi acidental e ficou registrada de propósito: as duas
passadas concordam no essencial e divergem na margem, o que mede a estabilidade do método.

## Itens confirmados, por bloqueio

| bloqueio | itens | quem resolve |
|---|---|---|
| `nenhum` | 151 | o agente executa |
| `ci_workflow` | 58 | CI/workflow — chama o dono |
| `migration_producao` | 10 | migration em produção — chama o dono |
| `decisao_dono` | 7 | decisão do dono |

| valor | itens |   | classe | itens |
|---|---|---|---|---|
| alto | 26 |  | teste | 77 |
| medio | 99 |  | ci | 57 |
| baixo | 101 |  | front | 43 |
|  |  |  | script | 25 |
|  |  |  | docs | 11 |
|  |  |  | sql | 9 |
|  |  |  | edge | 4 |

## Itens de valor alto sem bloqueio

| o que falta | arquivos | prova na main | branch de origem |
|---|---|---|---|
| Botao de desligar a IA do Copiloto nao desliga as 7 funcoes que cobram | `supabase/functions/_shared/ai-feature-flags.ts`, `supabase/functions/_shared/__tests__/ai-feature-flags.test.ts` | ai-feature-flags.ts:59-78 o mapa AI_CAPABILITY_BY_FUNCTION termina em "copilot-live" (:77) e nao lista nenhuma das 7 edges; :240-241 key===null => gat | `claude__feat-copiloto-edges-261101-1330` |
| Analise de foto e figurinha do cliente nao funciona: o modelo nao abre a imagem | `supabase/functions/ai-multimodal-analysis/index.ts`, `supabase/functions/_shared/ai-image-input.ts` | ai-multimodal-analysis/index.ts:67-68 manda image_url:{url:imageUrl} cru de bucket privado; helper toInlineImage existe (ai-image-input.ts:308) e so c | `claude__feat-copiloto-edges-261101-1330` |
| Queda de conexao com o banco passa como "tudo ok" na checagem automatica | `scripts/db-audit/check-migration-drift.mjs` | scripts/db-audit/check-migration-drift.mjs:916 compare() ainda retorna 4 campos; grep de return 3/pendingOnly/pendingApply/--json = 0; unicos returns  | `claude__fix-ga-fase1-lote-banco-261020-2200` |
| Aviso de atualizacao de banco pendente confunde-se com erro de infraestrutura no relatorio do CI | `scripts/db-audit/lote-pendente.mjs` | scripts/db-audit/lote-pendente.mjs:61 ainda 'else if (rc === 2)'; :49 ainda passa a flag morta '--classificar'; docstring :9-14 descreve exit 2 como a | `claude__fix-ga-fase1-lote-banco-261020-2200` |
| Guarda do banco acusa erro falso quando a migration espera o apply do dia | `scripts/db-audit/check-migration-drift.mjs`, `scripts/db-audit/lote-pendente.mjs` | check-migration-drift.mjs:938 main() nao le process.argv (0 hits de 'classificar'); :642-647 arquivo sem registro vai para errors -> :988 return 1; lo | `claude__w21-classificar-migration-drift` |
| Dois novos casos de excecao do guarda ficariam sem classificacao e passariam como limpos | `scripts/db-audit/check-migration-drift.mjs` | check-migration-drift.mjs: continue em :726, :750, :772, :789, :824 (5 ramos de excecao na main; a branch W21 cobria so 3) | `claude__w21-classificar-migration-drift` |
| Falha de conexao com o banco e reportada como 'apply aguardado', escondendo problema real | `scripts/db-audit/check-migration-drift.mjs`, `scripts/db-audit/lote-pendente.mjs` | check-migration-drift.mjs:942 e :965 retornam 2 em falha de leitura/consulta; lote-pendente.mjs:61-62 mapeia rc===2 para 'apply aguardado' (neutro) | `claude__w21-classificar-migration-drift` |
| Importar/exportar templates de mensagem em planilha (CSV/JSON) não existe | `src/components/talkx/talkxTemplateFile.ts` | arquivo ausente na main (ls src/components/talkx/talkxTemplateFile.ts: No such file); grep -rn 'talkxTemplateFile/parseTemplateFile' src = 0 ocorrênci | `claude_juca__practical-rubin-8xnw0u` |
| Tela de importação com prévia e aviso de nome repetido não existe | `src/components/talkx/TalkXTemplateImportDialog.tsx` | arquivo ausente na main (ls: No such file); grep -rn 'TalkXTemplateImportDialog' src = 0 ocorrências | `claude_juca__practical-rubin-8xnw0u` |
| Lista de templates não tem botões de baixar nem de importar | `src/components/talkx/TalkXTemplates.tsx`, `src/components/talkx/__tests__/TalkXTemplatesRail.test.tsx` | TalkXTemplates.tsx:313 rightSlot só tem 'Novo Template'; grep 'Download/Upload/canDownload/Export/Importar' no arquivo = só essa linha | `claude_juca__practical-rubin-8xnw0u` |
| Na lista de campanhas não dá para pausar/cancelar/excluir várias de uma vez | `src/components/talkx/TalkXOverview.tsx`, `src/components/talkx/kit/constants.ts` | TalkXOverview.tsx:92,349 mantém seleção mas nunca usa TalkXBulkBar (grep: só kit/table.tsx:76, TalkXSegments.tsx:475, TalkXSuppression.tsx:598); :466  | `claude_juca__practical-rubin-8xnw0u` |
| Acesso negado pelo banco no Talk X mostra erro genérico, não 'sem permissão' | `src/components/talkx/kit/states.tsx` | kit/states.tsx:355-357: if (query.isError) return <TalkXErrorState .../> — não olha error.code; grep 42501 em src/components/talkx = só testes/comentá | `claude_juca__practical-rubin-8xnw0u` |

A lista completa dos itens confirmados, com prova de cada um, está em `itens-confirmados.json`.

**Correção aplicada antes de publicar.** A primeira versão deste consolidado trazia 146 pareceres
do revisor cortados em exatamente 160 caracteres, vários no meio da conclusão — corte do
pós-processamento (`.slice(0, 160)` e `.slice(0, 200)` nos scripts das frentes), não do modelo.
O texto íntegro estava nos journals das execuções e foi restaurado: 144 pareceres, 46 que estavam
vazios, 20 provas e 11 evidências. Restam 9 campos no tamanho original porque o journal não tinha
versão mais longa — esses são o que o agente realmente escreveu.

## Itens desta lista já resgatados em 15/11

| item | onde entrou |
|---|---|
| Contrato de runtime lia SQL de fora do repositório (GA18) | PR #3150, mergeada |
| Análise de foto do cliente: o modelo recebia link de bucket privado | PR #3151, mergeada |
| Guarda de drift acusa erro falso quando a migration espera o apply | PR #3143, **aberta — mexe em CI, decisão do dono** |
| Botão de desligar a IA não alcança as 7 edges que cobram | PR #3146, **aberta — decisão do dono** |

A PR #3151 trouxe junto um achado que não estava no ledger e que os revisores automáticos
levantaram: ao embutir a imagem, `estimateAiTokens` contava o base64 como texto e qualquer foto
acima de ~590 KB estourava o teto de 200.000 tokens, devolvendo 429 sem chegar ao modelo.

## O que esta auditoria NÃO cobre

As 329 entradas são as branches e PRs **remotas**. O clone local na máquina do dono tem
4.377 branches, das quais 4.240 têm commit que nenhuma ref remota alcança, além de 596
commits pendurados (sem branch), 14 stashes e 131 worktrees. Esse inventário local é um
trabalho separado e está em andamento.

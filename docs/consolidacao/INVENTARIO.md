# Inventário das peças do Zapp Web V2

Leitura iniciada em **28/10/2026**. O baseline de testes foi medido na `main` `653f3d3304eec342a4360fd14d1b0c1d45d1f202`; as comparações mais recentes dos locais A, C, D/E e GitHub usam `7cacbe2f39845ca600c2dd18a4d30f70f03c217e`. A pasta B foi comparada com a primeira revisão. A `main` pode avançar novamente: **recomparar cada candidato com a `main` imediatamente antes de implementar ou arquivar**.

As tabelas abaixo dão o mapa por local. Os índices citados contêm uma linha por arquivo, branch, commit, PR ou issue observada, com uma das cinco decisões propostas. Arquivos gerados, dependências e objetos internos Git da pasta B estão contados por categoria no relatório B; não são código a integrar. Uma decisão proposta por nome/hash é **triagem**, não prova de que a funcionalidade está pronta ou autorização para copiar código. `DESCARTAR` significa excluir da integração V2; nenhum arquivo de origem foi apagado ou movido nesta fase.

## A — clone principal

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 7.832 arquivos rastreados pela revisão medida da `main` | Código/documentos | `projetos/Zapp_Web_V2` | Sim | Não | Todas | JÁ ESTÁ NA MAIN | Baixa |
| Branch `dia/2026-10-23`: 3 commits próprios e 1 merge | Testes/contatos | Mesmo clone; branch também no remoto | Não por patch-id | Sim; 143 caminhos no diff da branch | Contatos e mocks de Framer Motion | INTEGRAR após revisão por funcionalidade | Alta |
| 215 entradas no estado local: 195 de bytes iguais à main, 16 de bytes diferentes e 4 metadados/configurações locais | Arquivos de trabalho | Mesmo clone, índice e working tree | Parcial | Sim para 16 | Auth, gamificação, dashboard, Edge Functions e scripts | TERMINAR os 16; demais conforme índice | Alta |
| 4.266 branches locais e 13 stashes | Referências/trabalho guardado | `.git` do clone | 21 branches ancestrais da main; as demais não foram provadas por conteúdo | Potencial | Diversas | TERMINAR verificação antes de limpeza | Alta |

Detalhes: [relatório A](_levantamento/A.md), [arquivos da main](_levantamento/A-main.tsv), [alterações locais](_levantamento/A-pendentes.tsv), [branches](_levantamento/A-branches.tsv), [stashes](_levantamento/A-stashes.tsv). A classificação de branches de 24/10 guardada em F é pista histórica, não confirmação atual.

## B — arquivos locais a processar (prioridade máxima)

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 178.642 arquivos úteis de 584.817 arquivos regulares encontrados | Código, SQL, docs, designs e dados | `projetos/ZAPP WEB V2 - LOCAL - ARQUIVOS A PROCESSAR` | 141.963 têm SHA-256 igual à main medida | 27.033 têm hash diferente | Diversas | 141.962 JÁ ESTÁ NA MAIN; 34.128 DESCARTAR; 1.021 INTEGRAR; 1.531 TERMINAR | Alta para candidatos |
| 406.617 entradas excluídas da triagem útil, inclusive links e metadados | Dependências, builds, caches, grafo gerado e objetos Git | B | Não se aplica | Não há código de produto proposto | Nenhuma | DESCARTAR da integração; preservar origem | Baixa |
| 9.646 caminhos protegidos dentro do índice | Potenciais credenciais ou nomes sensíveis | B, inclusive `sensiveis/` | Não aferido | Conteúdo não lido | Configuração/segurança | Não integrar; índice separa DESCARTAR e TERMINAR para revisão segura; dono confere rotação se houver credencial ativa | Alta |
| 26 marcadores Git, 23 com destino ausente | Worktrees/clones copiados | B | Indeterminado | Sim em alguns | Diversas | TERMINAR análise dos deltas sem restaurar ponteiros nesta fase | Alta |
| Três documentos `zapp-web-v3*.md` | Planejamento de outro produto | Raiz de B | Não se aplica | Não para V2 | V3 | DESCARTAR da integração V2 | Baixa |

O [relatório B](_levantamento/B.md) explica exclusões de `node_modules`, builds, caches e objetos Git. Índices: [todos os arquivos úteis](_levantamento/B-arquivos.tsv), [406.617 artefatos excluídos, comprimidos](_levantamento/B-excluidos.tsv.gz), [2.552 candidatos](_levantamento/B-candidatos.tsv), [deltas de worktrees](_levantamento/B-deltas-worktrees.tsv), [marcadores Git](_levantamento/B-repositorios.tsv) e [contagens](_levantamento/B-resumo-tecnico.tsv). Os 1.021 `INTEGRAR` são **candidaturas automáticas**, ainda sem prova de valor; cada uma exige comparação funcional antes do plano de PR.

## C — `zapp-worktrees`

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| `preview`, HEAD destacado `45338438ba` | Worktree de prévia com vínculo Git quebrado | `zapp-worktrees/preview` | Parte; há 2.525 caminhos diferentes da main atual | Sim, 1.548 commits exclusivos por ancestralidade | Contatos, tarefas e várias áreas históricas | TERMINAR triagem; INTEGRAR apenas a correção de datas já identificada, se ainda ausente | Alta |
| Três alterações sem commit em `preview` | Código/testes | Mesmo local | A versão do HEAD corrige datas; working tree reverte a correção | Sim, regressivo | Filtro de período e teste de fuso | DESCARTAR da integração após preservar evidência | Alta |

O [relatório C](_levantamento/C.md) registra status, último commit e limitação do vínculo Git. Índices por item: [2.525 caminhos](_levantamento/C-diferencas.tsv), [1.548 commits](_levantamento/C-commits.tsv) e [157 documentos de planejamento](_levantamento/C-planejamento.tsv). Os diffs de uma cópia antiga não serão mesclados em bloco.

## D — `hermes-workspaces/Zapp_Web_V2`

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| `.base-tc` e materiais locais do integrador | Worktree/arquivos soltos | `hermes-workspaces/Zapp_Web_V2` | Parcial | Sim; há trabalho de dashboard e Evolution API incompleto | Dashboard/Evolution API | TERMINAR comparação e trabalho inacabado | Alta |

## E — demais workspaces Hermes do Zapp

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 13 worktrees V2 adicionais e 2 V3 identificados no conjunto D/E | Branches e cópias de trabalho | `.integra/`, `ga-fix/`, `ga-audit-261020/`, `Zapp_Web_V3/` | Parcial; comparação por caminho no índice | 16.008 diferenças no conjunto D/E, com repetição entre worktrees | Banco, inbox, plataforma, Talk X e CI | TERMINAR triagem V2; DESCARTAR V3 da integração V2 | Alta |
| 8.265 arquivos soltos selecionados no conjunto D/E | Documentos de fila, código e metadados | `hermes-workspaces/` | 8 hashes iguais à main; demais exigem análise | Sim em parte | Várias | Decisão por item no índice | Média |
| 12 entradas de alterações locais em dois worktrees | Trabalho sem commit | `.integra/fase2` e `.integra/lote-main` | Não comprovado | Sim | Conflitos e documentação | TERMINAR antes de qualquer limpeza | Alta |

Os totais D/E são compartilhados; **não somar as mesmas diferenças como funcionalidades distintas**. [Relatório D/E](_levantamento/DE.md), [estado por worktree](_levantamento/DE-repos.md), [arquivos diferentes](_levantamento/DE-arquivos.tsv), [commits](_levantamento/DE-commits.tsv) e [arquivos soltos](_levantamento/DE-soltos.tsv). Os arquivos com nomes potencialmente sensíveis estão marcados para exclusão da integração e sem hash publicado.

## F — backups (somente leitura)

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 277 arquivos, inclusive bundle Git de 1,12 GB, 211 objetos e handoffs | Backup/evidência | `backups/` | Não se aplica a arquivos de recuperação | Sim como histórico | Diversas | DESCARTAR da integração; preservar F | Baixa |
| Três patches preservados | Patch de código | `backups/zapp-web-v2-2026-10-24/patches/` | Parcial ou conflitante contra main atual | Sim | CI, contatos e tipos | TERMINAR revisão hunk a hunk | Alta |

[Relatório F/G](_levantamento/FG.md), [assuntos ainda citados nos documentos](_levantamento/FG-funcionalidades.md) e [277 itens de F](_levantamento/BACKUPS.tsv). O backup permanece intacto.

## G — auditorias (somente leitura)

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 838 arquivos de relatórios, logs, scripts e provas | Auditoria/evidência | `auditorias/` | 5 idênticos por SHA-256 | Sim como lista de problemas | Diversas | DESCARTAR da integração; usar como evidência | Média |
| `RealtimeInboxView.pagination.test.tsx` | Teste | `auditorias/r2-inb-004-etapa2/` | Não encontrado por nome/hash na main | Potencial | Paginação da inbox | TERMINAR verificação e teste | Média |

[Relatório F/G](_levantamento/FG.md), [assuntos ainda citados nos documentos](_levantamento/FG-funcionalidades.md) e [838 itens de G](_levantamento/AUDITORIAS.tsv). As auditorias de Sicoob são de outro produto. G permanece intacto.

## GitHub e funcionalidades registradas

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 164 PRs abertos | Revisões pendentes | GitHub | Não por definição, mas conteúdo pode ter entrado por outro squash | Sim | Diversas | Decisão individual em `GITHUB.json`; nenhum PR foi considerado verde automaticamente | Alta |
| 221 branches remotas, incluindo `main` | Referências | GitHub | Só `main` é ancestral; conteúdo das demais precisa comparação | Potencial | Diversas | Decisão individual em `GITHUB.json` | Alta |
| 25 issues abertas | Demandas | GitHub | Não se aplica | Potencial | Diversas | Decisão individual em `GITHUB.json` | Média |
| 55 views efetivas em `FEATURE_REGISTRY.md` | Funcionalidades/telas | `main` | Sim como código/rota; prontidão não comprovada | 10 estão classificadas Partial | Diversas | TERMINAR verificação funcional e testes de cada view | Alta |

[Relatório GitHub](_levantamento/GITHUB.md), [dados completos de PRs/branches/issues](_levantamento/GITHUB.json) e [55 views](_levantamento/FEATURES.tsv). O resumo de `FEATURE_REGISTRY.md` diz 56 views (44 Full, 12 Partial), mas a tabela tem 55 (45 Full, 10 Partial). A guarda de documentação passou 9 testes e não confere esse resumo; corrigir no fechamento da documentação depois de verificar as rotas. `ESTADO.md` lista 84 Edge Functions, das quais 20 sem chamador no repositório; isso não basta para declarar que estão sem uso externo.

## Decisões e limites desta fase

1. Preservar as alterações já existentes em A e os 12 arquivos locais dos worktrees Hermes antes de integrar qualquer coisa. Não copiar arquivos protegidos, `.env*`, tokens ou credenciais para um PR.
2. A triagem por SHA identifica duplicatas exatas. Diferença de SHA, commit exclusivo ou PR aberto **não** provam que o código é melhor ou deve ser integrado. A Fase 2 deve transformar apenas grupos funcionalmente confirmados em PRs pequenos.
3. A `main` mudou durante a coleta. Cada grupo da Fase 2/3 precisa de nova comparação com o SHA atual e baseline de checks correspondente antes do PR.
4. F e G foram somente lidos. B, C, D e E não tiveram arquivos movidos nesta fase. A prévia `preview` e alguns workspaces Hermes podem ser usados por serviços locais; sua limpeza exige verificação desses serviços.

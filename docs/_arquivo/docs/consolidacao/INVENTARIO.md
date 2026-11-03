# Inventário das peças do Zapp Web V2

Levantamento iniciado em **28/10/2026** e revalidado parcialmente em **29/10/2026, 20:03 UTC**. O baseline de testes continua sendo a medição histórica na `main` `653f3d3304eec342a4360fd14d1b0c1d45d1f202`; a `main` atual é `a1340faa6daa6cda1f71537f10e88205a2568fff`. As tabelas abaixo distinguem a coleta histórica da atualização pontual. B ainda precisa de reindexação integral, e as comparações por origem não substituem a conferência funcional de cada candidato. **Recomparar cada item com a `main` imediatamente antes de implementar ou arquivar.**

As tabelas abaixo dão o mapa por local. Os índices citados contêm uma linha por arquivo, branch, commit, PR ou issue observada, com uma das cinco decisões propostas. Os índices detalhados de B ainda representam a raiz e o conteúdo da coleta de 28/10; não comprovam cobertura dos 181 itens hoje no topo da nova raiz. Arquivos gerados, dependências e objetos internos Git da pasta B estão contados por categoria no relatório histórico B; não são código a integrar. Uma decisão proposta por nome/hash é **triagem**, não prova de que a funcionalidade está pronta ou autorização para copiar código. `DESCARTAR` significa excluir da integração V2; nenhum arquivo de origem foi apagado ou movido nesta fase.

## A — clone principal

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| Estado em 29/10: branch `dia/2026-10-23`, HEAD `3024ca92`; `origin/main` consultada em `a1340faa`; 67 commits atrás e 4 à frente | Clone Git | `/home/joaquim_ataides/projetos/Zapp_Web_V2` | Parcial | Sim; branch não equivale à main | Várias | Preservar e comparar por grupo | Alta |
| 227 entradas em `git status --porcelain` na consulta de 29/10 | Arquivos de trabalho | Mesmo clone, índice e working tree | Parcial; não recontado por hash nesta rodada | Sim | Várias | Preservar; confirmar cada item no índice antes de decidir | Alta |
| 4.266 branches locais e 13 stashes | Referências/trabalho guardado | `.git` do clone | 21 branches ancestrais da main; as demais não foram provadas por conteúdo | Potencial | Diversas | TERMINAR verificação antes de limpeza | Alta |

Detalhes históricos: [relatório A](_levantamento/A.md), [arquivos da main](_levantamento/A-main.tsv), [alterações locais](_levantamento/A-pendentes.tsv), [branches](_levantamento/A-branches.tsv), [stashes](_levantamento/A-stashes.tsv). A contagem de status mudou de 215 para 227 entre as leituras; os TSVs ainda usam a base `7cacbe2` e precisam de atualização. A classificação de branches de 24/10 guardada em F é pista histórica, não confirmação atual.

## B — arquivos locais a processar (prioridade máxima)

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 181 itens no topo em 29/10: 31 diretórios e 150 arquivos | Pastas reorganizadas | `/home/joaquim_ataides/projetos/_a-processar/ZAPP_WEB_V2_LOCAL` | Inventário antigo usa outra raiz | Comparação item a item pendente | Diversas | Reindexar antes de reutilizar decisões antigas | Alta |
| 7.646 arquivos no clone Git aninhado, fora `.git`, dependências e builds; branch `claude/feat-c098-restore-tests-261027-1433`, HEAD `ba20b9d2`, 6 à frente/55 atrás da main `a1340faa` | Clone Git local | `.../ZAPP_WEB_V2_LOCAL/Zapp_Web_V2` | Parcial; 2 testes modificados são idênticos à main; 1 script não rastreado difere | `resolve-rollback-ref.mjs`, SHA256 `948849028d5fcd16bdc09a6e79dde12ba62ce360e233f85838baba6f73b43d65`, idêntico ao arquivo da PR #2128, ainda `DIRTY` | Deploy/rollback | Preservar; revisar contrato e PR antes de propor integração | Alta |
| 178.642 arquivos úteis de 584.817 arquivos regulares encontrados | Código, SQL, docs, designs e dados | Raiz antiga registrada em 28/10 | 141.963 tinham SHA-256 igual à main medida | 27.033 tinham hash diferente naquela coleta | Diversas | Contagens e decisões são históricas; não projetar na raiz atual | Alta para candidatos |
| 406.617 entradas excluídas da triagem útil, inclusive links e metadados | Dependências, builds, caches, grafo gerado e objetos Git | B | Não se aplica | Não há código de produto proposto | Nenhuma | DESCARTAR da integração; preservar origem | Baixa |
| 9.646 caminhos protegidos dentro do índice | Potenciais credenciais ou nomes sensíveis | B, inclusive `sensiveis/` | Não aferido | Conteúdo não lido | Configuração/segurança | Não integrar; índice separa DESCARTAR e TERMINAR para revisão segura; dono confere rotação se houver credencial ativa | Alta |
| 26 marcadores Git, 23 com destino ausente | Worktrees/clones copiados | B | Indeterminado | Sim em alguns | Diversas | TERMINAR análise dos deltas sem restaurar ponteiros nesta fase | Alta |
| Três documentos `zapp-web-v3*.md` | Planejamento de outro produto | Raiz de B | Não se aplica | Não para V2 | V3 | DESCARTAR da integração V2 | Baixa |

O [relatório B](_levantamento/B.md) explica exclusões da coleta antiga de dependências, builds, caches e objetos Git. Índices: [todos os arquivos úteis](_levantamento/B-arquivos.tsv), [artefatos excluídos](_levantamento/B-excluidos.tsv.gz), [candidatos](_levantamento/B-candidatos.tsv), [deltas de worktrees](_levantamento/B-deltas-worktrees.tsv), [marcadores Git](_levantamento/B-repositorios.tsv) e [contagens](_levantamento/B-resumo-tecnico.tsv). Esses índices não cobrem comprovadamente a raiz reorganizada. Os candidatos `INTEGRAR` antigos são triagem automática, não prova de valor.

## C — `zapp-worktrees`

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| 30 worktrees de origem consultáveis em 29/10, excluído o worktree desta auditoria | Worktrees | `/home/joaquim_ataides/zapp-worktrees` | 29 limpos; `preview` é exceção | Não se aplica | Várias | Atualizar lista em C.md; não limpar worktrees | Alta |
| `preview`, HEAD destacado `45338438ba` | Worktree de prévia com vínculo `.git` quebrado (`preview1` ausente; registro `preview` encontrado) | `zapp-worktrees/preview` | Dados históricos de 2.525 caminhos/1.548 commits usam base antiga | Sim | Contatos, tarefas e várias áreas históricas | Preservar e reavaliar por funcionalidade | Alta |
| Três alterações rastreadas sem commit em `preview`; nenhum untracked | Código/testes | Mesmo local | A versão do HEAD corrige datas; working tree reverte a correção | Sim, regressivo segundo comparação anterior | Filtro de período e teste de fuso | Manter fora de integração e preservar evidência | Alta |

O [relatório C](_levantamento/C.md) registra status, último commit e limitação do vínculo Git. Índices por item: [2.525 caminhos](_levantamento/C-diferencas.tsv), [1.548 commits](_levantamento/C-commits.tsv) e [157 documentos de planejamento](_levantamento/C-planejamento.tsv). Os diffs de uma cópia antiga não serão mesclados em bloco.

## D — `hermes-workspaces/Zapp_Web_V2`

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| `.base-tc` destacado em `3024ca92` e arquivos de handoff | Worktree/arquivos soltos | `hermes-workspaces/Zapp_Web_V2` | Diretório pai não é checkout Git; `.base-tc` é o worktree identificável, 4 à frente/67 atrás | Sim | Dashboard/Evolution API | Preservar e reconciliar por arquivo; sem importação em bloco | Alta |

## E — demais workspaces Hermes do Zapp

| Item | Tipo | Onde está | Existe na main? | Diff relevante? | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|---|---|---|
| Worktrees Git D/E reconsultados em 29/10 | Branches e cópias de trabalho | `.integra/`, `.base-tc`, `ga-fix/`, `ga-audit-261020/` | Bases locais variam; vários refs 185 commits atrás e `lote-main` 107 atrás/1 à frente | Não recontado em conteúdo | Banco, inbox, plataforma, Talk X e CI | Atualizar lista e comparar funcionalmente; ancestralidade não decide integração | Alta |
| 8.265 arquivos soltos selecionados no conjunto D/E | Documentos de fila, código e metadados | `hermes-workspaces/` | 8 hashes iguais à main; demais exigem análise | Sim em parte | Várias | Decisão por item no índice | Média |
| `.integra/fase2`: 6 staged e 7 unstaged; `.integra/lote-main`: working tree limpo, 1 commit à frente/107 atrás | Trabalho e diferenças versionadas | D/E | Cinco caminhos de hooks/tipos diferem da main apesar de lote-main estar limpo; manifesto alterado e `.merge_file_*` staged em fase2 | Sim | Conflitos, deploy, tipos e hooks | Preservar; “12 alterações locais” é retrato antigo | Alta |

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
| 156 PRs abertas na consulta de 29/10 20:03 UTC | Revisões pendentes | GitHub | Não por definição, conteúdo pode entrar por squash em outra PR | Sim | Diversas | Atualizar `GITHUB.json` antes de usar como lista operacional | Alta |
| 222 branches remotas, incluindo `main`, na consulta de 29/10 | Referências | GitHub | Só `main` é ancestral; conteúdo das demais precisa comparação | Potencial | Diversas | Atualizar `GITHUB.json` antes de limpeza | Alta |
| 25 issues abertas | Demandas | GitHub | Não se aplica | Potencial | Diversas | Decisão individual em `GITHUB.json` | Média |
| 55 views efetivas em `FEATURE_REGISTRY.md` | Funcionalidades/telas | `main` | Sim como código/rota; prontidão não comprovada | 10 estão classificadas Partial | Diversas | TERMINAR verificação funcional e testes de cada view | Alta |

[Relatório GitHub](_levantamento/GITHUB.md), [dados completos de PRs/branches/issues](_levantamento/GITHUB.json) e [55 views](_levantamento/FEATURES.tsv). O resumo de `FEATURE_REGISTRY.md` diz 56 views (44 Full, 12 Partial), mas a tabela tem 55 (45 Full, 10 Partial). A guarda de documentação passou 9 testes e não confere esse resumo; corrigir no fechamento da documentação depois de verificar as rotas. `ESTADO.md` lista 84 Edge Functions, das quais 20 sem chamador no repositório; isso não basta para declarar que estão sem uso externo.

## Decisões e limites desta fase

1. Preservar as alterações já existentes em A, o clone e itens locais de B, e as alterações staged/unstaged de D/E antes de integrar qualquer coisa. Não copiar arquivos protegidos, `.env*`, tokens ou credenciais para um PR.
2. A triagem por SHA identifica duplicatas exatas. Diferença de SHA, commit exclusivo ou PR aberto **não** provam que o código é melhor ou deve ser integrado. A Fase 2 deve transformar apenas grupos funcionalmente confirmados em PRs pequenos.
3. A `main` mudou durante a coleta. Cada grupo da Fase 2/3 precisa de nova comparação com o SHA atual e baseline de checks correspondente antes do PR.
4. F e G foram somente lidos. B, C, D e E não tiveram arquivos movidos nesta fase. A prévia `preview` e alguns workspaces Hermes podem ser usados por serviços locais; sua limpeza exige verificação desses serviços.

# MISSÃO DAS PRs — adm01-debug/Zapp_Web_V2

> Salvo em: 2026-10-23. Ler ANTES de qualquer escrita no GitHub. Prevalece sobre qualquer resumo de contexto.

## Objetivo

Agir como dev sênior com autonomia total. Analisar TODAS as PRs abertas respondendo:
1. Ainda é válida?
2. Traz regressão?
3. Já está implementada no main?
4. A regra de negócio está correta?
5. Está completa?

Depois, LEVAR CADA PR AO DESFECHO: mergear prontas; completar/corrigir inacabadas e mergear; fechar obsoletas. Nenhuma PR fica parada sem motivo registrado.

## Autonomia

- Decidir sozinho tudo que antes seria "decisão humana": conflitos, ambiguidade de regra, qual PR de cluster sobrevive, o que resgatar, o que fechar.
- Ambiguidade de regra de negócio: hierarquia → comportamento do main em produção > migrations/constraints/policies > testes > tipos/enums > UI > docs > descrição da PR. Empate = opção conservadora (não mudar comportamento vigente).
- Nunca parar para perguntar. Só envolver Joaquim nos BLOQUEIOS listados abaixo, acumulados no relatório final.

## Escrita Permitida no GitHub (só via MCP "GITHUB - MCP - FOREVER")

a) Merge de PR aprovada, pelo método padrão do repo (squash-merge).
b) PR SUCESSORA para completar ou corrigir PR inacabada:
   - branch: `claude/fix-pr<N>-<slug>-<AAMMDD-HHMM>` a partir do main atual
   - trazer commits da PR original (cherry-pick ou merge do head) + só o que falta
   - PR nova: título "Completa #N: <o que muda>", corpo com link original, o que faltava, o que corrigiu, o que foi verificado
   - a sucessora passa pelos mesmos critérios de merge
c) Comentar e fechar a PR original quando substituída por sucessora JÁ mergeada, é duplicada, já implementada no main ou obsoleta. Comentário cita evidência: SHA, PR ou arquivo:linha.
d) Apagar SOMENTE branches criadas por mim, depois do merge.

## PROIBIDO

- Escrever na branch de outra PR: push, rebase, "update branch", commit de sugestão. Branch alheia = somente leitura.
- Push direto no main; force-push (exceto --force-with-lease na própria branch); editar título/descrição de PR alheia; labels; deletar branch alheia; mudar configurações, branch protection ou segredos; burlar checks obrigatórios; tocar em .github/workflows.
- SINGU = READ-ONLY e fora do escopo. PR que escreve nele não é mergeada nem completada: é BLOQUEIO.
- Experimentos só em git worktree local.

## EVIDÊNCIA

Toda afirmação traz arquivo:linha, SHA, número de PR ou saída de comando. Sem evidência = NÃO VERIFICADO. Item NÃO VERIFICADO nunca é mergeado.

## Método

### 0) Preparação e retomada
- Se analise-prs/progresso.json existir: retomar dele, pulando PRs concluídas cujo head SHA não mudou.
- Fixar SHA do main.
- Gerar linha de base do main em analise-prs/baseline/: typecheck, testes que falham listados POR NOME, lint, build.
- Montar analise-prs/regras-de-negocio.md.
- Salvar progresso.json após cada PR e após cada escrita no GitHub.

### 1) Inventário
Autor/bot, draft, base, descrição, comentários, commits, arquivos, mergeable, checks, head SHA.

### 2) Clusters
Duplicadas, cadeias (PR sobre PR), bots. Definir a sobrevivente de cada cluster.

### 3) Por PR
- Intenção
- Leitura de 100% do diff
- Merge de teste local e leitura do diff REAL
- VALIDADE
- JÁ IMPLEMENTADA: git cherry, patch-id, busca de símbolos/rotas/tabelas/textos, implementação equivalente, commits posteriores, cluster
- REGRESSÃO: código recente revertido/apagado, chamadores, defaults/permissões, contratos com backend, segredos, erros novos vs. linha de base, testes removidos/skip/enfraquecidos, dependências
- REGRA DE NEGÓCIO: coincide, estende ou contradiz a vigente? Checar bordas, permissões, tenant, concorrência
- COMPLETUDE: o que falta (TODO, tela sem estado de erro, chamada sem backend, migration sem uso, teste ausente)
- Custo

### VEREDITO (um por PR)
- MERGEAR
- COMPLETAR → sucessora com o que falta
- CORRIGIR → sucessora consertando regressão, conflito ou regra errada
- RESGATAR PARCIAL → sucessora só com a parte boa
- FECHAR → comentário com evidência
- BLOQUEADA → apenas pelos motivos da lista de BLOQUEIOS

### 4) Plano de execução
Ordenado para minimizar conflitos (cadeias de base para topo; clusters primeiro pela sobrevivente).

## Critério de Merge (todos obrigatórios)

Válida; não implementada; sem conflito; zero erro novo vs. linha de base; zero código recente revertido; regra de negócio válida; completa; confiança alta.

Merge no main = produção (app, edge functions, migrations). Portanto:
- Migration: só se aditiva e não destrutiva (sem DROP, RENAME, ALTER TYPE, DELETE/UPDATE em massa) e idempotente.
- Edge function: só com testes passando e sem afrouxar autenticação.
- RLS/permissões: só se testes no Postgres temporário provarem que nenhum acesso foi ampliado.

## BLOQUEIOS (únicos motivos para não levar ao desfecho)

- Migration destrutiva
- Ampliação de acesso/RLS
- Mudança em segredos, workflows, infra ou configuração do repo
- Escrita no SINGU
- Regra de negócio que contradiz a vigente E altera preço, fiscal (CFOP/NF-e/ICMS) ou dinheiro do cliente
- Exclusão de dado em produção

Para cada bloqueio: o que a PR faz, o risco, recomendação, o que faria se aprovado.

## EXECUÇÃO (só depois de analisar TODAS)

Uma PR por vez, na ordem do plano. Antes de cada escrita:
- Confirmar que a PR continua aberta e head SHA é o analisado (mudou = reanalisar)
- Refazer merge de teste contra o main atual

Depois de cada merge:
- Esperar CI do main e comparar com linha de base
- Confirmar deploy do front subiu
- Se havia migration ou edge function: confirmar em produção via MCP Supabase (só leitura)
- Qualquer falha nova = PARAR todas as escritas no GitHub, registrar SHA + PR no relatório

## Entregáveis em analise-prs/

- baseline/
- regras-de-negocio.md
- progresso.json
- prs.json
- prs.csv
- dossies/PR-<N>.md (incluindo decisões tomadas e fonte usada)
- RELATORIO_PRS.md

## META CUMPRIDA quando o chat mostrar

1. total PRs abertas no início = total analisado; contagem por veredito
2. cada PR mergeada com SHA, CI do main e produção sem falha nova vs. linha de base
3. sucessoras abertas e mergeadas; originais fechadas com link do comentário
4. PRs obsoletas/duplicadas/já implementadas fechadas com comentário de evidência
5. PRs ainda abertas = somente BLOQUEADAS, cada uma com motivo e recomendação
6. lista de todas as escritas feitas no GitHub, todas dentro do permitido
7. worktrees removidos
8. caminhos de analise-prs/

## Limite: 80 turnos

Se atingir: salvar progresso.json, gerar RELATORIO_PRS.md parcial, dizer exatamente em que PR e etapa parou.

## Estado inicial coletado (2026-10-23)

- main SHA: `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`
- Total PRs abertas: **137** (página 1: 100, página 2: 37)
- Branch protection required checks: `🏗️ Build`, `🔎 TypeCheck`

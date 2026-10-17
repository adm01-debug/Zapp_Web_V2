# Plano de Sincronizacao Total - Local x GitHub x Banco Canonico (300 etapas)

> Para o agente executor: execute fase a fase, marque o checkbox, anexe prova (comando + saida). Principio: qualidade + velocidade pelo caminho mais rapido e economico - script antes de leitura manual, relatorio por excecao.
> Atos que exigem ordem nominal do Joaquim: merge de PR, deploy, migration em producao, delecao de branch/worktree/tag, custo novo. Sem ordem: prepare, prove e pare no gate.

- Data da auditoria: 2026-10-17 - Repo: adm01-debug/Zapp_Web_V2
- Executor esperado: agente senior/complexo, com revisor independente na F30. Este documento planeja; nao executa a sincronizacao.

## Diagnostico medido (2026-10-17)

| Ponta | Medido | Veredito |
|---|---|---|
| ~/projetos main | limpa, 0 ahead / 17 behind origin/main, HEAD 025d0258dc | fast-forward puro resolve |
| dia/2026-10-17 (HEAD dos workspaces) | 1546 ahead / 79 behind origin/main; merge-base 7a15852791 (#1888) | fork velho, nao publicar por merge cego |
| main local x dia | 62 / 1546; dia/2026-10-15..17 no mesmo OID d723a90107 | dia parou de integrar |
| Arquivos tracked | HEAD 6.660 vs origin 7.526; comuns 6.621; 952 blobs diferentes; 905 origin-only; 39 HEAD-only | divergencia nas duas direcoes |
| Migrations | HEAD ~875 vs origin 1.071; 197 origin-only vs dia; colisao de prefixo 20261016220000 na origin | dia atras do schema do GitHub |
| Artefatos DB | schema-manifest HEAD 2026-10-09 vs origin 2026-10-16; routine_grants 740 vs 738; types.ts 12.749 vs ~64k linhas | artefatos do dia velhos |
| Edge | HEAD 81 funcoes (manifest) vs origin 84; config.toml 18 vs 19 secoes | 3 funcoes so no GitHub |
| Testes DB | supabase/tests 22 vs 91; scripts/db-audit 247 vs 350 | ferramental do dia incompleto |
| Refs locais | 4.131 branches locais (4.052 v2/*), 107 remotas, 331 tags, 8 stashes; 18 ancestor-merged em origin/main | classificar por script, nao a mao |
| Worktrees | 3.329 registrados; 3.419 diretorios em hermes-workspaces; 29 em ~/zapp-worktrees | limpar so apos evidencia |
| GitHub | 28 PRs abertas (25 draft; ready #1983, #1930, #1922); main a9b4d6c com CI/CD, E2E logado e DB Guard em FAILURE | GitHub tambem nao esta verde |
| Banco canonico | identidade em scripts/db-audit/database-identity.json (PG17/public); sem prova ao vivo nesta auditoria (sem acesso RO nesta sessao) | F10/F11 sao gates bloqueantes |

Conclusao: NAO esta sincronizado em nenhuma das 3 direcoes. GitHub esta a frente do dia em schema/testes/artefatos; o dia tem 1.546 commits nao publicados (classificar - muito pode ser equivalente via squash); banco so o ledger ao vivo diz o aplicado. Sem merge cego, sem publicar em massa, sem tocar producao sem ordem.

## Regras inegociaveis

1. Producao (merge, deploy, migration aplicada, delecao remota) so com ordem nominal do Joaquim, registrada.
2. Destrutivo so com prova, lista e restauracao possivel (CSV com OID por item).
3. Banco canonico manda no schema; origin/main manda no codigo; branch do dia e rascunho, nao fonte.
4. Migration aplicada nunca e editada: correcao e migration nova, com rollback executavel provado no banco local.
5. Guarda, CI e manifesto nunca sao afrouxados para fazer passar.
6. E2E e preview so com banco local e usuario sintetico. Segredo e dado real nunca em Git, log ou PR.


## F00 Governanca, congelamento e prova de identidade
- [ ] **Etapa 001** - Ler este plano, CLAUDE.md, AGENTS.md, CONTRIBUTING.md e ESTADO.md da origin/main antes de escrever qualquer arquivo. Prova: resumo de 5 linhas no anexo da fase.
- [ ] **Etapa 002** - Assumir papel executor: nao redesenhar nem ampliar escopo; desvio vai para ANEXO_SINCRONIZACAO_DESVIOS.md. Prova: anexo criado.
- [ ] **Etapa 003** - Congelar abertura de novas branches v2/* e anunciar a janela de sincronizacao no cartao. Prova: comentario no cartao.
- [ ] **Etapa 004** - Provar identidade das 3 pontas: rev-parse de HEAD, dia, main e origin/main; gh repo view; fingerprint do banco sem imprimir segredo. Prova: hashes anexados.
- [ ] **Etapa 005** - Criar branch de trabalho somente via hermes-tarefa-iniciar Zapp_Web_V2 sincronizacao-total-execucao. Prova: workspace e branch impressos.
- [ ] **Etapa 006** - Criar .tmp/sync/ com os CSV/JSON de entrada datados (refs, worktrees, PRs, migrations, funcoes). Prova: lista de arquivos gerados.
- [ ] **Etapa 007** - Nomear responsavel por trilha (Git, Front, Edge, Banco, CI, Revisao); ninguem aprova a propria mudanca. Prova: tabela de donos.
- [ ] **Etapa 008** - Fixar teto de tempo/token por fase; script antes de leitura manual; relatorio por excecao. Prova: tabela de orcamento.
- [ ] **Etapa 009** - Regra de parada: divergencia destrutiva, segredo ou dado real encontrado = parar e escalar ao Joaquim. Prova: regra copiada no cartao.
- [ ] **Etapa 010** - Gate F00: checklist assinado por executor e revisor com hashes das 3 pontas. Prova: assinatura no anexo.

## F01 Inventario Git local exaustivo (sem apagar nada)
- [ ] **Etapa 011** - git fetch --all --prune --tags na copia de referencia e guardar saida com data/hora UTC. Prova: log anexado.
- [ ] **Etapa 012** - Contar refs (heads, remotes, tags, stashes, worktrees) e comparar com a linha de base 4131/107/331/8/3329. Prova: contagens lado a lado.
- [ ] **Etapa 013** - Exportar for-each-ref completo (ref, oid, upstream, data, assunto) para sync/refs.csv. Prova: total de linhas do CSV.
- [ ] **Etapa 014** - Classificar refs por prefixo (v2, dia, lote, integra, fix, chore, codex, ci, local, hermes, outros). Prova: tabela por prefixo.
- [ ] **Etapa 015** - Marcar as 18 refs ancestor-merged em origin/main como candidatas a arquivo, sem deletar nada. Prova: lista nominal.
- [ ] **Etapa 016** - Listar refs nao-merged por ancestralidade sem concluir perda: ancestralidade nao prova conteudo. Prova: lista separada da anterior.
- [ ] **Etapa 017** - Para cada v2/*, calcular ahead/behind vs origin/main e vs dia/2026-10-17. Prova: colunas no CSV.
- [ ] **Etapa 018** - Agrupar branches por OID de HEAD repetido (clusters) para deduplicar a analise. Prova: clusters com tamanho.
- [ ] **Etapa 019** - Exportar os 8 stashes com diff --stat de cada um, sem aplicar nenhum. Prova: arquivos por stash.
- [ ] **Etapa 020** - Gate F01: totais do CSV batem com o git; amostra de 20 branches conferida a mao com 100% de acerto. Prova: amostra registrada.

## F02 Inventario de worktrees e sujeira local
- [ ] **Etapa 021** - Listar worktrees registrados pela ferramenta Hermes permitida para sync/worktrees.csv. Prova: total exportado.
- [ ] **Etapa 022** - Cruzar 3.329 worktrees com 3.419 diretorios de hermes-workspaces e 29 de ~/zapp-worktrees. Prova: diferencas nomeadas.
- [ ] **Etapa 023** - Por worktree: branch, HEAD, estado (limpo/sujo/ausente) e data do ultimo commit, em lotes de 100 via script. Prova: CSV completo.
- [ ] **Etapa 024** - Proibido medir com varredura de disco na raiz dos workspaces; tamanho so por worktree sujo individual. Prova: comando usado registrado.
- [ ] **Etapa 025** - Classificar sujos: commitavel, .tmp descartavel, build/node_modules, segredo suspeito, desconhecido. Prova: coluna de classe.
- [ ] **Etapa 026** - Congelar intocaveis: .integra, .integrador, .noturno e sincronizacao-canonica-20261016. Prova: lista de exclusao no script.
- [ ] **Etapa 027** - Listar worktrees com diretorio sumido (podaveis) sem podar nesta fase. Prova: lista nominal.
- [ ] **Etapa 028** - Agrupar detached repetidos no mesmo OID. Prova: clusters de detached.
- [ ] **Etapa 029** - Salvar evidencia de cada worktree sujo (status --porcelain e diff --stat em arquivo proprio). Prova: diretorio de evidencias.
- [ ] **Etapa 030** - Gate F02: 100% classificados e zero worktree sujo sem evidencia. Prova: contagem de pendencias = 0 ou lista nomeada.

## F03 Classificacao de conteudo das branches (equivalencia de patch)
- [ ] **Etapa 031** - Para cada branch nao-merged, rodar git cherry contra origin/main e separar equivalente de unico. Prova: coluna cherry no CSV.
- [ ] **Etapa 032** - Confirmar equivalentes com diff vazio ou patch-id estavel. Prova: metodo registrado por branch.
- [ ] **Etapa 033** - Para unicas, exportar log e diff --stat vs origin/main para sync/branch-unique.csv. Prova: arquivo gerado.
- [ ] **Etapa 034** - Agrupar unicas por area (src, migrations, functions, scripts, docs, e2e/tests, .github). Prova: tabela por area.
- [ ] **Etapa 035** - Flag BANCO em toda branch que toca migration ou types.ts: ela entra obrigatoriamente nas F10-F14. Prova: flag no CSV.
- [ ] **Etapa 036** - Flag CI em toda branch que toca .github/workflows, scripts/ci ou guardas: revisao separada. Prova: flag no CSV.
- [ ] **Etapa 037** - Detectar conteudo ja integrado via squash: numero do PR no assunto + gh pr view conferido. Prova: PR linkado por branch.
- [ ] **Etapa 038** - Produzir a lista curta de trabalho realmente nao integrado (esperado: muito menor que 4.113). Prova: lista curta publicada.
- [ ] **Etapa 039** - Priorizar a lista curta por recencia, impacto em producao, banco, tamanho e dono identificavel. Prova: ordem numerada.
- [ ] **Etapa 040** - Gate F03: toda branch local tem veredito (integrada, equivalente, unica-pendente, obsoleta-provada, intocavel). Prova: CSV sem veredito vazio.

## F04 Divergencia central: dia x origin/main x main local
- [ ] **Etapa 041** - Reproduzir: dia 1546/79 vs origin; main local 0/17; main x dia 62/1546. Prova: saidas dos rev-list.
- [ ] **Etapa 042** - Fixar merge-base 7a15852791 (#1888) e listar os 79 commits origin-only ausentes no dia. Prova: lista anexada.
- [ ] **Etapa 043** - Listar os 62 commits de main ausentes no dia e os 17 que faltam em main local. Prova: listas anexadas.
- [ ] **Etapa 044** - Regenerar o diff de arquivos dia x origin (comuns 6.621; diferentes 952; origin-only 905; HEAD-only 39) e confirmar. Prova: numeros novos.
- [ ] **Etapa 045** - Separar os 952 diferentes em: origin mais novo, dia mais novo, conflito real (ultimo commit de cada lado por arquivo). Prova: CSV com classe.
- [ ] **Etapa 046** - Proibir merge direto dia para main: estrategia e replay seletivo por trilhas (F05-F09), nunca merge cego. Prova: decisao escrita.
- [ ] **Etapa 047** - Adotar origin/main como base canonica de codigo e o banco canonico como fonte de schema. Prova: decisao registrada em ADR (F23).
- [ ] **Etapa 048** - Destino da dia/2026-10-17: congelar como arquivo historico com tag sync/dia-2026-10-17-pre-sync (criacao de tag local; publicacao so com ordem). Prova: tag local criada.
- [ ] **Etapa 049** - Fast-forward de ~/projetos main para origin/main somente apos a tag de seguranca. Prova: novo HEAD de main.
- [ ] **Etapa 050** - Gate F04: estrategia aprovada por revisor que nao fez a analise. Prova: assinatura no anexo.

## F05 Trilha Front src/ - reconciliacao
- [ ] **Etapa 051** - Inventariar 426 origin-only, 33 HEAD-only e 731 blobs diferentes em src/ (maior area). Prova: CSV regenerado.
- [ ] **Etapa 052** - Quebrar por subarea: components 246 origin-only, hooks 131, lib 30, pages 8, services 3. Prova: CSV por subarea.
- [ ] **Etapa 053** - Para cada arquivo HEAD-only: provar obsoleto, unico util ou regressao se entrar. Prova: veredito por arquivo.
- [ ] **Etapa 054** - Para cada blob diferente, decidir a versao vencedora por recencia + teste existente, nunca por tamanho. Prova: criterio no CSV.
- [ ] **Etapa 055** - Replay em PRs pequenos por subarea (max. 30 arquivos por PR), com typecheck e testes do modulo. Prova: lista de PRs planejados.
- [ ] **Etapa 056** - Proibir PR unico gigante de src/ (precedente: lote revertido em #1982 por nao compilar). Prova: regra no corpo de cada PR.
- [ ] **Etapa 057** - types.ts fica fora desta trilha: ele pertence a F12 e entra em PR proprio. Prova: nenhum PR de front toca types.ts.
- [ ] **Etapa 058** - Rodar ratchets nos PRs de UI: lint, tipografia, bundle-budget e nomes acessiveis de botoes-icone. Prova: saidas anexadas.
- [ ] **Etapa 059** - Cada PR de front cita a(s) branch(es) v2/* de origem no corpo, para rastrear o resgate. Prova: corpos conferidos.
- [ ] **Etapa 060** - Gate F05: na branch final de conferencia, diff de src/ contra o decidido e vazio ou explicado arquivo a arquivo. Prova: diff anexado.

## F06 Trilha Edge Functions e config Supabase
- [ ] **Etapa 061** - Inventariar HEAD 83 diretorios/360 arquivos/81 funcoes no manifest vs origin 86/383/84. Prova: tabela regenerada.
- [ ] **Etapa 062** - Decidir os 24 arquivos origin-only e 1 HEAD-only de supabase/functions, funcao por funcao. Prova: veredito nominal.
- [ ] **Etapa 063** - Diff linha a linha de supabase/config.toml: 18 secoes de funcao (HEAD) vs 19 (origin). Prova: diff anexado.
- [ ] **Etapa 064** - Validar verify_jwt de cada funcao contra o deployment-manifest (origin: 70 true, 14 false), sem afrouxar nenhuma. Prova: tabela conferida.
- [ ] **Etapa 065** - Conferir orphan_allowlist (sicoob-bridge, sicoob-bridge-reply) e legacy_unmanaged_functions vazio. Prova: trecho do manifest.
- [ ] **Etapa 066** - Para cada funcao alterada: deno check/smoke local e contrato de erro sem exposicao (checker de edge). Prova: saida por funcao.
- [ ] **Etapa 067** - Nenhum deploy de Edge nesta sync sem ordem nominal do Joaquim por funcao. Prova: lista de pendentes de ordem.
- [ ] **Etapa 068** - Regenerar o deployment-manifest da arvore final e comparar o hash com o commitado. Prova: hashes iguais ou PR corrigindo.
- [ ] **Etapa 069** - Mudanca em supabase/functions/_shared/ exige reteste de todas as funcoes que importam dele. Prova: lista de importadoras testadas.
- [ ] **Etapa 070** - Gate F06: manifest, config.toml e arvore de funcoes concordam funcao a funcao. Prova: conferencia assinada.

## F07 Trilha scripts, CI e workflows
- [ ] **Etapa 071** - Inventariar scripts origin-only 124 (db-audit +103, ci +16) e workflows HEAD-only 3 vs origin-only 1. Prova: listas nominais.
- [ ] **Etapa 072** - Decidir os workflows HEAD-only (auto-update-pr-branch, settings-guard, supabase-sync): mortos ou portados com revisao de CI. Prova: veredito por workflow.
- [ ] **Etapa 073** - Adotar notifica-falha-main.yml da origin provando que nao duplica alerta existente. Prova: comparacao de gatilhos.
- [ ] **Etapa 074** - Rodar os testes de scripts/ci e scripts/db-audit na arvore final antes de qualquer PR de CI. Prova: contagem pass/fail.
- [ ] **Etapa 075** - Guarda, manifesto ou CI que falha vira cartao proprio; nunca editar guarda para fazer passar. Prova: cartoes criados, se houver.
- [ ] **Etapa 076** - Conferir pins de actions e referencias a segredos de workflow sem imprimir valor algum. Prova: checkers verdes.
- [ ] **Etapa 077** - Mapear as falhas atuais da main (CI/CD, E2E logado, DB Guard) para a F16 antes de sincronizar codigo. Prova: vinculo fase-cartao.
- [ ] **Etapa 078** - PR de CI nunca mistura workflow com src/ ou migration. Prova: diffs conferidos.
- [ ] **Etapa 079** - Validar branch-hygiene e allowed-actions contra as 28 PRs abertas para nao quebrar PR viva. Prova: checker verde.
- [ ] **Etapa 080** - Gate F07: suites de scripts verdes localmente e workflows iguais ao decidido, com diff revisado por terceiro. Prova: assinatura.

## F08 Trilha docs, e2e, tests e arquivos raiz
- [ ] **Etapa 081** - Inventariar docs origin-only 41, e2e 5, tests 6 e .tmp trackeado (10 origin vs 8 HEAD). Prova: listas nominais.
- [ ] **Etapa 082** - Se .tmp trackeado for lixo confirmado: PR proprio removendo do versionamento e ajustando .gitignore, sem reescrever historico. Prova: PR isolado.
- [ ] **Etapa 083** - Conferir raiz divergente: bun.lock, .env.production, .gitignore, FEATURE_REGISTRY.md, ESTADO.md, CONTRIBUTING.md. Prova: diff por arquivo.
- [ ] **Etapa 084** - .env.production: comparar somente nomes de variaveis, nunca valores. Prova: lista nominal de diferencas.
- [ ] **Etapa 085** - bun.lock: regenerar via instalacao limpa na arvore final; nunca editar lock a mao nem misturar com codigo. Prova: PR isolado de lock, se houver.
- [ ] **Etapa 086** - e2e somente local, com usuario sintetico criado no banco local (regra R1); proibido projeto autenticado com sessao salva e proibido modo production. Prova: projeto e usuario registrados.
- [ ] **Etapa 087** - tests/contracts: 90 (HEAD) vs 95 (origin); rodar a suite de contratos na arvore final. Prova: contagem da suite.
- [ ] **Etapa 088** - Planos antigos em docs/plans: marcar status no cabecalho ao concluir; nao apagar plano de outro agente. Prova: cabecalhos conferidos.
- [ ] **Etapa 089** - ESTADO.md e FEATURE_REGISTRY.md so mudam no PR final de governanca, com numeros medidos. Prova: PR final cita os numeros.
- [ ] **Etapa 090** - Gate F08: nenhum arquivo raiz diverge sem decisao registrada e .tmp fora do diff final. Prova: conferencia assinada.

## F09 Resgate seletivo das branches unicas
- [ ] **Etapa 091** - Trabalhar so a lista curta da F03, uma branch por vez, da mais recente para a mais antiga. Prova: ordem seguida registrada.
- [ ] **Etapa 092** - Cada resgate: cherry-pick para branch nova a partir de origin/main atualizada; nunca merge da branch velha. Prova: branch nova por resgate.
- [ ] **Etapa 093** - Conflito se resolve pelo comportamento com teste, nao por escolher um lado inteiro do arquivo. Prova: teste citado no PR.
- [ ] **Etapa 094** - Cada resgate vira PR draft pequeno com branch/cartao original, prova vermelho-verde e diff --stat. Prova: PRs abertos.
- [ ] **Etapa 095** - Branch que nao compila ou nao tem teste volta como refazer para o senior; nao entra por insistencia. Prova: cartao de refazer linkado.
- [ ] **Etapa 096** - Obsoleta-provada: registrar a prova (PR equivalente) em sync/obsoletas.csv antes de qualquer limpeza. Prova: linha no CSV.
- [ ] **Etapa 097** - Sem dono e sem teste: quarentena anunciada de 7 dias; depois disso, arquivo depende de decisao do Joaquim. Prova: anuncio datado.
- [ ] **Etapa 098** - Proibido cherry-pick em massa automatizado sem revisao humana de cada diff (foi assim que um lote quebrou a main). Prova: revisor por PR.
- [ ] **Etapa 099** - Atualizar refs.csv a cada resgate: unica-pendente vira integrada via PR numero X. Prova: CSV atualizado.
- [ ] **Etapa 100** - Gate F09: lista curta zerada, ou cada restante com bloqueio escrito e dono nomeado. Prova: lista final.

## F10 Banco canonico: acesso somente-leitura e identidade
- [ ] **Etapa 101** - Obter a conexao somente-leitura do banco canonico (gateway RO) pelo cofre da maquina; nunca colar a URL em arquivo, log ou PR. Prova: apenas o nome da variavel registrado.
- [ ] **Etapa 102** - Provar identidade com scripts/db-audit/database-identity.json: fingerprint do projeto, database, schema public, PG 17. Prova: veredito bate/nao bate.
- [ ] **Etapa 103** - Rodar o verificador de identidade e guardar somente o veredito, jamais a string de conexao. Prova: saida redigida.
- [ ] **Etapa 104** - Provar que a conexao e RO de verdade com tentativa de escrita transacional descartada, usando o procedimento ja aprovado do repo. Prova: erro de permissao registrado.
- [ ] **Etapa 105** - Sem acesso RO disponivel: PARAR a trilha de banco e registrar o bloqueio; nao substituir por suposicao. Prova: bloqueio no cartao.
- [ ] **Etapa 106** - Gerar a fotografia do canonico (manifest.sql) fora do repo ate a revisao. Prova: arquivo com hash e data UTC.
- [ ] **Etapa 107** - Contar tabelas, views, funcoes, policies, triggers e indices do canonico e comparar com o schema-manifest da origin. Prova: tabela comparativa.
- [ ] **Etapa 108** - Registrar o horario UTC da fotografia; toda comparacao posterior cita essa fotografia. Prova: carimbo no anexo.
- [ ] **Etapa 109** - Conferir que nenhum script desta fase escreve no canonico (revisar comandos antes de rodar). Prova: lista de comandos revisada.
- [ ] **Etapa 110** - Gate F10: identidade provada e fotografia arquivada com hash, sem segredo no Git. Prova: assinatura.

## F11 Banco: ledger de migrations x arquivos (duas direcoes)
- [ ] **Etapa 111** - Rodar check-migration-drift com a conexao RO: arquivos da origin/main contra o ledger do canonico. Prova: saida completa anexada.
- [ ] **Etapa 112** - Exportar 4 conjuntos: arquivo aplicado ok; arquivo sem aplicar; aplicado sem arquivo; mesma versao com nome/hash divergente. Prova: 4 listas.
- [ ] **Etapa 113** - Confirmar as ~197 migrations origin-only em relacao ao dia: aplicadas no canonico ou faltantes nomeadas. Prova: lista de faltantes.
- [ ] **Etapa 114** - Colisao de prefixo 20261016220000 (2 arquivos): provar a ordem e o estado reais pelo ledger, nao pelo nome. Prova: linhas do ledger.
- [ ] **Etapa 115** - Revalidar cada excecao de migration-evidence.json contra o ledger atual. Prova: excecao por excecao com veredito.
- [ ] **Etapa 116** - Aplicado sem arquivo: recuperar o SQL a partir do ledger para arquivo de reconciliacao, sem reexecutar nada. Prova: arquivo proposto em PR draft.
- [ ] **Etapa 117** - Arquivo sem aplicar: classificar uma a uma (pendente real, substituida, erro de ledger) com prova. Prova: classe por arquivo.
- [ ] **Etapa 118** - Proibido aplicar migration em producao e proibido editar o ledger a mao fora de migration de reconciliacao versionada e revisada. Prova: regra no cartao da trilha.
- [ ] **Etapa 119** - Migration nova desta sync nasce via hermes-db-migrar no banco local da tarefa, com rollback no topo. Prova: migrations criadas pelo fluxo.
- [ ] **Etapa 120** - Gate F11: drift de ledger vira lista fechada e nomeada; zero item desconhecido. Prova: lista final assinada.

## F12 Banco: artefatos derivados (types, catalogo, manifesto)
- [ ] **Etapa 121** - Regenerar schema-catalog (catalog.sql) e schema-manifest (manifest.sql) contra o canonico RO, fora do repo. Prova: arquivos frescos com hash.
- [ ] **Etapa 122** - Diff contra a origin: explicar routine_grants 738 (origin) vs 740 (dia) grant a grant. Prova: explicacao por grant.
- [ ] **Etapa 123** - Regenerar types.ts pela CLI fixada do repo (gen-types.sh): esperado ~64k linhas contra 12.749 do dia. Prova: contagem de linhas.
- [ ] **Etapa 124** - Provar o projeto antes de gerar types (identidade da F10): gerar de banco errado ja aconteceu duas vezes. Prova: veredito de identidade junto da geracao.
- [ ] **Etapa 125** - Rodar check-catalog-fresh, check-manifest-fresh e check-triple-parity na arvore final. Prova: tres saidas verdes.
- [ ] **Etapa 126** - PR exclusivo de artefatos (types + catalogo + manifesto juntos), sem codigo de produto. Prova: diff do PR so com os 3 arquivos.
- [ ] **Etapa 127** - Impacto do types novo no front: typecheck completo; correcao de casts vai em PR separado e posterior. Prova: erros classificados.
- [ ] **Etapa 128** - Se o manifesto fresco divergir do ledger (F11), o banco manda: migration de reconciliacao nasce antes do PR de artefato. Prova: ordem respeitada.
- [ ] **Etapa 129** - Colar no corpo do PR os hashes dos 3 artefatos para o revisor reproduzir byte a byte. Prova: hashes no PR.
- [ ] **Etapa 130** - Gate F12: artefatos regenerados do canonico provado, checks frescos verdes, PR isolado revisado. Prova: assinatura.

## F13 Banco: RLS, grants, definers e realtime
- [ ] **Etapa 131** - Rodar a checagem de SECURITY DEFINER no canonico RO: zero funcao publica com EXECUTE para PUBLIC ou anon. Prova: saida da consulta.
- [ ] **Etapa 132** - Rodar a checagem de ACL das funcoes MCP: apenas postgres e service_role. Prova: saida da consulta.
- [ ] **Etapa 133** - Auditar policies das migrations resgatadas: isolamento por empresa/usuario e negar por padrao. Prova: policy por policy.
- [ ] **Etapa 134** - Conferir no canonico (nao so no papel): search_events INSERT-only e policy de delete de connection_alert_preferences. Prova: linhas do catalogo vivo.
- [ ] **Etapa 135** - Listar tabelas sem RLS ou com policy permissiva a partir do manifesto fresco; cada uma vira risco nomeado ou correcao. Prova: lista com dono.
- [ ] **Etapa 136** - Validar grants de anon/authenticated em tabelas sensiveis com amostra anonimizada ou sintetica. Prova: consultas e resultados redigidos.
- [ ] **Etapa 137** - Conferir publicacao realtime: tabela sensivel fora do realtime, conforme manifesto e catalogo. Prova: lista de publicacoes.
- [ ] **Etapa 138** - Correcao de RLS so entra com teste SQL executado no banco local; mock de cliente nao prova policy. Prova: teste db executado.
- [ ] **Etapa 139** - Rollback de migration de RLS restaura policy/grant anterior: provar executando o rollback no banco local. Prova: estado antes/depois.
- [ ] **Etapa 140** - Gate F13: relatorio RLS/grants assinado; zero afrouxamento sem decisao registrada do Joaquim. Prova: relatorio anexado.

## F14 Banco local x canonico e migrations novas
- [ ] **Etapa 141** - Subir o banco local da tarefa e aplicar todas as migrations da origin/main do zero (replay limpo). Prova: tempo e erros do replay.
- [ ] **Etapa 142** - Comparar o manifesto do banco local pos-replay com o canonico (diff de manifestos): so divergencia explicada. Prova: diff anexado.
- [ ] **Etapa 143** - Divergencia local x canonico vira migration de reconciliacao nova, com timestamp novo; nunca editar migration aplicada. Prova: migration criada.
- [ ] **Etapa 144** - Toda migration nova: fluxo hermes-db-migrar, teste que falha sem ela, rollback executado e estado restaurado provado. Prova: vermelho/verde + rollback.
- [ ] **Etapa 145** - Migration que toca catalogo/manifesto roda tambem a integracao descartavel em PG17 local do repo. Prova: saida do teste.
- [ ] **Etapa 146** - Antes de criar timestamp novo, conferir colisao com prefixos existentes (inclui 20261016220000). Prova: checagem de prefixo.
- [ ] **Etapa 147** - Nada e aplicado em producao nesta sync: a entrega e PR aprovado + plano de aplicacao aguardando ordem nominal. Prova: plano anexo sem execucao.
- [ ] **Etapa 148** - Escrever o plano de aplicacao futura (ordem, janela, rollback, smoke pos-aplicacao) como documento anexo. Prova: documento revisado.
- [ ] **Etapa 149** - Aplicacao futura (fora desta sync, pos-ordem): uma migration por vez, conferindo o ledger entre cada uma. Prova: registrado como etapa externa ao plano.
- [ ] **Etapa 150** - Gate F14: replay local limpo igual ao canonico (ou diff explicado) e pacote pronto para ordem do Joaquim. Prova: assinatura.

## F15 Edge: mapa codigo x deploy x segredos (sem deploy)
- [ ] **Etapa 151** - Cruzar funcoes do codigo (manifesto fresco) com a lista real de funcoes do projeto, somente leitura. Prova: tabela cruzada.
- [ ] **Etapa 152** - Funcao no codigo e nao deployada, ou deployada e nao no codigo: lista nomeada com decisao proposta. Prova: lista com dono.
- [ ] **Etapa 153** - Conferir segredos apenas por nome (lista de nomes), nunca por valor; nome faltante vira bloqueio nomeado. Prova: nomes conferidos.
- [ ] **Etapa 154** - Escrever a ordem de deploy por funcao (compartilhado _shared primeiro) como documento, sem executar. Prova: documento revisado.
- [ ] **Etapa 155** - Definir o smoke pos-deploy de cada funcao (401 anonimo onde exige auth, contrato de erro, log sem segredo). Prova: roteiro por funcao.
- [ ] **Etapa 156** - Proibido deploy de Edge nesta sync sem ordem nominal do Joaquim por funcao. Prova: pendentes de ordem listados.
- [ ] **Etapa 157** - Webhooks com verify_jwt desligado (evolution, whatsapp, gmail, elevenlabs): conferir autenticacao propria no codigo. Prova: trecho por funcao.
- [ ] **Etapa 158** - Cron que chama Edge (connection-health-check, batch-fetch-avatars): conferir o segredo dedicado no codigo, nunca em log. Prova: conferencia sem valor.
- [ ] **Etapa 159** - Registrar divergencia entre config.toml do repo e o comportamento remoto observado, se houver. Prova: divergencia nomeada ou 'nenhuma'.
- [ ] **Etapa 160** - Gate F15: mapa codigo x deploy x segredo fechado e assinado; zero deploy executado sem ordem. Prova: assinatura.

## F16 CI da main vermelha e as 28 PRs abertas
- [ ] **Etapa 161** - Reproduzir as falhas da main a9b4d6c (CI/CD Pipeline, E2E logado, DB Guard offline) abrindo o log de cada run. Prova: links e trechos.
- [ ] **Etapa 162** - Classificar cada falha: codigo, teste, guarda, infra/credencial ou intermitente, com trecho do log. Prova: classe por falha.
- [ ] **Etapa 163** - Falha de guarda se resolve corrigindo codigo ou baseline em PR proprio revisado; nunca afrouxando a guarda. Prova: PRs correspondentes.
- [ ] **Etapa 164** - Inventariar as 28 PRs abertas (25 draft; ready: 1983, 1930, 1922) com idade, tamanho e trilha. Prova: tabela de PRs.
- [ ] **Etapa 165** - PRs draft do Copiloto/RADAR (1997-2032): marcar quais dependem de migration e separar produto de banco. Prova: flag por PR.
- [ ] **Etapa 166** - PR 1983 (lote 880, ready): revisar os fixes F1-F6, exigir CI verde no head exato; merge so com ordem do Joaquim. Prova: revisao registrada.
- [ ] **Etapa 167** - PRs de correcao de CI (2033-2037, serie GA): sequenciar antes das PRs de produto para destravar as demais. Prova: ordem escrita.
- [ ] **Etapa 168** - PR orfa (branch morta ou sem autor): fechar somente com comentario de prova e link para a substituta. Prova: comentario por PR.
- [ ] **Etapa 169** - Um merge por vez: CI verde no head exato e revisao de quem nao escreveu. Prova: registro por merge.
- [ ] **Etapa 170** - Gate F16: main verde, ou cada falha com cartao, dono e prazo; fila de PRs com ordem de merge escrita. Prova: lista final.

## F17 Sequenciamento dos PRs da sincronizacao
- [ ] **Etapa 171** - Ordem de abertura: governanca/docs, CI que destrava, artefatos de banco, migrations (se houver), front, edge, limpeza. Prova: ordem publicada.
- [ ] **Etapa 172** - Cada PR: titulo Conventional Commits em pt-BR, corpo com problema, prova, risco, rollback e secao de banco quando tocar DB. Prova: corpos conferidos.
- [ ] **Etapa 173** - Tamanho maximo por PR: 30 arquivos ou 1.500 linhas, o que vier primeiro; passou disso, dividir antes de abrir. Prova: stat por PR.
- [ ] **Etapa 174** - PR fica draft ate CI verde; ready somente com relato de teste vermelho-verde anexado. Prova: relato por PR.
- [ ] **Etapa 175** - Proibido em PR: .tmp, dist, artefato de build, segredo, dado real de cliente ou conversa. Prova: varredura pre-ready.
- [ ] **Etapa 176** - Um PR por branch nova a partir de origin/main atualizada no dia; atualizar a base antes de pedir revisao e avisar o revisor se reescrever a branch. Prova: base registrada.
- [ ] **Etapa 177** - Merge somente com ordem do Joaquim, um ok por PR; o executor nao mergeia por conta propria. Prova: ordem registrada por PR.
- [ ] **Etapa 178** - Apos cada merge autorizado: fetch, confirmar o avanco de origin/main e recalcular ahead/behind das trilhas restantes. Prova: numeros atualizados.
- [ ] **Etapa 179** - Merge quebrou a main: revert versionado imediato (precedente #1982), nunca correcao apressada sem teste. Prova: procedimento no cartao.
- [ ] **Etapa 180** - Gate F17: ordem executada sem PR gigante, sem merge sem ordem, main verde apos cada merge. Prova: conferencia assinada.

## F18 Limpeza de branches, worktrees e tags (destrutivo controlado)
- [ ] **Etapa 181** - Somente apos F03/F09: gerar a lista de delecao candidata (integradas e obsoletas-provadas) com prova por item. Prova: lista gerada.
- [ ] **Etapa 182** - Antes de deletar: tag local de arquivo sync/pre-limpeza-2026-10-17 cobrindo a branch do dia e HEADs nao classificaveis. Prova: tag criada.
- [ ] **Etapa 183** - Apresentar a lista ao Joaquim em lotes de 100 com motivo; deletar localmente so com ok do lote. Prova: ok registrado por lote.
- [ ] **Etapa 184** - Deletar branch local integrada de forma segura (recusando nao-merged) e registrar o OID em sync/deleted-refs.csv. Prova: linhas do CSV.
- [ ] **Etapa 185** - Worktree limpo e integrado sai pela ferramenta de limpar tarefas da Hermes, nunca por remocao manual de pasta. Prova: comandos registrados.
- [ ] **Etapa 186** - Worktree sujo so e limpo apos evidencia salva (F02) e decisao nomeada sobre o conteudo. Prova: vinculo evidencia-decisao.
- [ ] **Etapa 187** - Delecao de branch remota no GitHub e ato externo: ordem nominal do Joaquim por lote, registrada no PR de governanca. Prova: ordem por lote.
- [ ] **Etapa 188** - Manter as 331 tags; tag so some provando que nao e release nem arquivo historico. Prova: justificativa por tag, se houver.
- [ ] **Etapa 189** - Os 8 stashes: virar branch de resgate ou patch arquivado em sync/stash-patches antes de qualquer descarte. Prova: destino por stash.
- [ ] **Etapa 190** - Gate F18: contagens finais medidas e comparadas; tudo que sumiu tem prova e autorizacao registradas. Prova: antes/depois assinado.

## F19 Ambientes: Vercel, preview e variaveis
- [ ] **Etapa 191** - Conferir o projeto na Vercel: branch de producao = main; nenhum deploy manual nesta sync. Prova: tela/config registrada.
- [ ] **Etapa 192** - Preview de PR somente com banco local e usuario sintetico (R1); preview apontando para producao e proibido. Prova: configuracao conferida.
- [ ] **Etapa 193** - Comparar nomes de variaveis (Production/Preview/Development) com .env.example: so nomes, nunca valores. Prova: lista nominal.
- [ ] **Etapa 194** - Variavel usada no codigo e ausente no ambiente (ou o contrario): lista nomeada com dono. Prova: lista publicada.
- [ ] **Etapa 195** - Merge autorizado na main dispara deploy: acompanhar o build ate Ready ou erro, sem intervir a mao. Prova: status por merge.
- [ ] **Etapa 196** - Build quebrado por lock (precedente do bun.lock): tratar no PR isolado de lock da F08. Prova: vinculo com a F08.
- [ ] **Etapa 197** - Nao alterar DNS, dominio, firewall ou stack nesta sincronizacao. Prova: regra no cartao.
- [ ] **Etapa 198** - Registrar nos PRs as URLs canonica e de preview usadas nas provas. Prova: URLs nos corpos.
- [ ] **Etapa 199** - Qualquer custo novo (plano, complemento, servico) para e vira pedido de decisao; autonomia nao cobre custo. Prova: pedido, se houver.
- [ ] **Etapa 200** - Gate F19: ambientes conferidos por nome, deploy pos-merge acompanhado, zero mudanca de infra sem ordem. Prova: assinatura.

## F20 Qualidade: bateria na arvore final
- [ ] **Etapa 201** - Instalacao limpa na arvore final; falhas de instalacao se resolvem antes de qualquer teste. Prova: install verde registrada.
- [ ] **Etapa 202** - Typecheck completo verde; erro vira cartao proprio, nunca cast novo para silenciar. Prova: saida do typecheck.
- [ ] **Etapa 203** - Lint e ratchets do repo (tipografia, bundle, nomes de botoes-icone) verdes ou com divida nomeada pre-existente. Prova: saidas.
- [ ] **Etapa 204** - Suite unitaria completa: comparar contagens antes e depois da sync. Prova: numeros pass/fail/skipped.
- [ ] **Etapa 205** - Suite de contratos (tests/contracts) verde na arvore final. Prova: contagem de contratos.
- [ ] **Etapa 206** - Suites de SQL (supabase/tests) executadas no banco local, nunca apenas leitura de arquivo. Prova: saida da execucao.
- [ ] **Etapa 207** - E2E critico local com usuario sintetico; nenhum artefato de E2E com segredo entra no Git. Prova: checker de segredo em artefatos verde.
- [ ] **Etapa 208** - Testes que ja falhavam antes: lista nominal de pre-existentes com link da falha anterior. Prova: lista com links.
- [ ] **Etapa 209** - Nenhum teste removido, pulado ou afrouxado neste plano; se houver excecao, e cartao separado aprovado. Prova: diff de testes revisado.
- [ ] **Etapa 210** - Gate F20: bateria medida na arvore final identica a que origin/main tera pos-sync. Prova: tabela final de resultados.

## F21 Seguranca e segredos
- [ ] **Etapa 211** - Varredura de segredos no diff total da sync codificando apenas verdade/falso, nunca imprimindo o segredo. Prova: resultado por PR.
- [ ] **Etapa 212** - gitleaks na branch final; achado real vira incidente separado com rotacao, nao apenas remocao do arquivo. Prova: relatorio do scan.
- [ ] **Etapa 213** - Canhoto de .env.production e de arquivos de credencial fora do diff. Prova: lista de arquivos excluidos.
- [ ] **Etapa 214** - Dado de cliente (CPF, telefone, conversa, pagamento) fora de diff, log e PR: amostra so sintetica. Prova: varredura registrada.
- [ ] **Etapa 215** - Identificador do projeto de producao fora de codigo e teste (exceto configuracao ja existente e revisada). Prova: busca registrada.
- [ ] **Etapa 216** - Revisar efeitos de seguranca de cada migration resgatada (grant novo, policy nova, definers). Prova: revisao por migration.
- [ ] **Etapa 217** - Nenhum afrouxamento de protecao entra: guarda mais fraca, RLS mais aberta ou verify desligado e bloqueio automatico. Prova: regra aplicada nos PRs.
- [ ] **Etapa 218** - Dependencia nova exige justificativa, alternativa nativa descartada e nota de manutencao no PR. Prova: justificativa por dependencia.
- [ ] **Etapa 219** - Incidente de segredo encerrado apenas com rotacao provada pelo dono do servico. Prova: confirmacao, se houver.
- [ ] **Etapa 220** - Gate F21: scans limpos e nenhum afrouxamento; achado aberto bloqueia o merge da trilha. Prova: assinatura.

## F22 Performance e orcamento de execucao (tokens/tempo)
- [ ] **Etapa 221** - Medir o tempo de cada fase e ajustar o roteiro: script em lote sempre que uma decisao se repetir mais de 5 vezes. Prova: tempos por fase.
- [ ] **Etapa 222** - Proibido abrir arquivo por arquivo de inventario: leitura so das excecoes que o CSV apontar. Prova: lista de excecoes lidas.
- [ ] **Etapa 223** - Um unico relatorio por fase anexado; nada de narrar cada comando no chat. Prova: anexos por fase.
- [ ] **Etapa 224** - Cache de conjuntos (arquivos, refs, migrations) em sync/*datado*; regenerar so a cada gate. Prova: arquivos gerados por gate.
- [ ] **Etapa 225** - Paralelizar trilhas independentes com no maximo 1 suite pesada por vez nesta maquina. Prova: registro de suites executadas.
- [ ] **Etapa 226** - Etapa que falhou 3 vezes vira bloqueio registrado, nao insistencia silenciosa. Prova: bloqueios registrados.
- [ ] **Etapa 227** - Revisao e por diff e relato, nunca por releitura do repositorio inteiro. Prova: diffs revisados por PR.
- [ ] **Etapa 228** - Medir commits, PRs e homes de teste geradas vs planejadas; variacao maior que 20% exige adendo neste plano. Prova: numeros finais.
- [ ] **Etapa 229** - Economizar token nao e pular prova: teste, rollback e assinatura sao inegociaveis. Prova: gates completos.
- [ ] **Etapa 230** - Gate F22: custo e prazo reais registrados e comparados com a estimativa da secao de ondas. Prova: tabela final.

## F23 Documentacao e registro permanente
- [ ] **Etapa 231** - ADR nova: origin/main-e-codigo-canonico, banco-canonico-e-schema e dia-como-arquivo. Prova: ADR em docs/decisions ou docs/adr (seguir o padrao existente).
- [ ] **Etapa 232** - Atualizar ESTADO.md com os numeros finais medidos (branches, worktrees, PRs, migrations, gates). Prova: PR de governanca.
- [ ] **Etapa 233** - Atualizar FEATURE_REGISTRY.md somente com fato provado nesta sync. Prova: diff revisado.
- [ ] **Etapa 234** - Runbook de sincronizacao: condensar este plano no caminho que funcionou, para repetir mensalmente. Prova: runbook criado.
- [ ] **Etapa 235** - Registrar licces: lote quebrado (#2031/#1982), types do banco errado, colisao de timestamp. Prova: seco no runbook.
- [ ] **Etapa 236** - Marcar este plano como executado com links dos PRs por fase no cabecalho. Prova: cabecalho final.
- [ ] **Etapa 237** - Nunca apagar plano, audit ou evidencia de outra pessoa: status/sim ou arquivar, nao deleter. Prova: regra aplicada.
- [ ] **Etapa 238** - Indices (docs/README ou indice de plans) atualizados para este plano e para o runbook aparecerem. Prova: indice conferido.
- [ ] **Etapa 239** - Anexos CSV/JSON datados ficam fora do Git; no Git entram apenas resumos e decisoes. Prova: diff de docs conferido.
- [ ] **Etapa 240** - Gate F23: quem nao participou consegue reconstruir o que foi feito so com a documentacao. Prova: leitura-teste de terceiro.

## F24 Ordem de execucao em ondas
- [ ] **Etapa 241** - Onda 0 (dia 1): F00-F04 - governanca, inventario e estrategia aprovada. Prova: 4 gates assinados.
- [ ] **Etapa 242** - Onda 1 (dias 1-2): F10-F11 - identidade do banco e ledger fechado (trilha critica). Prova: lista de drift fechada.
- [ ] **Etapa 243** - Onda 1 em paralelo: F16 - main verde e fila de PRs ordenada. Prova: main verde ou falhas nomeadas.
- [ ] **Etapa 244** - Onda 2 (dias 2-3): F12-F15 - artefatos, RLS, banco local e mapa de edge. Prova: PR de artefatos pronto para ordem.
- [ ] **Etapa 245** - Onda 2 em paralelo: F05-F08 - decisoes por arquivo das trilhas de codigo. Prova: PRs draft pequenos abertos.
- [ ] **Etapa 246** - Onda 3 (dias 3-4): F09 + F17 - resgates seletivos e merges autorizados um a um. Prova: lista curta zerada.
- [ ] **Etapa 247** - Onda 4 (dia 4): F20-F22 - bateria final, seguranca e medicao de custo. Prova: tabela final da F20.
- [ ] **Etapa 248** - Onda 5 (dia 5): F18-F19 - limpeza autorizada e ambientes. Prova: contagens finais.
- [ ] **Etapa 249** - Onda 5 em paralelo: F23-F26 - documentacao e operacao canonica. Prova: runbook pronto.
- [ ] **Etapa 250** - Gate F24: nenhuma onda comecou pulando o gate da anterior; desvio esta registrado no anexo. Prova: anexo de desvios.

## F25 Criterios de aceite por trilha
- [ ] **Etapa 251** - Aceite Git: fetch limpo, main local igual a origin/main, diff local planejado igual a zero ou nomeado. Prova: rev-parse e status finais.
- [ ] **Etapa 252** - Aceite Front: typecheck e suites verdes na arvore final, sem PR gigante pendente. Prova: tabela da F20.
- [ ] **Etapa 253** - Aceite Edge: manifest, config.toml e codigo concordam; deploy pendente apenas por ordem. Prova: mesa da F06/F15.
- [ ] **Etapa 254** - Aceite Banco: drift de ledger zerado ou com plano aprovado parado no gate de ordem. Prova: check de drift final.
- [ ] **Etapa 255** - Aceite Artefatos: types, catalogo e manifesto regenerados do canonico provado e mergeados. Prova: hashes pos-merge.
- [ ] **Etapa 256** - Aceite Limpeza: branches e worktrees finais contados, todos com prova e autorizacao. Prova: antes/depois da F18.
- [ ] **Etapa 257** - Aceite CI: main verde ou falhas com cartao, dono e prazo; nunca forcar merge no vermelho. Prova: links dos runs.
- [ ] **Etapa 258** - Aceite Seguranca: scans limpos e zero afrouxamento introduzido na sync. Prova: Gate F21.
- [ ] **Etapa 259** - Aceite Economia: tempo e tokens por fase registrados e dentro da estimativa ou desvio explicado. Prova: Gate F22.
- [ ] **Etapa 260** - Gate F25: cada aceite vira sim/nao com prova linkada; nao existe 'acho que esta sincronizado'. Prova: tabela de aceites.

## F26 Pos-sync: operacao canonica (para nao re-divergir)
- [ ] **Etapa 261** - Ritual dirio: branch do dia nasce de origin/main atualizada; fetch e a primeira acao do dia. Prova: ritual no runbook.
- [ ] **Etapa 262** - Branch do dia vive no maximo 1 dia util; nada de acumular outra dia gigante. Prova: regra registrada.
- [ ] **Etapa 263** - Verificacao semanal: contagens de refs, worktrees e PRs draft comparado com as linhas de base deste plano. Prova: rotina criada.
- [ ] **Etapa 264** - Worktree orfao por mais de 7 dias gera lista de limpeza com prova; automatizar aviso, nunca delecao automatica. Prova: rotina descrita.
- [ ] **Etapa 265** - Toda PR de produto cita a branch do cartao; branch v2/* sem PR em 15 dias entra em revisao de obsoleta. Prova: regra no runbook.
- [ ] **Etapa 266** - Manifesto, catalogo e types so sao gerados a partir do canonico provado; PR de geracao mostra a identidade. Prova: regra no runbook.
- [ ] **Etapa 267** - Migration entra com fluxo versionado, teste no banco local e rollback provado, sempre. Prova: regra no runbook.
- [ ] **Etapa 268** - Aplicacao de migration em producao sempre pos-ordem, uma a uma, conferindo o ledger. Prova: regra no runbook.
- [ ] **Etapa 269** - Revisao mensal de tags, branches arquivadas e documentos de estado. Prova: ritual mensal.
- [ ] **Etapa 270** - Gate F26: rituais no runbook e dono nomeado para a verificacao semanal. Prova: runbook assinado.

## F27 Rollback geral da sincronizacao
- [ ] **Etapa 271** - Antes de cada merge autorizado, registrar o OID de origin/main para revert preciso. Prova: OID por PR.
- [ ] **Etapa 272** - Merge ruim: revert versionado do PR (precedente #1982), nunca reescrita de historico publicado. Prova: procedimento pronto.
- [ ] **Etapa 273** - Migration futura ruim (pos-ordem): aplicar a migration de rollback aprovada, nunca deletar a linha do ledger a mao. Prova: rollback versionado.
- [ ] **Etapa 274** - Artefato errado (types/manifesto): reverter o PR de artefatos e regenerar a partir do canonico provado. Prova: procedimento no runbook.
- [ ] **Etapa 275** - Limpeza que apagou algo util: restaurar branch ou worktree pelo OID do arquivo de delecoes. Prova: delecoes restauraveis pelo CSV.
- [ ] **Etapa 276** - Deploy de Edge ruim (pos-ordem): redeploy da versao anterior conhecida e registrada. Prova: versao anterior por funcao no documento da F15.
- [ ] **Etapa 277** - Deploy web ruim: rollback para o deployment Ready anterior na plataforma. Prova: procedimento registrado.
- [ ] **Etapa 278** - Incidente durante a sync: parar todas as trilhas, registrar o estado e retomar somente com a main verde. Prova: regra no cartao-mae.
- [ ] **Etapa 279** - Comunicar rollback ao Joaquim em linguagem comum: o que voltou, o que ficou e o proximo passo. Prova: modelo de mensagem no runbook.
- [ ] **Etapa 280** - Gate F27: todo PR da sync tem rollback nomeado e testavel antes do merge. Prova: conferencias de corpo de PR.

## F28 Matriz de riscos e decisoes que sao so do Joaquim
- [ ] **Etapa 281** - Risco lote gigante: mitigado por PRs pequenos com teto de tamanho (F17) e revert rapido (F27). Prova: regra ativa.
- [ ] **Etapa 282** - Risco schema divergente: mitigado pela trilha banco primeiro (F10-F14), nunca depois do codigo. Prova: ordem das ondas.
- [ ] **Etapa 283** - Risco perda de trabalho local: mitigado por tags de arquivo e evidencia antes de limpar (F02/F18). Prova: tag e evidencias.
- [ ] **Etapa 284** - Risco segredo no diff: mitigado por varreduras F21 antes do ready. Prova: scans por PR.
- [ ] **Etapa 285** - Risco CI vermelha mascarar regressao: mitigado pela F16 antes dos merges de produto. Prova: ordem da F24.
- [ ] **Etapa 286** - Decisao do Joaquim: cada merge de PR. Sem ok nominal, o PR fica verde em draft/ready aguardando. Prova: oks registrados.
- [ ] **Etapa 287** - Decisao do Joaquim: cada aplicacao de migration em producao e cada deploy de Edge. Prova: oks registrados.
- [ ] **Etapa 288** - Decisao do Joaquim: cada lote de delecao de branch/worktree/tag. Prova: oks por lote.
- [ ] **Etapa 289** - Decisao do Joaquim: custo novo, mudanca de infra/DNS ou afrouxamento de protecao. Prova: pedidos separados.
- [ ] **Etapa 290** - Gate F28: nada pendente de decisao sem texto pronto de 1 linha (o que, risco, recomendacao). Prova: lista de pedidos.

## F29 Entregaveis finais
- [ ] **Etapa 291** - Entregavel 1: PRs mergeados com links e OIDs antes/depois. Prova: tabela final de PRs.
- [ ] **Etapa 292** - Entregavel 2: relatorio de drift de migrations (ledger fechado) com hashes. Prova: relatorio anexado.
- [ ] **Etapa 293** - Entregavel 3: artefatos regenerados do canonico (types, catalogo, manifesto). Prova: PR de artefatos.
- [ ] **Etapa 294** - Entregavel 4: inventario final de branches e worktrees (antes/depois). Prova: contagens finais.
- [ ] **Etapa 295** - Entregavel 5: runbook de sincronizacao mensal. Prova: arquivo em docs.
- [ ] **Etapa 296** - Entregavel 6: tabela de aceites F25 completa ponta a ponta. Prova: tabela com provas.
- [ ] **Etapa 297** - Entregavel 7: lista do que foi adiado e por que (nada some em silencio). Prova: lista de adiados.
- [ ] **Etapa 298** - Entregavel 8: este plano marcado como executado, com desvio e links por fase. Prova: cabecalho atualizado.
- [ ] **Etapa 299** - Entregavel 9: resumo em linguagem comum para o Joaquim (o que sincronizou, o que espera a ok dele). Prova: resumo no PR de governanca.
- [ ] **Etapa 300** - GATE FINAL F29: revisor independente assina que Local = GitHub = Banco (ou cada diferenca restante tem ordem escrita do Joaquim). Prova: assinatura final datada.

### Fim do plano - 300 etapas (F00-F29, 10 por fase)
> Execucao estimada: 5 dias uteis em ondas (F24). Atos externos aguardando ordem nominal do Joaquim ao longo de todo o plano: merges de PR, aplicacoes de migration em producao, deploys de Edge e delecoes em lote.

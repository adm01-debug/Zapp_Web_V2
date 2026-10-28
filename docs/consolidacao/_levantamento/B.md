# Levantamento B — arquivos locais a processar

**Escopo:** somente `/home/joaquim_ataides/projetos/ZAPP WEB V2 - LOCAL - ARQUIVOS A PROCESSAR` (B), comparado com a árvore limpa em `/home/joaquim_ataides/zapp-worktrees/consolidacao-baseline-20261028`. Referência de código da `main`: `653f3d3304eec342a4360fd14d1b0c1d45d1f202` (o `HEAD` da árvore é `c923c73619a0dbb3ff34a4db64c6a3be5a163327`, commit apenas de `BASELINE.md`). Leitura em 28/10/2026. Origem e GitHub intactos; nenhum commit feito.

## Método e cobertura

- `find` inicial: 584.817 arquivos regulares e 51.721 diretórios. A caminhada de metadados registrou 585.259 entradas de arquivo, incluindo links simbólicos; a diferença decorre principalmente do tratamento de links. **178.642 arquivos úteis** constam individualmente em `B-arquivos.tsv`, com tipo, tamanho, SHA256 quando seguro, equivalente por caminho/nome, igualdade por SHA256, decisão proposta e prioridade.
- Foram separados dependências e artefatos: `node_modules` (399.030 entradas), `graphify-out` (6.451), `dist` (501), `.tmp` (368), metadados internos `.git` (186), `out` (5), `test-results` (4), `__pycache__` (4) e `playwright-report` (1). Arquivos `.git` de ponteiro, `*.tsbuildinfo` e `*:Zone.Identifier` também foram excluídos do índice útil. Os 464 links simbólicos não foram seguidos; nenhum destino externo a B foi varrido.
- Os nomes de **9.646 arquivos potencialmente sensíveis** foram registrados sem ler conteúdo nem calcular hash: **8.038** sob `sensiveis/` (incluindo 4 `.env*`), **51** outros arquivos `.env*` e **1.557** demais nomes que sugerem token/chave/credencial. As áreas de `sensiveis/` foram tratadas somente por metadados. Esses itens foram excluídos da integração V2 ou marcados `TERMINAR` para revisão técnica segura; nenhum recebeu `INTEGRAR`. Os nomes constam no índice local, sem valores. O dono deve verificar se há credenciais ativas e providenciar rotação quando necessária, sem copiá-las ao repositório.
- Equivalência por nome considera nome e, quando possível, caminho relativo dentro de `src/`, `supabase/`, `docs/`, `scripts/`, `e2e/`, `tests/`, `.github/`, `public/` e `qa/`. Igualdade de conteúdo foi aferida por SHA256, inclusive quando o nome diverge. Nome igual sem hash igual **não** prova versão aproveitável.

| Medida | Total |
|---|---:|
| Código JS/TS/Python | 93.066 |
| Edge functions | 8.437 |
| SQL/migrations | 27.332 |
| Scripts | 4.976 |
| Documentos `.md`/`.txt` | 20.863 |
| Configuração/dados | 15.200 |
| Imagens | 3.071 |
| Outros | 5.697 |
| Arquivos exatamente iguais à `main` por SHA256 | 141.963 |
| Arquivos com conteúdo diferente e hash calculado | 27.033 |
| Arquivos sem hash por proteção | 9.646 |
| Nomes/caminhos equivalentes na `main` | 161.345 mesmo caminho; 3.249 mesmo nome |
| Sem equivalente por nome | 14.048 |
| Conteúdos SHA256 distintos em B | 15.760 |

As cinco decisões por arquivo estão em `B-arquivos.tsv` (um script de Telefonia com hash igual foi classificado como `DESCARTAR` deste pacote, enquanto os três testes menores foram comparados por casos): **141.962 `JÁ ESTÁ NA MAIN`**, **34.128 `DESCARTAR`**, **1.021 `INTEGRAR`**, **1.531 `TERMINAR`**, **0 `DECISÃO DE NEGÓCIO`**. São propostas de triagem, não autorização para mesclar ou eliminar. Cada uma das **1.021 linhas `INTEGRAR` é apenas candidata por diferença de hash/localização; não há prova de valor funcional**. `DECISÃO DE NEGÓCIO` ficou vazia porque os casos sensíveis pedem tratamento operacional/técnico e nenhuma escolha de produto exclusiva do dono foi identificada nesta varredura. A decisão `DESCARTAR` aplicada a cópias antigas/arquivadas exige confirmação histórica antes de movê-las na Fase 5. `INTEGRAR` exige revisão do diff e testes na Fase 3.

## Repositórios e worktrees encontrados

Há **26 marcadores `.git`**: 21 ponteiros dos worktrees copiados para B, dois clones em `anexos/sensiveis/` e três repositórios reais de QA arquivada. Os **23 ponteiros** levam a diretórios Git ausentes; por isso branch, último commit, `git status`, commits fora da main e presença remota são **indisponíveis** nesses casos. Os nomes de branch nos prompts são intenção histórica, não estado Git verificável. `B-repositorios.tsv` contém cada caminho, ponteiro, disponibilidade e metadados acessíveis.

Nos três repositórios reais de `anexos/arquivo/qa-fase0/qa4/t/`: `ia` está em `main` no commit `93fe7f8dea` (04/10/2026, mensagem `c`), `origin` e `ref` estão em `main` no commit `26959e727b` (04/10/2026, mensagem `o-1-1791132585218904685`). `ia` e `origin` não têm branch remota local; `ref` tem. `git log main..HEAD` é vazio nos três. `ia` e `origin` estão limpos; `ref` tem `graphify-out/` não rastreado. Não houve consulta à rede.

### Cópias em `zapp-worktrees/`

As 21 cópias somam **157.407 arquivos úteis**. A maioria é idêntica à `main`; os arquivos divergentes repetidos em quatro ou mais cópias receberam `DESCARTAR` como versão compartilhada antiga, sujeitos a revisão histórica. `B-deltas-worktrees.tsv` isola **1.091** diferenças presentes em até três cópias no mesmo caminho e SHA (a maioria em `preview`); o índice completo mantém todas as linhas.

| Cópia | Arquivos | SHA igual à main | Delta específico (até 3 cópias) | Foco de revisão |
|---|---:|---:|---:|---|
| `ci-cache-261020` | 7522 | 6811 | 6 | CI/workflows |
| `docs-contatos` | 7536 | 6836 | 0 | documentação de Contatos |
| `docs-p053-ledger` | 7534 | 6829 | 5 | ledger P053 |
| `fix-contatos-cabecalho` | 7553 | 6846 | 7 | cabeçalho/novo contato |
| `fix-ga-resto-sonar-contracts` | 7522 | 6791 | 26 | contratos CI/DB |
| `fix-ga-resto-typessync` | 7529 | 6808 | 12 | type sync e DB |
| `fix-toque44-spec` | 7551 | 6849 | 2 | acessibilidade 44 px |
| `ga-resto-docs-regen` | 7523 | 6807 | 9 | documentação de deploy |
| `ordem-abas-261020` | 7534 | 6837 | 0 | ordem de abas |
| `ordem-abas-doc-261020` | 7534 | 6834 | 0 | ordem de abas, docs |
| `preview` | 6669 | 5311 | 1000 | prévia histórica extensa |
| `resto-dbmigrate` | 7534 | 6804 | 20 | migração DB |
| `talkme-a-banco` | 7540 | 6831 | 0 | Talk Me banco |
| `talkme-b-midia` | 7540 | 6832 | 0 | Talk Me mídia |
| `talkme-c-perf` | 7540 | 6833 | 0 | Talk Me desempenho |
| `talkme-d-entrada` | 7541 | 6831 | 0 | Talk Me entrada |
| `talkme-e-e2e` | 7542 | 6832 | 0 | Talk Me e2e |
| `talkme-gov` | 7525 | 6814 | 0 | Talk Me governança |
| `talkme-ledger` | 7537 | 6837 | 1 | Talk Me ledger |
| `talkme-revoke` | 7535 | 6835 | 0 | Talk Me permissões |
| `test-e2e-contatos-fab` | 7552 | 6849 | 3 | Contatos FAB e2e |

**Deltas mais específicos:** `fix-contatos-cabecalho` tem 7 arquivos de componente/teste singulares; `test-e2e-contatos-fab` tem 3; `fix-toque44-spec` tem 2; `docs-p053-ledger` tem 5 arquivos de ledger; `ci-cache-261020` tem 6; `resto-dbmigrate` tem 20; `fix-ga-resto-sonar-contracts` tem 26; `fix-ga-resto-typessync` tem 12; `ga-resto-docs-regen` tem 9. Os worktrees Talk Me quase não têm delta específico e os arquivos centrais verificados (`TalkMeMedia.tsx`, `useTalkMeQueue.ts`, `e2e/talk-me.spec.ts`, migration de busca) já têm SHA256 idêntico na `main`. Como o Git desses 21 worktrees está quebrado, isso **não** substitui prova de merge de commits.

## Peças fora das cópias do repositório

| Item/grupo em B | Evidência de comparação | Funcionalidade | Decisão proposta | Prioridade |
|---|---|---|---|---|
| `Zapp_Web_V2-anexos/wip/telefonia-lacunas-files/` (3 testes e 1 script) | Script igual à `main`; testes com SHA diferente e a `main` maior: `calls-access` 14 vs 5 casos `it`, `CallEngine` 39 vs 12, `useSipClient` 54 vs 28 | Telefonia | `DESCARTAR` como versão anterior após checar se há asserção exclusiva | P2 |
| `Zapp_Web_V2-anexos/wip/patch-notify-due-tasks/` (2 SQL e 1 teste) | Sem SHA igual à `main` no levantamento | Autorização de lembretes | `INTEGRAR` se o contrato atual ainda precisar da correção | P0 |
| `Zapp_Web_V2-anexos/wip/src/components/inbox/location-picker/__tests__/useAddressAutocomplete.e80-load.test.tsx` | Sem SHA igual à `main` | Localização no Inbox | `INTEGRAR` após rodar/verificar teste | P0 |
| `Zapp_Web_V2-anexos/wip/recuperados/` (`useDiagnosticsData` stash e `EditQueueDialog.bak`) | Sem equivalente exato na `main` | Diagnóstico/filas | `TERMINAR` avaliação de recuperação | P1 |
| `Zapp_Web_V2-anexos/wip/x006-wip/` | Dois arquivos com SHA já existente na `main` | Talk X | `JÁ ESTÁ NA MAIN` | P3 |
| `Zapp_Web_V2-anexos/design/` | 65 arquivos úteis: 37 SHA iguais à main, 28 distintos; prévias e imagens têm caráter de referência | Telefonia, Contatos, Talk X, Tarefas | `TERMINAR` avaliação visual; não copiar HTML de protótipo para produção | P2 |
| `analise-projeto-90/` | 13 arquivos úteis; plano de 100 etapas + simulação de 107, protótipos HTML e ZIP | Design/Inbox | `TERMINAR` reconciliação do plano com as views efetivas na main (55 na medição) | P2 |
| `Zapp_Web_V2-anexos/mapa-zapp-v2/` | 44 arquivos distintos; chats antigos e dados de triagem | Mapa, Contatos, Tarefas, IA, Telefonia, Talk X | `TERMINAR` reconciliação documental | P2 |
| `Zapp_Web_V2-anexos/auditorias/` | 129 itens de evidência; 4 SHA iguais | Auditoria de paridade/DB/edge | `TERMINAR` revisão de achados ainda válidos | P2 |
| `Zapp_Web_V2-anexos/arquivo/` | 12.906 arquivos úteis, majoritariamente backups/histórico; 60 SHA iguais | Arquivo histórico | `DESCARTAR` do fluxo de integração, preservando origem até validação | P3 |
| `Zapp_Web_V2-anexos/sensiveis/` | 8.038 nomes no índice, sem leitura/hash | Material sensível | `DESCARTAR` da integração V2, sem mover; dono verifica credenciais ativas e rotação | P1 |
| `zapp-web-v3*.md` (3 arquivos) | Documentos do produto V3, fora do escopo | Zapp V3 | `DESCARTAR` da integração V2; sem mover | P3 |
| `design-system-zapp/SKILL.md`, `backend-zapp-como-provar/SKILL.md` | Instruções locais, sem equivalente por nome | Processo de desenvolvimento | `TERMINAR` avaliação documental | P3 |

**Planejamento lido:** `analise-projeto-90/PLANO-100-ETAPAS.md` e `SIMULACAO-GAPS.md` descrevem tokens/tema futurista, sidebar, lista/chat/input do Inbox, CRM, dashboard, gamificação, mobile e 7 cuidados adicionais (erros, foco, toque, skeleton, textos, animação, contraste). `zapp-worktrees/.talkme-prompts/plano50.md` pede simplificar o cabeçalho de Contatos e criar FAB verde sem perder ações/indicadores. Os prompts `pA`–`pE` especificam busca segura no banco Talk Me, mídia, desempenho, foco/entrada no Inbox e E2E/guia; os arquivos centrais verificados já estão na `main`. O documento de Telefonia contém 60 melhorias propostas (32 P0, 26 P1, 2 P2), com riscos de histórico limitado, sessão SIP/WhatsApp, identidade da chamada e notas. O `LEIA-ME` da prévia de Contatos diz expressamente que ela usa dados demonstrativos e não é atualização publicada. Os documentos `zapp-web-v3*.md` são do V3 e não foram tratados como especificação do V2.

## Limites da decisão

Este é um inventário estático. O SHA comprova igualdade de bytes, não que a funcionalidade esteja correta ou publicada. `INTEGRAR`, `TERMINAR` e `DESCARTAR` são **propostas por arquivo** baseadas em localização, tipo e comparação; antes de PR ou arquivamento, verificar histórico e diff funcional. A árvore `preview` contém muitas versões divergentes e antigas: nenhuma deve ser copiada em lote. A falta dos diretórios Git dos 23 ponteiros impede recuperar status/commits locais apenas a partir de B. Não foi lido conteúdo de credenciais; não houve alteração em B, GitHub, banco nem commit. Os arquivos `.env*`, nomes de credenciais/tokens e toda a árvore `sensiveis/` permanecem onde estão e não devem ter valores copiados. A pendência do dono é verificar, em ambiente seguro, se existem credenciais ativas nesses locais e rotacioná-las quando necessário.

## Índices produzidos

- `B-arquivos.tsv`: uma linha por arquivo útil, decisão e prioridade individual.
- `B-excluidos.tsv.gz`: uma linha por cada uma das 406.617 entradas de dependências, builds, caches e metadados excluídas da triagem útil; apenas caminhos e categoria, sem conteúdo. Junto de `B-arquivos.tsv`, cobre as 585.259 entradas encontradas na caminhada de metadados.
- `B-candidatos.tsv`: 2.552 linhas `INTEGRAR`/`TERMINAR` para triagem segura; nenhuma contém hash de arquivo protegido.
- `B-deltas-worktrees.tsv`: 1.091 diferenças específicas de worktree.
- `B-repositorios.tsv`: 26 marcadores Git e limitações de cada um.
- `B-resumo-tecnico.tsv`: contagens por topo, tipo, decisão e worktree.

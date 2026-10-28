# Plano de montagem do Zapp Web V2

**28/10/2026.** Este plano usa o [inventário](INVENTARIO.md), o [baseline](BASELINE.md) e os índices por origem. O GitHub mudou durante a coleta: o inventário remoto de 12:07 UTC tinha 164 PRs/221 branches e a consulta posterior tinha 163 PRs/220 branches, pois o #2306 foi mergeado e sua branch removida. Antes de cada ação, atualizar `origin/main` e comparar novamente o item com o SHA atual. Nenhum arquivo de origem, PR ou branch foi limpo nesta fase.

## Regras para executar cada grupo

1. Nascer sempre da `main` atualizada. Um defeito ou uma funcionalidade por branch `codex/consolida-<nome>` e por PR. Arquivos iguais por hash, históricos, código V3 e cópias de builds ficam fora dos PRs.
2. Primeiro reproduzir a lacuna no código atual e ler o diff da fonte. Para código sem commit, preservar a origem e copiar apenas os trechos necessários. Para commits úteis, preferir cherry-pick revisado. Não importar uma árvore antiga ou um patch inteiro.
3. Rodar teste do caminho principal e, conforme a área, contratos de Edge/DB e E2E. Rodar build, lint, typecheck e Vitest; comparar com `BASELINE.md`: **15.562 testes passando** como piso, zero erro novo de build, lint ou tipos. O baseline tinha 603 erros/213 avisos de lint, 22 erros TS e uma exceção assíncrona na suíte; registrar os números reais de cada PR sem esconder falhas preexistentes.
4. Fazer commit em português, push e PR com origem, diff funcional e números antes/depois. Merge squash somente com os checks obrigatórios verdes e sem conflito. Se a `main` avançar, atualizar a branch e repetir os checks. Migrações são testadas apenas no banco local; produção segue seu fluxo versionado com aprovação humana.
5. Depois do merge, mover a origem correspondente de B/C/D/E para `_arquivo/<data>/<grupo>/` somente quando não houver serviço usando o diretório, com `MANIFESTO_ARQUIVO.md` apontando caminho anterior e número do PR. Material pendente continua identificado no relatório. F/G permanecem somente leitura.

## Ordem de trabalho

| Ordem | Grupo funcional / branch | Fontes | Teste principal e critério de pronto | Dependência |
|---:|---|---|---|---|
| 1 | Comparação segura de secrets — `codex/consolida-comparacao-segredos` | Dois handlers de Edge sem commit em A | Token certo aceita, errado/ausente rejeita; contrato HTTP igual e comparação de tempo constante; gates sem regressão | Helper existente em `_shared`; nenhuma migration |
| 2 | XP dos minijogos — `codex/consolida-xp-minijogos` | Três arquivos sem commit em A; migration já versionada na main | Partida com pontos credita uma vez e respeita limite diário no banco local; teste de hook, pontuação e erro da RPC | Confirmar RPC/tipos locais antes do front |
| 3 | Sentimento: leitura parcial — `codex/consolida-sentimento-parcial` | `useSentimentData.ts` sem commit em A | Erro na leitura de agentes não apaga métricas; erro principal aparece; tendência do #2301 permanece correta | Comparar com #2301 já mergeado |
| 4 | Quatro contratos de RPC tipados — branches `codex/consolida-<rpc>` | Cinco arquivos sem commit em `hermes-workspaces/.integra/lote-main` | Cada hook compila sem cast genérico e contrato da RPC corresponde ao SQL versionado; um PR por RPC | Tipos do banco local; não publicar `types.ts` inteiro por cópia |
| 5 | Arquivos soltos recuperados — `codex/consolida-diagnosticos` e `codex/consolida-edicao-filas`, se houver lacuna | `Zapp_Web_V2-anexos/wip/recuperados/` em B | Reproduzir defeito atual e testar fluxo de diagnóstico/edição; sem PR se já coberto | Conferir fonte sem commit e origem do `.bak` |
| 6 | Contatos: período de calendário — `codex/consolida-periodo-contatos` | Commit `4e323ed8a8` em A, HEAD `45338438ba` em C e patch de F como evidência | 31/03 recua a 28/02, mês/trimestre/ano corretos; teste deixa de ser `it.fails` | Não usar as três alterações regressivas sem commit do `preview` |
| 7 | CI: exceção após teste de Tarefas — `codex/consolida-ci-tarefas-dnd`, se ainda reproduzida | Baseline Vitest e `TasksBoardMode.a11y.test.tsx` da main | Suíte encerra sem `document is not defined`, mantém as 15.562 aprovações; corrigir desmontagem/temporizador pela causa raiz | Prérequisito se o erro impedir checks verdes |
| 8 | Contatos: cabeçalho/FAB e teste E2E — `codex/consolida-contatos-fab` | B `fix-contatos-cabecalho`, `test-e2e-contatos-fab`; PR #2135 | Botão acessível cria contato no desktop/móvel; ações anteriores preservadas; E2E e unitários | Evitar código duplicado do PR e da cópia local |
| 9 | Fila offline por usuário — `codex/consolida-fila-offline-usuario` | PRs #2267/#2090; B apenas se tiver trecho exclusivo | Logout e troca de atendente não entregam texto alheio; testes de auth/fila | Separar os 169 arquivos comuns do PR #2268 |
| 10 | Templates e base de conhecimento — `codex/consolida-templates-knowledge` | PR #2268, comparar #2085/#2073 | Supervisor autorizado edita; erro de rede não trava; operador sem acesso não escreve | Separar os 169 arquivos comuns do PR #2267 |
| 11 | Contratos de CI, banco, tipos, Talk Me, inbox, UI, design e demais candidatos | Grupos de B, C/D/E e PRs remotos nos anexos abaixo | Cada grupo tem teste e critério específico no anexo; grupos grandes são **filas de triagem**, divididas em PRs por lacuna comprovada | Seguir dependências dos anexos; nunca PR de centenas de arquivos por proximidade de pasta |
| 12 | Verificar as 55 telas do registro | `FEATURE_REGISTRY.md`, componentes e testes da main | Para cada tela, ação principal, vazio/erro, permissão e teste; concluir, remover justificadamente ou registrar bloqueio exato em `PENDENCIAS.md` | [Índice de validação](_plano/FEATURES-validacao.tsv) |

Os 10 itens classificados `Partial` pela guarda são `sentiment`, `reports`, `docs`, `automations`, `integrations`, `google-calendar`, `themes`, `public-api`, `talkx-kit` e `evolution-monitor`. `Partial` significa que a guarda não encontrou acesso direto a dados no arquivo da tela; várias usam hooks ou filhos com dados. Conferir cada uma antes de implementar. `google-calendar` usa estado local na tela e pode depender de credencial/integração externa; `public-api` mostra desativação e `talkx-kit` é um kit de desenvolvimento. Essas três exigem uma decisão de produto documentada **se** não houver caminho funcional autorizado. As outras 45 telas também precisam de validação funcional, mesmo classificadas `Full`.

## Anexos operacionais que fazem parte deste plano

- [Grupos de A e F/G](_plano/A-grupos.md): origem, branch, teste e critério dos arquivos sem commit, patches e teste de paginação da Inbox; inclui dez descartes por regressão comprovada.
- [38 grupos da pasta B](_plano/B-grupos.md) e [índice das 2.552 linhas candidatas](_plano/B-grupos-indice.tsv): cada linha pertence a um grupo funcional. `INTEGRAR` automático no inventário **não comprova valor**; grupos com centenas de arquivos só viram PRs após identificar uma lacuna pequena e testável.
- [Grupos de C/D/E](_plano/CDE-grupos.md): 15 entradas locais, Contatos, quatro RPCs, testes de Dashboard e WIP Evolution; cada branch condicional tem fonte, teste e pronto.
- [PRs e branches do GitHub](_plano/GITHUB-limpeza.md): número, branch, sobreposição real de arquivos e condição para fechar/apagar, além dos grupos funcionais remotos. É a lista de limpeza exigida; **não fechar nem apagar enquanto a equivalência não estiver comprovada**.
- [55 validações por tela](_plano/FEATURES-validacao.tsv): origem, branch se houver lacuna, teste relacionado e critério de pronto. O teste listado é ponto de partida; verificar que cobre a ação principal antes de considerar concluído.

## PRs e branches para a fase de limpeza

O [anexo do GitHub](_plano/GITHUB-limpeza.md) propõe fechamento **condicional** de #2109 em favor de #2209 após integrar e testar a correção; #2060 após conferir sua diferença exclusiva; #2111/#2208 se o tipo de hook antigo continuar sem consumidor; #2071/#2230 porque a main já removeu o hook morto e preservou leitores ainda usados. Nenhum fechamento é automático: o comentário futuro citará o PR/commit substituto e a prova de equivalência. O mesmo anexo lista **24 branches** de workflow candidatas à exclusão, uma a uma, com motivo e risco; só apagar após confirmar ausência de conteúdo exclusivo e de uso por PR ou serviço.

PRs grandes #2267/#2268 compartilham 169 caminhos, mas têm testes e objetivos exclusivos; extrair por funcionalidade antes de decidir o destino. #2277 contém `DROP` de tabela de backup e depende de autorização específica do dono para essa parte. #2238 pede decisão de produto sobre entrega ambígua. Ambos seguem documentados, sem alteração de produção. PRs RADAR com dependência entre fases permanecem abertos para triagem, sem fechamento por idade ou título.

## O que será registrado como pendência

Quando a implementação depender de secret, acesso externo, pagamento ou escolha de produto, registrar em `PENDENCIAS.md` o arquivo/funcionalidade, motivo exato do bloqueio e passo simples para o dono, e continuar no grupo seguinte. Os 9.646 caminhos protegidos em B e os caminhos sensíveis de D/E não fornecem código para PR: o dono deverá verificar em ambiente seguro se há credenciais ativas e rotacioná-las quando necessário. O plano não contém nem solicita valores dessas credenciais.

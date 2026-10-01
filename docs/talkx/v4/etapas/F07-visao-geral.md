# Fase 7 — Visão geral (X077–X082)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 01. 6 etapas.
>
> **Entrega da fase:** A tela de entrada do módulo igual ao desenho, com números reais.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de kit, estados e Visão geral** (etapas X077, X078, X079, X080, X081, X082)

Base: `main` @ `3d09433` (2026-10-01). 20 etapas, na ordem de execução. Todas são front (sem DDL, sem deploy de edge).
Abreviações: `Shared` = `src/components/talkx/talkxShared.tsx` · `Overview` = `src/components/talkx/TalkXOverview.tsx` ·
`View` = `src/components/talkx/TalkXView.tsx` · `useTalkX` = `src/hooks/integrations/useTalkX.ts` ·
`kit/` = `src/components/talkx/kit/` (criado em X042).

Ordem: X042…X055 são o kit e a navegação do módulo (pré-requisito das demais trilhas); X077…X082 são a tela 01.
Etapas de kit que só entregam componente trazem **Fecha: —** e dizem em qual etapa o ID fecha.

---

## Etapas

### X077 · KPIs da Visão geral lidos da RPC, com fonte correta e comparativo

- **Fase:** 7 · **Tela:** 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X028, X044, X045, X047, X072
- **Fecha:** T01-026, T01-027, T01-028, T01-029
- **Dependências, em detalhe:** X044, X045, X047 ; CAP-080 (visão geral: filtro `sending`, contatos distintos, `completed` do período anterior, série diária de campanhas) ; CAP-084 ; CAP-016
- **Hoje:** Os 5 KPIs são calculados no navegador sobre a lista inteira (`Overview:96-108`): "Em andamento" sem barras (`:123`); "Taxa de sucesso" = enviados/(enviados+falhas), impressa com ponto e sem comparativo (`:103,125`); "Contatos alcançados" = soma de `sent_count`, que conta o mesmo contato mais de uma vez (`:104,126`). A RPC `talkx_overview_stats` não tem consumidor e hoje filtra `status IN ('running','paused')`, soma `total_recipients` como alcance e não devolve `completed` do período anterior (`supabase/migrations/20260916180000_talkx_rpc_null_guards_and_reply_index.sql:43,49,60-72`).
- **Fazer:** `src/hooks/integrations/useTalkXOverviewStats.ts` chama `talkx_overview_stats(p_from, p_to)` com o período da barra de filtros (padrão: últimos 30 dias; "Todo o período" oculta os comparativos), reconsulta a cada 30 s só com campanha ativa e é invalidado pelo tempo real. Renderizar com `KpiCard`: Total de campanhas (`current.campaigns` + barras da série diária); Em andamento (`current.active` = `sending` + `paused`, + barras de envios por dia); Concluídas (comparativo relativo com `previous.completed`); Taxa de sucesso = entregues/enviados (`delivery_rate_pct`, anel, comparativo em pontos, oculto se o período anterior tiver menos de 50 enviados); Contatos alcançados = contatos distintos com envio no período (comparativo relativo). Campo ausente na resposta → "Sem dados ainda"; nenhum cálculo de KPI no navegador. Remover `totals` de `Overview:96-108`.
- **Aceite:** `useTalkXOverviewStats.test.ts` com resposta fixa: valores e comparativos "+22%", "+2,1%", "+18%"; período anterior zerado → sem comparativo; "Todo o período" → sem comparativo. `grep -n "reduce(" src/components/talkx/TalkXOverview.tsx` sem ocorrência de KPI. Em homologação com fixture: `talkx_overview_stats(...)->'current'->>'contacts_reached'` igual a `select count(distinct contact_id) from talkx_recipients where sent_at >= … and sent_at < …`. Contrato `talkx-analytics-contract.test.mjs:42-45` atualizado. Print da faixa de KPIs ao lado do mock.
- **V3:** V41
- **Negócio:** Os cinco números do topo passam a vir do banco, com "contatos alcançados" contando cada pessoa uma vez e a variação contra o período anterior.

### X078 · Listagem de campanhas paginada no servidor, com tempo real completo

- **Fase:** 7 · **Tela:** 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X047, X057
- **Fecha:** — (comportamentos implícitos da tela 01: volume em memória e exclusão não refletida; base de X079, X081 e X082)
- **Dependências, em detalhe:** X047 ; CAP-099
- **Hoje:** O hook traz todas as campanhas com `select('*')` e ordena por `created_at` (`useTalkX:133-145`); busca, filtro e paginação são feitos no navegador (`Overview:81-94`). O tempo real ouve UPDATE e INSERT, não DELETE (`useTalkX:148-181`): campanha excluída em outra sessão só some na próxima consulta. Sem tempo real, há polling de 15 s (`useTalkX:144`). `View` resolve rotas com `campaigns.find` (`View:77,90`). O padrão é 8 por página (`Overview:53`); o mock mostra "10 por página".
- **Fazer:** `src/hooks/integrations/useTalkXCampaignList.ts`: consulta com colunas nomeadas, `count: 'exact'`, `.range()`, ordenação por `name`, `status`, `sent_count`, `scheduled_at` ou `created_at`, filtros de status, segmento (`segment_id`; "Seleção manual" = nulo), criador e período, e busca `ilike` em nome, descrição e mensagem com escape de `%`, `,` e parênteses; mantém a página anterior enquanto carrega. `useTalkXCampaign(id)` para as rotas de `View`. Um canal de tempo real: UPDATE corrige a linha nas páginas em cache (espera de 500 ms); INSERT e DELETE invalidam lista, KPIs e indicador de campanha ativa; polling de 15 s quando o canal não está inscrito. Paginação: padrão 10, opções 10/20/50, e a página recua quando o total diminui. `useTalkX().campaigns` continua servindo Analytics e "Em andamento" até os demais trilhas trocarem por RPC.
- **Aceite:** `useTalkXCampaignList.test.ts`: página 3 com 10 por página pede o intervalo 20–29; ordenação e filtros vão na consulta; busca `50%,(x)` sai escapada; evento DELETE invalida a lista; total caindo de 21 para 20 na página 3 leva à página 2. Teste em Postgres descartável com 1.200 campanhas: a 2ª página devolve 10 linhas e `count` = 1200.
- **V3:** — (substitui a virtualização prevista no V42)
- **Negócio:** A lista continua rápida com muitas campanhas e reflete na hora o que outra pessoa criou, alterou ou excluiu.

### X079 · Tabela da Visão geral nas colunas do mock, sobre `TalkXTable`

- **Fase:** 7 · **Tela:** 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X028, X043, X057, X061, X078
- **Fecha:** T01-040, T01-042, T01-044, T01-045, T01-046, T01-050
- **Dependências, em detalhe:** X043, X078 ; CAP-059 (miniatura por URL assinada do `talkx-media`) ; CAP-012 (campanha com mais de um segmento) ; CAP-016
- **Hoje:** Tabela feita à mão (`Overview:212-280`): tile por objetivo no lugar da miniatura (`:230`); ícone genérico no canal (`:241`); agendada mostra "0%" sem barra e rascunho com destinatários mostra "0%" (`:244-246`); a 2ª linha de resultados é falhas ou "% de sucesso", nunca entregues (`:248-251`); data sempre absoluta (`:254`, `Shared:89-90`); sem ordenação (grep `aria-sort` = 0). Há dois blocos que o mock não tem: "Rascunhos pendentes" (`Overview:139-171`) e "Insights" (`:174-194`).
- **Fazer:** Reescrever a tabela com `TalkXTable` e as células de X043: Campanha (miniatura de `media_url` quando imagem, com fallback no tile; nome; descrição), Segmento / Público (chip do segmento, "+N" quando houver mais de um, "N contatos"), Canal (logo WhatsApp), Status (ponto pulsante em `sending`), Progresso (rascunho "-"; agendada "0%" com barra vazia; demais com % e barra na cor do status), Resultados ("N enviados" / "M entregues (x,x%)" com `delivered_count`; falhas no `title`), Agendada em (`scheduled_at ?? started_at` com "Hoje"/"Ontem" + "por <criador>"), Ações. Ordenação no servidor por Campanha, Status, Resultados e Agendada em, com `aria-sort`. Clique no nome abre `campaign=<id>`. Os blocos "Rascunhos pendentes" e "Insights", que o mock 01 não tem, **não são removidos**: passam para baixo da tabela, recolhidos por padrão (decisão N35) — função que existe hoje não sai sem pedido do dono.
- **Aceite:** `TalkXOverview.table.test.tsx` com 5 linhas espelhando o mock: em andamento "68%" com barra; agendada "0%" com barra vazia; concluída "100%"; pausada "42%"; rascunho "-". "821 entregues (96,6%)". "Hoje, 10:00", "Ontem, 16:20" e "15 set. 2026, 09:00" com relógio fixo. Clique no cabeçalho muda a ordenação da consulta e o `aria-sort`. Sem mídia → tile. Print 1672×941 com fixture das 8 campanhas do mock, lado a lado.
- **V3:** V42
- **Negócio:** A lista mostra a imagem da campanha, quantos foram entregues, datas como "Hoje, 10:00" e pode ser ordenada por coluna.

### X080 · Ações de linha persistidas: duplicar, excluir com regra, pausar, retomar e cancelar

- **Fase:** 7 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X014, X024, X025, X026, X043, X049, X051, X052, X078
- **Fecha:** T01-048, T17-034, T17-035, T17-036, T17-037
- **Dependências, em detalhe:** X043, X049, X051, X052, X078 ; CAP-109 (RPC de duplicar e de excluir com regra) ; CAP-053 ; CAP-054 ; CAP-055 ; CAP-096
- **Hoje:** Menu montado à mão (`Overview:257-274`). Pausar e retomar não pedem confirmação (`:267-268`). Duplicar não grava nada: monta um objeto com `id: ''` e abre o wizard (`View:135-141`, `src/components/talkx/talkxCampaignDraft.ts:7-26`); não há modal de duplicar (grep `Duplicar campanha` = 0). Excluir só aparece em rascunho (`Overview:272`), o banco só permite rascunho (`supabase/migrations/20260930420000_talkx_guards_fail_closed.sql:74-78`) e `deleteCampaign` não tem `onError` (`useTalkX:291-300`). "Ver relatório" abre o Monitor (`Overview:264`, `View:159`).
- **Fazer:** `src/components/talkx/useCampaignRowActions.tsx` devolve as ações por status, para tabela, grade e "Últimas campanhas": Ver / Monitorar / Ver relatório (rota `campaign=<id>`); Editar (rascunho, agendada); Iniciar agora (`confirmarDisparo`); Pausar (com motivo); Retomar; Duplicar (preset `duplicarCampanha`; ao confirmar chama a RPC de CAP-109, que cria rascunho com a configuração e sem destinatários, contadores nem agendamento, e abre o wizard em `wizard=<novo id>`); Cancelar campanha; Excluir (só nos status que a regra de CAP-109 permite; preset `excluirCampanha` com botão "Excluir", espera e mensagem do servidor em caso de recusa). Ciclo de vida via `useTalkXLifecycle`. Atualização otimista do status na lista, com desfazer em erro, e indicador por linha. Remover `duplicateTalkXCampaignDraft` e seu teste (`__tests__/talkxCampaignDraft.test.ts`) e `duplicateCampaign` de `View:135-141`.
- **Aceite:** `useCampaignRowActions.test.tsx`: matriz de itens pelos 6 status; confirmar duplicar chama a RPC uma vez e a rota vai para `wizard=<id>`; erro da RPC mantém o modal aberto com a mensagem e a lista intacta; recusa `talkx_campaign_delete_denied` mostra a mensagem e a linha permanece. Em homologação: após duplicar, `select count(*) from talkx_campaigns where name = '<nome> (cópia)'` = 1 e `select count(*) from talkx_recipients where campaign_id = '<novo>'` = 0; após pausar pela lista, `talkx_campaign_events` tem `paused` com `actor_id` e motivo.
- **V3:** V43
- **Negócio:** Duplicar cria de fato uma campanha nova em rascunho; pausar, retomar, cancelar e excluir pela lista pedem confirmação e ficam registrados.

### X081 · Filtros da Visão geral (status, canal, segmento, criador, período), grade e massa

- **Fase:** 7 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X043, X045, X078, X079, X080
- **Fecha:** T01-032, T01-037, T01-038, T01-039, T17-004, T17-007
- **Hoje:** O terceiro filtro é "Todos os objetivos"; não há filtro de canal (`Overview:76,84`). Não há período nem botão de atualizar (`refetchCampaigns` só é usado em `TalkXCampaignRunning.tsx:630`). A escolha lista/grade não persiste (`Overview:54`). O vazio filtrado não oferece "Limpar" (`Overview:205`). A seleção não faz nada e não limpa ao trocar página ou filtro (`Overview:55,112,215,227`). O cartão da grade não tem ⋮, checkbox, miniatura nem entregues (`Overview:361-386`).
- **Fazer:** Visão geral usa `TalkXFilterBar` com: busca; "Todos os status"; "Todos os canais" (opções de `TALKX_CHANNELS` em `kit/constants.ts`: só WhatsApp — A15); "Todos os segmentos" (com "Seleção manual"); "Todos os criadores"; chip de período; "Limpar filtros"; ⟳ (refaz lista e KPIs; gira enquanto busca); alternância lista/grade gravada em `localStorage` (`talkx.overview.layout`). Estado em `useTalkXFilterState`, alimentando `useTalkXCampaignList` e `useTalkXOverviewStats`. O filtro de objetivo sai da barra (não está no mock). `CampaignGridCard.tsx` em arquivo próprio: miniatura 16:9, status, chip de segmento e contatos, 3 números (enviados, entregues, falhas), progresso pelas regras da tabela, data e autor, ⋮ (`useCampaignRowActions`), checkbox com a mesma seleção da lista, esqueleto `cards`. `TalkXBulkBar`: "N selecionadas · Pausar · Cancelar · Excluir · Limpar seleção"; cada ação calcula as elegíveis pelo status, confirma com "X de N", executa em sequência e resume o resultado; a seleção sobrevive à troca lista ↔ grade e limpa ao mudar página ou filtro. O filtro de objetivo existente é mantido dentro de "Mais filtros" (decisão N35).
- **Aceite:** `TalkXOverview.filters.test.tsx`: os 4 selects com os rótulos do mock; canal lista "WhatsApp"; "7 dias" muda os argumentos da lista e dos KPIs; ⟳ dispara as duas consultas; o layout persiste após remontar; vazio filtrado tem "Limpar filtros". `TalkXOverview.bulk.test.tsx`: 3 selecionadas (em andamento, rascunho, concluída) → Pausar informa "1 de 3"; trocar para grade mantém a seleção; mudar de página limpa. Prints de lista e de grade ao lado do mock.
- **V3:** V42 (massa, canal), V44, V47 (período)
- **Negócio:** Dá para filtrar por período, canal, segmento e criador, ver em grade e pausar, cancelar ou excluir várias campanhas de uma vez.

### X082 · Painel lateral: Talk X com 3 números reais, ações rápidas, últimas campanhas e dica do dia

- **Fase:** 7 · **Tela:** 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X021, X027, X028, X052, X061, X072, X075, X077, X078, X080 · **Integra com (não bloqueia):** X171
- **Fecha:** T01-055, T01-056, T01-057, T01-058, T01-062, T01-063, T01-064, T01-065, T01-066, T01-067, T01-068
- **Dependências, em detalhe:** X052, X077, X078, X080 ; CAP-080 e CAP-084 (respostas e conversões do período atual e anterior) ; CAP-018 ; CAP-020 ; CAP-067 ; CAP-083 ; CAP-091 (tela de importação) ; CAP-059
- **Hoje:** `HeroCard` não tem ilustração (`Shared:701-726`; `talkxFloat` em `src/components/ui/motion/variants.ts:74` sem uso) e mostra "Mensagens enviadas", "Taxa de sucesso" e "Segmentos salvos" (`Overview:292-296`) no lugar das 3 variações do mock. São 3 ações rápidas, sem "Importar contatos" (`Overview:299-303`); "Criar segmento" só troca de aba (`View:293`). "Ver todas" apenas limpa filtros (`Overview:305`). Últimas campanhas: sem miniatura (`Overview:309`), % sempre de progresso, ponto cinza para azul/violeta/vermelho (`Shared:747`), sem "⋯". Dica com texto fixo e sem ação (`Overview:313`, `Shared:757-769`). O rail não tem esqueleto.
- **Fazer:** Hero: ilustração com 3 tiles flutuantes (WhatsApp, envio, gráfico) animados por `talkxFloat` com movimento reduzido. Três números = variação do período atual contra o anterior, do mesmo `useTalkXOverviewStats`: "mais engajamento" (taxa de resposta), "tempo de resposta" (tempo médio de resposta) e "conversões" (nº de conversões); cada um só aparece com base nos dois períodos (≥ 50 enviados, ≥ 10 respostas, ≥ 5 conversões), senão "Sem dados ainda". Ações rápidas (4): Nova campanha ("Criar campanha do zero"), Usar template, Criar segmento (rota `tab=segments&segment=new`, abre o construtor), Importar contatos ("Adicionar novos contatos", rota da tela de importação). Últimas campanhas: 4 por `started_at`/`updated_at` em consulta própria, miniatura, ponto na cor dos 6 status, "• 68%" de progresso em andamento/pausada e taxa de entrega em concluída, "⋯" com `useCampaignRowActions`, "Ver todas" limpa filtros e leva o foco à tabela. Dica do dia: `TIPS[]` em `kit/constants.ts` (texto sem número), troca por dia; a seta "›" avança; dica com número só vinda de `talkx_benchmarks` com base. Esqueleto `rail`; abaixo de 1280 px o rail vai para baixo em acordeão.
- **Aceite:** `TalkXOverview.rail.test.tsx`: sem base → 3 vezes "Sem dados ainda"; com resposta fixa → "+32%", "-45%", "+28%"; 4 ações, cada uma com a rota esperada; concluída mostra taxa de entrega e em andamento mostra progresso; classe do ponto por status; a dica muda com a data e com a seta. `talkx-analytics-contract.test.mjs:47-50` (proíbe "3× mais chances") continua passando. Prints do rail em 1672 e 1280 ao lado do mock.
- **V3:** V46, V49 (hero)
- **Negócio:** O painel da direita mostra variações reais de engajamento, tempo de resposta e conversões, atalho para importar contatos e as últimas campanhas com menu de ações.

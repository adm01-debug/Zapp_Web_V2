# Fase 14 — Supressão e Analytics (X176–X188)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 06, 07. 13 etapas.
>
> **Entrega da fase:** Lista de supressão completa (motivos, importação, trilha, centro de proteção) e Analytics com gráficos, funil, horários e recomendações.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de supressão e analytics** (etapas X176, X177, X178, X179, X180, X181, X182, X183, X184, X185, X186, X187, X188)

Base: `main` `3d09433` (2026-10-01). Mocks: `docs/talkx/references/06_Lista_de_Supressao.png`, `07_Analytics.png`.

**Abreviações de arquivo**
**SUP** = `src/components/talkx/TalkXSuppression.tsx` · **HSUP** = `src/hooks/integrations/useTalkXSuppression.ts` ·
**ANA** = `src/components/talkx/TalkXAnalytics.tsx` · **INS** = `src/hooks/integrations/useTalkXInsights.ts` ·
**VIEW** = `src/components/talkx/TalkXView.tsx` · **SH** = `src/components/talkx/talkxShared.tsx` ·
**M:<versão>** = `supabase/migrations/<versão>_*.sql` · **CT** = `scripts/db-audit/talkx-analytics-contract.test.mjs`.

**Convenções que valem para todas as etapas com DDL desta trilha** (não repetidas em cada uma)
- Versão da migration reservada com `supabase_migrations.reserve_migration_version`; ordem arquivo → PR → merge → apply
  por `db_query` com o `INSERT` no ledger na mesma transação (`register-migration.mjs`); `supabase/schema-catalog.json`
  e `types.ts` regenerados; `supabase-usage-guard.mjs` com `novas: 0`.
- Teste SQL novo roda em Postgres descartável e é registrado em `.github/workflows/db-guard.yml` (mesmo padrão das
  linhas 344 e 410).
- Função nova: `REVOKE ALL … FROM PUBLIC, anon` e `GRANT EXECUTE … TO authenticated, service_role` explícitos.
- Etapa de tela só fecha com o print 1672×941 ao lado do mock (régua, X004).

Ordem de execução: X007 (não depende de nada e remove uma quebra) → X070…X184 (tela 06: banco, depois tela) →
X072…X188 (tela 07: banco, depois tela).

---

## Etapas

### X176 · Criar RPCs de leitura da supressão: listagem paginada, KPIs e atividade

- **Fase:** 14 · **Tela:** 06 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X017, X029, X070, X071
- **Fecha:** fonte no banco de T06-009, T06-011, T06-014, T06-017, T06-018, T06-042, T06-062, T06-064 (a tela fecha em X178, X179, X184)
- **Dependências, em detalhe:** X070, X071 ; CAP-030 (`respect_suppression`, para "Campanhas protegidas") ; CAP-031 (expiração)
- **Hoje:** a tela lê a tabela inteira, sem `count` nem `range`, e filtra em memória (`SUP:53-64,83-91`); os totais são `length` do que veio (`SUP:93-98`); o hook morto corta em 500 (`HSUP:48`). Não há RPC de supressão para o front (`grep "\.rpc(" src/components/talkx` não acha nenhuma).
- **Fazer:** Três funções `SECURITY INVOKER` que devolvem 42501 para quem não é admin/supervisor. `talkx_suppression_list(busca, origens, motivos, campanha, de, até, status, ordenação, direção, limite ≤ 200, offset)` devolve `{total, rows}`; cada linha traz nome, e-mail e avatar do contato, telefone `coalesce(contacts.phone, phone)`, origem, código/rótulo/tom do motivo, observação, nome da campanha, datas e `status` derivado (`suprimido` | `expirado` | `removido`); a busca casa nome, e-mail e dígitos de telefone. `talkx_suppression_stats(p_days default 30)` devolve, com valor atual, valor do período anterior e série de 8 pontos: suprimidos ativos (sem expirados nem removidos), opt-outs dos últimos `p_days` (`reason_code='opt_out'`, o que inclui `auto_optout`), bloqueios manuais e campanhas protegidas (iniciadas com `respect_suppression`), mais o total de campanhas iniciadas e a lista de campanhas que têm supressão (para o filtro). `talkx_suppression_activity(limite, offset)` lê os eventos `suppression*` com ator, contato (nome, e-mail, telefone) e, para lote, a contagem de linhas do lote. Índice simples em `talkx_blacklist(created_at desc)`.
- **Aceite:** `scripts/db-audit/talkx-suppression-read-rpcs.test.sh` com 12 registros (3 `auto_optout` nos últimos 30 dias, 1 `optout` de 40 dias atrás, 2 manuais, 1 expirado, 1 removido, 1 telefone avulso, 1 com campanha): `stats.optouts.value = 3`; `stats.active.value` não conta expirado nem removido; `list` com limite 5 e offset 5 devolve as linhas 6–10 e `total` constante; filtro `status='expirado'` devolve 1; busca por e-mail acha 1; telefone avulso vem com `contact_name` nulo e `phone` preenchido; agente recebe 42501.
- **V3:** V71 (substitui a view `talkx_blacklist_active`), V72 (fonte dos KPIs)
- **Negócio:** Os números e a lista passam a ser calculados no servidor, corretos mesmo com milhares de contatos suprimidos.

### X177 · Criar RPCs de lote da supressão: importar com prévia e exportar por página

- **Fase:** 14 · **Tela:** 06 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X029, X071, X176
- **Fecha:** CAP-034
- **Dependências, em detalhe:** X071, X176 ; CAP-031 (hoje supressão expirada ainda ocupa o índice ativo e conta como "já suprimido")
- **Hoje:** não existe importação nem exportação (`grep -rniE "csv|xlsx|papaparse" src/components/talkx` = 0). Os índices únicos da lista são parciais (`M:20260930160000:24-26`, `M:20260929860000`), que o `upsert` do PostgREST não alcança — a carga precisa de função.
- **Fazer:** `talkx_suppression_import_batch(p_batch_id, p_rows jsonb, p_reason_code, p_reason, p_expires_at, p_dry_run)` aceita até 500 linhas por chamada: normaliza o telefone (dígitos; DDI 55 quando vier com 10–11 dígitos), casa com `contacts.phone` de contato não excluído para gravar `contact_id`, senão grava telefone avulso; insere com `origin='list'` e `import_batch_id`, `ON CONFLICT DO NOTHING`; devolve `{recebidas, inseridas, ja_suprimidas, invalidas:[{linha, motivo}]}`; com `p_dry_run=true` só classifica. `talkx_suppression_export_page(p_export_id, p_filtros, limite ≤ 1000, offset)` devolve as colunas do arquivo (contato, e-mail, telefone, origem, motivo, observação, campanha, data, expira em, status) com os mesmos filtros da listagem e grava um evento `suppression_export` na primeira página. As duas exigem admin/supervisor e `profiles.can_download = true` (A14).
- **Aceite:** `scripts/db-audit/talkx-suppression-batch.test.sh`: importar `+55 (11) 98765-4321` (casa com contato), `41999990000` (avulso) e `123` → `inseridas=2`, `invalidas=1`; repetir → `inseridas=0`, `ja_suprimidas=2`; `p_dry_run=true` não grava linha; `select count(*) from talkx_campaign_events where event_type='suppression_import'` = 1; usuário sem `can_download` recebe 42501; exportar com offset 0 grava 1 evento e com offset 1000 não grava outro.
- **V3:** V75 (parte de banco), V74 (exportar)
- **Negócio:** O sistema passa a aceitar uma lista inteira de telefones de uma vez e a entregar a lista em arquivo, sempre registrando quem fez.

### X178 · Unificar o hook de supressão e paginar a tabela no servidor com colunas reais

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X030, X055, X176
- **Fecha:** T06-031, T06-032, T06-033, T06-034, T06-035, T06-036, T06-037, T06-039, T06-042, T06-043, T06-044, T06-072, T06-073
- **Dependências, em detalhe:** X176 ; CAP-026 (opt-out gravando a campanha — sem ele a coluna Campanha só tem dado em bloqueio manual) ; kit de tabela e estados da trilha do kit (A17)
- **Hoje:** `useTalkXSuppression` não é importado por ninguém (`HSUP:37`), lista sem filtrar `removed_at` (`HSUP:44-48`) e remove com DELETE (`HSUP:93`). A tela faz queries próprias (`SUP:53-73`), pagina em memória sem voltar à página 1 (`SUP:43,91`), tem `pageSize` sem setter e `onPageSize={() => {}}` (`SUP:44,184`), mostra empresa no lugar do e-mail (`SUP:163`), "+" para telefone avulso (`SUP:166`), rótulo de motivo na coluna Origem (`SH:60-67`), "📢 Campanha" literal (`SUP:169`) e "Suprimido" fixo (`SUP:171`). Agente vê lista vazia em vez de aviso de permissão (`SUP:147`).
- **Fazer:** Reescrever `useTalkXSuppression.ts` como único ponto de acesso: listagem por `talkx_suppression_list` com página, tamanho, filtros e ordenação nos parâmetros; mutações de adicionar, editar e remover (remover é `UPDATE` de `removed_at`), todas com `onError`. `TalkXSuppression.tsx` deixa de chamar `supabase`/`fromTable` e usa a tabela do kit. Colunas: avatar de 2 iniciais, nome com e-mail abaixo, telefone formatado (`+55 11 98765-4321`), origem com ícone e rótulo próprio (Opt-out, Sistema, Manual, LGPD, Lista), motivo em chip com o tom do cadastro, nome da campanha, data, status Suprimido/Expirado/Removido. Registro sem contato mostra "Sem contato vinculado" e o telefone gravado. Rodapé com total do servidor; tamanhos 10/25/50; trocar filtro ou tamanho volta à página 1. Erro de carga → estado de erro com "Tentar de novo"; 42501 → estado "sem permissão".
- **Aceite:** `src/components/talkx/__tests__/TalkXSuppression.list.test.tsx`: RPC devolve `total=4892` e 10 linhas → rodapé "Mostrando 1 a 10 de 4.892 contatos suprimidos"; página 2 chama com `offset=10`; "25 por página" chama com `limit=25` e página 1; linha com `contact_id` nulo mostra o telefone; erro 42501 mostra o estado sem permissão. `grep -nE "fromTable\(|supabase\.from\(" SUP` = 0; `grep -n "\.delete()" HSUP` = 0. `TalkXSuppression.authoring.test.tsx` ajustado ao hook novo.
- **V3:** V71, V72
- **Negócio:** A lista mostra quem está bloqueado, por qual motivo e por qual campanha, com paginação que funciona.

### X179 · KPIs da supressão com janela e comparativo; Centro de proteção com medidor

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + docs + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X017, X176, X178 · **Integra com (não bloqueia):** X189
- **Fecha:** T06-009, T06-011, T06-012, T06-013, T06-014, T06-015, T06-016, T06-017, T06-018, T06-019, T06-020, T06-046, T06-047, T06-048, T06-049, T06-050, T06-051, T06-052, T06-059
- **Dependências, em detalhe:** X176, X178 ; CAP-030 ; central de ajuda da trilha de dados, relatório e importação (A16)
- **Hoje:** "Opt-outs 30 dias" conta `origin==='optout'` sem janela e ignora `auto_optout`, único valor que o webhook grava (`SUP:95,134`). Três KPIs não têm delta nem barras (`SUP:134-136`); "Campanhas protegidas" mostra "—" (`SUP:136`). O rail exibe o total de contatos sob o rótulo "campanhas protegidas automaticamente" (`SUP:192-193`) e um `'0'` fixo para LGPD (`SUP:196`). "Saiba mais" aponta para `#` (`SUP:203`).
- **Fazer:** Os 4 KPIs passam a ler `talkx_suppression_stats`: valor, mini-barras da série e variação contra o período anterior; a variação fica oculta quando o período anterior é zero e "Campanhas protegidas" mostra o estado "sem dados ainda" do kit enquanto não houver campanha iniciada (A9). Criar `src/components/talkx/suppression/ProtectionGauge.tsx` (anel SVG = protegidas ÷ campanhas iniciadas, escudo ao centro). O card "Centro de proteção" recebe o medidor, o número de campanhas protegidas, a frase do mock e os 4 números com ícone em 4 colunas (Suprimidos, Opt-outs, Manuais, Protegidas). "Saiba mais" abre a ajuda no artigo `lista-de-supressao` (escrever o artigo em markdown na pasta definida pela trilha de dados, relatório e importação; até a central existir, abre o diálogo de ajuda atual por callback de `TalkXView`).
- **Aceite:** `TalkXSuppression.kpis.test.tsx`: `optouts {value:3, previous:0}` não renderiza variação; `previous:2` renderiza "+50%"; `protected.total_started=0` renderiza "sem dados ainda"; o link "Saiba mais" não tem `href="#"`. `grep -n "'0', 'LGPD'" SUP` = 0 e `grep -n "campanhas protegidas automaticamente" SUP` = 0. Print da tela 06 ao lado do mock.
- **V3:** V72, V74
- **Negócio:** Os quatro números do topo e o painel de proteção passam a mostrar valores reais, com a comparação contra o período anterior.

### X180 · Cinco filtros, busca por nome/telefone/e-mail, ordenação e visão em grade

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X178
- **Fecha:** T06-021, T06-022, T06-023, T06-024, T06-025, T06-026, T06-027, T06-028, T06-040, T06-071
- **Dependências, em detalhe:** X178 ; kit de filtros e seletor de período da trilha do kit (A17)
- **Hoje:** só existe o select de origem, sem rótulo e com textos de motivo (`SUP:139-141`); `filterMotivo` existe e nenhum controle o altera (`SUP:42,86`); a busca roda em memória e não olha e-mail (`SUP:87`); não há filtro de campanha, data nem status, nem "Limpar filtros", ordenação ou grade (`grep -n "sort\|SegmentedToggle" SUP` = 0).
- **Fazer:** Barra com rótulo acima de cada controle: Origem (Opt-out, Sistema, Manual, LGPD, Lista), Motivo (motivos ativos de `talkx_suppression_reasons`), Campanha (campanhas com supressão, vindas de `talkx_suppression_stats`), Data (intervalo com atalhos 7/30/90 dias e "Todos os períodos") e Status (Suprimido, Expirado, Removido, Todos — padrão Suprimido, para o rodapé bater com o KPI). Busca com espera de 300 ms enviada ao servidor. "Limpar filtros" na barra e no estado vazio por filtro. Cabeçalhos Contato, Origem, Motivo, Data e Status ordenam no servidor, com `aria-sort`. Alternador lista/grade (`SegmentedToggle`, `SH:585`): a grade mostra cartões com os mesmos campos e o mesmo menu de ações; a escolha fica em `localStorage` (`talkx-suppression-view`).
- **Aceite:** `TalkXSuppression.filters.test.tsx`: cada filtro altera o argumento correspondente da RPC; busca `joao@` chega em `p_search` após a espera; dois filtros combinados chegam juntos; "Limpar filtros" zera tudo e volta à página 1; clicar em "Status" alterna `aria-sort` e a direção; o alternador troca tabela por cartões com as mesmas 10 linhas. Print da barra ao lado do mock.
- **V3:** V73
- **Negócio:** Dá para achar um bloqueio por nome, telefone ou e-mail e filtrar por origem, motivo, campanha, período e situação.

### X181 · Ações de linha, seleção em massa e modais de editar e remover com trilha

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X071, X178
- **Fecha:** T06-029, T06-030, T06-041, T06-066
- **Dependências, em detalhe:** X071, X178 ; kit de modais da trilha do kit (A17) ; decisão N13
- **Hoje:** a linha tem só o botão "Remover" dentro de um `<AlertDialog>` vazio (`SUP:172-176`); a confirmação é um `<AlertDialog>` solto (`SUP:246-251`); a mutação de remover não tem `onError` (`SUP:117-125`); não há checkbox, edição de motivo nem expiração.
- **Fazer:** Menu "⋮" (`RowActionsMenu`, `SH:561`) com: Editar motivo e expiração; Ver contato (callback `onOpenContact` de `TalkXView`, desabilitado para telefone avulso); Ver campanha (quando houver); Remover da lista; Reativar (para Removido ou Expirado). Modal "Editar" com motivo, observação e expiração (nunca, 30 dias, 90 dias, data). Modal "Remover" do kit com nome, telefone, motivo atual e campo "motivo da remoção" (gravado em `removal_reason`); quando o motivo é opt-out ou LGPD, exige marcar a confirmação e preencher o motivo. Aviso de sucesso com "Desfazer" por 10 segundos. Checkbox no cabeçalho (página atual) e por linha; barra de massa com "N selecionados", Remover, Alterar motivo, Exportar selecionados (ativo após X183) e Limpar seleção; a remoção em massa é uma única atualização.
- **Aceite:** `TalkXSuppression.actions.test.tsx`: editar envia `reason_code` e `expires_at`; remover sem motivo em registro de opt-out mantém o botão desabilitado; "Desfazer" envia `removed_at=null`; selecionar 3 e remover envia os 3 ids em uma chamada; erro da mutação aparece em aviso. `grep -n "AlertDialog" SUP` = 0. Conferência no banco após o fluxo manual: `select event_type, actor_id from talkx_campaign_events where entity_type='suppression' order by created_at desc limit 3` mostra remove → update com o ator.
- **V3:** V73, V76 (editar), V79
- **Negócio:** Cada bloqueio pode ser corrigido, ter prazo de validade ou ser retirado, um a um ou vários de uma vez, com confirmação e registro.

### X182 · Card Ações da lista, modal Adicionar contato e modal Gerenciar motivos

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X029, X070, X071, X178
- **Fecha:** T06-053, T06-056, T06-057, T06-063, T06-068
- **Dependências, em detalhe:** X070, X071, X178 ; CAP-031
- **Hoje:** "Adicionar contato" é um botão na barra de filtros (`SUP:142`); o modal carrega todos os contatos sem paginação e corta em 50 (`SUP:69,78-80`), só aceita contato existente, não grava `reason_code` nem expiração (`SUP:110`) e mostra o erro 23505 cru quando o contato já está na lista (`SUP:114`). Os motivos são constante no código (`SUP:36`).
- **Fazer:** Card "Ações da lista" no rail com 4 `RailAction` (`SH:242`): Importar contatos — CSV, XLSX ou TXT; Exportar lista — Baixar lista em CSV; Adicionar contato — Inserir manualmente; Gerenciar motivos — Personalizar categorias (importar e exportar ficam desabilitados até X183). Modal "Adicionar contato" do kit com duas abas: contato existente (busca no servidor pela RPC `search_contacts`, critério de contato visível) e telefone avulso (10–15 dígitos, máscara brasileira); campos motivo, observação, origem (Manual ou LGPD), campanha relacionada (opcional) e expiração; duplicado ativo mostra "Este contato já está na lista" com atalho para o registro. Modal "Gerenciar motivos": lista com rótulo, cor e uso (quantos registros), criar, renomear e desativar; motivo de sistema só permite trocar rótulo e cor. Remover a constante `REASONS`.
- **Aceite:** `TalkXSuppression.add.test.tsx` e `TalkXSuppressionReasons.test.tsx`: adicionar telefone avulso envia `phone` sem `contact_id`, com `reason_code` e `expires_at`; telefone com 8 dígitos não habilita o botão; erro 23505 vira a mensagem de duplicado; criar motivo novo e vê-lo no select do modal de adicionar; motivo de sistema não tem ação de desativar. Após o fluxo manual: `select count(*) from talkx_blacklist where reason_code is null` = 0.
- **V3:** V74 (ações da lista), V76, V77
- **Negócio:** Passa a ser possível bloquear um telefone que nem está cadastrado, dizer o motivo e por quanto tempo, e manter a própria lista de motivos.

### X183 · Importar CSV/XLSX/TXT e exportar CSV da lista de supressão

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X168, X171, X177, X182
- **Fecha:** T06-054, T06-055, T06-067
- **Dependências, em detalhe:** X177, X182 ; CAP-091 (leitor de CSV/XLSX da trilha de dados, relatório e importação) ; CAP-088 (gerador de CSV com neutralização de fórmula da trilha de dados, relatório e importação)
- **Hoje:** não há importação nem exportação no módulo; `package.json` não tem biblioteca de planilha (só `cmdk` e `recharts` entre as relevantes). A permissão de download já existe em `src/hooks/system/useDownloadPermission.ts:5-25`.
- **Fazer:** Modal "Importar contatos" em 4 passos: arquivo (CSV, XLSX ou TXT com um telefone por linha; até 50.000 linhas e 5 MB); mapeamento de colunas (telefone obrigatório; nome e e-mail opcionais); prévia com válidos, inválidos e já suprimidos, calculada por `talkx_suppression_import_batch` em `p_dry_run`; motivo e expiração, seguidos do envio em lotes de 500 com barra de progresso, cancelamento e resultado final com a lista de inválidos para baixar. "Exportar lista" baixa os registros dos filtros atuais (ou os selecionados) paginando `talkx_suppression_export_page`, em CSV UTF-8 com BOM e células iniciadas por `=`, `+`, `-` ou `@` neutralizadas. As duas ações só aparecem habilitadas para quem tem `canDownload`; sem a permissão ficam desabilitadas com a explicação.
- **Aceite:** teste do normalizador e do mapeamento (`+55 (11) 98765-4321`, `11987654321`, `abc`, linha vazia); teste do exportador: nome `=HYPERLINK("x")` sai prefixado. Fluxo manual com fixture: arquivo de 3 telefones → 2 aparecem na lista e 1 inválido no resultado; `select count(*) from talkx_campaign_events where event_type in ('suppression_import','suppression_export')` = 2 (um de cada); usuário sem `can_download` vê as duas ações desabilitadas.
- **V3:** V75, V74 (exportar)
- **Negócio:** A lista de bloqueados pode ser carregada de uma planilha e baixada em arquivo, só por quem tem permissão de download.

### X184 · Atividade recente da supressão lida dos eventos de entidade

- **Fase:** 14 · **Tela:** 06 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X071, X176, X179
- **Fecha:** T06-060, T06-061, T06-062, T06-064, T06-065
- **Hoje:** o rail não tem o card (`grep -n "Atividade" SUP` = 0); a query da tela exclui removidos (`SUP:59`) e nenhum evento é lido.
- **Fazer:** Card "Atividade recente" no rail com os 5 últimos itens de `talkx_suppression_activity`: ícone por tipo (adicionado, removido, atualizado, importação, exportação), título ("Contato adicionado à lista", "Contato removido da lista", "Motivo atualizado", "N contatos importados", "Lista exportada"), e-mail do contato (telefone quando não há e-mail) e data relativa ("Hoje, 14:32", "Ontem, 16:08", depois "13 set. 2026, 11:43"), em trilho vertical. "Ver todas" abre modal do kit com o histórico paginado (20 por página), filtro por tipo e nome de quem fez. O card atualiza quando qualquer mutação da tela termina. Sem eventos: "Nenhuma atividade ainda".
- **Aceite:** `TalkXSuppressionActivity.test.tsx` com relógio fixo e 3 eventos (hoje, ontem, 13/09): textos de data conferem; evento de lote mostra a contagem; lista vazia mostra o estado vazio; "Ver todas" pede `offset=20` na segunda página. Print do rail ao lado do mock.
- **V3:** V74 (atividade), V79
- **Negócio:** Aparece, na lateral, quem entrou e quem saiu da lista por último, com acesso ao histórico completo.

### X185 · Barra de filtros do Analytics, 5 KPIs com comparativo e card Comparativo de períodos

- **Fase:** 14 · **Tela:** 07 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X007, X055, X072, X073
- **Fecha:** T07-009, T07-010, T07-011, T07-012, T07-013, T07-015, T07-017, T07-018, T07-019, T07-020, T07-021, T07-022, T07-023, T07-024, T07-025, T07-026, T07-027, T07-028, T07-076, T07-077, T07-078, T07-079, T07-080, T07-081
- **Dependências, em detalhe:** X007, X072, X073 ; kit de KPI e de filtros da trilha do kit (A17)
- **Hoje:** o período são 3 botões (`ANA:206-210`); não há filtro de canal, origem do público nem equipe. "Taxa de envio" ocupa o lugar de "Taxa de entrega" (`ANA:214`); a taxa de resposta é recalculada no navegador com janela de 24 h, só `status='sent'` e limite de 5.000 (`ANA:90-126`); "Envio por segmento" ocupa o lugar de "Conversão por segmento" (`ANA:216-222`); não há receita. O card "Comparativo de Campanhas" compara campanhas, não períodos (`ANA:382-410`). CT fixa esses textos (`CT:30-39`, `CT:61-64`).
- **Fazer:** Criar `src/hooks/integrations/useTalkXAnalytics.ts` (filtros → `talkx_overview_stats`; atualização a cada 60 s só com campanha em `sending`). Barra com 4 cartões-seletor: Período (7, 30, 90 dias, este mês, personalizado), Canal (Todos os canais, WhatsApp), Origem do público (Todos, Contatos, Segmento, CRM 360) e Equipe (departamentos; só para admin/supervisor), mais "Limpar filtros"; os filtros ficam na URL e num contexto lido por todos os cartões da tela. Cinco KPIs com valor, mini-barras e variação contra o período anterior: Campanhas enviadas (campanhas iniciadas; total de mensagens como legenda), Taxa de entrega (falhas como legenda), Taxa de resposta, Conversão por segmento e Receita influenciada (formato R$); valor nulo mostra "sem dados ainda" e variação some sem período anterior. Card "Comparativo de períodos" no rail, com seletor próprio e 3 linhas (campanhas enviadas, taxa de resposta, receita) em 2 colunas e variação. Remover os KPIs "Mensagens enviadas" e "Falhas", a faixa "N contatos responderam" e o "Comparativo de Campanhas". Reescrever os testes de CT citados.
- **Aceite:** `TalkXAnalytics.kpis.test.tsx`: trocar cada filtro muda os argumentos da RPC; "Limpar filtros" volta ao padrão; `previous: null` não mostra variação; `revenue: null` mostra "sem dados ainda"; `revenue: 284320` mostra "R$ 284.320"; o comparativo com `previous.campaigns_sent=2` e `current=3` mostra "+50%". `grep -n "from('messages')\|fromTable('talkx_recipients')" ANA` = 0 para o cálculo de resposta. CT atualizado e verde. Print ao lado do mock.
- **V3:** V18 (parte do Analytics), V41 (padrão do hook), V69 ("vs. período")
- **Negócio:** Os cinco números do topo passam a ser reais, comparados com o período anterior, e todos os quadros obedecem aos mesmos filtros.

### X186 · Gráfico Performance de campanhas com 4 séries e funil em SVG proporcional

- **Fase:** 14 · **Tela:** 07 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X072, X073, X185
- **Fecha:** T07-029, T07-030, T07-031, T07-032, T07-033, T07-034, T07-035, T07-036, T07-043, T07-044, T07-047, T07-048, T07-049
- **Hoje:** "Performance por Campanha" é um gráfico de barras das 5 maiores campanhas, Enviadas × Falhas (`ANA:241-258`); não há série no tempo. O funil são 4 barras com larguras fixas 100/80/55/35 % (`ANA:266-279`), sem degrau de respostas, com Lidas e Conversões em "Não rastreado" (`ANA:176-177`) por exigência de CT (`CT:34-37`).
- **Fazer:** Criar `src/components/talkx/analytics/AnalyticsPerformanceChart.tsx`: gráfico de área (recharts) com as séries diárias Enviadas, Entregues, Respostas e Conversões, legenda, gradiente, pontos, eixo de datas no formato "1 out", dica com os 4 valores do dia, seletor de período próprio (padrão = filtro da tela) e ícone (i) explicando de onde vem cada série; série com fonte nula não é desenhada e ganha a nota "sem dados ainda". Criar `AnalyticsFunnel.tsx`: funil em SVG com 5 degraus de largura proporcional ao valor (Enviadas, Entregues, Lidas, Respostas, Conversões), cada um com número e percentual sobre enviadas; degrau com fonte nula aparece vazio com "sem dados ainda". Título "Entrega → Leitura → Resposta → Conversão". Remover o gráfico de barras e o funil antigos e ajustar CT (linhas 34–37).
- **Aceite:** `TalkXAnalytics.performance.test.tsx`: 30 pontos diários → 4 séries; `conversions` nulo → 3 séries e a nota; funil com 18.742/18.075 → largura do 2º degrau = 96,4% da do 1º; `read: null` mostra "sem dados ainda" e não "0". Print ao lado do mock.
- **V3:** V16, V17 (funil), V38 (funil só existia para o relatório)
- **Negócio:** Aparece a evolução diária de envios, entregas, respostas e vendas, e o funil mostra onde as mensagens se perdem.

### X187 · Top segmentos, mapa de calor por engajamento e tabela de melhor resultado

- **Fase:** 14 · **Tela:** 07 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X007, X074, X185
- **Fecha:** T07-037, T07-038, T07-039, T07-040, T07-041, T07-042, T07-050, T07-051, T07-052, T07-053, T07-055, T07-056, T07-058, T07-059, T07-062, T07-063, T07-064
- **Hoje:** não há card "Top segmentos" (só 3 nomes no texto de um KPI, `ANA:219-221`). O mapa de calor mostra volume de envio, de domingo a sábado, com legenda "Menor/Maior" (`ANA:25,331-352`); ao lado há "Volume por dia da semana" e "Melhor horário", que fala em "taxa de abertura" sem dado de abertura (`ANA:286-324`). A tabela tem colunas #, Campanha, Canal (texto fixo), Enviadas, Taxa de entrega e Falhas, sem ordenação (`ANA:359-379`), e abre um painel com amostra de 200 destinatários (`ANA:413-464`).
- **Fazer:** Criar em `src/components/talkx/analytics/`: `AnalyticsTopSegments.tsx` (seletor de métrica: taxa de resposta, taxa de entrega, conversão; até 7 linhas mais "Outros", com barra, percentual e volume entre parênteses; a sub-visão `view=segmentos` mostra a lista completa); `AnalyticsHeatmap.tsx` (linhas de segunda a domingo, 24 colunas, intensidade pela taxa de resposta, célula sem base mínima em tom neutro, legenda "Menor engajamento … Maior engajamento", ícone (i) e tabela equivalente para leitor de tela); `AnalyticsTopCampaigns.tsx` (colunas #, Campanha com ícone do objetivo e nome que abre a campanha, Canal com ícone do WhatsApp, Enviadas, Taxa de entrega, Taxa de resposta, Conversões; "Ordenar por" com 4 opções resolvidas no servidor; "Ver todas as campanhas →" vai para `?tab=overview`). Remover a query de horário do navegador, os dois cards laterais e o painel de amostra.
- **Aceite:** `TalkXAnalytics.breakdowns.test.tsx`: trocar a métrica chama a RPC com `p_metric` novo; 8 segmentos → 7 linhas + "Outros"; primeira linha do mapa é "Seg"; célula com taxa nula não recebe cor de intensidade; trocar "Ordenar por" chama com `p_sort` novo; conversão nula mostra "sem dados ainda"; "Ver todas as campanhas" grava `tab=overview`. `grep -n "taxa de abertura" ANA` = 0. Print ao lado do mock.
- **V3:** V16, V69
- **Negócio:** Fica visível quais segmentos e quais campanhas dão mais resultado e em que horários os clientes mais respondem.

### X188 · Painel Insights com ações que aplicam de verdade e Resumo com estimativa condicionada

- **Fase:** 14 · **Tela:** 07 (e 01) · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X007, X055, X075, X076, X185
- **Fecha:** T07-066, T07-067, T07-068, T07-069, T07-070, T07-071, T07-072, T07-073, T07-074, T07-075
- **Dependências, em detalhe:** X007, X075, X185 ; `InsightCard` nos tokens do kit (trilha do kit, A17) ; CAP-086 só para texto gerado por modelo (A10; fora desta etapa)
- **Hoje:** os insights ficam no rodapé (`ANA:467-487`); o hook calcula no navegador (`INS:24-88`); `applyLabel` existe sem `apply`, então o botão nunca aparece (`INS:101`, `SH:974`); o cartão usa cores fora dos tokens e o selo "Heurístico" (`SH:931-935,969-971`). O wizard só aceita `segmentId`, `templateId` e `step` como valores iniciais (`useCampaignEditor.ts:173`; `VIEW:41`). Não existe "Resumo". O mesmo hook alimenta a Visão geral (`TalkXOverview.tsx:46,182`).
- **Fazer:** `useTalkXInsights` passa a chamar `talkx_insights` com o período da tela e a montar o texto em português a partir dos parâmetros de cada regra; a consulta antiga sai inteira. Painel no rail, acima do comparativo: título "Insights" e a frase "Análise dos seus dados de campanhas." (o título "Insights da IA" só aparece com `talkx_settings.ai_insights` ligado e texto vindo do `ai-proxy`). Cada cartão tem ícone colorido por tipo, texto com os números medidos e botão que executa a ação da regra: "Aplicar sugestão →" abre nova campanha com a janela de envio pré-preenchida (estender o valor inicial do wizard com `sendWindow` em `VIEW:41` e `useCampaignEditor.ts:173`); "Ver segmentos →" vai para `?tab=segments`; "Ver templates →" vai para `?tab=templates` com o template indicado. Card "Resumo": com `estimated_lift_pct` preenchido, mostra a frase com o percentual e a palavra "estimativa"; nulo, mostra só quantas recomendações há; sem insight algum, mostra "Ainda não há dados suficientes para recomendações". Ajustar `TalkXOverview.tsx` ao formato novo.
- **Aceite:** `src/hooks/integrations/__tests__/useTalkXInsights.test.ts` e `TalkXAnalytics.insights.test.tsx`: "Aplicar sugestão" chama a abertura do wizard com `sendWindow {start:'09:00', end:'11:00'}`, e `useCampaignEditor.test.tsx` confirma que o passo de entrega nasce com esses horários; "Ver segmentos" grava `tab=segments`; `estimated_lift_pct: null` não renderiza nenhum "%" no Resumo; todo cartão renderizado tem botão. `grep -rn "'finished'" src/hooks/integrations/useTalkXInsights.ts` = 0. Print ao lado do mock.
- **V3:** V83, V49 (cartão nos tokens)
- **Negócio:** As recomendações ganham botões que fazem o que prometem — abrir a campanha já com o melhor horário, ir aos segmentos, ir ao template — e só mostram percentual de ganho quando há histórico para calcular.

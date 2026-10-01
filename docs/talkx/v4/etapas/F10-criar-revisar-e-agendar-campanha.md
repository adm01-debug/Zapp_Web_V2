# Fase 10 — Criar, revisar e agendar campanha (X118–X139)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 08, 09, 10. 22 etapas.
>
> **Entrega da fase:** Wizard completo com as três origens de público, vários segmentos, mídia, links medidos, revisão com checagens reais, confirmação gravada e agendamento com repetição.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de dados, links, relatório, importação e ajuda** (etapas X118)

28 etapas, na ordem de execução. Base: `main` @ `3d09433` (2026-10-01).

- **CRM 360 = banco `pgxfvjmuubtbowutlide`, sempre somente leitura**, pela edge `crm-integration`. Bitrix24 só leitura, pela edge
  `bitrix-api`. Nenhuma etapa escreve no CRM nem no Bitrix; `sync_contacts` (`bitrix-api/index.ts:137-175`) não é chamada nem alterada.
- **Migration:** versão reservada por `supabase_migrations.reserve_migration_version` (> `20260930530000`); arquivo → PR → merge →
  apply + ledger no mesmo `db_query` → `schema-catalog.json`, `types.ts`, `known-violations.json`.
- **Edge só vale depois de `deploy-functions.yml` disparado e aprovado.** Etapa com "Deploy de edge: sim" só fecha com o deploy confirmado.
- **Um único job no pg_cron para os dados desta trilha** (`talkx-data-jobs`, a cada 5 min, criado em X036). Os demais jobs são linhas em
  `talkx_data_jobs`, disparadas por `talkx_run_data_jobs()`. Motivo: o pg_cron já falha com `job startup timeout`; não somar jobs.
- **E2E não grava em produção:** os testes Playwright desta trilha interceptam as RPCs; a lógica real é provada por teste SQL
  (Postgres descartável) e teste Deno.
- **Chaves `dados:*` entregues** (para os outros blocos citarem): `vinculo_crm`, `vendedor`, `regiao`, `uf`, `cidade`, `empresa`, `ramo`,
  `pessoa_juridica`, `estagio_funil`, `status_cliente`, `score`, `genero`, `aniversario`, `ultima_interacao`, `compras`, `ultima_compra`,
  `ticket_medio`, `total_pedidos`, `valor_total`, `rfm_segmento`, `rfm_recencia`, `rfm_frequencia`, `rfm_monetario`, `origem_lead`,
  `cobertura`.

**Trilha de criar, revisar e agendar** (etapas X119, X120, X121, X122, X123, X124, X125, X126, X127, X128, X129, X130, X131, X132, X133, X134, X135, X136, X137, X138, X139)

Base: `main` `3d09433` (2026-10-01). 22 etapas, na ordem de execução: banco (X009…X121) → wizard (X122…X133) →
revisão e lançamento (X134…X136) → tela Agendada (X137…X139).

Convenções usadas abaixo:
- Caminhos curtos: `Wizard` = `src/components/talkx/TalkXCampaignWizard.tsx` · `Delivery` = `src/components/talkx/TalkXWizardDelivery.tsx` ·
  `Editor` = `src/components/talkx/useCampaignEditor.ts` · `Selector` = `src/components/talkx/TalkXContactSelector.tsx` ·
  `Scheduled` = `src/components/talkx/TalkXCampaignScheduled.tsx` · `Shared` = `src/components/talkx/talkxShared.tsx` ·
  `View` = `src/components/talkx/TalkXView.tsx` · `Route` = `src/components/talkx/talkxWizardRoute.ts` ·
  `useTalkX` = `src/hooks/integrations/useTalkX.ts` · `Segs` = `src/hooks/integrations/useTalkXSegments.ts` ·
  `send` = `supabase/functions/talkx-send/index.ts` · `window` = `supabase/functions/_shared/talkx-window.ts` ·
  `RPC-draft` = `supabase/migrations/20260912130000_harden_talkx_draft_save.sql` ·
  `guard` = `supabase/migrations/20260930420000_talkx_guards_fail_closed.sql`.
- Toda etapa com **DDL: sim** segue o fluxo do `CLAUDE.md`: versão por `supabase_migrations.reserve_migration_version`,
  arquivo → PR → merge → apply + ledger na mesma transação, `schema-catalog.json` e `types.ts` regenerados,
  `supabase-usage-guard.mjs` com `novas: 0`.
- Toda etapa de tela fecha com o print 1672×941 ao lado do mock (A18), publicado no artefato da régua (X004).
- "Trilha do kit / de segmentos / de templates / de dados" em **Depende de** = entrega daquele bloco (kit, catálogo de filtros, editor único, links/projeção).

---

## Etapas

### X118 · Criar o gerenciador de links rastreáveis no editor de mensagem

- **Fase:** 10 · **Tela:** 08, 05, 14 · **Camada:** front · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X021, X022, X055
- **Fecha:** CAP-062 (front)
- **Dependências, em detalhe:** X021, X022 ; CAP-001 (rascunho idempotente) ; modais e estados do kit (trilha do kit)
- **Hoje:** Nenhuma tela cria link: `grep -rn "talkx_links" src` só encontra `src/integrations/supabase/types.ts`. O envio troca `{{link}}` por `[link]` quando não há link cadastrado (`talkx-send/index.ts:58-59`).
- **Fazer:** `src/components/talkx/links/TalkXLinksManager.tsx` + `src/hooks/integrations/useTalkXLinks.ts`: lista os links da campanha (rótulo, destino, UTM, cliques), cria/edita por `talkx_upsert_link`, exclui por `talkx_delete_link`, mostra a URL final e o texto `{{link:rotulo}}` com "Inserir na mensagem" (callback `onInsertPlaceholder`) e "Copiar". Validação no cliente igual à do banco. Campos UTM recolhidos, com sugestão (`utm_source=whatsapp`, `utm_medium=talkx`, `utm_campaign=<nome>`). Só admin/supervisor edita; os demais veem a lista. Montado no passo de mensagem do assistente (tela 08) e, no editor de template (tela 05), como catálogo de rótulos. Exige rascunho salvo para ter `campaign_id`.
- **Aceite:** Teste de componente: criar link → RPC chamada com os campos → placeholder inserido na posição do cursor; rótulo inválido bloqueia o botão; agente não vê "Novo link". E2E (RPC interceptada) em `e2e/talkx.spec.ts`: adicionar link no rascunho → `{{link:rotulo}}` aparece na prévia.
- **V3:** V81
- **Negócio:** Quem monta a campanha cria os links medidos ali mesmo e insere na mensagem com um clique.

### X119 · Gravar na RPC de rascunho os campos novos de público, mídia, botões e entrega

- **Fase:** 10 · **Tela:** 08, 10 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X009, X016, X017, X019, X057, X059, X060, X061, X064, X066
- **Fecha:** T09-013, T10-007, T10-012, T10-027
- **Dependências, em detalhe:** X009 ; CAP-012 (tabela `talkx_campaign_segments`) ; CAP-003 (validador de regras de audiência) ; CAP-030 (`respect_suppression`) ; CAP-035 (limite por minuto) ; CAP-041 (dias da semana) ; CAP-052 (`recurrence`) ; CAP-059 (bucket `talkx-media`) ; CAP-060 (schema de botões) ; CAP-077 (versão do template na campanha)
- **Hoje:** A RPC lê uma lista fixa de chaves (`RPC-draft:79-100`), exige um único `segment_id` (`RPC-draft:108-109`) e mídia `^https://` (`RPC-draft:113`); `audience_filters` é um objeto sem validação (`RPC-draft:84,107`). Na tela 10, salvar é UPDATE direto, sem `revision` e sem evento (`useTalkX:221-234`, `Scheduled:124-131`).
- **Fazer:** Migration que recria `save_talkx_campaign_draft` para também ler do payload: `segment_ids[]` (substitui as linhas da campanha em `talkx_campaign_segments`; só segmentos `active`), `audience_filters` no mesmo formato de regras dos segmentos (validado pela função da CAP-003), `respect_suppression` (falso só para admin), `send_weekdays`, `max_per_minute`, `recurrence`, `buttons`, `template_version_id` e mídia como caminho do bucket `talkx-media` (além de `https://`). Quando a campanha está `scheduled` e mudam data, fuso, janela, repetição ou velocidade, a própria RPC grava o evento `scheduled_updated` com o ator. Esta etapa não cria as colunas — elas vêm das capacidades citadas; aqui só entra a gravação pelo rascunho e a inclusão dos campos na comparação de replay. `talkx-draft-save.test.sh` muda junto.
- **Aceite:** Casos novos em `talkx-draft-save.test.sh`: (a) payload com 3 `segment_ids` grava 3 linhas e remove as anteriores; (b) segmento inativo → `22023`; (c) usuário não-admin com `respect_suppression=false` → `42501`; (d) mídia `talkx-media/<caminho>` aceita e `http://` recusada; (e) mudar `scheduled_at` de campanha `scheduled` gera 1 linha `scheduled_updated` em `talkx_campaign_events` com `actor_id` e incrementa `revision`.
- **V3:** V21 (flag de supressão no rascunho), V27 (fim da exigência `^https://`), V30 (recorrência no payload), V32 (evento `scheduled_updated`)
- **Negócio:** Tudo o que for escolhido no wizard e na tela de agendamento fica salvo de verdade, com registro de quem alterou a programação.

### X120 · Criar a RPC de checagens de lançamento `talkx_campaign_launch_checks`

- **Fase:** 10 · **Tela:** 09, 10 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014, X016, X017, X019, X020, X032, X066, X118, X119
- **Fecha:** T09-016, T09-020, T09-041
- **Dependências, em detalhe:** X119 ; CAP-003 ; CAP-004 ; CAP-029 ; CAP-030 ; CAP-036 ; CAP-037 ; CAP-062 ; CAP-074 ; CAP-075 ; CAP-078 ; CAP-096 ; CAP-104
- **Hoje:** A prontidão é calculada no navegador com 3 condições (conexão, público, mensagem — `Delivery:183-186`) e `audienceOk` é sempre verdadeiro em edição (`Delivery:184`). "Conformidade" é texto fixo (`Delivery:215`). Variável sem valor não é detectada: o envio manda `[variavel]` ao cliente (`send:65-70`).
- **Fazer:** Função `talkx_campaign_launch_checks(p_campaign_id uuid) returns jsonb`, somente leitura, `SECURITY DEFINER` com checagem de dono ou admin/supervisor (precisa contar a supressão, que agente não lê). Devolve uma lista `{code, severity (block|warn|ok), step, count, message}` com: `role`, `connection_ready`, `audience_not_empty`, `message_present`, `template_approved`, `variables_resolved` (por variável do texto: nº de destinatários elegíveis sem valor, incluindo `{{link}}` sem link cadastrado), `suppression_applied`, `consent` (`revoked` bloqueia; `unknown` avisa), `schedule_reachable` (existe período permitido por janela, horário comercial e dias a partir do início), `daily_limit` (elegíveis ÷ limite diário da conexão = dias necessários) e `connection_busy`. Cada item aponta o passo do wizard que corrige o problema. Grant só para `authenticated`.
- **Aceite:** `scripts/db-audit/talkx-launch-checks.test.sh` (Postgres descartável, incluído em `.github/workflows/db-guard.yml`): campanha com `{{vendedor}}` e 2 de 5 contatos sem vendedor → `variables_resolved` com `severity=block` e `count=2`; conexão `disconnected` → `connection_ready` `block`; campanha completa → nenhum `block`; agente que não é dono → `42501`.
- **V3:** —
- **Negócio:** "Tudo pronto" e "Conformidade" passam a ser o resultado de verificações feitas pelo servidor, não um texto fixo.

### X121 · Persistir as 3 confirmações e quem lançou; confirmar e agendar por RPC

- **Fase:** 10 · **Tela:** 09 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014, X025, X120
- **Fecha:** T09-046, T09-047, T09-048, T09-050
- **Dependências, em detalhe:** X120 ; CAP-005 ; CAP-055 ; CAP-096
- **Hoje:** As confirmações são `useState` (`Editor:240-242`), ficam fora de `buildPayload` (`Editor:502-519`) e não geram evento. Agendar é `UPDATE status='scheduled'` feito pelo navegador (`Editor:574-577`). O catálogo não tem colunas de confirmação nem de lançamento.
- **Fazer:** Migration que adiciona em `talkx_campaigns`: `launch_confirmations jsonb`, `launch_confirmed_by`, `launch_confirmed_at`, `launched_by`, `launched_at`. RPC `confirm_talkx_campaign_launch(p_campaign_id, p_expected_revision, p_confirmations, p_mode)`: exige papel admin/supervisor, as 3 chaves (`consent`, `content`, `suppression`) verdadeiras e nenhuma checagem `block` da X120; grava confirmações, ator e instante; insere evento `checklist` com o ator; com `p_mode='schedule'` muda o status para `scheduled` e insere `scheduled`; com `p_mode='now'` preenche `launched_by/launched_at` e devolve a campanha pronta para o `start`. Gatilho em `talkx_campaigns`: sair de `draft` sem confirmação gravada é recusado (inclusive por UPDATE direto); mudar mensagem, mídia, botões, público ou conexão depois de confirmar zera as confirmações e devolve a campanha a `draft`. No disparo agendado, `launched_by` é quem confirmou.
- **Aceite:** `scripts/db-audit/talkx-launch-confirmation.test.sh` (em `db-guard.yml`): (a) UPDATE direto para `scheduled` sem confirmação → recusado; (b) RPC com uma chave falsa → erro e nenhuma linha alterada; (c) RPC completa grava `launch_confirmed_by/at` e 1 evento `checklist` com `actor_id`; (d) agente → `42501`; (e) editar a mensagem depois de confirmar deixa `launch_confirmations` nulo e status `draft`.
- **V3:** V21
- **Negócio:** Fica registrado quem confirmou consentimento, conteúdo e supressão, e quando; sem as três confirmações a campanha não sai.

### X122 · Encaixar o wizard no shell: stepper com teclado, rodapé fixo e saída com pendência

- **Fase:** 10 · **Tela:** 08, 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X014, X055
- **Fecha:** T08-001, T08-009, T09-001, T09-004, T09-005
- **Dependências, em detalhe:** trilha do kit (kit de modais e estados, busca do módulo) ; CAP-096
- **Hoje:** O breadcrumb é texto sem link e diz "Nova Campanha" também ao editar (`Wizard:103-111`). O rodapé e o rail não são fixos (`Wizard:152-179`; nenhum `sticky` no arquivo). `beforeunload` dispara por nome preenchido, não por alteração pendente (`Wizard:52-56`). Mensagem é uma tela separada do público (`Wizard:146-147`). A ajuda só é montada na visão de abas (`View:261`). Não há estado "sem permissão" no wizard.
- **Fazer:** Em `Wizard`: cabeçalho dentro do shell do módulo com breadcrumb clicável ("Talk X › Campanhas › Nova campanha | Editar <nome> › <passo>"), busca do módulo, botão "Ajuda" (abre `TalkXHelp`) e chip de estado com o status real da campanha e o passo atual, com menu "Salvar e sair" / "Descartar rascunho". Passos 1 e 2 passam a dividir a mesma página rolável (Informações, Origem, Filtros, Mensagem, Mídia), como no mock; o passo ativo define a seção em foco e o que "Continuar" valida. Stepper navegável por teclado (setas, Enter, `aria-current="step"`). Rodapé `sticky` com Voltar / Salvar rascunho / Continuar; rail `sticky` a partir de 1280 px e `Sheet` "Resumo" abaixo disso. Sair (voltar, breadcrumb, histórico do navegador) com `autosaveIsDirty` abre o modal do kit "Salvar e sair / Descartar / Continuar editando"; `beforeunload` só com pendência real. Usuário sem papel admin/supervisor vê o estado "sem permissão" do kit.
- **Aceite:** `src/components/talkx/__tests__/TalkXCampaignWizard.layout.test.tsx` (novo): teclado percorre os 4 passos; sair com alteração pendente abre o modal e sem pendência não abre; breadcrumb mostra "Editar <nome>". `e2e/talkx.spec.ts` ("wizard stepper shows all four steps…" e "wizard advances to step 2…") ajustado à página única. Print 1672×941 ao lado de `08_Nova_Campanha.png`.
- **V3:** V29
- **Negócio:** A tela de criação fica igual ao desenho, com os botões sempre à vista, e avisa antes de perder o que foi digitado.

### X123 · Restaurar o rascunho inteiro (filtros, passo, opções) e salvar sozinho desde o passo 1

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X009, X025, X119
- **Fecha:** T08-064
- **Dependências, em detalhe:** X009 ; X119 ; CAP-055
- **Hoje:** Os filtros são gravados em `audience_filters` (`Editor:505`), mas o estado nasce em `'all'` (`Editor:222-227`); `respectSuppression` nasce `true` fixo (`Editor:239`); abrir pela lista força o passo 1 (`View:110-114`). Cada autosave grava um evento `updated` e atualiza `last_used_at` do segmento (`Editor:548,559`). O erro da RPC aparece cru no link "Não salvo — tentar novamente" (`Wizard:162-166`).
- **Fazer:** Em `Editor`: hidratar filtros, `draft_step`, `responsible_id`, `respect_suppression` e demais campos da X119 a partir da campanha; enviar `draft_step` em `buildPayload`. Em `View`, `openEdit` abre no `draft_step` salvo. Autosave e "Salvar rascunho" passam a funcionar só com o nome (sem mensagem). Remover do autosave o `logEvent('updated')` e a escrita em `last_used_at` (ciclo de vida é gravado pelo servidor). Rodapé mostra "Rascunho salvo há X". Traduzir os códigos da RPC (`invalid_talkx_campaign_draft`, `talkx_campaign_stale_revision`, `selected_whatsapp_connection_unavailable`) em mensagens com ação ("Outra sessão alterou esta campanha — recarregar").
- **Aceite:** `useCampaignEditor.test.tsx`: novos casos "autosaves a new campaign that only has a name" e "restores filters, step and delivery options from the saved draft" (falham hoje); caso existente "autosaves all persisted audience filters" atualizado. E2E em `e2e/talkx.spec.ts`: preencher nome e um filtro, avançar ao passo 2, recarregar a página → volta no passo 2 com o filtro aplicado. Conferir no banco: 1 linha em `talkx_campaigns` e nenhum evento `updated` por pausa de digitação.
- **V3:** V23
- **Negócio:** Dá para parar no meio, fechar o navegador e continuar depois exatamente de onde parou.

### X124 · Passo 1 — nome com validação, objetivo com ícone e campo Responsável

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X009, X123
- **Fecha:** T08-013, T09-012
- **Hoje:** O nome aceita 1 caractere (`Editor:496`). O select de objetivo não tem ícone nem descrição (`Wizard:231-236`; `Shared:44-51`). O lugar do "Responsável" é ocupado por "Conexão WhatsApp" (`Wizard:238-245`). Na revisão, o subtexto do objetivo é a descrição livre da campanha (`Delivery:207`).
- **Fazer:** Em `Wizard`/`Editor`: nome com mínimo de 3 e máximo de 200 caracteres, erro abaixo do campo e `aria-invalid`. `OBJECTIVES` (`Shared`) ganha ícone e descrição por objetivo (ex.: Vendas — "Gerar mais vendas e conversões"), usados no select e na revisão. Novo select "Responsável" listando perfis ativos admin/supervisor (avatar + nome), padrão = usuário atual, gravando `responsible_id`. "Conexão WhatsApp" sai da linha de informações e fica abaixo da descrição até a X133 movê-la para o passo Entrega; `canProceed[1]` deixa de depender dela.
- **Aceite:** `useCampaignEditor.test.tsx`: "requires a campaign name with at least 3 characters" e "persists the selected responsible profile" (falham hoje). `e2e/talkx.spec.ts` ("wizard step 1 shows audience fields and stepper") passa a procurar o campo "Responsável". Print da trilha "Informações da campanha" ao lado do mock 08.
- **V3:** V25
- **Negócio:** Cada campanha passa a mostrar quem é o responsável por ela, e nomes vazios ou de uma letra deixam de passar.

### X125 · Origem do público: Contatos ZAPP e CRM 360° resolvidos no servidor

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X016, X017, X036, X038, X055, X119, X123
- **Fecha:** T08-015, T08-016
- **Dependências, em detalhe:** X119 ; X123 ; CAP-003 ; CAP-004 ; CAP-028 ; CAP-092 ; `dados:vinculo_crm` ; trilha do kit (estado "CRM indisponível")
- **Hoje:** A origem "Contatos" carrega todos os contatos com telefone no navegador, sem paginação e sem o critério de contato visível (`Editor:287-295`); o público é a lista de ids marcados à mão (`Editor:209,448-450`). O card "CRM 360°" está sempre desabilitado (`Wizard:255`) e `canProceed[1]` é falso para essa origem (`Editor:496`). O snapshot de destinatários é montado no navegador (`Editor:555-571`).
- **Fazer:** Em `Editor`: para "Contatos ZAPP" o público passa a ser o resultado das regras de `audience_filters`, contado e amostrado pela RPC de audiência (CAP-003/CAP-004); sai a consulta `contacts-talkx` sem paginação e a filtragem de supressão no navegador. A seleção manual de contatos **continua disponível** (decisão N34): os ids marcados vão como lista explícita (`p_contact_ids`) para a mesma RPC de audiência, que aplica elegibilidade e supressão. `Selector` passa a ler a lista paginada pelo servidor, com busca; serve para "Ver contatos do público" e para marcar contatos à mão. "CRM 360°" fica habilitado quando existem vínculos em `crm_contact_links`: o público são os contatos vinculados, filtrados por negócio e estágio da projeção; sem vínculos mostra o estado "CRM indisponível" do kit com link para a tela de vínculo. `persistSave` deixa de chamar `resolveAudience` e `replaceDraftRecipients`: o snapshot é feito pelo servidor na confirmação. `canProceed[1]` = contagem elegível > 0.
- **Aceite:** `useCampaignEditor.test.tsx`: "counts the contacts audience through the server RPC" e "enables CRM 360 only when links exist" (falham hoje); os casos de seleção manual ("autosaves a changed manual selection…", "restores the persisted recipient snapshot…") continuam passando, agora com a lista resolvida pelo servidor. Com a base atual, "Contatos ZAPP" sem filtro mostra 2.504 (contatos visíveis), não 3.106 nem 1.000. Print da trilha "Origem do público" ao lado do mock.
- **V3:** V24 (parte: público = resultado do filtro), V88, V89 (parte de tela)
- **Negócio:** As três origens do desenho funcionam, e o número de contatos mostrado é o que realmente vai receber.

### X126 · Os 7 filtros de audiência com o catálogo de filtros dos segmentos

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X016, X037, X038, X040, X107, X125
- **Fecha:** T08-020, T08-021, T08-022, T08-023, T08-024, T08-025, T08-026
- **Dependências, em detalhe:** X125 ; trilha de segmentos (catálogo de filtros compartilhado) ; CAP-003 ; CAP-093 ; `dados:empresa` ; `dados:estagio_funil` ; `dados:vendedor` ; `dados:segmento_rfm` ; `dados:cidade` ; `dados:uf`
- **Hoje:** A tela tem só Empresa e Tag, de escolha única, filtrando em memória, e os dois somem quando não há valores (`Selector:100-121`; `Editor:365-366`). Status, Estágio no funil, Vendedor, RFM e Localização não existem. Os estados `city/group/inactive/birthday` estão mortos: as colunas nem entram no `select` (`Editor:224-227,291,367-383`).
- **Fazer:** Novo `src/components/talkx/TalkXAudienceFilters.tsx` com os 7 controles na ordem do mock — Tags (múltipla), Status do contato, Empresa, Estágio no funil, Vendedor, RFM, Localização (UF e cidade) —, todos lendo opções e operadores do catálogo de filtros da trilha de segmentos; "Status do contato" usa a entrada que o catálogo definir (hoje os candidatos são `contact_type` e `conversation_status`, `Segs:52-53`). Cada escolha vira uma regra em `audience_filters`, no mesmo JSON dos segmentos. A contagem do rail atualiza com debounce e cancelamento da consulta anterior. "Limpar filtros" zera as regras. Filtro cuja coluna da projeção ainda não tem dado aparece desabilitado com "sem dados ainda" (A9), em vez de sumir. Remover os estados mortos de `Editor`.
- **Aceite:** `src/components/talkx/__tests__/TalkXAudienceFilters.test.tsx` (novo): cada um dos 7 filtros gera a regra esperada e "Limpar filtros" devolve regras vazias; `useTalkXSegments.test.ts` cobre os campos novos do catálogo. Query de conferência: para um filtro de vendedor, a contagem da tela é igual à da RPC de audiência chamada com a mesma regra. Print da trilha "Filtros de audiência" ao lado do mock.
- **V3:** V24
- **Negócio:** Os sete filtros do desenho passam a existir e a reduzir o público de verdade — os mesmos filtros usados nos segmentos.

### X127 · Origem "Segmento salvo": escolher vários segmentos ativos, sem contar contato em dobro

- **Fase:** 10 · **Tela:** 08, 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X016, X057, X058, X119, X125
- **Fecha:** T08-017, T09-013
- **Dependências, em detalhe:** X119 ; X125 ; CAP-012 ; CAP-013 ; CAP-014 ; CAP-003
- **Hoje:** A seleção é de um único segmento (`Editor:196`; `Wizard:259-262`), a lista inclui inativos (`Wizard:265`) e o público é resolvido no navegador com teto de 5.000 (`Segs:173-178`) enquanto a contagem é exata (`Segs:161-168`).
- **Fazer:** Em `Wizard`/`Editor`: cards de segmento com seleção múltipla, busca por nome e só segmentos `active`; estado `segmentIds[]` enviado como `segment_ids`. O rail e a revisão mostram a contagem por segmento e o total da união sem duplicar contato (RPC de audiência com a lista de segmentos). Chips removíveis com os segmentos escolhidos. `initial.segmentId` (vindo da tela de segmentos) continua pré-selecionando um. Remover `resolveAudience` do caminho de salvar e o card `SegmentPreviewCard` de segmento único (`Wizard:418-443`), substituído pela lista.
- **Aceite:** `useCampaignEditor.test.tsx`: "saves several selected segments" e "hides inactive segments" (falham hoje). Conferência no banco após salvar com 3 segmentos: 3 linhas em `talkx_campaign_segments`; após confirmar, `count(distinct contact_id)` em `talkx_recipients` = total mostrado no rail, e cada linha com `segment_id`. Revisão mostra "3 segmentos | N contatos" como no mock 09.
- **V3:** V25 (segmentos ativos) ; multi-segmento estava só no backlog (V100)
- **Negócio:** Uma campanha pode usar vários segmentos ao mesmo tempo, e quem está em dois deles recebe uma mensagem só.

### X128 · Mensagem no wizard com o editor único: abas, barra, variáveis do mock e limite 4096

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X020, X022, X062, X066, X087, X118, X122
- **Fecha:** T08-030, T08-031, T08-032, T08-033, T08-035, T08-036, T08-037, T08-038, T08-039, T08-040, T08-045, T08-046, T08-047
- **Dependências, em detalhe:** X122 ; trilha de templates (editor de mensagem único e seleção de template) ; CAP-062 (trilha de dados, relatório e importação) ; CAP-072 ; CAP-075 ; CAP-076 ; CAP-077 ; CAP-058
- **Hoje:** A mensagem é um `Textarea` sem barra de formatação (`Wizard:341`); a barra só existe no editor de template (`src/components/talkx/TalkXTemplateEditor.tsx:309-310`). O contador só exibe (`Wizard:344`). As variáveis são 5, sem `{{vendedor}}`, `{{data_atual}}` e `{{link}}` (`Editor:11-17`), e o chip anexa ao fim do texto (`Editor:430`). Áudio é enviado sem o texto (`send:655-657`). O menu "Templates" mistura aprovados com 6 textos fixos no código (`Editor:19-26`; `Wizard:319-324`).
- **Fazer:** Trocar o `Textarea` de `StepMessage` pelo editor único da trilha de templates, com abas Texto/Imagem/Vídeo/Documento/Áudio, barra (emoji, negrito, itálico, lista, link) e inserção de variável na posição do cursor. Chips na ordem do mock: `{{nome}}`, `{{empresa}}`, `{{saudacao}}`, `{{vendedor}}`, `{{data_atual}}`, `{{link}}` (os demais em "Mais variáveis"); o chip e o botão de link abrem a criação/seleção de link rastreável (CAP-062). Contador bloqueia acima de 4.096 e aplica o limite de legenda do editor quando há mídia. `personalizePreview` (`Shared:101-141`) passa a resolver as variáveis novas igual ao envio (CAP-075). "Templates" abre a seleção da trilha de templates só com aprovados e grava `template_id` + versão; saem os textos fixos `MESSAGE_TEMPLATES`. Na aba Áudio, aviso de que o texto não acompanha o áudio enquanto a CAP-058 não enviar os dois.
- **Aceite:** `talkxSharedPersonalizePreview.test.ts`: casos novos para `{{vendedor}}`, `{{data_atual}}` e `{{link}}` com a mesma saída do teste Deno de `personalize` (paridade). `TalkX.test.tsx`: variável entra no cursor; 4.097 caracteres desabilita "Continuar". Envio de teste a um número interno com as 6 variáveis chega sem nenhum `[variavel]`. Print da trilha "Mensagem" ao lado do mock 08.
- **V3:** V26, V65 (parte de tela), V81 (parte de tela)
- **Negócio:** Escrever a mensagem da campanha fica igual a escrever um template: mesma barra, mesmas variáveis e sem risco de passar do limite.

### X129 · Anexar mídia por upload ("Selecionar arquivo") no wizard

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X061, X062, X119, X128
- **Fecha:** T08-048, T08-049, T08-030, T08-031, T08-032, T08-033
- **Dependências, em detalhe:** X119 ; X128 ; CAP-059 ; CAP-058
- **Hoje:** Não há upload: o campo é um `Input` de URL que só aparece com uma aba de mídia ativa (`Wizard:361-373`); a RPC exige `^https://` (`RPC-draft:113`); o bucket `talkx-media` não existe.
- **Fazer:** Em `StepMessage`: bloco "Adicionar mídia (opcional)" sempre visível, com o botão "Selecionar arquivo". Novo `uploadMedia` em `Editor`: valida tipo (imagem, vídeo, documento, áudio) e 16 MB antes de enviar, sobe para o bucket `talkx-media` com barra de progresso e cancelar, e guarda o caminho em `media_url`. O tipo do arquivo escolhe a aba. Prévia por tipo (miniatura, pôster do vídeo, nome e tamanho do documento, player do áudio) por URL assinada; botão remover. O campo de URL digitada sai. Mensagem só com mídia (sem texto) passa a ser aceita em `canProceed[2]`.
- **Aceite:** `useCampaignEditor.test.tsx`: "rejects a file above 16 MB before uploading" e "stores the bucket path after upload" (falham hoje). Teste manual registrado no PR com os 4 tipos: upload → prévia → "Ver no celular" para número interno recebe a mídia; conferir no banco `talkx_campaigns.media_url` começando por `talkx-media/`. Print da trilha de mídia ao lado do mock.
- **V3:** V27 (parte de tela)
- **Negócio:** A imagem, o vídeo, o documento ou o áudio da campanha são anexados direto do computador, sem precisar de link.

### X130 · Botões na mensagem da campanha: edição, prévia e aviso de fallback

- **Fase:** 10 · **Tela:** 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X064, X067, X096, X119, X128
- **Fecha:** T09-029
- **Dependências, em detalhe:** X119 ; X128 ; CAP-060 ; CAP-057 ; trilha de templates (editor de botões do template)
- **Hoje:** Não existe botão interativo em nenhuma camada do Talk X: `talkx-send` só usa `sendText`, `sendMedia` e `sendWhatsAppAudio` (`send:653-667`) e o wizard não tem campo de botões (`Wizard:304-399`).
- **Fazer:** Em `StepMessage`: seção "Botões" (até 3; tipo resposta rápida ou link), usando o mesmo componente de edição de botões do editor de template; estado `buttons` enviado no payload do rascunho. Aplicar um template com botões preenche a seção. A prévia do rail e da revisão desenha os botões abaixo da bolha, como "Quero aproveitar agora" no mock 09. Aviso fixo na seção: quando o aparelho do contato não renderiza botão, a mensagem segue como texto + link (A7). Mensagem com botões sai atrás da chave de configuração definida pela CAP-060.
- **Aceite:** `TalkX.test.tsx`: "renders campaign buttons in the preview" e "limits the message to 3 buttons" (falham hoje). Envio real pelo "Ver no celular" para número interno: chega com botão ou com o fallback texto + link; conferir no banco o snapshot da mensagem com os botões. Print da prévia com botão ao lado do mock 09.
- **V3:** —
- **Negócio:** A campanha pode levar um botão de ação na mensagem, como no desenho, e continua legível quando o celular não mostra botões.

### X131 · Painel "Resumo da campanha" calculado no servidor

- **Fase:** 10 · **Tela:** 08 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X016, X017, X058, X068, X125, X127
- **Fecha:** T08-052, T08-053, T08-054, T08-055, T08-056
- **Dependências, em detalhe:** X125 ; X127 ; CAP-003 ; CAP-004 ; CAP-013 ; CAP-029 ; CAP-087
- **Hoje:** Elegíveis e bloqueados só são calculados para seleção manual, lendo a lista inteira de supressão no navegador — que agente não consegue ler; para segmento, bloqueados = 0 (`Editor:326-340,397-402`). A duração é `elegíveis × média de digitação e intervalo`, ignorando janela, horário comercial e limite diário (`Editor:417-422`). O início usa o fuso do navegador e não tem "Em N dias" (`Wizard:464,472`). `StatTile` não tem gráfico nem anel (`Wizard:405-416`).
- **Fazer:** Novo hook `src/hooks/integrations/useTalkXCampaignSummary.ts` que lê do servidor: público total e elegíveis (CAP-003/CAP-004), bloqueados por supressão (CAP-029, visível a qualquer papel) e duração prevista (CAP-087, que já considera janela, dias e limites). `WizardRail` passa a renderizar: "Público total (estimado)" com mini-barras = contagem por segmento selecionado (ou por grupo de regras); com um único grupo as barras não aparecem (A9). "Elegíveis para envio" com anel e percentual; "Bloqueados por supressão" com percentual; "Início estimado" no fuso da campanha com relativo ("Em 2 dias" / "Imediato ao lançar"); "Duração estimada" + "Envio em lotes"; "Canal" WhatsApp + composição da mensagem. Esqueleto durante a consulta e estado de erro do kit. Remover de `Editor` a consulta `talkx-blacklist-ids` e os cálculos locais.
- **Aceite:** `src/hooks/integrations/__tests__/useTalkXCampaignSummary.test.ts` (novo): elegíveis + bloqueados = total; origem segmento com supressão devolve bloqueados > 0 (hoje 0). Logado como agente não-admin, o tile de bloqueados mostra o mesmo número que um admin vê. Print do rail ao lado do mock 08.
- **V3:** V28 (parte do rail)
- **Negócio:** O painel lateral mostra quantos vão receber, quantos estão bloqueados e quanto tempo o envio leva — para qualquer origem e para qualquer usuário.

### X132 · Prévia em moldura de celular, contato de amostra real e "Ver no celular"

- **Fase:** 10 · **Tela:** 08, 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X016, X055, X062, X067, X125, X128
- **Fecha:** T08-059, T08-060, T08-063, T09-025, T09-026, T09-030
- **Dependências, em detalhe:** X125 ; X128 ; CAP-003 (amostra) ; CAP-057 ; CAP-058 ; trilha do kit (moldura no kit e modal)
- **Hoje:** O rail e a revisão usam `WhatsAppBubble` (`Wizard:478`; `Delivery:219`); a moldura `PhoneFrame` existe mas só é usada no editor de template (`Shared:302`). A amostra é o primeiro contato da lista, não o primeiro elegível (`Wizard:446`; `Delivery:161`). Não existe "Ver no celular"; a ação `test` da edge usa a primeira conexão ativa e dados fictícios (`send:150-210`).
- **Fazer:** Rail e revisão passam a usar a moldura do kit: barra de status com hora, cabeçalho com seta, avatar, nome e número da conexão escolhida, ícones de chamada e menu, chip "Hoje", bolha com variáveis resolvidas, mídia e botões, fundo no padrão do WhatsApp e barra "Mensagem…" com clipe, câmera e microfone. Selo de verificado e "Conta comercial" só aparecem se a conexão tiver coluna que os sustente (A9). A amostra é o primeiro contato elegível devolvido pela RPC de audiência, com seus campos customizados, e o usuário pode trocar para o próximo. "Ver no celular" abre modal do kit pedindo o número (pré-preenchido com o telefone do perfil) e dispara o envio de teste pela conexão escolhida, com os dados do contato de amostra; mostra sucesso ou o motivo da falha.
- **Aceite:** `TalkX.test.tsx`: "uses the first eligible contact as preview sample" e "sends a test through the selected connection" (falham hoje). Envio real para número interno: a mensagem recebida é igual à prévia. Prints: rail ao lado do mock 08 e coluna central ao lado do mock 09.
- **V3:** V28, V67 (parte de tela)
- **Negócio:** A prévia mostra a mensagem como ela chega, com um contato de verdade, e um clique manda o teste para o seu celular.

### X133 · Passo Entrega: conexão, velocidade, janela, horário comercial, dias, fuso e limites

- **Fase:** 10 · **Tela:** 08, 10 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X017, X018, X019, X060, X119, X124
- **Fecha:** T10-020, T10-022, T10-023, T10-025, T10-026, T10-028
- **Dependências, em detalhe:** X119 ; X124 ; CAP-030 ; CAP-035 ; CAP-036 ; CAP-038 ; CAP-040 ; CAP-041 ; CAP-043 ; CAP-044 ; CAP-110
- **Hoje:** O texto do horário comercial é fixo "segunda a sexta, das 08:00 às 18:00" (`Delivery:93`), igual à regra fixa do motor (`window:82`). A lista de fusos está duplicada com nomes IANA crus (`Delivery:73`; `Scheduled:21-40`). O slider de intervalo não altera o perfil gravado (`Delivery:105,116`; `Editor:424-428`). `respectSuppression` é estado local (`Editor:239`; `Delivery:129`). Não há dias da semana nem limites. A conexão é escolhida no passo 1 (`Wizard:238-245`).
- **Fazer:** Extrair de `Delivery` para `src/components/talkx/TalkXDeliverySections.tsx` as seções reutilizáveis (wizard e tela 10): Agendamento (enviar ao lançar ou data + hora em campos separados + fuso com rótulo "(UTC-03:00) Brasília (BRT)", a partir de uma lista única em `src/components/talkx/talkxTimezones.ts`); Janela de envio com o cartão "Envios apenas neste período"; Horário comercial mostrando o horário real das configurações e o rótulo Ativado/Desativado; Dias de envio; Throttle com select de perfil, intervalo e mensagens/min vindos do valor real do perfil, limite por minuto da campanha e limite diário da conexão (leitura) com "leva N dias"; Confirmação e supressão (primeira opção persistida; segunda fixa, com dica). O passo ganha a seção "Conexão WhatsApp" (select + estado ao vivo; sem conexão ativa, estado "WhatsApp desconectado" do kit). Sliders de digitação/intervalo vão para "Avançado". Ajustar `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` (linhas 44-51 fixam texto de `Delivery` e `Scheduled`).
- **Aceite:** `src/components/talkx/__tests__/TalkXDeliverySections.test.tsx` (novo): trocar o perfil muda o intervalo exibido para o valor do perfil; mudar o horário comercial nas configurações muda o texto; fuso salvo `America/Manaus` volta selecionado. `talkx-schedule-timezone-contract.test.mjs` verde. Rascunho salvo com dias e limite volta igual ao reabrir (conferir colunas em `talkx_campaigns`).
- **V3:** V20 (parte de tela), V25 (conexão no passo 3)
- **Negócio:** O passo de entrega mostra as regras reais de envio — horário da empresa, dias, velocidade e limites — e não números fixos.

### X134 · Revisão: linhas com dado real e "Editar" que leva ao passo certo e volta

- **Fase:** 10 · **Tela:** 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X016, X066, X120, X124, X127, X131, X133
- **Fecha:** T09-012, T09-013, T09-014, T09-016, T09-018, T09-019, T09-020, T09-021, T09-022, T09-023
- **Dependências, em detalhe:** X120 ; X124 ; X127 ; X131 ; X133 ; CAP-029 ; CAP-078 ; CAP-077
- **Hoje:** "Editar" chama `ed.setStep(step)` sem atualizar a rota (`Delivery:154`); o efeito de rota devolve ao passo 4 (`Wizard:74-79`). Segmento é um só (`Delivery:208`). Exclusões mostram 0 para segmento (`Delivery:209`). Variáveis só listam o que está no texto (`Delivery:211`). Agendamento não tem "Hoje / Em N minutos" (`Delivery:20-24,213`). Conformidade é texto fixo (`Delivery:215`).
- **Fazer:** Em `Delivery` (`Row` e `TalkXWizardReview`): "Editar" passa a usar o navegador de rota do wizard com `step=N&return=4` (`Route` aceita o parâmetro `return`); no passo aberto, o botão principal vira "Voltar à revisão". Linhas: Objetivo com a descrição do objetivo; Segmentos selecionados com nomes e "N segmentos | X contatos"; Exclusões/Supressão com a contagem do servidor; Template com nome, versão e "Template aprovado" (ou "Mensagem personalizada" quando o texto foi alterado depois de aplicar); Variáveis com "N configuradas" ou "N sem valor em X contatos" (checagem `variables_resolved`); Velocidade com perfil e mensagens/min reais; Agendamento no fuso da campanha com relativo ("Hoje, 16:12 · Em 5 minutos"); Conexão com nome, número e estado ao vivo — sem o sufixo "(Oficial)", que não tem coluna; Conformidade listando o resultado das checagens `suppression_applied` e `consent` ("Todas as verificações aprovadas" só quando todas passam).
- **Aceite:** `TalkXView.route.test.tsx`: "edit on the review opens the requested step and returns to step 4" (falha hoje); `talkxWizardRoute.test.ts`: caso para `return=4`. `TalkX.test.tsx`: linha de variáveis mostra "sem valor" quando a checagem devolve `count>0`. Print da coluna "Resumo da Campanha" ao lado do mock 09.
- **V3:** V22
- **Negócio:** Na revisão, cada "Editar" abre o ponto exato a corrigir e devolve à revisão; cada linha mostra o que está gravado.

### X135 · Revisão: Resumo operacional, recomendações acionáveis e "Tudo pronto" por checagens

- **Fase:** 10 · **Tela:** 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X068, X074, X075, X076, X120, X131
- **Fecha:** T09-033, T09-034, T09-035, T09-036, T09-037, T09-038, T09-039, T09-040, T09-041, T09-042
- **Dependências, em detalhe:** X120 ; X131 ; CAP-087 ; CAP-085 (regras no servidor para rascunho: horário, template, público) ; CAP-081 ; CAP-021 ; CAP-083 ; CAP-086 ; trilha do kit (estado "sem dados ainda")
- **Hoje:** "Taxa de resposta projetada" é a constante `responses = null` (`Delivery:182,227`). "Risco de opt-out" não existe; no lugar há "Suprimidos" (`Delivery:226`). Não há recomendações. "Tudo pronto para lançar!" afirma conformidade com base em 3 condições locais (`Delivery:184-185,243-248`).
- **Fazer:** Em `TalkXWizardReview`: "Resumo operacional" com Público total, Tempo estimado de entrega (com mensagens/min reais), Taxa de resposta projetada (% e nº de respostas) e Risco de opt-out (faixa e %), lidos da CAP-087; as duas previsões ficam no estado "sem dados ainda" enquanto o servidor não indicar base suficiente — mínimo proposto: 5 campanhas concluídas com 100 ou mais enviados nos últimos 90 dias. "Recomendações" com até 3 cartões vindos das regras do servidor (horário, template, público), cada um com botão que aplica algo (ajustar horário, trocar template, abrir o público) e o selo "Com base em campanhas similares" só quando houver base; texto gerado por modelo só com a chave `ai_insights` ligada. O cartão final passa a refletir a X120: "Tudo pronto para lançar!" quando não há `block`; senão "N pendências", cada uma com link para o passo. "Lançar campanha" / "Agendar campanha" só habilita sem pendência bloqueante.
- **Aceite:** `TalkX.test.tsx`: "hides projections without enough history", "lists blocking checks with a link to the step" e "disables launch while a blocking check exists" (falham hoje). Com o banco atual (0 campanhas), a tela mostra "sem dados ainda" nas duas previsões e nenhuma recomendação com percentual. Print da coluna direita ao lado do mock 09.
- **V3:** V83 (parte da tela 09), V69 (consumo)
- **Negócio:** A revisão diz o que ainda impede o lançamento e só mostra previsões e recomendações quando existe histórico para sustentá-las.

### X136 · Modal "Confirmar disparo?" com 3 confirmações gravadas e lançamento que abre o monitor

- **Fase:** 10 · **Tela:** 09 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X013, X014, X016, X025, X055, X121, X135
- **Fecha:** T09-042, T09-046, T09-047, T09-048, T09-050
- **Dependências, em detalhe:** X121 ; X135 ; CAP-007 ; CAP-003 ; CAP-055 ; CAP-096 ; trilha do kit (`TalkXConfirmDialog` do kit)
- **Hoje:** As 3 confirmações ficam num cartão fora do modal (`Delivery:230-241`); o modal só as repete como texto (`Delivery:271-275`) e é um `Dialog` próprio (`Delivery:257-281`). `launch` aguarda `startCampaign`, que aguarda o envio inteiro (`Editor:578-584`; `useTalkX:353-368`); o navegador grava os eventos `scheduled` e `started` (`Editor:576,583`). Fora da janela, o erro mostrado é "Verifique a conexão" (`Editor:582`).
- **Fazer:** Substituir o `Dialog` pelo `TalkXConfirmDialog` do kit com o texto do mock ("…será enviada para N contatos. Esta ação não pode ser desfeita.") e as 3 caixas dentro do modal; "Confirmar lançamento" só habilita com as três marcadas. Ao confirmar: chamar `confirm_talkx_campaign_launch` (modo `now` ou `schedule`); em `now`, pedir o `start` à edge, que responde na hora (CAP-007), e navegar para o monitor; em `schedule`, abrir a tela 10. Remover de `Editor` o UPDATE direto de status, os `logEvent` de `scheduled`/`started` e o cartão "Confirmações obrigatórias" da revisão. Mensagens por motivo: fora da janela ou do horário comercial (oferece "Agendar para o próximo período"), sem permissão, conexão caiu, checagem bloqueante (leva ao passo). Ajustar `scripts/db-audit/talkx-navigation-contract.test.mjs` e os casos "does not record a false started event…" e "rejects direct launch…" de `useCampaignEditor.test.tsx`.
- **Aceite:** `TalkX.test.tsx`: "keeps the launch button disabled until the three confirmations are checked" e "navigates to the monitor without waiting for the send loop" (falham hoje). E2E com conexão de teste e 3 contatos internos: confirmar → monitor abre em menos de 5 s. Conferir no banco: `launch_confirmed_by/at` e `launched_by/at` preenchidos, 1 evento `checklist` e 1 `started` com `actor_id`, `talkx_recipients` = 3 linhas. Print do modal ao lado do mock 09.
- **V3:** V21 (parte de tela) ; uso do `TalkXConfirmDialog` entregue na V08
- **Negócio:** O lançamento pede as três confirmações, registra quem confirmou e leva direto ao acompanhamento, sem tela travada.

### X137 · Tela 10 — data, horário, fuso, repetição, janela, throttle e supressão; salvar

- **Fase:** 10 · **Tela:** 10 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X017, X018, X055, X059, X060, X119, X133
- **Fecha:** T10-006, T10-007, T10-009, T10-010, T10-012, T10-013, T10-014, T10-015, T10-016, T10-020, T10-021, T10-022, T10-023, T10-024, T10-025, T10-026, T10-027, T10-028
- **Dependências, em detalhe:** X119 ; X133 ; CAP-052 ; CAP-030 ; CAP-040 ; CAP-044 ; CAP-046 ; trilha do kit (modais do kit)
- **Hoje:** Data e hora são um único `datetime-local` com `min` calculado em UTC (`Scheduled:210-217`). Não há repetição, throttle nem supressão na tela; a velocidade é só leitura (`Scheduled:316-318`). Horário comercial mostra "Seg–Sex, 08:00–18:00" fixo (`Scheduled:258`). Salvar é UPDATE direto, sem `revision` e sem evento (`Scheduled:124-131`). "Editar no wizard" abre no passo 1 (`Scheduled:189`; `View:110-114`). Cancelar e iniciar usam `<AlertDialog>` solto (`Scheduled:348-381`).
- **Fazer:** Recompor a coluna "Configurações de Agendamento" de `Scheduled` com as seções da X133: Data de início e Horário de início separados (mínimo calculado no fuso da campanha), Fuso horário, Janela de envio com o cartão, Limitar por horário comercial, Throttle / Simulação humana (select de velocidade + cartão com o intervalo real do perfil) e Confirmação e supressão (duas caixas com dica). Novo `src/components/talkx/TalkXRecurrenceField.tsx`, usado aqui e no passo Entrega: Não repetir, Diariamente, Semanalmente (dias da semana) e Personalizado (a cada N dias ou semanas, dias da semana, data final obrigatória). "Salvar agendamento" passa a chamar `save_talkx_campaign_draft` com `revision`, gravando todos os campos da tela; conflito de revisão mostra "recarregar". "Editar" abre o wizard no passo 3. "Cancelar agendamento" e "Iniciar agora" usam o modal do kit. Atualizar `talkx-schedule-timezone-contract.test.mjs` (linhas 50-51).
- **Aceite:** `src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx` (novo): salvar em `America/Manaus` e reabrir mantém fuso e horário local; repetição semanal seg/qua gera o payload esperado; "Editar" chama a rota com `step=3`. Conferir no banco após salvar: `schedule_timezone` preservado, `revision` incrementada, 1 evento `scheduled_updated`. Print da coluna esquerda ao lado do mock 10.
- **V3:** V32, V30 (parte de tela)
- **Negócio:** Na campanha agendada dá para mudar dia, hora, repetição, velocidade e proteção num lugar só, sem o horário "andar" por causa do fuso.

### X138 · Tela 10 — calendário em português e "Resumo da Programação" em linha do tempo

- **Fase:** 10 · **Tela:** 10 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X025, X059, X068, X137
- **Fecha:** T10-030, T10-031, T10-034, T10-035, T10-036, T10-037
- **Dependências, em detalhe:** X137 ; CAP-052 ; CAP-055 ; CAP-087
- **Hoje:** O calendário não recebe `locale` (`src/components/ui/calendar.tsx:10-13`) e aceita datas passadas (`Scheduled:268-280`); o dia selecionado é calculado no fuso do navegador (`Scheduled:109`). "Resumo da Programação" são 5 linhas simples de Data/Hora/Fuso/Janela/Destinatários (`Scheduled:281-290`), sem o marco "configurada", sem "Previsão de conclusão" e sem linha do tempo.
- **Fazer:** Em `Scheduled`: calendário com `locale` pt-BR (mês por extenso, Dom…Sáb), dias anteriores a hoje desabilitados no fuso da campanha, dia selecionado derivado do horário local da campanha e marcação dos dias das próximas ocorrências da repetição. Novo `src/components/talkx/TalkXScheduleTimeline.tsx` com os marcos do mock: "Campanha configurada e aguardando início" (data do último evento `scheduled`/`scheduled_updated`), "Início dos envios" + nome da campanha, "Janela de envio ativa" (início–fim) e "Previsão de conclusão em até X" (CAP-087; oculto sem previsão — A9); com repetição, lista as 3 próximas ocorrências calculadas por um helper puro `nextOccurrences` em `src/components/talkx/talkxRecurrence.ts`, com a mesma regra do servidor.
- **Aceite:** `src/components/talkx/__tests__/talkxRecurrence.test.ts` (novo): ocorrências diária, semanal e personalizada, incluindo virada de horário de verão em `America/New_York` e respeito à data final. `TalkXCampaignScheduled.test.tsx`: dia de ontem desabilitado; campanha às 23:30 de `America/Manaus` marca o dia certo com o navegador em outro fuso. Print da coluna central ao lado do mock 10.
- **V3:** V30 (linha do tempo), V32
- **Negócio:** O calendário e a linha do tempo mostram, em português e no fuso da campanha, quando o envio começa, em que período roda e quando deve terminar.

### X139 · Tela 10 — cabeçalho, "Resumo da Campanha" com dados reais e estado "pronta para envio"

- **Fase:** 10 · **Tela:** 10 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X009, X019, X055, X061, X068, X120, X127, X137
- **Fecha:** T10-001, T10-002, T10-003, T10-004, T10-005, T10-039, T10-041, T10-043, T10-044, T10-045
- **Dependências, em detalhe:** X009 ; X120 ; X127 ; X137 ; CAP-038 ; CAP-059 ; CAP-087 ; trilha do kit (breadcrumb, estados do kit)
- **Hoje:** A "Linha WhatsApp" é o texto fixo "Linha WhatsApp conectada" sempre que há id, sem ler nome, número ou estado (`Scheduled:315`). O selo "Agendada para" usa o fuso do navegador (`Scheduled:159-161`). O título é só o nome como subtítulo (`Scheduled:182-186`). O público é só o total (`Scheduled:314`); não há duração estimada nem responsável. Enquanto a campanha não chega, ou se o id não existe, a tela fica em branco (`Scheduled:63`).
- **Fazer:** Em `Scheduled`: breadcrumb do módulo ("Campanhas › Talk X › Campanha Agendada"), faixa "Talk X · Agendamento de campanha", título "Campanha Agendada • <nome>" e o subtítulo do mock. Selo "Agendada para dd/mm • HH:mm" no fuso da campanha; a frase "Campanha pronta para ser enviada." só aparece quando a X120 não devolve `block` — caso contrário, "N pendências" com link para o wizard. "Resumo da Campanha": imagem da mídia por URL assinada; Nome; Público-alvo com os nomes dos segmentos e o total; Mensagem; Linha WhatsApp com nome, número e selo do estado real da conexão (corrige o texto fixo); Duração estimada com o ritmo previsto (CAP-087); Responsável com avatar, nome e "Criado em". Esqueleto durante a carga e estado de erro do kit para id inexistente ou sem acesso, com "Voltar às campanhas".
- **Aceite:** `TalkXCampaignScheduled.test.tsx`: "shows the real connection name, number and status" (com conexão `disconnected` o selo não diz "Conectada" — falha hoje), "renders an error state for an unknown campaign id" e "hides the ready message while a blocking check exists". Print da tela inteira 1672×941 ao lado de `10_Campanha_Agendada.png`.
- **V3:** V32, V31 (estado de erro)
- **Negócio:** A tela da campanha agendada mostra a linha de WhatsApp de verdade e só diz "pronta para ser enviada" quando realmente está.

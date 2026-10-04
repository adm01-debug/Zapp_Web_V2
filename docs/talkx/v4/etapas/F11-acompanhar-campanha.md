# Fase 11 — Acompanhar campanha (X140–X160)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 11, 12, 13. 21 etapas.
>
> **Entrega da fase:** Monitor ao vivo, campanha em andamento e campanha pausada como no desenho, com fila por segmento, ações por contato e checklist de retomada.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de acompanhamento** (etapas X140, X141, X142, X143, X144, X145, X146, X147, X148, X149, X150, X151, X152, X153, X154, X155, X156, X157, X158, X159, X160)

Base: `main` @ `3d09433` (2026-10-01). 22 etapas, na ordem de execução: correção urgente → banco → hooks → tela 11 → tela 12 → tela 13.

**Abreviações usadas em "Hoje"**
`LM` = `src/components/talkx/TalkXLiveMonitor.tsx` · `CR` = `src/components/talkx/TalkXCampaignRunning.tsx` · `TV` = `src/components/talkx/TalkXView.tsx` · `SH` = `src/components/talkx/talkxShared.tsx` · `UM` = `src/hooks/integrations/useTalkXMonitor.ts` · `UE` = `src/hooks/integrations/useTalkXEvents.ts` · `UX` = `src/hooks/integrations/useTalkX.ts` · `UCS` = `src/hooks/integrations/useTalkXConnectionStatus.ts` · `SEND` = `supabase/functions/talkx-send/index.ts` · `LIM` = `supabase/migrations/20260930380000_talkx_update_campaign_limits_22009.sql`.

**Convenções desta trilha**
- Componentes novos destas telas ficam em `src/components/talkx/tracking/` (um arquivo por card), para não disputar `CR`/`LM`/`SH` entre sessões.
- "Kit A17" = modais, estados, tabela, KPI, filtro e breadcrumb entregues pela trilha do kit. "Régua A18" = print 1672×941 da tela ao lado do mock.
- Toda migration desta trilha é aditiva (função/coluna/índice novos): arquivo → PR → merge → apply + ledger com `scripts/db-audit/register-migration.mjs`, versão reservada por `supabase_migrations.reserve_migration_version`, `supabase/schema-catalog.json` e `types.ts` regenerados, `supabase-usage-guard.mjs` com `novas: 0`.
- Bases mínimas (A9) definidas aqui: "vs. ontem" só com envio da mesma campanha no dia anterior; "vs. previsto", série "Previsto" e término estimado só quando CAP-087 devolver valor; "vs. média" e "Ótimo engajamento" só com ≥ 5 campanhas concluídas de ≥ 100 enviadas em CAP-083; "Pico de respostas" só com ≥ 5 respostas na janela anterior.

---

## Etapas

### X140 · Criar a RPC `talkx_monitor_panel` (KPIs, comparativos, série por minuto, saúde do worker)

- **Fase:** 11 · **Tela:** 11, 12, 13 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014, X019, X028, X030, X057, X068
- **Fecha:** fonte no banco de T11-016, T11-017, T11-019…T11-023, T11-025…T11-029, T11-033…T11-036, T11-039, T11-041, T11-043, T12-015, T12-016, T12-019…T12-022, T12-024, T12-025, T12-036…T12-038, T12-042, T12-043, T13-055
- **Dependências, em detalhe:** CAP-014 (`talkx_recipients.segment_id`) ; CAP-018 (respostas atribuídas) ; CAP-026 (opt-out grava `campaign_id`) ; CAP-087 (função de previsão: previsto por minuto, término estimado) ; CAP-035 (limite por minuto) ; CAP-096 (papel no banco)
- **Hoje:** não existe RPC do monitor (`supabase/schema-catalog.json` só lista `talkx_overview_stats`, `talkx_campaign_report`, `talkx_benchmarks`). A série é montada no navegador com até 2.000 linhas ordenadas por `sent_at desc`, o que traz primeiro os pendentes (`UM:42-46`), conta "entregue" no minuto do envio (`UM:27-30`) e não gera ponto zero (`UM:33-35`). `talkx_recipients` não tem carimbo de falha (colunas em `supabase/schema-catalog.json`). "Enviando normalmente" é texto fixo (`LM:166`).
- **Fazer:** migration com (1) coluna `talkx_recipients.failed_at` preenchida por trigger quando o status vira `failed`; (2) índices parciais `(campaign_id, sent_at)`, `(campaign_id, delivered_at)`, `(campaign_id, replied_at)` se `pg_indexes` não tiver equivalente; (3) função `talkx_monitor_panel(p_campaign_id, p_window_minutes, p_bucket, p_day, p_segment_id)` que devolve um JSON com: `kpis` (enviadas, entregues, respondidas, falhas, opt-outs da campanha, a confirmar, pulados, restantes, taxa de entrega, opt-outs sobre a base), `vs_yesterday` (respondidas e falhas; nulo sem envio no dia anterior), `forecast` (previsto por minuto, % vs. previsto, término estimado — repassados de CAP-087; nulos sem ela), `spark` (12 blocos de 5 min por KPI), `series` (um ponto por minuto ou por hora, com zeros, enviadas por `sent_at`, entregues por `delivered_at`, respostas por `replied_at`, no fuso da campanha), `reply_peak` (respostas dos últimos 10 min × 10 min anteriores) e `health`. `health.worker_state` vale `sending`, `stalled` (status `sending`, há pendentes e nenhum `sent_at`/`delivery_claimed_at` há mais que o maior entre 180 s e 3× (`send_interval_max` + `typing_delay_max`)), `paused_manual`, `paused_auto` (com `pause_reason`) ou `done`; inclui `last_activity_at`, `rate_per_minute` (enviadas nos últimos 5 min ÷ 5) e `recommendation_code` por regra (`ok`, `high_failure` > 5% em ≥ 50 processados, `low_delivery` < 80% em ≥ 50 enviadas há mais de 10 min, `optout_spike` > 2%, `stalled`, `connection_down`). Função `SECURITY DEFINER`, `search_path` vazio, autoriza dono da campanha ou admin/supervisor, `REVOKE` de `public`/`anon`. Registrar as regras em `docs/talkx/ARQUITETURA.md`.
- **Aceite:** `scripts/db-audit/talkx-monitor-panel.test.sh` (novo, Postgres descartável, incluído em `.github/workflows/db-guard.yml`): com 12 destinatários semeados em 3 minutos distintos, a série de 15 min tem 15 pontos e soma 12; entregue cai no minuto do `delivered_at`; campanha `sending` com pendentes e último envio há 20 min → `worker_state='stalled'`; 6 falhas em 60 processados → `high_failure`; sem envio ontem → `vs_yesterday` nulo; agente que não é dono recebe `42501`. `supabase-usage-guard.mjs` com `novas: 0`.
- **V3:** V33, V34 (parte de banco), V16 (série por minuto)
- **Negócio:** os números do monitor passam a sair de uma conta única no servidor, inclusive o aviso de que a campanha parou sozinha.

### X141 · Criar as RPCs de leitura paginada: destinatários e linha do tempo da campanha

- **Fase:** 11 · **Tela:** 11, 12, 13 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014, X024, X025, X028, X031, X033, X057, X058
- **Fecha:** fonte no banco de T11-055…T11-058, T11-062, T11-063, T11-069…T11-073, T12-046…T12-051, T12-053, T12-013, T13-044
- **Dependências, em detalhe:** CAP-014 (`segment_id`) ; CAP-015 (`contacts.lead_origin` preenchido) ; CAP-017 (`read_at`) ; CAP-049 (`outcome_unknown`) ; CAP-053 (status `cancelled` do destinatário) ; CAP-055 (eventos gravados pelo servidor) ; CAP-100 (log por destinatário) ; CAP-096
- **Hoje:** as três telas leem `talkx_recipients` direto, com teto fixo e sem página: 200 linhas (`LM:57-59`, `CR:176-178`), 100 mensagens (`CR:239-243`), 50 logs (`CR:341-346`). A linha do tempo lê só `talkx_campaign_events`, 50 linhas (`UE:34-38`). `skipped` vira "Suprimido" mesmo quando o motivo é falta de telefone (`SH:41`). Não há busca por nome/telefone.
- **Fazer:** migration com duas funções `SECURITY DEFINER` (mesma autorização de X140). `talkx_campaign_recipients_page(p_campaign_id, p_status, p_segment_id, p_search, p_day, p_cursor, p_limit)` devolve `rows`, `next_cursor` e `total`; cada linha traz contato (nome, telefone, avatar, origem), segmento (id, nome), `display_status` com precedência respondida > lida > entregue > enviada > enviando > falha > a confirmar > suprimido > sem telefone > cancelado > na fila, `event_at` (horário do último estado), `sent_at`, `delivered_at`, `read_at`, `replied_at`, prévia de 120 caracteres de `personalized_message`, erro, tentativas e `can_retry`; paginação por cursor `(event_at, id)`, `p_limit` máximo 200, busca com curinga escapado. `talkx_campaign_timeline(p_campaign_id, p_kinds, p_before, p_limit)` une `talkx_campaign_events` (com nome do ator) aos itens por destinatário (enviada, respondida com `reply_message_id`, suprimido por opt-out, falha, reenvio agendado), ordenados por horário, com cursor. O texto da resposta não sai da RPC: a tela busca o trecho em `messages` pelo RLS normal.
- **Aceite:** `scripts/db-audit/talkx-recipients-page.test.sh` (novo): 450 destinatários → 3 páginas de 200/200/50 sem repetição nem lacuna; filtro `replied` devolve só quem tem `replied_at`; `skipped` sem telefone sai como `no_phone`; busca por "%" não devolve tudo. `scripts/db-audit/talkx-campaign-timeline.test.sh` (novo): eventos `started` + `paused` e 3 envios saem em ordem decrescente e a segunda página continua do cursor. Os dois entram em `db-guard.yml`.
- **V3:** V35 (parte de banco)
- **Negócio:** a lista de destinatários e a linha do tempo passam a mostrar a campanha inteira, com busca e filtro, em vez das últimas 200 linhas.

### X142 · Criar as RPCs de leitura: progresso por segmento e pré-checagem de retomada

- **Fase:** 11 · **Tela:** 11, 13 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X019, X030, X057, X058, X059, X060, X066
- **Fecha:** fonte no banco de T11-046…T11-052, T13-022, T13-030…T13-035, T13-037…T13-041
- **Dependências, em detalhe:** CAP-012, CAP-013, CAP-014 (tabela `talkx_campaign_segments`, ordem por segmento, `segment_id`) ; CAP-036 (limite diário aplicado) ; CAP-039, CAP-040, CAP-041 (janela, horário comercial e dias configuráveis) ; CAP-052 (recorrência) ; CAP-078 (aprovação de template) ; CAP-024 (autoresposta de opt-out lida do setting)
- **Hoje:** `grep -rn talkx_campaign_segments supabase src` = 0; a campanha tem um único `segment_id` e o destinatário não tem segmento. A regra de janela existe só na edge (`supabase/functions/_shared/talkx-window.ts:62-86`); o front não sabe se a retomada será aceita e mostra o erro cru `outside_send_window` (`UX:364-365`).
- **Fazer:** migration com duas funções de leitura (autorização de X140). `talkx_campaign_segment_progress(p_campaign_id)` devolve, por segmento na ordem de envio: total, enviadas, entregues, falhas, restante, % e status (`done` com restante 0, `running` com processados > 0, `pending` sem processados), mais `pending_segments` e `total_segments`. `talkx_campaign_resume_precheck(p_campaign_id)` devolve os fatos verificáveis do checklist: segmentos pendentes; status do template e das variantes; conexão `connected`; janela aberta agora e `next_send_at`; enviados hoje na conexão × limite diário; próxima ocorrência da recorrência; autoresposta de opt-out e `ai_insights` ligados. Para a janela não divergir da edge, criar `scripts/db-audit/fixtures/talkx-window-cases.json` (fuso, janela, horário comercial, dias) lido pelo teste SQL e por um teste Deno novo de `_shared/talkx-window.ts`.
- **Aceite:** `scripts/db-audit/talkx-segment-progress.test.sh` (novo): campanha com 3 segmentos (10/10 enviados, 4/10, 0/10) devolve `done`, `running`, `pending` e `pending_segments=2`. `scripts/db-audit/talkx-resume-precheck.test.sh` (novo): cada caso do JSON de janela dá o mesmo resultado no SQL e em `supabase/functions/_shared/__tests__/talkx-window-cases.test.ts`; template em `review` → item de template reprovado.
- **V3:** V34 (substitui "fila por status"), V36 (fontes do checklist)
- **Negócio:** o sistema passa a saber quanto de cada público já foi enviado e se a campanha pode voltar agora, antes de alguém clicar em Retomar.

### X143 · Rotear a campanha pela situação e dar endereço (URL) a cada tela de acompanhamento

- **Fase:** 11 · **Tela:** 11, 12, 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055 · **Integra com (não bloqueia):** X163
- **Fecha:** T11-001 (botão voltar quebrado), T12-002 (pausada deixa de abrir "em Andamento"), comportamentos implícitos "rascunho no monitor" e "saída automática" das telas 11/12
- **Dependências, em detalhe:** tela 14 da trilha de dados, relatório e importação (destino de concluída/cancelada) ; kit A17 (estado de erro e botão voltar)
- **Hoje:** `scheduled` → Agendada; `sending` e `paused` → `TalkXCampaignRunning`; `draft`, `completed` e `cancelled` → Monitor (`TV:156-160`); lançamento imediato → Monitor (`TV:212-213`). Nenhuma dessas telas tem URL: o estado vive em `useState` (`TV:35-40`) e `talkxWizardRoute.ts:27-56` só conhece `wizard`/`step`. O botão do monitor tem classes inválidas `h9`/`hover:bv-muted/50` e texto "Voltar à campanhas" (`TV:228`). Quando a campanha sai de `sending/paused`, a tela 12 fica em "Nenhuma campanha em andamento" (`CR:496-508`).
- **Fazer:** criar `src/components/talkx/talkxRoute.ts` com `?view=talkx&campaign=<id>[&screen=monitor]` e `?view=talkx&tab=<aba>`, mantendo `wizard`/`step` de `talkxWizardRoute.ts`. Em `TV`, trocar os quatro `useState` de id por uma função `screenForStatus`: `draft` → wizard, `scheduled` → tela 10, `sending` → tela 12, `paused` → tela 13 (cai na 12 até X156), `completed`/`cancelled` → relatório (cai no monitor em leitura até a tela da trilha de dados, relatório e importação existir). Lançamento imediato abre a tela 12. Mudança de status com a tela aberta navega para a tela do novo status. Id inexistente ou sem acesso → estado de erro do kit com "Voltar para campanhas". Corrigir `TV:228`. Atualizar `scripts/db-audit/talkx-navigation-contract.test.mjs:11-19`, que hoje exige `setTopView('monitor')` para `sending`.
- **Aceite:** `src/components/talkx/__tests__/TalkXView.route.test.tsx` — 7 casos novos (um por status + id inexistente + mudança de status ao vivo) que falham antes; `talkxRoute.test.ts` (novo) cobre parse/format e parâmetro duplicado; `talkxWizardRoute.test.ts` segue verde; `node --test scripts/db-audit/talkx-navigation-contract.test.mjs` verde com o texto novo.
- **V3:** V31
- **Negócio:** clicar numa campanha abre a tela certa para a situação dela, e o link copiado abre a mesma tela para outra pessoa.

### X144 · Trocar leituras com teto fixo por hooks das RPCs, com tempo real e modo degradado

- **Fase:** 11 · **Tela:** 11, 12, 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X057, X140, X141, X142
- **Fecha:** T11-007 (atualizar refaz todas as leituras), T11-040 (conexão atualizada com a tela aberta), parcela do monitor em CAP-103 (`UM:46`, `CR:178,243,346,520`)
- **Dependências, em detalhe:** X140 ; X141 ; X142 ; CAP-099 (colunas novas na publicação realtime) ; kit A17 (estados de erro e de carregamento)
- **Hoje:** o monitor refaz `select('*')` da campanha e 200 destinatários a cada 4 s (`LM:29,49,65`), mais 2.000 linhas a cada 5 s para o gráfico (`UM:46,53`) e eventos a cada 10 s (`UE:43`); a tela 12 usa 15 s e 30 s (`CR:181,248,533`). O canal realtime não trata falha de inscrição (`LM:68-74`). Se a leitura da campanha falhar, o esqueleto fica para sempre (`LM:99`). O status da conexão é lido uma vez, sem atualização (`UCS:18-31`).
- **Fazer:** criar em `src/hooks/integrations/`: `useTalkXMonitorPanel`, `useTalkXRecipientsPage` (página por cursor), `useTalkXCampaignTimeline`, `useTalkXSegmentProgress` e `useTalkXLiveChannel`. O último abre um canal por campanha (`talkx_campaigns`, `talkx_recipients`, `talkx_campaign_events`), invalida as leituras no máximo 1 vez por segundo e expõe `live`, `degraded` (erro/timeout de inscrição: polling de 10 s no painel e 15 s na tabela, com reconexão em espera crescente) e `offline`. Um selo único mostra "Ao vivo" ou "Tempo real indisponível — atualizando a cada 10 s". `UCS` ganha `refetchInterval` de 15 s. Erro de leitura mostra o estado de erro do kit com "Tentar de novo". Remover a query de destinatários de `UM` e `buildRateByMinute`; substituir `src/hooks/integrations/__tests__/useTalkXMonitor.test.ts` pelos testes novos. Acrescentar `replied_count`, `pause_reason` à interface `TalkXCampaign` (`UX:17-59`).
- **Aceite:** `useTalkXLiveChannel.test.ts` (novo): `CHANNEL_ERROR` → estado `degraded` e polling ligado; `SUBSCRIBED` → polling desligado; 50 eventos em 1 s → 1 invalidação. `useTalkXMonitorPanel.test.ts` (novo): erro da RPC vira `isError`. `grep -n "limit(2000)" src/hooks/integrations/useTalkXMonitor.ts src/components/talkx/TalkXCampaignRunning.tsx` = 0. `talkx-analytics-contract.test.mjs:67-68` segue verde.
- **V3:** V34 (conexão ao vivo), V35 (limite de linhas)
- **Negócio:** o monitor continua atualizando quando a conexão em tempo real cai, e avisa que está em modo mais lento em vez de mostrar número parado.

### X145 · Tela 11: criar a aba "Monitor" no módulo, com cabeçalho, filtros e seletor de campanha

- **Fase:** 11 · **Tela:** 11 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X057, X143, X144
- **Fecha:** T11-001, T11-002, T11-003, T11-004, T11-005, T11-006, T11-007, T11-008, T11-009, T11-010, T11-011, T11-012, T11-013, T11-014
- **Dependências, em detalhe:** X143 ; X144 ; CAP-014 (filtro por segmentação) ; kit A17 (cabeçalho de módulo, breadcrumb, filtro, estado vazio)
- **Hoje:** o monitor é um retorno antecipado que esconde as abas do módulo (`TV:224-235`); as abas não têm "Monitor" (`TV:266-272`). O cabeçalho mostra o nome da campanha e o texto do template (`LM:110-113`), sem filtro de data nem de segmentação; o filtro de status fica dentro de uma aba interna (`LM:177-180`); "atualizar" é só um ícone girando (`LM:119`); o conteúdo está em 3 abas internas (`LM:143-147`).
- **Fazer:** incluir a aba "Monitor" em `TV:266-272` e renderizar o monitor dentro de `TabsContent`, com as demais abas visíveis. Sem campanha na URL, a aba escolhe a `sending` mais recente, depois a `paused`; sem nenhuma, estado vazio do kit com "Nova campanha". Criar `tracking/TalkXMonitorHeader.tsx`: breadcrumb, ícone WhatsApp, título "Monitor ao Vivo", subtítulo do mock, filtro de dia (entre `started_at` e hoje), "Todas as segmentações" (segmentos da campanha), "Todos os status" (mesmo estado do select do card de destinatários; não filtra KPIs nem gráfico), botão atualizar (refaz as leituras de X144) e chip seletor "Em andamento · <nome> · Iniciada às HH:mm" listando campanhas `sending`/`paused`. Reorganizar `LM` em página única com a grade do mock (KPIs; ritmo + saúde + fila; destinatários + linha do tempo), removendo as abas internas; os blocos são trocados nas etapas X146…X152. Atualizar `e2e/talkx.spec.ts` (teste das abas) com a aba nova.
- **Aceite:** `src/components/talkx/__tests__/TalkXMonitorHeader.test.tsx` (novo): trocar o dia muda `p_day` na chamada do painel; trocar segmentação muda `p_segment_id`; trocar status não refaz o painel. `TalkXView.route.test.tsx`: `?view=talkx&tab=monitor` abre a aba com as 6 abas presentes. Régua A18: cabeçalho e faixa de abas ao lado de `docs/talkx/references/11_Monitor_ao_Vivo.png`.
- **V3:** V31 (parte), V33 (badge "Iniciada às")
- **Negócio:** o Monitor vira uma aba do módulo: dá para trocar de campanha, de dia e de público sem sair da tela.

### X146 · Mostrar KPIs ao vivo com comparativos e mini-gráficos nas telas 11 e 12

- **Fase:** 11 · **Tela:** 11, 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X028, X030, X031, X055, X068, X140, X144
- **Fecha:** T11-016, T11-017, T11-019, T11-020, T11-021, T11-022, T11-023, T11-025, T11-026, T11-027, T11-028, T11-029, T12-015, T12-016, T12-019, T12-020, T12-021, T12-022, T12-024, T12-025, T12-026
- **Dependências, em detalhe:** X140 ; X144 ; CAP-018 (respondidas) ; CAP-026 (opt-outs da campanha) ; CAP-087 (vs. previsto) ; CAP-049 (a confirmar) ; kit A17 (cartão de KPI)
- **Hoje:** tela 11 tem 6 cartões sem comparativo nem gráfico, e nenhum de respondidas ou opt-outs (`LM:135-141`). Tela 12 passa `bars={null}` em todos (`CR:103-107`), rotula o total de destinatários como "prev." (`CR:103`) e calcula "% de erro" sobre enviadas em vez de processadas (`CR:105`).
- **Fazer:** criar `tracking/TalkXLiveKpiRow.tsx`, alimentado só por `useTalkXMonitorPanel`. Tela 11: Enviadas ("↑ N% vs. previsto"), Entregues ("N% de entrega"), Respondidas ("vs. ontem"), Falhas ("vs. ontem"), Opt-outs ("N% da base"). Tela 12: os quatro primeiros + "Destinatários Restantes · de N contatos" com barra. Cada cartão usa `spark` como mini-barras. Comparativo nulo não renderiza a linha (A9); nunca mostrar 0% no lugar de "sem dado". Quando houver `outcome_unknown`, o cartão Falhas ganha a linha "N a confirmar" que filtra a tabela. Substituir `LM:135-141` e `CR:102-108`; remover a barra "Progresso geral" (`CR:111-121`), absorvida pelo cartão Restantes.
- **Aceite:** `src/components/talkx/__tests__/TalkXLiveKpiRow.test.tsx` (novo): payload com `vs_yesterday=null` não tem o texto "vs. ontem"; payload com `forecast.vs_pct=12` mostra "12% vs. previsto"; opt-outs 18 de 1.250 mostra "1,4% da base"; variante da tela 12 mostra "de 5.000 contatos". Régua A18: faixa de KPIs das telas 11 e 12 ao lado dos mocks.
- **V3:** V33 (KPIs)
- **Negócio:** os cinco números do topo mostram também se a campanha está acima ou abaixo do esperado, e somem quando ainda não há base para comparar.

### X147 · Desenhar o ritmo com séries do servidor, janela, previsto e término (telas 11 e 12)

- **Fase:** 11 · **Tela:** 11, 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X019, X068, X140, X144
- **Fecha:** T11-030, T11-031, T11-033, T11-034, T11-035, T11-036, T11-037, T12-034, T12-035, T12-036, T12-037, T12-038, T12-039, T12-040
- **Dependências, em detalhe:** X140 ; X144 ; CAP-087 (série "Previsto" e término) ; CAP-035 (limite por minuto, linha de referência)
- **Hoje:** tela 11: subtítulo diz "estimado" para dado real (`LM:152`); o filtro de status dos destinatários entra na query do gráfico (`LM:97`); janela fixa de 60 min (`UM:19`); sem legenda (`LM:12`). Tela 12: lê os 2.000 envios mais antigos (`CR:519-520`), rótulo de hora em UTC (`CR:525`), só 20 pontos (`CR:530`), e o card some sem dado (`CR:123`).
- **Fazer:** criar `tracking/TalkXRateChart.tsx` usando `series` do painel. Select "Últimos 60 / 30 / 15 minutos" muda `p_window_minutes`. Séries: "Enviadas" (área), "Entregues" (tracejada, pelo minuto da entrega), "Previsto" (tracejada, só com `forecast`). Tela 11: balão "Término estimado · Hoje, HH:mm · em N min" quando `forecast.eta_at` existir. Tela 12: tooltip "Hoje, HH:mm · N mensagens/min" e linha de referência horizontal no limite por minuto configurado. Legenda nas duas. Eixo no fuso da campanha. Sem envio na janela: estado "sem envios neste período" do kit, com o card visível. O gráfico não recebe o filtro de status.
- **Aceite:** `src/components/talkx/__tests__/TalkXRateChart.test.tsx` (novo): série com `forecast` nulo não desenha "Previsto" nem o balão; trocar para 15 min chama o painel com `p_window_minutes=15`; mudar o filtro de status não refaz o painel; série vazia mostra o estado do kit. Régua A18: card "Ritmo de Entrega" (11) e "Ritmo de Envio" (12).
- **V3:** V33 (janela, previsto, ETA, desacoplar filtro)
- **Negócio:** o gráfico mostra o ritmo real minuto a minuto, a linha do que era esperado e a hora prevista para terminar.

### X148 · Montar "Saúde da campanha", Pausar/Cancelar com modais do kit e chip de insights

- **Fase:** 11 · **Tela:** 11, 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X012, X013, X014, X024, X025, X055, X075, X076, X140, X144
- **Fecha:** T11-039, T11-040, T11-041, T11-042, T11-043, T11-045, T11-076, T12-066, T12-069
- **Dependências, em detalhe:** X140 ; X144 ; CAP-007, CAP-009, CAP-011 (continuidade do envio — é o que torna "parada" recuperável) ; CAP-050, CAP-051 (queda e volta de conexão) ; CAP-053 (cancelar marca pendentes) ; CAP-054 (pausa com motivo e ator) ; CAP-055 (evento gravado pelo servidor) ; CAP-085, CAP-086 (insights por regra e texto por IA, trilhas de analytics e do motor) ; CAP-096 ; kit A17 (modal de confirmação)
- **Hoje:** "Enviando normalmente" aparece sempre que o status é `sending`, sem sinal do worker (`LM:166`). O card tem 3 linhas (`LM:165-169`), sem taxa por minuto, recomendação nem término. Pausar/Cancelar/Retomar são três `AlertDialog` soltos (`LM:224-235`), com texto diferente dos da tela 12 (`CR:783-812`), sem campo de motivo, e gravam o evento pelo navegador (`LM:226,230,234`). Os botões não consideram o papel do usuário.
- **Fazer:** criar `tracking/TalkXHealthCard.tsx`: "Status atual" a partir de `health.worker_state` — "Enviando normalmente", "Envio parado há N min" (com "Ver o que fazer", que abre a ajuda), "Pausada por você", "Pausada automaticamente: fora da janela / conexão caiu — volta sozinha"; "Conexão WhatsApp"; "Taxa de envio (por minuto)" medida; "Recomendação" pelo `recommendation_code` (rótulo "da IA" só com `talkx_settings.ai_insights` ligado e texto de CAP-086); "Término estimado". Criar `tracking/TalkXCampaignDialogs.tsx` com os modais do kit: Pausar (ícone de alerta, texto do mock 12, motivo opcional com 4 atalhos, "Sim, pausar agora", fechar no ✕), Cancelar (informa quantos pendentes deixam de receber) e Retomar. Remover os `logEvent` de `LM:226,230,234` quando CAP-055 estiver aplicado. Botões desabilitados com dica para quem não é admin/supervisor. Chip "Insights — <resumo>" abre o painel de insights da trilha de supressão e analytics filtrado pela campanha; sem insight, não renderiza. Manter `useTalkXConnectionStatus` importado em `LM` ou ajustar `talkx-analytics-contract.test.mjs:67-68`.
- **Aceite:** `src/components/talkx/__tests__/TalkXHealthCard.test.tsx` (novo): `worker_state='stalled'` mostra "Envio parado" e não "Enviando normalmente"; `paused_auto` com `send_window` mostra "volta sozinha"; `ai_insights=false` não tem o texto "IA". `TalkXCampaignDialogs.test.tsx` (novo): pausar com motivo chama `pauseCampaign` com `reason`; agente vê botão desabilitado. `grep -n "AlertDialog" src/components/talkx/TalkXLiveMonitor.tsx` = 0. Em campanha interna: após pausar, `talkx_campaign_events` tem 1 linha `paused` com `actor_id` e a mensagem do motivo.
- **V3:** V34, V13 (modais)
- **Negócio:** o card avisa quando a campanha travou ou pausou sozinha e o que fazer; pausar pede o motivo e registra quem pausou.

### X149 · Criar o card "Fila por segmento" com total, enviadas, restante e progresso

- **Fase:** 11 · **Tela:** 11 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X057, X058, X142, X144
- **Fecha:** T11-046, T11-047, T11-048, T11-049, T11-050, T11-051, T11-052
- **Dependências, em detalhe:** X142 ; X144 ; CAP-012, CAP-013, CAP-014 ; kit A17 (tabela, estado vazio)
- **Hoje:** não existe (`grep -i "Fila" src/components/talkx` = 0).
- **Fazer:** criar `tracking/TalkXSegmentProgressTable.tsx` (reutilizado na tela 13) sobre `useTalkXSegmentProgress`: colunas Segmento, Total, Enviadas, Restante, Progresso (barra + %), na ordem de envio; barra verde em 100%. Na tela 11 mostra 4 linhas; "Ver todos →" abre um painel lateral com a lista completa. Clicar no segmento aplica o filtro "segmentação" do cabeçalho. Campanha com contatos manuais (sem segmento) mostra uma linha "Seleção manual". Atualiza pelo canal de X144.
- **Aceite:** `src/components/talkx/__tests__/TalkXSegmentProgressTable.test.tsx` (novo): payload de 6 segmentos renderiza 4 linhas + "Ver todos"; 398 de 400 mostra "99%" e restante 2; clicar em "VIP" chama o filtro com o id. Régua A18: card "Fila por Segmento".
- **V3:** V34 (o V3 trocava por fila por status; aqui entra o que o mock mostra)
- **Negócio:** dá para ver quanto de cada público (VIP, Recompra…) já recebeu e quanto falta.

### X150 · Unificar a tabela de destinatários: colunas, estados, busca, filtro e paginação

- **Fase:** 11 · **Tela:** 11, 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X028, X031, X055, X057, X058, X141, X144
- **Fecha:** T11-053, T11-055, T11-056, T11-057, T11-058, T11-062, T11-063, T12-045, T12-046, T12-047, T12-048, T12-049, T12-050, T12-051, T12-053
- **Dependências, em detalhe:** X141 ; X144 ; CAP-014 (segmento) ; CAP-015 (origem) ; CAP-017 (lida) ; CAP-018 (respondida) ; CAP-049 ; kit A17 (tabela, pílula de status, paginação)
- **Hoje:** tela 11: lista em aba separada (`LM:173-201`), busca o telefone e não mostra (`LM:58,187-189`), horário relativo e só para quem tem `sent_at` (`LM:194`), sem origem nem segmento, `skipped` sempre "Suprimido" (`SH:41`). Tela 12: tabela em outra aba, sem filtro nem busca (`CR:172-218`), status em texto colorido com mapa incompleto (`CR:169-170`), mensagem em outra aba (`CR:306`).
- **Fazer:** criar `tracking/TalkXRecipientsTable.tsx` sobre `useTalkXRecipientsPage`, com colunas configuráveis. Tela 11 ("Destinatários em tempo real"): Contato (avatar, nome, telefone), Origem, Segmento, Status, Horário (HH:mm para todos os estados), Ações. Tela 12 ("Entregas em Tempo Real" + selo "Enviando agora" quando `worker_state='sending'`): Destinatário, Segmento, Status, tiques (enviado/entregue/lido), Horário, Mensagem (prévia), menu. Estender `RECIPIENT_STATUS` (`SH:34-42`) com Respondida, Lida, Sem telefone e Cancelado. Select "Todos os status" e campo "Buscar destinatário…" (espera de 300 ms) vão para a RPC; paginação "Carregar mais" por cursor, com contagem total. Valor ausente (origem, segmento) mostra "—". Linha nova entra no topo sem refazer a página inteira. Substituir `LM:173-201` e montar o card na Visão Geral da tela 12.
- **Aceite:** `src/components/talkx/__tests__/TalkXRecipientsTable.test.tsx` (novo): linha com `display_status='replied'` mostra "Respondida"; `no_phone` mostra "Sem telefone" e não "Suprimido"; digitar "maria" chama a RPC com `p_search='maria'` uma vez; "Carregar mais" envia o `next_cursor`; sem `read_at` aparecem 2 tiques. Régua A18: cards de destinatários das telas 11 e 12.
- **V3:** V35 (tabela, busca)
- **Negócio:** a lista mostra quem respondeu, quem foi suprimido e por quê, com busca por nome ou telefone em toda a campanha.

### X151 · Adicionar ações por linha: abrir conversa, reenviar e bloquear o contato

- **Fase:** 11 · **Tela:** 11, 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X014, X030, X031, X055, X069, X071, X150
- **Fecha:** T11-064, T11-065, T11-066, T11-067, T12-054
- **Dependências, em detalhe:** X150 ; CAP-047, CAP-048 (reenvio automático e ação `retry`) ; CAP-049 (regra para `outcome_unknown`) ; CAP-108 (mensagem da campanha no histórico da conversa) ; CAP-026 (supressão com `campaign_id`) ; CAP-033 (trilha de supressão, trilha de supressão e analytics) ; CAP-096 ; kit A17 (`RowActionsMenu`, modal)
- **Hoje:** nenhuma ação por linha (`grep "RowActionsMenu" LM CR` = 0; o componente existe em `SH:561`). A edge devolve 400 para qualquer ação fora de `test/start/pause/cancel` (`SEND:233-235`). O app já abre conversa por evento `open-contact-chat` (`src/components/contacts/useContactsCRUD.ts:108-117`).
- **Fazer:** criar `tracking/TalkXRecipientRowActions.tsx`. Ícone de conversa em toda linha com contato: dispara `open-contact-chat` com o `contact_id` e troca a view para o chat. Ícone de reenviar só quando `can_retry` vier verdadeiro da RPC: modal do kit "Reenviar para <nome>?" e chamada à ação `retry` de CAP-048; resposta de recusa (suprimido, tentativas esgotadas, resultado a confirmar) vira mensagem em português. Ícone de bloquear em linha não suprimida: modal com motivo, grava a supressão pela RPC de supressão com `campaign_id` e origem manual. Menu "⋯" reúne as três ações mais "Copiar telefone" e "Ver mensagem enviada". Ações de escrita só para admin/supervisor.
- **Aceite:** `src/components/talkx/__tests__/TalkXRecipientRowActions.test.tsx` (novo): linha `failed` com `can_retry=true` mostra reenviar e a confirmação chama `retry` com o `recipientId`; linha `delivered` não mostra reenviar; bloquear chama a RPC com `p_campaign_id`; agente não vê reenviar nem bloquear. Em campanha interna: após reenviar uma falha, `talkx_recipients.attempt_count` sobe 1 e o status volta a `pending`; após bloquear, `talkx_blacklist` tem a linha com `campaign_id` e `blocked_by`.
- **V3:** V35 (abrir conversa, reenviar), V19 (consumo da ação)
- **Negócio:** de cada linha dá para abrir a conversa com o cliente, tentar de novo uma mensagem que falhou ou bloquear o contato para as próximas campanhas.

### X152 · Ler a "Linha do tempo operacional" do servidor, com tipos, ícones e "Ver todos"

- **Fase:** 11 · **Tela:** 11 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X025, X028, X030, X031, X141, X144
- **Fecha:** T11-069, T11-070, T11-071, T11-072, T11-073, T11-074, T11-075
- **Dependências, em detalhe:** X141 ; X144 ; CAP-055 (eventos pelo servidor) ; CAP-054 (ator e motivo) ; CAP-047 (reenvio agendado) ; CAP-050, CAP-051 (queda/volta de conexão) ; CAP-026 (opt-out da campanha) ; CAP-018 (resposta)
- **Hoje:** a linha do tempo é uma aba (`LM:203-222`) que lê 50 eventos por polling de 10 s (`UE:38,43`); mostra um ponto colorido para 4 tipos (`LM:210`) e o tipo cru quando não há mensagem ("resumed", `LM:214`); `limits_updated` sairia como JSON. Resposta, envio, opt-out e falha de conexão não aparecem: ninguém grava esses eventos.
- **Fazer:** criar `tracking/TalkXOperationalTimeline.tsx` (reutilizado na tela 13) sobre `useTalkXCampaignTimeline`. Mapa tipo → ícone, cor, título e frase em `tracking/talkxTimelineCopy.ts`: "Resposta recebida — <nome> respondeu: “trecho”", "Mensagem enviada — Para <nome> (<telefone>)", "Contato suprimido por opt-out", "Falha de conexão — nova tentativa em N s", "Retomada após pausa — por <ator>", além de iniciada, pausada (com motivo), cancelada, concluída, limites alterados (valores formatados), retomada automática. O trecho da resposta (até 80 caracteres) é buscado em `messages` pelo RLS; sem acesso, mostra só "Resposta recebida". Horário HH:mm à esquerda. Card mostra 5 itens; "Ver todos →" abre painel lateral paginado por cursor com filtro por tipo. Itens novos entram pelo canal de X144. O filtro de status do cabeçalho restringe os itens por destinatário.
- **Aceite:** `src/components/talkx/__tests__/TalkXOperationalTimeline.test.tsx` (novo): evento `resumed` com ator renderiza "Retomada após pausa" e o nome, nunca a palavra "resumed"; `limits_updated` não mostra chave JSON; item de resposta sem acesso à mensagem não mostra trecho; "Ver todos" pede a segunda página com `p_before`. `talkxTimelineCopy.test.ts` (novo): todo `TalkXEventType` de `UE:5-11` tem título. Régua A18: card "Linha do Tempo Operacional".
- **V3:** V35 (timeline), V12 (consumo dos eventos do servidor)
- **Negócio:** a linha do tempo conta o que aconteceu em frases — quem respondeu, quem saiu da lista, quando a conexão caiu e quem retomou.

### X153 · Tela 12: montar cabeçalho, seletor, abas, anel de progresso e "Pico de respostas"

- **Fase:** 11 · **Tela:** 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X028, X055, X075, X143, X144, X146, X147, X150
- **Fecha:** T12-001, T12-002, T12-003, T12-004, T12-005, T12-006, T12-029, T12-030, T12-031, T12-032, T12-041, T12-042, T12-043, T12-044
- **Dependências, em detalhe:** X143 ; X144 ; X146 ; X147 ; X150 ; CAP-018 (respostas) ; CAP-083 (média histórica, trilha de supressão e analytics) ; kit A17 (breadcrumb, abas, select)
- **Hoje:** cabeçalho só com chevron "Voltar", ícone genérico e texto diferente do mock (`CR:606-616`); `<select>` nativo que mostra o status cru `[sending]` (`CR:619-629`); "Iniciada em" só na aba Configurações (`CR:159`); "Ver Monitor" só no card de ações (`CR:700-703`). Abas são `<button>` sem `role="tab"` (`CR:646-657`). O anel tem 5 fatias em que "Enviadas" vale `sent − delivered`, sem percentuais nem respostas (`CR:47-53,75-80`). Não existe "Pico de respostas".
- **Fazer:** cabeçalho com breadcrumb "Campanhas › <nome> › Em andamento", ícone WhatsApp, título e subtítulo do mock, seletor do kit "Campanha: <nome> [pílula traduzida]" restrito a campanhas `sending`, chip "Início: <dia>, HH:mm", botão "→ Ver monitor" e atualizar. Abas com o componente de abas do kit (teclado e `role="tab"`). Criar `tracking/TalkXProgressRing.tsx` (reutilizado na tela 13): centro "N% · X de Y"; legenda Enviados (total), Entregues (%), Respondidos (%), Falhas (%), Pendentes. Criar `tracking/TalkXReplyPeakCard.tsx` com `reply_peak` e `spark` do painel: selo "Em tempo real", "+N% nas respostas" nos últimos 10 min, mini-barras; só mostra a variação com ≥ 5 respostas na janela anterior, senão "Ainda sem respostas suficientes"; o cartão "Ótimo engajamento!" só aparece quando a taxa de resposta supera a média de CAP-083 com base mínima. Montar a grade da Visão Geral do mock (KPIs; anel + ritmo + pico; entregas + ações).
- **Aceite:** `src/components/talkx/__tests__/TalkXProgressRing.test.tsx` (novo): 1.250 enviados / 1.180 entregues / 289 respondidos / 42 falhas / 5.000 total → "25%", "1.250", "(94%)", "(23%)", "(3%)", "3.750". `TalkXReplyPeakCard.test.tsx` (novo): `prev10=2` não mostra percentual; sem benchmark não mostra "Ótimo engajamento". `TalkX.test.tsx`: seletor mostra "Em andamento", não "[sending]"; setas do teclado trocam de aba. Régua A18: tela 12 inteira ao lado de `12_Campanha_Em_Andamento.png`.
- **V3:** V33 (parte da tela 12); "Pico de respostas" não tinha etapa
- **Negócio:** a tela "Em andamento" passa a ter o desenho aprovado: o anel com as cinco contagens e o aviso quando as respostas disparam.

### X154 · Tela 12: montar "Ações da campanha", "Configurações atuais" e a aba Configurações

- **Fase:** 11 · **Tela:** 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X006, X018, X019, X024, X055, X060, X148
- **Fecha:** T12-011, T12-057, T12-058, T12-060, T12-061, T12-063, T12-064
- **Dependências, em detalhe:** X006 ; X148 ; CAP-035 (limite por minuto) ; CAP-036 (limite diário) ; CAP-038 (conexão escolhida) ; CAP-039, CAP-040, CAP-041 (janela, horário comercial, dias) ; CAP-042 (DND) ; CAP-044, CAP-046 (perfil → intervalos, piso no servidor) ; CAP-053 ; CAP-110 (settings lidos pelo backend) ; kit A17 (modal de formulário)
- **Hoje:** card de ações em faixa horizontal no fim da página (`CR:673-722`), sem "Configurações atuais". A aba Configurações mostra o UUID da conexão (`CR:160`) e só o booleano "Horário comercial" (`CR:158`). O modal de limites é um `AlertDialog` com `<select>` e `<input>` nativos (`CR:727-780`). Não existe limite por minuto, dias de envio nem DND no banco.
- **Fazer:** criar `tracking/TalkXCampaignActionsCard.tsx` no lugar de `CR:673-722`: botões empilhados Pausar, Cancelar, Editar Limites, Ver Monitor ao Vivo (os dois primeiros usam os modais de X148); bloco "Configurações Atuais" com Limite de envio (mensagens/min), Horário de envio, Dias de envio e Respeitar DND, cada linha lida da campanha/`talkx_settings`; linha sem coluna no banco não renderiza (A9). Mover o modal de limites para `tracking/TalkXLimitsDialog.tsx` no kit, mantendo as funções de X006 e acrescentando limite por minuto, dias da semana e DND conforme as colunas de CAP-035/CAP-041/CAP-042 existirem. Aba Configurações: nome e número da conexão (`whatsapp_connections.name/phone_number`), velocidade, intervalos e digitação em segundos, janela, dias, fuso, limite diário usado × teto. "Enviar relatório" sai deste card (pertence ao relatório da trilha de dados, relatório e importação).
- **Aceite:** `src/components/talkx/__tests__/TalkXCampaignActionsCard.test.tsx` (novo): campanha com janela 08:00–18:00 mostra "08:00 - 18:00"; sem coluna de DND no payload, a linha não existe; aba Configurações mostra o nome da conexão e nunca um UUID (regex). `TalkXLimitsDialog.test.tsx` (novo) mantém os 4 casos de X006. `grep -n "AlertDialog" src/components/talkx/TalkXCampaignRunning.tsx` = 0. Régua A18: painel direito da tela 12.
- **V3:** V20 (exibição), V09
- **Negócio:** o card lateral mostra as regras que estão valendo (limite, horário, dias, não perturbe) e é ali que se muda o ritmo com a campanha rodando.

### X155 · Tela 12: dar conteúdo real às abas Destinatários, Mensagens, Resultados e Logs

- **Fase:** 11 · **Tela:** 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X027, X028, X033, X141, X144, X150, X151
- **Fecha:** T12-013 (e o teto de linhas das abas T12-009, T12-010, T12-012)
- **Dependências, em detalhe:** X141 ; X144 ; X150 ; X151 ; CAP-010 (snapshot da mensagem) ; CAP-017 (lidas) ; CAP-020 (tempo médio de resposta) ; CAP-100 (log por destinatário)
- **Hoje:** Destinatários mostra as 200 mais recentes e ignora erro de leitura (`CR:176-179,213`); Mensagens mostra 100 (`CR:243,321`); Resultados calcula ritmo e tempo restante no navegador com a série truncada (`CR:426-428,452-458`) e não tem respostas, opt-outs nem lidas; Logs perde nome e telefone quando o evento chega pelo realtime (`CR:372-373,378`) e mostra o status em inglês (`CR:404`).
- **Fazer:** Destinatários: `TalkXRecipientsTable` em modo completo (todas as colunas, ações de X151, paginação). Mensagens: mesma RPC com a mensagem inteira, filtro por status e busca, paginação por cursor, mantendo a regra de `talkxMessageSnapshot.ts`. Resultados: números do painel — total, enviadas, entregues, lidas, respondidas, falhas, a confirmar, opt-outs, pulados, taxa de entrega/resposta/falha (falha sobre processados), tempo decorrido, ritmo medido, término estimado; nada calculado no navegador a partir de linhas. Logs: `talkx_campaign_timeline` só com itens por destinatário, entrada ao vivo pelo canal de X144 com nome e telefone resolvidos por um mapa id → contato alimentado pela página carregada, rótulos de `RECIPIENT_STATUS`, tentativa e erro por linha, pausa de rolagem ("Pausar rolagem"/"Retomar") e filtro "só falhas". Remover `TabRecipients`, `TabMessages`, `TabLogs`, `TabResults` e os mapas `STATUS_TONE`/`STATUS_LABEL` de `CR`.
- **Aceite:** `src/components/talkx/__tests__/TalkXRunningTabs.test.tsx` (novo): evento realtime de um destinatário já carregado mantém o nome (não vira "—"); status aparece "Entregue", não "delivered"; aba Mensagens com 250 mensagens carrega em 2 páginas; aba Resultados com `replied=289` mostra "Respondidas 289". `grep -n "limit(200)\|limit(100)\|limit(50)" src/components/talkx/TalkXCampaignRunning.tsx` = 0. `talkxMessageSnapshot.test.ts` segue verde.
- **V3:** V35 (aplicado à tela 12), V18 (consumo)
- **Negócio:** cada aba da tela "Em andamento" mostra a campanha inteira, e o log ao vivo diz o nome de quem recebeu em vez de um traço.

### X156 · Tela 13: criar `TalkXCampaignPaused.tsx` com cabeçalho, banner, Retomar e Encerrar

- **Fase:** 11 · **Tela:** 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X013, X014, X024, X025, X055, X143, X144, X148
- **Fecha:** T13-001, T13-002, T13-003, T13-004, T13-005, T13-006, T13-007, T13-016, T13-017, T13-018, T13-067, T13-068, T13-069, T13-070, T13-071
- **Dependências, em detalhe:** X143 ; X144 ; X148 ; CAP-054 (motivo e ator da pausa) ; CAP-055 (evento `paused` do servidor) ; CAP-053 (encerrar marca pendentes) ; CAP-007 (retomar em `sending` sem erro) ; CAP-096 ; kit A17 (cartão de alerta, modal)
- **Hoje:** não existe (`grep -rn "TalkXCampaignPaused" src` = 0); `paused` abre a tela 12 com o título "Campanha em Andamento" (`TV:158`, `CR:613`). `pause_reason` não está na interface nem é lido por nenhuma tela (`UX:17-59`); `paused_at` está na interface e nunca é exibido (`UX:55`). Retomar pela tela 12 não pede confirmação (`CR:683-691`); retomar fora da janela mostra "outside_send_window" cru (`UX:364-365`).
- **Fazer:** criar `src/components/talkx/TalkXCampaignPaused.tsx` e ligá-lo em `screenForStatus` de X143. Cabeçalho: breadcrumb "Campanhas › <nome> › Talk X", ícone de pausa âmbar, "Campanha Pausada • <nome>", subtítulo por tipo de pausa ("pausada manualmente por <ator>" / "pausada automaticamente: fora do horário de envio" / "…: conexão do WhatsApp caiu" / "…: limite diário atingido"), cartões "Pausada em" (`paused_at`) e "Tipo de campanha: Talk X - WhatsApp", botões "Retomar campanha" e "Encerrar campanha". Banner âmbar do kit com o motivo digitado, a frase "Nenhum novo contato será processado até que a campanha seja retomada", data/hora e autor; em pausa automática, informa quando ela volta sozinha. Ator e motivo vêm do último evento `paused` (não do navegador). Modal "Retomar campanha?" com o nome da campanha e o texto do mock; recusa do servidor vira frase ("Fora do horário de envio — volta às HH:mm", "WhatsApp desconectado"). Modal "Encerrar campanha?" informa quantos contatos deixam de receber, pede motivo e chama o cancelamento. Botões só para admin/supervisor.
- **Aceite:** `src/components/talkx/__tests__/TalkXCampaignPaused.test.tsx` (novo): evento `paused` com ator "Admin 01" e motivo → banner com os dois; `pause_reason='connection_lost'` → "pausada automaticamente" e sem nome de pessoa; resposta `outside_send_window` → frase em português; modal de retomar contém o nome da campanha. `TalkXView.route.test.tsx`: `paused` abre a tela nova. Em campanha interna: após Encerrar, `select count(*) from talkx_recipients where campaign_id=… and status='pending'` = 0 e há evento `cancelled` com ator. Régua A18: cabeçalho e banner ao lado de `13_Campanha_Pausada_Retomada.png`.
- **V3:** V36 (cabeçalho, modais), V13
- **Negócio:** campanha pausada ganha tela própria que diz quem pausou, por quê e quando — e se foi o sistema, quando ela volta sozinha.

### X157 · Tela 13: montar as 8 abas com conteúdo real

- **Fase:** 11 · **Tela:** 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X057, X059, X060, X142, X149, X150, X152, X154, X155, X156
- **Fecha:** T13-008, T13-009, T13-010, T13-011, T13-012, T13-013, T13-014, T13-015
- **Dependências, em detalhe:** X156 ; X149 ; X150 ; X152 ; X154 ; X155 ; X142 ; CAP-012 (segmentos da campanha) ; CAP-052 (recorrência) ; CAP-039, CAP-040, CAP-041
- **Hoje:** a campanha pausada herda as 6 abas da tela 12 (`CR:25-32`); não há aba Segmentos, Agendamentos nem Histórico.
- **Fazer:** montar em `TalkXCampaignPaused.tsx` as abas do kit, cada uma com endereço (`&ptab=`): Visão Geral (etapas X158…X160); Segmentos (`TalkXSegmentProgressTable` completo, com status por segmento); Destinatários e Mensagens (componentes de X155); Agendamentos (novo `tracking/TalkXScheduleTab.tsx`: janela, dias, fuso, próxima abertura de janela vinda de `talkx_campaign_resume_precheck`, retomada automática prevista e, quando houver, recorrência e próximas ocorrências; sem recorrência, mostra "Envio único"); Análises (bloco Resultados de X155 + "Principais métricas" de X160); Histórico (`TalkXOperationalTimeline` em página inteira, paginado, com filtro por tipo); Configurações (aba de X154, somente leitura enquanto pausada, com "Editar limites").
- **Aceite:** `src/components/talkx/__tests__/TalkXCampaignPausedTabs.test.tsx` (novo): as 8 abas existem na ordem do mock; `&ptab=historico` abre o Histórico; aba Agendamentos sem recorrência mostra "Envio único" e a próxima abertura de janela do precheck; nenhuma aba renderiza vazia sem estado do kit. Régua A18: faixa de abas da tela 13.
- **V3:** V36 (o V36 não cobria as abas)
- **Negócio:** na campanha pausada dá para conferir públicos, mensagens, horários e histórico sem sair da tela antes de decidir retomar.

### X158 · Tela 13: montar os 4 KPIs, o anel por audiência e o card "Segmentos da campanha"

- **Fase:** 11 · **Tela:** 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X057, X058, X140, X142, X146, X149, X153, X156
- **Fecha:** T13-019, T13-020, T13-021, T13-022, T13-023, T13-024, T13-025, T13-027, T13-028, T13-029, T13-030, T13-031, T13-032, T13-033, T13-034, T13-035
- **Dependências, em detalhe:** X156 ; X140 ; X142 ; X146 ; X149 ; X153 ; CAP-012, CAP-013, CAP-014
- **Hoje:** a campanha pausada mostra os KPIs da tela 12 (`CR:103-107`), sem percentual da audiência e sem "Segmentos pendentes"; o anel tem 5 fatias sem "Concluídos" (`CR:47-53`); não há card de segmentos (`grep -i "Segmentos da Campanha" src` = 0).
- **Fazer:** na Visão Geral da tela 13: `TalkXLiveKpiRow` na variante pausada — "Destinatários Totais · 100% da audiência", "Processados (Concluídos) · N% da audiência", "Restantes na Fila · N% da audiência", "Segmentos Pendentes · de N segmentos" (de `talkx_campaign_segment_progress`), com mini-barras do painel. `TalkXProgressRing` na variante de 3 fatias (Concluídos, Restantes, Falhas com %), título "Progresso da Campanha", subtítulo "Acompanhamento da execução por audiência" e select "Todos os segmentos" que passa `p_segment_id` ao painel. Card "Segmentos da Campanha — Status de cada segmento na execução": `TalkXSegmentProgressTable` com colunas Segmento, Destinatários, Status (Concluído / Em execução / Pendente) e Progresso; "Ver todos →" leva à aba Segmentos.
- **Aceite:** `src/components/talkx/__tests__/TalkXCampaignPausedOverview.test.tsx` (novo): 1.680 processados de 2.500 → "67% da audiência" e anel "67% · 1.680 de 2.500 processados"; progresso com 2 segmentos `pending` de 6 → "2 · de 6 segmentos"; escolher um segmento chama o painel com `p_segment_id`; status `running` mostra "Em execução". Régua A18: linha de KPIs, anel e card de segmentos da tela 13.
- **V3:** V36 (KPIs e anel; "Segmentos" não tinha etapa)
- **Negócio:** a tela mostra quanto da audiência já foi processado e quais públicos ainda não começaram.

### X159 · Tela 13: criar o "Checklist para retomar" com 5 itens, verificação e persistência

- **Fase:** 11 · **Tela:** 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X019, X026, X030, X059, X060, X066, X142, X156
- **Fecha:** T13-036, T13-037, T13-038, T13-039, T13-040, T13-041, T13-042
- **Dependências, em detalhe:** X156 ; X142 ; CAP-056 (checklist persistido) ; CAP-078 (aprovação de template) ; CAP-036 (limite diário) ; CAP-039, CAP-040, CAP-041 ; CAP-052 ; CAP-024 ; CAP-050
- **Hoje:** não existe checklist (`grep -i "checklist" src/components/talkx` = 0). O tipo de evento `checklist` existe e ninguém grava nem lê (`UE:11`).
- **Fazer:** criar `tracking/TalkXResumeChecklist.tsx` e `src/hooks/integrations/useTalkXResumeChecklist.ts`. Os 5 itens do mock, cada um com subtítulo vindo de `talkx_campaign_resume_precheck`: (1) "Revisar segmentação dos públicos — N segmentos pendentes"; (2) "Confirmar mensagens e templates — Todos os templates OK" ou "Template aguardando aprovação"; (3) "Verificar limites e janelas de envio — Dentro do limite da conta" ou o impedimento (limite diário atingido, fora do horário, WhatsApp desconectado); (4) "Validar agendamentos — Próximo envio em <tempo>"; (5) "Revisar respostas automáticas — <estado da autoresposta de opt-out e das regras>". Itens 2, 3 e 4 têm verificação automática (selo "verificado agora" ou "atenção"); 1 e 5 são conferência manual. Marcar/desmarcar grava pela capacidade CAP-056 (um registro por item, com ator e hora) e a marcação volta ao reabrir a tela; a marcação vale para a pausa atual (reinicia a cada nova pausa). Cada item tem link para onde se resolve (aba Segmentos, template, aba Agendamentos, Configurações). O modal de retomar de X156 lista os itens automáticos com "atenção"; o bloqueio segue a decisão N32.
- **Aceite:** `src/components/talkx/__tests__/TalkXResumeChecklist.test.tsx` (novo): precheck com `window_open=false` → item 3 com "Fora do horário de envio" e selo "atenção"; template `approved` → item 2 "Todos os templates OK"; marcar o item 1 chama a gravação com a chave do item; remontar o componente com o registro salvo mostra o item marcado. Em campanha interna: `select count(*) from talkx_campaign_events where campaign_id=… and event_type='checklist'` aumenta 1 a cada marcação, com `actor_id`.
- **V3:** V36 (checklist; os 5 itens passam a ser os do mock)
- **Negócio:** antes de retomar, o Joaquim vê uma lista do que conferir; o sistema já confere sozinho o que consegue e guarda quem marcou cada item.

### X160 · Tela 13: montar linha do tempo, "Resumo de enviados" e "Principais métricas"

- **Fase:** 11 · **Tela:** 13 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X025, X027, X028, X057, X066, X075, X140, X152, X156
- **Fecha:** T13-043, T13-044, T13-045, T13-046, T13-047, T13-048, T13-050, T13-051, T13-052, T13-053, T13-054, T13-055, T13-056, T13-057, T13-058, T13-059, T13-060, T13-061, T13-062, T13-063, T13-064, T13-065, T13-066
- **Dependências, em detalhe:** X156 ; X140 ; X152 ; CAP-055 (eventos `started`, `paused`, `created` pelo servidor) ; CAP-012 (evento de segmentos configurados) ; CAP-078 (evento de mensagens aprovadas) ; CAP-018 ; CAP-020 (tempo médio de resposta) ; CAP-083 (médias históricas, incluindo taxa de falha e tempo de resposta — trilha de supressão e analytics)
- **Hoje:** a linha do tempo só existe no Monitor (`LM:203-222`); a pausa pela tela 12, pela lista ou pelo motor não gera evento (`CR:584`, `TV:290`, `SEND:416-420`). O gráfico da tela 12 tem 2 séries por minuto e 20 pontos (`CR:123-144`). `talkx_benchmarks` não tem consumidor em `src`; tempo médio de resposta não é calculado em lugar nenhum.
- **Fazer:** na Visão Geral da tela 13: (1) card "Linha do Tempo da Campanha" com `TalkXOperationalTimeline` restrito a eventos de ciclo de vida (pausada com ator e motivo, iniciada com nº de destinatários, segmentos configurados, mensagens aprovadas, criada), 5 itens e "Ver todos →" para a aba Histórico; acrescentar em `talkxTimelineCopy.ts` os títulos de `segments_reviewed` e do evento de aprovação. (2) `tracking/TalkXSentSummaryChart.tsx`: título "Resumo de Enviados", select "Últimas 24 horas / 12 horas / 6 horas" (painel com `p_bucket='hour'`), chips Enviados, Entregues e Respostas, três linhas com legenda e marcador vertical "HH:mm Campanha pausada" em `paused_at`. (3) `tracking/TalkXKeyMetricsCard.tsx`: Taxa de Entrega, Taxa de Resposta, Taxa de Falha (sobre processados) e Tempo Médio de Resposta (formato "2m 41s"), cada uma com "↑/↓ N% vs. média" só quando CAP-083 tiver base mínima; sem base, a linha mostra o valor sem comparativo.
- **Aceite:** `src/components/talkx/__tests__/TalkXSentSummaryChart.test.tsx` (novo): `paused_at` dentro da janela desenha o marcador com a hora; fora da janela, não desenha; chips somam a série. `TalkXKeyMetricsCard.test.tsx` (novo): 161 s → "2m 41s"; benchmark nulo → sem "vs. média"; falha 42 em 1.722 processados → "2%". `TalkXCampaignPaused.test.tsx`: card de linha do tempo não mostra itens por destinatário. Régua A18: tela 13 inteira ao lado de `13_Campanha_Pausada_Retomada.png`.
- **V3:** V36 (timeline e resumo), V18 (consumo do tempo médio); "Principais métricas" não tinha etapa
- **Negócio:** a tela pausada mostra a história da campanha até a pausa, o que já foi enviado nas últimas horas e se ela está melhor ou pior que a média.

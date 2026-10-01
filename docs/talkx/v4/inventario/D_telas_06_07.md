# Inventário mock × código — Telas 06 (Lista de supressão) e 07 (Analytics)

Base: `main` `3d09433` (2026-10-01). Somente leitura. Mocks abertos e ampliados (recortes 2×):
`docs/talkx/references/06_Lista_de_Supressao.png`, `docs/talkx/references/07_Analytics.png`.
Abreviações de arquivo: **SUP** = `src/components/talkx/TalkXSuppression.tsx` · **ANA** = `src/components/talkx/TalkXAnalytics.tsx` ·
**VIEW** = `src/components/talkx/TalkXView.tsx` · **SH** = `src/components/talkx/talkxShared.tsx` ·
**INS** = `src/hooks/integrations/useTalkXInsights.ts` · **HSUP** = `src/hooks/integrations/useTalkXSuppression.ts` ·
**WHM** = `supabase/functions/_shared/evolution-webhook-messages.ts` · **WHS** = `supabase/functions/_shared/evolution-webhook-msg-handlers.ts`.

Fora do inventário: sidebar e barra superior globais do ZAPP (busca ⌘K, sino, avatar) — são do shell, não das telas 06/07.

---

## 0. Fatos transversais conferidos no código (valem para as duas telas)

### 0.1 RPCs — definição mais recente, retorno exato e consumidores

`grep -rn "\.rpc(" src/components/talkx src/hooks/integrations/useTalkX*.ts` → só `increment_talkx_template_use`,
`update_talkx_template_with_snapshot`, `save_talkx_campaign_draft`, `update_talkx_campaign_limits`,
`replace_talkx_draft_recipients`. **Nenhuma das 5 RPCs abaixo é chamada pelo front.**

| RPC | Definição vigente | Retorno | Quem chama |
|---|---|---|---|
| `talkx_overview_stats(p_from, p_to)` | `supabase/migrations/20260916180000_talkx_rpc_null_guards_and_reply_index.sql:15-101` (INVOKER; grant authenticated) | `jsonb {period:{from,to}, current:{campaigns, contacts_reached (=SUM total_recipients), sent, delivered, failed, unknown, completed, active, delivery_rate_pct}, previous:{campaigns, contacts_reached, sent, delivery_rate_pct}, by_status:{status:n}, daily_sends:[{day,sends}]}`. Janela por `talkx_campaigns.created_at`; período anterior = mesma duração antes de `p_from`. **Não traz** respostas, lidas, conversões, receita, segmento, hora. Bug: `active` filtra `status IN ('running','paused')` (:49) e `running` não existe no CHECK (`sending`) | **ninguém** (front, edges) |
| `talkx_campaign_report(p_campaign)` | `supabase/migrations/20260916190000_fix_talkx_benchmarks_and_campaign_report.sql:41-115` (INVOKER) | `jsonb {campaign_id, kpis:{total_recipients, sent_count, delivered_count, failed_count, outcome_unknown_count, delivery_rate_pct, duration_secs}, by_status:{status:n}, hourly_series:[{hour, sent, delivered}], by_variant:[{variant_id, variant_name, recipients, sent}]}`; erro P0002 se inexistente. `hourly.sent` conta só `status='sent'` (:75) → subconta entregues (P2-5, V16 não entrou). Sem respostas/lidas/cliques/conversões | **ninguém** |
| `talkx_benchmarks()` | `supabase/migrations/20260916220000_fix_talkx_benchmarks_anon_grant_and_e90_execute.sql:34-104` (DEFINER; anon revogado) | `jsonb {window_days:90, as_of, global:{campaign_count, avg_delivery_rate_pct, avg_reply_rate_pct, avg_duration_secs, p50_delivery_rate_pct, p90_delivery_rate_pct, avg_recipients}, by_segment:[≤5 × {segment_id, campaign_count, avg_delivery_rate_pct, avg_reply_rate_pct}] (só admin/supervisor; vazio para agente), by_template:[≤5 × {template_id, campaign_count, avg_delivery_rate_pct, avg_reply_rate_pct}]}`. Lê a view `talkx_campaign_metrics` (só `status='completed'`), janela fixa de 90 dias, sem nomes | **ninguém** |
| `talkx_suppress_contact(p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id)` | `supabase/migrations/20260930330000_talkx_suppress_contact_phone_axis.sql:20-54` (DEFINER; **só service_role**) | `uuid` do registro criado, ou `NULL` se já havia supressão ativa (`ON CONFLICT DO NOTHING`, cobre os índices parciais de `contact_id` e `phone`). **Não tem parâmetro de campanha nem `blocked_by`/`expires_at`** | só o webhook: `WHM:292-299` |
| `talkx_recipient_is_suppressed(p_contact_id, p_phone)` | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql:23-50` (DEFINER; **só service_role**) | `boolean`: existe linha com `removed_at IS NULL` e (`expires_at` nulo ou futuro) e (`contact_id` igual **ou** dígitos do `phone` iguais) | só `supabase/functions/talkx-send/index.ts:371` (e `multiplix-send`) |

View `talkx_campaign_metrics` (`20260922130000…:6-33` + `security_invoker` em `20260928410000`): `campaign_id, segment_id, template_id, status,
total_recipients, sent_count, delivered_count, replied_count, outcome_unknown_count, delivery_rate_pct, reply_rate_pct, duration_secs,
started_at, completed_at, created_at, id, campaign_name` — só campanhas `completed`. Consumida no front apenas por `INS:58-63`.

### 0.2 `useTalkXSuppression.ts` continua código morto
`grep -rn "useTalkXSuppression" src/ e2e/` → única ocorrência é a própria declaração (`HSUP:37`). Além de morto, diverge da tela:
lista sem filtrar `removed_at` (`HSUP:44-48`), remove com **DELETE físico** (`HSUP:93`), grava `origin:'manual'` fixo (`HSUP:80`) e
não grava `blocked_by`. É o único lugar do front que conhece `reason_code`/`phone` avulso/`expires_at` (`HSUP:75-84`). V71 não entrou.

### 0.3 Opt-out automático no webhook (estado real)
- Regex única `TALKX_OPT_OUT_RE` (`supabase/functions/_shared/talkx-reply.ts:29-30`):
  `sair|stop|cancelar|descadastrar|remove|unsubscribe|parar|nao quero|não quero|optout|opt-out`, **mensagem inteira**, case-insensitive.
  **`PARE` não casa** (só `parar`); `remover` não casa (só `remove`); "quero sair da lista" não casa (limitação documentada no arquivo, `:22-27`).
- Fluxo (`WHM:280-327`): só mensagem de texto recebida (`!fromMe`), com `contact_id`; **gate**: precisa existir `talkx_recipients` do contato
  com `sent_at` nos últimos 30 dias (`:287-290`), senão ignora; chama `talkx_suppress_contact` com `reason_code:'opt_out'`,
  `origin:'auto_optout'`, `reason:'Opt-out via mensagem: <texto>'`, `source_message_id` (`:292-299`). **Não grava `campaign_id`**
  (o `recentSend` só seleciona `id`) nem evento `suppression_add`.
- Confirmação (`:303-316`): texto **fixo** no código ("Você foi removido da lista… Não **receberemos** mais mensagens…" — erro de redação),
  ignora `talkx_settings.optout_autoreply`; só envia se a RPC devolveu id novo (idempotente desde V07).
- Mensagem de opt-out não conta como resposta (`WHM:329-334`). Resposta: `attributeTalkXReply` grava `replied_at`/`reply_message_id`
  no destinatário mais recente em **72 h fixas** (`talkx-reply.ts:13,38-78`; ignora `talkx_settings.reply_window_hours`).
- Entrega: `DELIVERY_ACK` → `record_talkx_recipient_delivered` (`WHS:117-121`). `READ`/`PLAYED` só atualizam `messages.status`
  (`WHS:83,110`) — nada em `talkx_recipients`.

### 0.4 Auditoria (E51–E60, E86–E92) × código atual — o que mudou e o que continua igual
| Achado da auditoria | Estado em `3d09433` |
|---|---|
| P1-4 `blocked_by: auth.uid()` viola FK (E55) | **Corrigido (V04)**: `SUP:105,110,120` usam `profile.id`; teste `src/components/talkx/__tests__/TalkXSuppression.authoring.test.tsx` |
| Drift CHECK `auto_optout` + índice de phone (E57) | **Reconciliado (V05)**: `20260929860000_…` |
| P2-1 `UNIQUE(contact_id)` total (E51) | **Corrigido (V07)**: `20260930160000_…` + `20260930330000_…` (idempotência nos dois eixos) |
| "Conversão por segmento" = envio (E84) | **Renomeado (V08)** para "Envio por segmento" (`ANA:217`); a métrica de conversão continua inexistente |
| Hook morto; "Opt-outs 30d" sem janela; "Campanhas protegidas" `—`; 1 filtro de 5; sem ⋮/massa; `onPageSize` vazio; rail sem gauge/atividade; LGPD `'0'` fixo; "Saiba mais" `#`; sem import/motivos; autoresposta fixa; sem evento | **Inalterado** (linhas no inventário abaixo) |
| E86/E89 RPCs sem consumidor; E87 `read_at` inexistente; E88 Analytics recalcula com 24 h/5000; E92 regra `status='finished'`, nenhum `apply()`; P2-2 hook após `return`; P2-5 séries só `status='sent'` | **Inalterado** (`ANA:49,96,198-202`; `INS:85,97-103`) |

---

## Tela 06 — Lista de supressão

### Componente(s) atuais
- `src/components/talkx/TalkXSuppression.tsx:38-254` (tela inteira: KPIs `:132-137`, filtro `:139-143`, tabela `:145-185`, rail `:189-205`,
  modal adicionar `:208-244`, confirmação de remoção `:246-251`). Queries inline (`:53-73`), sem hook.
- Montagem: `VIEW:302-304` (aba `suppression`); cabeçalho e abas em `VIEW:239-283`.
- Primitivos: `SH:60-67` (`SUPPRESSION_ORIGIN`), `SH:356-383` (`FilterBar`), `SH:386-410` (`TalkXPagination`), `SH:224-239` (`RailCard`).
- `src/hooks/integrations/useTalkXSuppression.ts` — **não usado** (§0.2).

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T06-001 | Cabeçalho | Ícone raio + "Campanhas" + "Conecte. Engaje. Converta. Comunicação em escala, com resultado real." | visual | OK | `VIEW:239-242` | — | — |
| T06-002 | Cabeçalho | Botão "Ajuda" (ícone + texto) | nav | PARCIAL | `VIEW:251-256` (só ícone; abre Dialog `TalkXHelp`) | — | front: rótulo "Ajuda"; tela de ajuda real (V91) |
| T06-003 | Cabeçalho | Botão "+ Nova campanha" | ação | OK | `VIEW:257` | — | — |
| T06-004 | Abas | "Visão geral" | nav | OK | `VIEW:267` | — | — |
| T06-005 | Abas | "Segmentos" | nav | OK | `VIEW:268` | — | — |
| T06-006 | Abas | "Templates ▾" (com chevron) | nav | PARCIAL | `VIEW:269` (aba simples, sem dropdown) | — | front: dropdown Biblioteca/Criar (V45) |
| T06-007 | Abas | "Lista de supressão" (ativa, sublinhado azul) | nav | OK | `VIEW:270,302-304` | — | front: deep link `?tab=suppression` (V45) — hoje `activeTab` é estado local (`VIEW:36`) |
| T06-008 | Abas | "Analytics ▾" (com chevron) | nav | PARCIAL | `VIEW:271` (sem dropdown) | — | front: dropdown (V45) |
| T06-009 | KPIs | "Contatos suprimidos" **4.892** | dado | PARCIAL | `SUP:94,133` (= `blacklist.length`) | `talkx_blacklist` (`removed_at IS NULL`) | front/banco: contagem no servidor — a query (`SUP:56-60`) não pagina nem conta (`count`), então fica presa ao teto de linhas da API (padrão do Supabase 1.000; não há `max_rows` em `supabase/config.toml` — valor do projeto não conferido); não filtra `expires_at` (expirado conta como suprimido) |
| T06-010 | KPIs | Mini-barras do KPI "Contatos suprimidos" | dado | OK | `SUP:97,133` (`barsByDay(created_at)`, 8 dias) | `talkx_blacklist.created_at` | — |
| T06-011 | KPIs | Delta "+12%" (suprimidos) | dado | AUSENTE | `SUP:133` `delta={null}` | derivável: `talkx_blacklist.created_at` período × anterior | banco: RPC/contagem por período; front: delta |
| T06-012 | KPIs | "Opt-outs 30 dias" **1.034** | dado | FALSO | `SUP:95,134` | real: `talkx_blacklist.reason_code='opt_out'` + `created_at ≥ now()-30d` | front: a conta é `origin==='optout'` **sem janela de 30 dias** e ignora `auto_optout` — único valor que o webhook grava (`WHM:297`); a UI só insere `manual`/`lgpd` (`SUP:50,227`) → o KPI fica em 0 mesmo com opt-outs reais. V72 |
| T06-013 | KPIs | Mini-barras "Opt-outs 30 dias" | dado | AUSENTE | `SUP:134` `chart="none"` | `talkx_blacklist.created_at` filtrado | front |
| T06-014 | KPIs | Delta "+28%" (opt-outs) | dado | AUSENTE | `SUP:134` `delta={null}` | derivável (idem T06-011) | front/banco |
| T06-015 | KPIs | "Bloqueios manuais" **892** | dado | PARCIAL | `SUP:96,135` | `talkx_blacklist.origin='manual'` | idem T06-009 (teto de linhas, expirados) |
| T06-016 | KPIs | Mini-barras "Bloqueios manuais" | dado | AUSENTE | `SUP:135` `chart="none"` | `talkx_blacklist.created_at` | front |
| T06-017 | KPIs | Delta "+5%" (manuais) | dado | AUSENTE | `SUP:135` `delta={null}` | derivável | front/banco |
| T06-018 | KPIs | "Campanhas protegidas" **126** | dado | PARCIAL | `SUP:136` (card existe com valor `"—"`) | SEM FONTE (`talkx_campaigns.respect_suppression` não existe no catálogo) | banco: coluna + gravação no lançamento (V21); front: V72 |
| T06-019 | KPIs | Mini-barras "Campanhas protegidas" | dado | AUSENTE | `SUP:136` `chart="none"` | SEM FONTE | depende de T06-018 |
| T06-020 | KPIs | Delta "+18%" (protegidas) | dado | AUSENTE | `SUP:136` (no lugar: texto "aplicação automática") | SEM FONTE | depende de T06-018 |
| T06-021 | Filtros | Busca "Buscar por contato, telefone ou e-mail..." | ação | PARCIAL | `SUP:87,139` | `contacts.name/phone/email` | front: busca só nome, telefone e motivo; **não busca e-mail** (o select nem traz `email`, `SUP:58`); filtro em memória sobre o que veio; sem debounce; telefone avulso (`talkx_blacklist.phone`) fora |
| T06-022 | Filtros | "Origem" (rótulo acima) + select "Todas" | ação | PARCIAL | `SUP:85,140` | `talkx_blacklist.origin` | front: sem rótulo acima; opções usam rótulos de **motivo** ("Bloqueio manual", "Número inválido"…) de `SH:60-67` em vez de Opt-out/Sistema/Manual/LGPD/Lista |
| T06-023 | Filtros | "Motivo" + select "Todos" | ação | AUSENTE | `SUP:42,86`: estado `filterMotivo` existe e é aplicado, mas nenhum select o altera (`selects` só tem `origin`, `SUP:139-141`) | `talkx_blacklist.reason_code` (enum; a UI nunca grava) / `reason` (texto) | front: select; gravar `reason_code` |
| T06-024 | Filtros | "Campanha" + select "Todas" | ação | AUSENTE | `grep -n "campaign" SUP` → só `:31,169` | `talkx_blacklist.campaign_id` (coluna existe; nenhum writer preenche) | front: select; banco/edge: preencher `campaign_id` (T06-037) |
| T06-025 | Filtros | "Data" + "Todos os períodos" + ícone calendário | ação | AUSENTE | `grep -n "Calendar\|date" SUP` → 0 | `talkx_blacklist.created_at` | front: date range (V47/V73) |
| T06-026 | Filtros | "Status" + select "Todos" | ação | AUSENTE | `grep -n "filterStatus" SUP` → 0; query fixa `removed_at IS NULL` (`SUP:59`) | derivado de `removed_at`/`expires_at` | front: filtro Suprimido/Expirado/Removido; query deixar de excluir removidos |
| T06-027 | Filtros | Botão "Limpar filtros" | ação | AUSENTE | `FilterBar` aceita `onClear` (`SH:376-378`) mas `SUP:139-143` não passa | — | front |
| T06-028 | Filtros | Alternador lista / grade (2 botões) | ação | AUSENTE | `SegmentedToggle` existe (`SH:585-600`) e não é usado em SUP; não há visão em grade | — | front: toggle + cartão de grade (V3 não prevê para supressão) |
| T06-029 | Tabela | Checkbox "selecionar tudo" no cabeçalho | ação | AUSENTE | tabela à mão (`SUP:151-181`); `TalkXTable selectable` existe (`SH:629-696`) e não é usado | — | front: seleção + barra de ações em massa (V73) |
| T06-030 | Tabela | Checkbox por linha | ação | AUSENTE | idem | — | front |
| T06-031 | Tabela | Coluna "Contato": avatar com iniciais (2 letras, azul) | visual | PARCIAL | `SUP:162` (1 letra, tom vermelho; usa `avatar_url` quando há) | `contacts.name/avatar_url` | front: `InitialsAvatar` (já importado, `SUP:19`, sem uso) |
| T06-032 | Tabela | Coluna "Contato": nome ("João Silva") | dado | PARCIAL | `SUP:163` | `contacts.name` | front: supressão por telefone avulso (`contact_id` nulo) renderiza nome vazio e "?" |
| T06-033 | Tabela | Coluna "Contato": e-mail sob o nome | dado | AUSENTE | `SUP:163` mostra `contacts.company` no lugar | `contacts.email` (existe) | front: selecionar e exibir `email` |
| T06-034 | Tabela | Coluna "Telefone" ("+55 11 98765-4321") | dado | PARCIAL | `SUP:166` | `contacts.phone`; `talkx_blacklist.phone` | front: sem máscara (só `+dígitos`); ignora `talkx_blacklist.phone` → linha avulsa mostra "+" |
| T06-035 | Tabela | Coluna "Origem": ícone + rótulo (Opt-out, Sistema, Manual, LGPD, Lista) | dado | PARCIAL | `SUP:157,167` + `SH:60-67` | `talkx_blacklist.origin` (CHECK: manual, optout, system, lgpd, list, auto_optout) | front: sem ícone; rótulo exibido é de motivo (ex.: `manual`→"Bloqueio manual", `system`→"Número inválido") |
| T06-036 | Tabela | Coluna "Motivo": chip colorido (Opt-out solicitado, Número inválido, Bloqueio manual, LGPD, Sem permissão comercial) | dado | PARCIAL | `SUP:168` (texto livre truncado, sem chip) | `talkx_blacklist.reason` (texto); `reason_code` (enum de 6) | front: insert não grava `reason_code` (`SUP:110`); chip por código. Webhook grava "Opt-out via mensagem: …" como texto |
| T06-037 | Tabela | Coluna "Campanha": nome ("Lançamento Linha Office") | dado | PARCIAL | `SUP:169` (literal "📢 Campanha" ou "—"; sem join) | `talkx_blacklist.campaign_id` → `talkx_campaigns.name`; **nenhum writer preenche** (UI `SUP:110`; RPC do webhook sem parâmetro de campanha) → hoje SEM FONTE | banco: parâmetro `p_campaign_id` na RPC; edge: webhook passar a campanha do `recentSend` (`WHM:288-290`); front: join + nome |
| T06-038 | Tabela | Coluna "Data" ("15 set. 2026, 14:32") | dado | OK | `SUP:170` (`fmtDateTime`, `SH:89-90`) | `talkx_blacklist.created_at` | — |
| T06-039 | Tabela | Coluna "Status": pill "● Suprimido" | dado | PARCIAL | `SUP:171` (pill fixo) | `removed_at`/`expires_at` | front: status derivado; hoje registro expirado aparece "Suprimido" (query não olha `expires_at`) |
| T06-040 | Tabela | Cabeçalho "Status" destacado em verde (coluna de ordenação ativa) | ação | AUSENTE | sem ordenação por coluna; ordem fixa `created_at desc` (`SUP:60`); `grep -n "sort" SUP` → 0 | — | front: ordenação com `aria-sort` (V73 só cita "ordenação por data") |
| T06-041 | Tabela | Coluna "Ações": botão "⋮" por linha | ação | PARCIAL | `SUP:172-176` (botão "Remover" direto; `<AlertDialog>` vazio envolvendo o botão) | — | front: `RowActionsMenu` (`SH:561-583`) com Remover / Editar motivo / Ver contato / Ver campanha (V73) |
| T06-042 | Tabela | Rodapé "Mostrando 1 a 10 de 4.892 contatos suprimidos" | dado | PARCIAL | `SUP:184` + `SH:393` | total = linhas filtradas em memória | front/banco: total real exige `count` no servidor (T06-009) |
| T06-043 | Tabela | Paginação "‹ 1 2 3 4 5 ›" | ação | PARCIAL | `SUP:91,184` + `SH:395-402` | — | front: paginação só em memória; `page` não volta a 1 ao filtrar/buscar (`SUP:43,83-91`) → página vazia |
| T06-044 | Tabela | Seletor "10 por página ▾" | ação | FALSO | `SUP:44` (`const [pageSize] = useState(10)` sem setter) e `SUP:184` `onPageSize={() => {}}` | — | front: o seletor aparece (8/10/20/50, `SH:403-406`) e não faz nada |
| T06-045 | Rail · Centro de proteção | Ícone escudo + "Centro de proteção" + "Mais segurança para suas campanhas" | visual | OK | `SUP:190` | — | — |
| T06-046 | Rail · Centro de proteção | Medidor em anel (gauge) com escudo ao centro | visual | AUSENTE | `SUP:191-194` (caixa verde com número); `grep -rn "Gauge" src/components/talkx` → 0 | SEM FONTE (protegidas/total) | front: `ProtectionGauge` SVG (V74); depende de T06-018 |
| T06-047 | Rail · Centro de proteção | "**126** campanhas protegidas" | dado | FALSO | `SUP:192-193`: exibe `totals.total` (nº de **contatos suprimidos**) sob o rótulo "campanhas protegidas automaticamente" | SEM FONTE | front: remover/ocultar até V21; banco: `respect_suppression` |
| T06-048 | Rail · Centro de proteção | "Contatos da lista de supressão são automaticamente excluídos de todos os envios." | visual | AUSENTE | texto não existe no card (`SUP:190-200`); frase parecida só no aviso (`SUP:203`) | — | front |
| T06-049 | Rail · Centro de proteção | Mini "**4.892** Suprimidos" + ícone | dado | PARCIAL | `SUP:196` (sem ícone; grade 2×2) | `talkx_blacklist` | front: ícone, 4 colunas; mesma ressalva T06-009 |
| T06-050 | Rail · Centro de proteção | Mini "**1.034** Opt-outs" + ícone | dado | FALSO | `SUP:196` (mesma conta de T06-012) | idem T06-012 | idem T06-012 |
| T06-051 | Rail · Centro de proteção | Mini "**892** Manuais" + ícone | dado | PARCIAL | `SUP:196` | `talkx_blacklist.origin='manual'` | front: ícone |
| T06-052 | Rail · Centro de proteção | Mini "**126** Protegidas" + ícone | dado | FALSO | `SUP:196`: a 4ª célula é `['0','LGPD']` — número literal fixo | SEM FONTE (protegidas); LGPD seria `origin='lgpd'` | front: tirar o `'0'` fixo; "Protegidas" depende de V21 |
| T06-053 | Rail · Ações da lista | Título "Ações da lista" | visual | AUSENTE | `grep -n "Ações da lista" SUP` → 0 | — | front: card com `RailAction` (`SH:242-258`, já existe) |
| T06-054 | Rail · Ações da lista | "Importar contatos — CSV, XLSX ou TXT" | ação | AUSENTE | `grep -rniE "csv\|xlsx\|papaparse" src/components/talkx` → 0 | destino: `talkx_blacklist` (insert exige admin/supervisor) | front: parser + mapeamento + preview; banco: carga em lote idempotente (índices parciais); V75 cobre só CSV |
| T06-055 | Rail · Ações da lista | "Exportar lista — Baixar lista em CSV" | ação | AUSENTE | idem grep acima | `talkx_blacklist` + `contacts` | front: serializer CSV com neutralização de fórmula (V40/V74) |
| T06-056 | Rail · Ações da lista | "Adicionar contato — Inserir manualmente" | ação | PARCIAL | `SUP:142` (botão na barra de filtros, não no rail) + modal `SUP:208-244` | `talkx_blacklist` | front: mover para o rail; ver T06-063 |
| T06-057 | Rail · Ações da lista | "Gerenciar motivos — Personalizar categorias" | ação | AUSENTE | motivos são constante `REASONS` (`SUP:36`); tabela `talkx_suppression_reasons` não existe no catálogo | SEM FONTE | banco: tabela de motivos + FK; front: modal (V77) |
| T06-058 | Rail · Aviso | Aviso âmbar "Contatos suprimidos são automaticamente excluídos de todos os envios de campanhas, segmentos e automações." | visual | OK | `SUP:201-204` | — | — (texto promete "automações": o bloqueio real só existe em `talkx-send:371` e `multiplix-send`) |
| T06-059 | Rail · Aviso | Link "Saiba mais →" | nav | FALSO | `SUP:203` `<a href="#">` | — | front: abrir Ajuda no tópico LGPD (V74/V91) |
| T06-060 | Rail · Atividade recente | Título "Atividade recente" | visual | AUSENTE | `grep -n "Atividade" SUP` → 0 | — | front |
| T06-061 | Rail · Atividade recente | Link "Ver todas" | nav | AUSENTE | idem | — | front: lista/histórico completo |
| T06-062 | Rail · Atividade recente | Item "Contato adicionado à lista" + e-mail + "Hoje, 14:32" | dado | AUSENTE | idem | SEM FONTE gravada: tipos `suppression_add/remove` existem no CHECK de `talkx_campaign_events`, mas `grep -rn "suppression_add" src supabase/functions` → 0 writers. Derivável de `talkx_blacklist.created_at` | front/edge: gravar evento de entidade (policy só admin/supervisor) ou derivar da própria tabela |
| T06-063 | Modal (implícito) | Modal "Adicionar contato" | ação | PARCIAL | `SUP:208-244`; insert `SUP:110` | `talkx_blacklist` | front: sem telefone avulso, sem `reason_code`, sem expiração, sem campanha; origem só Manual/LGPD; lista de contatos carregada inteira sem paginação (`SUP:69`) e cortada em 50 (`SUP:78-80`); duplicado ativo devolve erro cru 23505 no toast (V76) |
| T06-064 | Rail · Atividade recente | Item "Contato removido da lista" + e-mail + "Ontem, 16:08" / "13 set. 2026, 11:43" | dado | AUSENTE | query exclui removidos (`SUP:59`) | derivável: `talkx_blacklist.removed_at/removed_by` | front: carregar removidos; evento `suppression_remove` (V79) |
| T06-065 | Rail · Atividade recente | Linha do tempo (trilho vertical, ícones +/−, datas relativas "Hoje"/"Ontem") | visual | AUSENTE | idem T06-060 | — | front |
| T06-066 | Modal (implícito) | Confirmação "Remover da lista de supressão?" | ação | PARCIAL | `SUP:246-251`; soft-delete `SUP:117-125` | `talkx_blacklist.removed_at/removed_by` | front: mutação sem `onError`; sem desfazer, sem trilha, sem bloqueio de 24 h (V79) |
| T06-067 | Modal (implícito) | Modal de importação (mapeamento, preview válidos/inválidos) | ação | AUSENTE | idem T06-054 | — | V75 |
| T06-068 | Modal (implícito) | Modal "Gerenciar motivos" | ação | AUSENTE | idem T06-057 | — | V77 |
| T06-069 | Estado | Lista vazia | estado | OK | `SUP:147` | — | — |
| T06-070 | Estado | Carregando (skeleton) | estado | OK | `SUP:146` | — | — |
| T06-071 | Estado | Vazio por filtro | estado | PARCIAL | `SUP:148` ("Nenhum resultado", sem ação) | — | front: "Limpar filtros" no vazio |
| T06-072 | Estado | Erro de carga | estado | AUSENTE | `SUP:53` não lê `isError`; `TalkXErrorState` (`SH:449-455`) sem uso aqui | — | front |
| T06-073 | Estado | Sem permissão (agente) | estado | AUSENTE | SELECT de `talkx_blacklist` é só admin/supervisor (`20260410103218_…:20-24`); para agente a tela mostra "Nenhum contato na lista de supressão" (`SUP:147`); `TalkXNoPermissionState` (`SH:469-471`) sem uso | — | front: estado de permissão em vez de vazio enganoso |

### Comportamentos implícitos
- **Permissão:** INSERT/UPDATE/DELETE/SELECT em `talkx_blacklist` só admin/supervisor (`20260409190343_…:80-88`, `20260410103218_…`, `20260910100000_…`). O front não checa papel: agente vê lista vazia e, ao adicionar, recebe erro de RLS no toast.
- **Itens do menu ⋮** (mock não abre o menu): hoje só "Remover". Editar motivo/expiração, ver contato, ver campanha não existem.
- **Seleção em massa:** o mock tem checkboxes mas não desenha a barra de ações; nada existe.
- **Volume:** o mock mostra 4.892 linhas; a tela carrega tudo de uma vez e filtra/pagina em memória (`SUP:53-91`). Sem `range`/`count`, a lista e os KPIs ficam limitados ao teto de linhas da API.
- **Validação:** telefone E.164, duplicado, expiração — só o duplicado é barrado, pelo banco (índices parciais), com erro cru.
- **Realtime:** não há assinatura; opt-out automático que chega pelo webhook só aparece após refetch.
- **Supressão expirada:** `talkx-send` ignora expirados (correto, §0.1); a tela os mostra como "Suprimido".
- **Responsivo:** grid `xl:grid-cols-[1fr_280px]` (`SUP:130`), tabela com `overflow-x-auto` — ok. **Teclado/a11y:** botão "Remover" e selects acessíveis; sem `aria-sort`, sem foco gerenciado no modal de adicionar (`aria-describedby={undefined}`).
- **Testes:** só `TalkXSuppression.authoring.test.tsx` (autoria). `e2e/talkx.spec.ts` não toca supressão (`grep -n "upress" e2e/talkx.spec.ts` → 0).

### Etapas do V3 que cobrem esta tela
- **V04, V05, V07** — já na `main` (FK de autoria, drift, unicidade parcial). **V08** não tocou esta tela: `SUP:192-193` (contatos rotulados como "campanhas protegidas") e `SUP:196` (`'0'` LGPD fixo) são números falsos que ficaram fora da lista de 7 casos.
- **V71** hook único + view `talkx_blacklist_active` — não cobre contagem/paginação no servidor (o mock tem 4.892 linhas).
- **V72** KPIs e tabela — não cobre: deltas (+12%/+28%/+5%/+18%) e mini-barras dos 3 últimos KPIs; e-mail sob o nome; ícone da coluna Origem; **nome da campanha** (ninguém grava `campaign_id`; V72 não manda gravar); avatar de 2 letras.
- **V73** filtros/ações/massa — não cobre: alternador lista/grade; ordenação por outras colunas (mock destaca "Status"); tamanhos de página do mock (10) × "10/25/50" × `SH:405` (8/10/20/50).
- **V74** rail — depende de V21 (gauge/protegidas), V75, V77, V91; "Atividade recente" depende de eventos que só V76/V78/V79 passam a gravar; não diz de onde vem o **e-mail** mostrado em cada item.
- **V75** importar — só CSV ("XLSX documentado como converta para CSV"); o mock promete "CSV, XLSX ou TXT". Depende de `talkxCsv.ts` (V40).
- **V76** adicionar/editar · **V77** motivos · **V78** opt-out configurável (keywords em tabela, autoresposta por setting, evento) · **V79** remover com trilha · **V80** funil + QA.
- **Exportar CSV**: só citado como item do rail em V74 e "exportar" em massa em V73 — nenhuma etapa define o export da supressão (colunas, RLS, escape).
- **V21** (`respect_suppression`) é pré-requisito de 5 elementos (T06-018/019/020/046/047/052) e está na Fase 2.

### Riscos e dependências
- **"Campanhas protegidas" não tem fonte** até V21; hoje o rail mostra um número de outra coisa sob esse rótulo (T06-047).
- **`campaign_id` nunca é gravado** → coluna e filtro "Campanha" sem dado mesmo depois do front pronto; exige mudar a assinatura de `talkx_suppress_contact` (contrato de função usada por edge → ordem merge → deploy → apply) e o webhook.
- **Edge:** qualquer mudança no opt-out (V78) só vale após `deploy-functions.yml` disparado e aprovado; não é possível afirmar daqui qual versão do `evolution-webhook` está implantada.
- **`reason_code` nulo** em tudo que a UI inserir até V71/V76; V77 quer transformá-lo em FK — precisa de backfill (hoje 0 linhas, custo zero se feito antes de haver dados).
- **CSV foi removido do sistema** (commits citados na auditoria); V75/V40 reintroduzem — decisão já registrada no V3, mas é pré-requisito de import e export.
- **Colisão:** `talkxShared.tsx` (`SUPPRESSION_ORIGIN`, `FilterBar`, `TalkXPagination`, `TalkXTable`) é ponto de conflito com V42/V47/V48.
- **Produção tem 0 supressões** — nenhum KPI/tabela é verificável com dado real sem fixture.
- **RLS:** eventos de entidade (`campaign_id` nulo) só admin/supervisor gravam/leem (`20260929730000_…:47-60`); o webhook (service_role) grava sem restrição.

---

## Tela 07 — Analytics

### Componente(s) atuais
- `src/components/talkx/TalkXAnalytics.tsx:27-490` — coluna única (`:205`), sem rail. Recebe `campaigns` por prop (`VIEW:305-307`); 3 queries inline
  (`:45-61` heatmap, `:90-124` respostas, `:129-143` detalhe) + `useTalkXSegments` (`:70`) + `useTalkXInsights` (`:202`).
- `src/hooks/integrations/useTalkXInsights.ts:1-148` (4 heurísticas; também usado em `TalkXOverview.tsx:46`). `InsightCard` em `SH:944-988`.
- Contrato que **congela** "Lidas"/"Conversões" como não rastreadas: `scripts/db-audit/talkx-analytics-contract.test.mjs:30-39`.
- Com 0 campanhas (produção hoje) a aba inteira é substituída por um estado vazio (`ANA:198`).

### Fonte de cada métrica do mock
| Métrica | Fonte exata | Situação |
|---|---|---|
| Enviadas | `talkx_campaigns.sent_count`; por dia: `talkx_recipients.sent_at`; RPC `talkx_overview_stats.current.sent` / `daily_sends` | existe; front soma a prop (`ANA:37`); RPC sem consumidor |
| Entrega | `talkx_campaigns.delivered_count` (ACK → `record_talkx_recipient_delivered`, `WHS:117-121`); `talkx_recipients.delivered_at`; RPC `delivery_rate_pct` (atual e anterior) | existe; só aparece no funil (`ANA:171`) e no painel de detalhe |
| Leitura | **SEM FONTE** — `talkx_recipients.read_at` não existe; `READ/PLAYED` só muda `messages.status` (`WHS:83,110`) | V17 |
| Resposta | `talkx_recipients.replied_at` / `reply_message_id`; `talkx_campaigns.replied_count` (trigger `trg_talkx_replied_count`, `20260916140000_…:30-32`); view `reply_rate_pct` | existe; **o Analytics não usa** — recalcula no cliente (`ANA:90-124`) |
| Conversão | `talkx_conversions` (campaign_id, recipient_id, link_id, value, source) — escrita só por `talkx-link` POST convert (`supabase/functions/talkx-link/index.ts:124-132`, sem autenticação); `authenticated` sem grant (`20260916290000_…:12`); 0 linhas; sem RPC | **SEM FONTE no front** (V81/V82/V90) |
| Receita influenciada | `talkx_conversions.value` | idem — **SEM FONTE no front** |
| Por segmento | `talkx_campaigns.segment_id` (1 segmento por campanha). `talkx_recipients.segment_id` **não existe**. RPC `talkx_benchmarks().by_segment` (admin; ≤5; só id; só `completed`; 90 dias fixos) | parcial: só no nível da campanha; "Conversão por segmento" SEM FONTE |
| Por horário | `talkx_recipients.sent_at` (volume) e `replied_at` (engajamento) | existe; front usa só volume e só `status='sent'` (`ANA:49`) |
| Comparativo de períodos | RPC `talkx_overview_stats.previous` (campaigns, contacts_reached, sent, delivery_rate_pct) | parcial e sem consumidor; resposta e receita do período anterior **SEM FONTE pronta** |
| Insights | heurísticas locais (`INS:90-134`); `talkx_settings.ai_insights=false`; nenhuma chamada de IA | parcial; 1 regra morta; nenhum `apply` |
| Canal | **SEM FONTE** — não há coluna de canal; Talk X só envia WhatsApp | divergência do mock (ícones de e-mail) |
| Origem do público | `talkx_campaigns.audience_source` (contacts/segment/crm360) | existe, sem filtro |
| Equipe | indireto: `talkx_campaigns.created_by` → `profiles.department_id` → `departments` | existe, sem filtro |

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T07-001 | Cabeçalho | Ícone raio + "Campanhas" + subtítulo | visual | OK | `VIEW:239-242` | — | — |
| T07-002 | Cabeçalho | Botão "Ajuda" (ícone + texto) | nav | PARCIAL | `VIEW:251-256` (só ícone) | — | front: rótulo; V91 |
| T07-003 | Cabeçalho | Botão "+ Nova campanha" | ação | OK | `VIEW:257` | — | — |
| T07-004 | Abas | "Visão geral" | nav | OK | `VIEW:267` | — | — |
| T07-005 | Abas | "Segmentos" | nav | OK | `VIEW:268` | — | — |
| T07-006 | Abas | "Templates ▾" | nav | PARCIAL | `VIEW:269` (sem dropdown) | — | front: V45 |
| T07-007 | Abas | "Lista de supressão" | nav | OK | `VIEW:270` | — | — |
| T07-008 | Abas | "Analytics ▾" (ativa, com chevron) | nav | PARCIAL | `VIEW:271,305-307` (sem dropdown; sem deep link) | — | front: dropdown Campanhas/Segmentos/Comparativo/Configurações (V45) |
| T07-009 | Filtros | Card "Período — Últimos 30 dias ▾" (ícone calendário) | ação | PARCIAL | `ANA:28,206-210` (3 botões 7/30/90 dias) | `talkx_campaigns.started_at` (filtro no cliente, `ANA:34`) | front: dropdown; o filtro mantém campanha **sem `started_at`** (rascunho/agendada) dentro do período |
| T07-010 | Filtros | Card "Canal — Todos os canais ▾" | ação | AUSENTE | `grep -n "Canal\|channel" ANA` → só `:363,370` (coluna da tabela) | SEM FONTE (canal único WhatsApp) | decisão: omitir ou fixo/desabilitado; nenhuma etapa V3 |
| T07-011 | Filtros | Card "Origem do público — Todos ▾" | ação | AUSENTE | `grep -n "audience_source" ANA` → 0 | `talkx_campaigns.audience_source` | front: select + filtro |
| T07-012 | Filtros | Card "Equipe — Todas as equipes ▾" | ação | AUSENTE | `grep -n "Equipe\|department\|created_by" ANA` → 0 | `talkx_campaigns.created_by` → `profiles.department_id` → `departments` | front: select; banco: RPC com filtro (RLS de `talkx_campaigns` já restringe agente às próprias) |
| T07-013 | Filtros | "Limpar filtros" | ação | AUSENTE | `grep -n "Limpar" ANA` → 0 | — | front |
| T07-014 | KPIs | "Campanhas enviadas" **18.742** | dado | FALSO | `ANA:213` (`filtered.length`) | real: `talkx_campaigns` com `started_at` no período / `SUM(sent_count)` (o mock usa o mesmo 18.742 do funil "Enviadas") | front: o valor é o nº de campanhas do filtro `ANA:34`, que **inclui rascunhos e agendadas** (sem `started_at`) sob o rótulo "enviadas"; usar RPC `talkx_overview_stats` |
| T07-015 | KPIs | Delta "↑ +28%" (campanhas enviadas) | dado | AUSENTE | `ANA:213` `delta={null}` | RPC `talkx_overview_stats.previous.campaigns/sent` | front: consumir RPC (V41 cria `useTalkXStats` só para a Visão geral) |
| T07-016 | KPIs | Mini-barras "Campanhas enviadas" | dado | OK | `ANA:213` (`barsByDay(started_at)`) | `talkx_campaigns.started_at` | — |
| T07-017 | KPIs | "Taxa de entrega" **96,4%** | dado | PARCIAL | `ANA:42,214`: card chama-se "Taxa de envio" = `sent/(sent+failed+unknown)` | `delivered_count/sent_count`; RPC `delivery_rate_pct` | front: KPI de entrega real (o dado já está em `stats.delivered`, `ANA:39`) |
| T07-018 | KPIs | Delta "↑ +2,1%" (entrega) | dado | AUSENTE | `ANA:214` `delta={null}` | RPC `previous.delivery_rate_pct` | front |
| T07-019 | KPIs | Mini-barras "Taxa de entrega" | dado | AUSENTE | `ANA:214` `chart="none"` | `talkx_recipients.delivered_at` por dia (sem RPC) | banco: série diária; front |
| T07-020 | KPIs | "Taxa de resposta" **12,8%** | dado | PARCIAL | `ANA:90-126,215` | correto: `talkx_campaigns.replied_count` / `talkx_recipients.replied_at` | front: hoje recalcula cruzando `messages` com janela de **24 h** (servidor usa 72 h), só destinatários `status='sent'` (`ANA:96` — quem recebeu ACK vira `delivered` e sai da base), limite 5000, só campanhas `completed/sending` (`ANA:65`). `replied_count` nem está na interface `TalkXCampaign` (`src/hooks/integrations/useTalkX.ts:17-59`). V18 |
| T07-021 | KPIs | Delta "↑ +3,4%" (resposta) | dado | AUSENTE | `ANA:215` (no lugar: "N de M responderam") | SEM FONTE pronta (RPC não devolve respostas do período anterior); derivável de `replied_count` por período | banco: ampliar RPC; front |
| T07-022 | KPIs | Mini-barras "Taxa de resposta" | dado | AUSENTE | `ANA:215` `chart="none"` | `talkx_recipients.replied_at` por dia | banco/front |
| T07-023 | KPIs | "Conversão por segmento" **4,6%** | dado | AUSENTE | `ANA:216-222`: card "Envio por segmento" (`sent/total` por `campaign.segment_id`, `ANA:71-88`) — outra métrica | SEM FONTE (conversões inacessíveis; sem `segment_id` no destinatário) | banco: leitura agregada de `talkx_conversions` por segmento; edge: convert autenticado (V82); front |
| T07-024 | KPIs | Delta "↑ +1,2%" (conversão) | dado | AUSENTE | idem (texto com top-3 segmentos no lugar) | SEM FONTE | idem |
| T07-025 | KPIs | Mini-barras "Conversão por segmento" | dado | AUSENTE | `ANA:222` `chart="none"` | SEM FONTE | idem |
| T07-026 | KPIs | "Receita influenciada" **R$ 284.320** | dado | AUSENTE | `grep -niE "receita\|revenue\|R\\$" ANA` → 0 | `talkx_conversions.value` — SEM FONTE no front (sem grant, sem RPC, 0 linhas, sem UI de links) | banco: RPC agregada; edge: V82/V90; front: KPI. V3 só prevê receita no relatório por campanha (V39) |
| T07-027 | KPIs | Delta "↑ +32%" (receita) | dado | AUSENTE | idem | SEM FONTE | idem |
| T07-028 | KPIs | Mini-barras "Receita influenciada" | dado | AUSENTE | idem | SEM FONTE | idem |
| T07-029 | Performance | Título "Performance de campanhas" + ícone (i) | visual | PARCIAL | `ANA:241-258`: "Performance por Campanha" = **barras por campanha** (top 5, Enviadas × Falhas); sem (i) | — | front: trocar por série temporal; tooltip explicativo |
| T07-030 | Performance | Seletor próprio "Últimos 30 dias ▾" | ação | AUSENTE | `grep -n "Select" ANA` → 0 | — | front |
| T07-031 | Performance | Legenda "● Enviadas ● Entregues ● Respostas ● Conversões" | visual | AUSENTE | o gráfico atual não tem legenda nem essas séries (`ANA:253-254`) | — | front |
| T07-032 | Performance | Série diária "Enviadas" | dado | AUSENTE | `grep -n "LineChart\|AreaChart" ANA` → 0 | `talkx_recipients.sent_at`; RPC `talkx_overview_stats.daily_sends` (sem consumidor) | front: hook + gráfico |
| T07-033 | Performance | Série diária "Entregues" | dado | AUSENTE | idem | `talkx_recipients.delivered_at` (sem RPC) | banco: série; front |
| T07-034 | Performance | Série diária "Respostas" | dado | AUSENTE | idem | `talkx_recipients.replied_at` (sem RPC) | banco: série; front |
| T07-035 | Performance | Série diária "Conversões" | dado | AUSENTE | idem | SEM FONTE no front (`talkx_conversions.created_at`) | banco/edge: V82; front |
| T07-036 | Performance | Área com gradiente, pontos, eixo Y 0–2.400, eixo X "1 out … 30 out" | visual | AUSENTE | idem | — | front (recharts já é dependência, `ANA:7`) |
| T07-037 | Top segmentos | Título "Top segmentos" | visual | AUSENTE | `grep -n "Top segmentos" ANA` → 0 (só top-3 dentro do texto de um KPI, `ANA:219-221`) | — | front |
| T07-038 | Top segmentos | Seletor de métrica "Taxa de resposta ▾" | ação | AUSENTE | idem | — | front |
| T07-039 | Top segmentos | 7 linhas com nome do segmento ("Clientes VIP", "Leads qualificados", "Clientes ativos", "Reativação inativos", "Novo cadastro", "Pós-venda", "Carrinho abandonado") | dado | AUSENTE | idem | `talkx_campaigns.segment_id` → `talkx_segments.name` (produção: 1 segmento, fixture E2E) | front: lista |
| T07-040 | Top segmentos | Barra colorida + "%" por linha ("28,4%") | dado | AUSENTE | idem | `replied_count/sent_count` por `segment_id`; RPC `talkx_benchmarks().by_segment` (admin, ≤5, sem nome, 90 dias, só `completed`) | banco: RPC por período, com nome e sem teto de 5; front |
| T07-041 | Top segmentos | Contagem entre parênteses "(3.421)" | dado | AUSENTE | idem | `SUM(sent_count)` por segmento (benchmarks devolve só `campaign_count`) | banco: incluir volume |
| T07-042 | Top segmentos | Linha "Outros" | dado | AUSENTE | idem | campanhas sem `segment_id` (`audience_source` contacts/crm360) | banco/front: agrupar resto |
| T07-043 | Funil | Título "Entrega → Leitura → Resposta → Conversão" | visual | PARCIAL | `ANA:263` ("Funil da Campanha" / "Somente métricas confirmadas pela plataforma") | — | front: título |
| T07-044 | Funil | Funil em trapézios coloridos (5 degraus) | visual | PARCIAL | `ANA:266-279` (4 barras `div` com larguras fixas 100/80/55/35%, não proporcionais) | — | front: SVG proporcional (V38 prevê só no relatório por campanha) |
| T07-045 | Funil | "**18.742** Enviadas · 100%" | dado | OK | `ANA:170,273-276` | `talkx_campaigns.sent_count` | — |
| T07-046 | Funil | "**18.075** Entregues · 96,4%" | dado | OK | `ANA:171` | `talkx_campaigns.delivered_count` | — |
| T07-047 | Funil | "**2.314** Lidas · 12,8%" | dado | AUSENTE | `ANA:176` (`value:null` → "Não rastreado"), travado por `scripts/db-audit/talkx-analytics-contract.test.mjs:35` | SEM FONTE (`read_at` não existe) | banco: coluna + RPC de recibo; edge: webhook READ/PLAYED; front; inverter o contract test (V17) |
| T07-048 | Funil | "**862** Respostas · 4,6%" | dado | AUSENTE | `ANA:169-178`: o funil não tem degrau de respostas | `talkx_campaigns.replied_count` (existe) | front: degrau |
| T07-049 | Funil | "**318** Conversões · 1,7%" | dado | AUSENTE | `ANA:177` ("Não rastreado"), travado pelo contract test `:36` | SEM FONTE no front | V81/V82/V90 + leitura agregada |
| T07-050 | Melhores horários | Título "Melhores horários" + ícone (i) | visual | PARCIAL | `ANA:331` ("Melhores horários de envio"; sem (i)) | — | front |
| T07-051 | Melhores horários | Legenda "Menor engajamento ▪▪▪ Maior engajamento" | visual | PARCIAL | `ANA:333-336` ("Menor"/"Maior", 2 amostras) | — | front |
| T07-052 | Melhores horários | Grade 7 dias × 24 horas com intensidade por **engajamento** | dado | PARCIAL | `ANA:45-61,341-352` | engajamento: `talkx_recipients.replied_at` × `sent_at` | front/banco: hoje é **volume de envios**; conta só `status='sent'` (`ANA:49`, P2-5/V16); query sem paginação; hora no fuso do navegador (`ANA:55`). Falta RPC dia×hora de resposta |
| T07-053 | Melhores horários | Ordem das linhas "Seg … Dom" | visual | PARCIAL | `ANA:25,341` (Dom … Sáb) | — | front |
| T07-054 | Melhores horários | Eixo "00h 03h 06h 09h 12h 15h 18h 21h" | visual | OK | `ANA:340` | — | — |
| T07-055 | Melhor resultado | Título "Campanhas com melhor resultado" + ícone (i) | visual | PARCIAL | `ANA:359` (sem (i)) | — | front |
| T07-056 | Melhor resultado | "Ordenar por [Taxa de resposta ▾]" | ação | AUSENTE | `ANA:149` (ordem fixa por `sent_count`) | — | front: seletor (entrega/resposta/conversões/enviadas) |
| T07-057 | Melhor resultado | Coluna "#" | dado | OK | `ANA:368` | — | — |
| T07-058 | Melhor resultado | Coluna "Campanha" (ícone/emoji + nome) | dado | PARCIAL | `ANA:369` (nome clicável, sem ícone) | `talkx_campaigns.name`; ícone: sem campo (derivável de `objective`) | front |
| T07-059 | Melhor resultado | Coluna "Canal" (ícone WhatsApp / e-mail) | dado | PARCIAL | `ANA:370` (texto fixo "WhatsApp") | SEM FONTE para e-mail (canal único) | front: ícone WhatsApp; e-mail é divergência do mock |
| T07-060 | Melhor resultado | Coluna "Enviadas" | dado | OK | `ANA:371` | `talkx_campaigns.sent_count` | — |
| T07-061 | Melhor resultado | Coluna "Taxa de entrega" ("98,1%") | dado | FALSO | `ANA:363,372`: sob o rótulo "Taxa de entrega" calcula `sent/(sent+failed)` — taxa de envio; `delivered_count` ignorado | `delivered_count/sent_count` | front: fórmula certa (não entrou na lista do V08) |
| T07-062 | Melhor resultado | Coluna "Taxa de resposta" ("24,3%") | dado | AUSENTE | `ANA:363` (colunas: #, Campanha, Canal, Enviadas, Taxa de entrega, Falhas) | `talkx_campaigns.replied_count/sent_count` | front: coluna + tipo |
| T07-063 | Melhor resultado | Coluna "Conversões" ("8,2%") | dado | AUSENTE | `ANA:363,373` (no lugar: "Falhas") | SEM FONTE no front | V82 + leitura agregada |
| T07-064 | Melhor resultado | Link "Ver todas as campanhas →" | nav | AUSENTE | `grep -n "Ver todas" ANA` → 0 | — | front: ir para a Visão geral (precisa callback de troca de aba) |
| T07-065 | Rail · Insights | Rail direito (coluna lateral fixa) | visual | AUSENTE | `ANA:205` (`space-y-4`, coluna única) | — | front: grid com rail (como `SUP:130`) |
| T07-066 | Rail · Insights | "Insights da IA" + ícone + selo "ZAPP" | visual | PARCIAL | `ANA:467-472` (seção "Insights" no rodapé; cada cartão com selo "Heurístico", `SH:969-971`) | — | front: posição/cabeçalho; decidir rótulo — não há IA (`talkx_settings.ai_insights=false`; V39/V83 pedem rótulo "Insights", sem "IA") |
| T07-067 | Rail · Insights | "Análise inteligente dos seus dados de campanhas." | visual | AUSENTE | `grep -n "Análise inteligente" ANA` → 0 | — | front |
| T07-068 | Rail · Insights | Card 1 "Aumente o envio no período da manhã — Campanhas enviadas entre 9h e 11h têm 47% mais respostas que a média." | dado | PARCIAL | `INS:29-54,93-104` ("Janela ótima de envio": melhor hora + taxa absoluta) | `talkx_recipients.sent_at/replied_at` | front/banco: sem comparação "vs média"; amostra de 2000 linhas sem ordem definida; exige ≥10 envios/hora e ≥5% |
| T07-069 | Rail · Insights | CTA "Aplicar sugestão →" | ação | AUSENTE | `INS:101` define `applyLabel` sem `apply`; `InsightCard` só mostra o botão com `onApply` (`SH:974`) → nunca renderiza | — | front: `apply()` que pré-preenche janela no wizard (V83) |
| T07-070 | Rail · Insights | Card 2 "Segmente mais sua base — Segmentos com mais de 1.000 contatos têm 2,3x mais conversões que envios genéricos." | dado | AUSENTE | nenhuma regra de segmento em `INS:90-134` | SEM FONTE (conversões); com respostas: `talkx_campaign_metrics.segment_id` + `talkx_segments.estimated_count` | front/banco: heurística por resposta (V83) — "conversões" não é sustentável |
| T07-071 | Rail · Insights | CTA "Ver segmentos →" | nav | AUSENTE | idem | — | front: trocar aba |
| T07-072 | Rail · Insights | Card 3 "Use templates que já performam — Campanhas com o template "Convite VIP" têm 68% mais respostas que a média." | dado | PARCIAL | `INS:56-68,106-113`: usa o nome da **campanha**, escolhe por `replied_count` absoluto, sem comparar com média; sem CTA | `talkx_campaign_metrics.template_id/reply_rate_pct`; RPC `talkx_benchmarks().by_template` (sem consumidor) | front: agrupar por template, comparar com `global.avg_reply_rate_pct` |
| T07-073 | Rail · Insights | CTA "Ver templates →" | nav | AUSENTE | `INS:108-112` (sem `applyLabel`/`apply`) | — | front |
| T07-074 | Rail · Insights | Ícones coloridos por card (verde/roxo/laranja) | visual | PARCIAL | `SH:927-938,961-964` (ícone cinza; fundo `bg-red-50`/`amber-50`/`blue-50` fora dos tokens) | — | front: tokens (V49) |
| T07-075 | Rail · Insights | "Resumo — Se você aplicar essas 3 recomendações, pode gerar até **+42%** mais conversões nos próximos 30 dias." | dado | AUSENTE | `grep -n "Resumo" ANA INS` → 0 | SEM FONTE (projeção; regra 2 do V3: zero número fabricado) | decisão: omitir ou resumo sem percentual |
| T07-076 | Rail · Comparativo | Título "Comparativo de períodos" + ícone | visual | AUSENTE | `ANA:382-410` é "Comparativo de **Campanhas**" (5 últimas concluídas, envio% × falha%) — outro conteúdo | — | front: card novo |
| T07-077 | Rail · Comparativo | Seletor "Últimos 30 dias ▾" | ação | AUSENTE | idem | — | front |
| T07-078 | Rail · Comparativo | Colunas "30 dias anteriores" × "Últimos 30 dias" | visual | AUSENTE | idem | — | front |
| T07-079 | Rail · Comparativo | "12.486 → 18.742 campanhas enviadas ↑ +50%" | dado | AUSENTE | `grep -rn "talkx_overview_stats" src` → só `types.ts` | RPC `talkx_overview_stats.current/previous` (existe; janela por `created_at`) | front: hook; banco: V16 (corrigir `contacts_reached`, série) |
| T07-080 | Rail · Comparativo | "8,2% → 12,8% taxa de resposta ↑ +56%" | dado | AUSENTE | idem | RPC **não** devolve respostas; derivável de `replied_count` por período | banco: ampliar RPC; front |
| T07-081 | Rail · Comparativo | "R$ 199.320 → R$ 284.320 receita influenciada ↑ +43%" | dado | AUSENTE | idem | SEM FONTE no front | V82/V90 + RPC |
| T07-082 | Estado | Sem campanhas | estado | OK | `ANA:198` | — | — (é o que produção mostra hoje: 0 campanhas) |
| T07-083 | Estado | Carregando | estado | AUSENTE | `VIEW:306` não repassa `isLoading`; enquanto carrega aparece "Nenhuma campanha para analisar" | — | front: skeleton |
| T07-084 | Estado | Erro / dados indisponíveis | estado | AUSENTE | queries `ANA:45,90,129` ignoram `error`; `TalkXErrorState`/`TalkXDataUnavailableState` sem uso | — | front |

### Comportamentos implícitos
- **Bug de hooks (P2-2):** `useTalkXInsights()` é chamado depois do `return` antecipado (`ANA:198-202`, com `eslint-disable`). Quando a lista passa de 0 para ≥1 campanha (realtime em `useTalkX`), o React lança "Rendered more hooks". Como produção tem 0 campanhas, a **primeira** campanha criada com a aba aberta dispara isso.
- **Período não é coerente entre blocos:** KPIs e tabela usam `filtered` (`ANA:34`); o "Comparativo de Campanhas" usa todas (`ANA:155-167`); os insights usam 90/180 dias fixos (`INS:26-27`); o mock tem 3 seletores de período independentes (filtro, gráfico, comparativo).
- **Permissão/escopo:** RLS de `talkx_campaigns` limita o agente às próprias campanhas, então os números são "os meus" para agente e "todos" para admin; `talkx_benchmarks` é global (DEFINER) — misturar os dois na mesma tela gera totais que não fecham. O filtro "Equipe" pressupõe visão acima do agente.
- **Regra morta:** insight de cliques filtra `status='finished'` (`INS:85`), valor que não existe no CHECK → `lowClickCampaigns` é sempre 0.
- **Insight de inativos** (`INS:70-76,115-123`) usa `contacts.updated_at`, não está no mock e tem `applyLabel` sem ação.
- **Sobra no código, fora do mock:** KPIs "Mensagens enviadas" e "Falhas" (`ANA:223-224`), faixa "N contatos responderam" (`ANA:228-238`), "Volume por dia da semana" (`ANA:286-307`), card "Melhor horário" (`ANA:310-324`, com frase "maior taxa de abertura" sem dado de abertura), "Comparativo de Campanhas" (`ANA:382-410`), painel de detalhe por campanha (`ANA:413-464`; trata só `sent`/`failed` no tom do status).
- **Tooltips (i)** de 3 cards: o mock os mostra, o conteúdo não está desenhado; nada no código.
- **Moeda/locale:** nenhum formatador de R$ no módulo. **Realtime:** KPIs somam a prop que já tem realtime; as 3 queries próprias têm `staleTime` de 1–2 min.
- **Responsivo:** grids `lg:grid-cols-2`/`2xl:grid-cols-6`; heatmap com `min-w-[600px]` e scroll. **A11y:** heatmap só com `title` por célula, sem tabela alternativa.
- **Testes:** só o contract test estático (regex sobre o arquivo); nenhum teste de render do Analytics nem do `useTalkXInsights`.

### Etapas do V3 que cobrem esta tela
**O V3 não tem fase nem etapa de construção para a tela 07** (a Fase 7 é supressão; funil/heatmap/insights/receita aparecem só no Relatório por campanha, V37–V39). O que encosta no Analytics:
- **V08** (na `main`) — renomeou "Conversão por segmento" → "Envio por segmento"; não pegou "Taxa de entrega" da tabela (`ANA:372`) nem "Campanhas enviadas" contando rascunhos (`ANA:213`).
- **V16** — troca `status='sent'` por `sent`+`delivered` em `ANA:49/96` e na RPC; não cria série diária de entregues/respostas/conversões.
- **V17** — `read_at` + "Lidas" no Analytics; não cria o degrau "Respostas" do funil.
- **V18** — Analytics passa a usar `replied_count`/RPC; não cria delta vs período anterior nem mini-barras.
- **V41** — `useTalkXStats` sobre `talkx_overview_stats`, mas só para a Visão geral; a RPC não tem resposta/receita/segmento/hora.
- **V45** — dropdown da aba "Analytics ▾" (Campanhas/Segmentos/Comparativo/Configurações), sem dizer o que cada sub-visão renderiza.
- **V49** — `InsightCard` nos tokens. **V69** — `useTalkXBenchmarks` e "vs. média" no Analytics (by_segment só admin, ≤5, sem nome).
- **V81/V82/V90** — links, conversão autenticada e conversões pelo CRM: pré-requisito de Conversões/Receita; nenhuma dá leitura agregada ao front fora do relatório.
- **V83** — corrige `finished`→`completed`, cria heurística de segmentos e `apply()`; cita a tela 07, mas sem rail, sem "Resumo", sem "% vs média".
- **V84** — `TalkXSettings` em Analytics ▾ Configurações.
- **Sem etapa:** filtros Canal/Origem do público/Equipe e "Limpar filtros"; gráfico de linha de 4 séries; card "Top segmentos"; funil global de 5 degraus em SVG; heatmap por engajamento e ordem Seg→Dom; ordenação e colunas Resposta/Conversões da tabela; "Ver todas as campanhas"; rail; "Comparativo de períodos"; KPI "Receita influenciada"; deltas e mini-barras dos KPIs; estados de loading/erro; correção do P2-2 (hook após `return`).
- O Apêndice B do V3 marca "+32%" como "não existe fonte — não implementar", mas não decide o que fazer com os demais deltas, com "Canal" e com o "Resumo +42%".

### Riscos e dependências
- **Sem fonte hoje:** Lidas (V17), Conversões e Receita (V81/V82/V90 + leitura agregada inexistente), Conversão por segmento, Canal, Resumo "+42%". São 4 dos 5 KPIs do mock com pelo menos uma parte sem fonte (delta ou valor).
- **Produção com 0 campanhas/0 destinatários:** nada na tela é verificável com dado real; toda validação depende de fixture ou do smoke V99.
- **Contract test congela o estado atual** (`talkx-analytics-contract.test.mjs:34-39,64-67`): liberar Lidas/Conversões ou voltar o rótulo "Conversão por segmento" quebra o CI até o teste ser reescrito (V17/V96).
- **RPCs existentes não bastam:** `talkx_overview_stats` janela por `created_at`, sem respostas/receita, com `active` filtrando `running` (inexistente); `talkx_benchmarks` fixa 90 dias e 5 itens. O Analytics do mock pede uma RPC nova (período, canal, origem, equipe → KPIs + séries + por segmento + dia×hora + ranking), que nenhuma etapa descreve. DDL de contrato → fluxo arquivo → PR → merge → apply.
- **Atribuição por segmento** só no nível da campanha (`talkx_campaigns.segment_id`); campanha com `audience_source='contacts'` cai em "Outros"; multi-segmento (`talkx_campaign_segments`) está no backlog do V100.
- **P2-2** vira erro de runtime na primeira campanha criada; **P2-5** distorce heatmap e taxa de resposta assim que houver ACK de entrega.
- **Colisão:** `talkxShared.tsx` (`InsightCard`, `KpiCard`) com V48/V49; `useTalkXInsights` é compartilhado com `TalkXOverview.tsx:46` — mudar a forma do insight afeta a tela 01.
- **Edge:** leitura (V17), janela de resposta (V18) e convert (V82) só valem após `deploy-functions.yml` aprovado.

# Talk X · Campanhas — Auditoria exaustiva do plano (2026-09-29)

> **Base auditada:** `main` `a0002bb` · banco `tnnnlkbymytvtqngbbqh` (ao vivo) · CI da `main` até 28/09.
> **Planos revisados:** `PLANO_IMPLEMENTACAO_TALKX_100.md` (E01–E100, 08/09) e
> `PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md` (001–100, 12/09).
> **Método:** 5 auditores independentes (um por bloco de fases) leram o código real, etapa por etapa,
> sub-item por sub-item; cada afirmação crítica foi reconferida no banco de produção ou na CI.
> Nada foi inferido de título de commit, changelog ou checkbox.
> **Sucessor:** [`PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`](./PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md).

---

## 1. Veredito

| Medida | Valor |
|---|---|
| Etapas E01–E100 **completas** conforme o próprio critério do plano | **6** (E01, E02, E03, E05, E06, E07) |
| Etapas **parciais** (código existe, aceite não fechado) | **74** |
| Etapas **ausentes** (nada implementado ou removido depois) | **20** |
| Telas de referência (17) com implementação **completa** | **0** |
| Telas **sem componente dedicado** | 3 — 13 Pausada, 14 Relatório, 15 Importação/CRM (16 Ajuda é um Dialog estático) |
| Bugs **confirmados em produção** (P0/P1) | **9** (§4) |
| Drifts de banco (DDL em produção sem migration nem ledger) | **2** (§5) |
| Afirmações **falsas** em README/CHANGELOG/PARIDADE/ARQUITETURA/OPERACAO | **40+** (§6) |

**Gates locais nesta base:** `tsc` 0 erros · `eslint` (escopo talkx) 0 erros/1 warning · `vitest` 89/89 verde ·
contratos `talkx-analytics-contract` e `talkx-navigation-contract` verdes.
**CI da `main` (28/09):** `CI/CD Pipeline` ✅ · `DB Guard (offline)` ✅ · **`E2E logado` ❌** (o teste
`talkx.spec.ts:160 "wizard advances to step 2"` falha nos 3 browsers) · **`DB Live Guard` ❌** (6 verificações,
incluindo "migrations vs ledger" e "catálogo") · `types-sync` ❌ (PR #1154 aberta).

O que os documentos do módulo dizem ("Fases 1–7 implementadas e mergeadas", `talkx-v1.0.0`, PARIDADE com dezenas
de ✅) **não corresponde ao código**. A tag `talkx-v1.0.0` foi criada com a mensagem "F0 (E01–E10) + F1 (E11–E20)",
e nem a F1 está completa.

Os dois planos anteriores foram escritos e o código evoluiu por sessões paralelas sem que ninguém reconciliasse
promessa × código × banco. O plano V3 (§9) parte deste diagnóstico, não dos checkboxes.

---

## 2. Estado real por camada

### 2.1 Banco de produção (verificado ao vivo)

| Objeto | Estado |
|---|---|
| Tabelas `talkx_*` | 12 (`campaigns`, `recipients`, `blacklist`, `segments`, `templates`, `campaign_events`, `settings`, `template_versions`, `template_variants`, `links`, `link_clicks`, `conversions`). **0 campanhas, 0 destinatários, 0 supressões** — o motor nunca foi exercitado em produção. 5 templates, 1 segmento (fixture E2E), 6 settings |
| Tabelas previstas e **ausentes** | `talkx_campaign_segments`, `talkx_segment_versions`, `talkx_suppression_reasons`, `talkx_optout_keywords`, `talkx_test_sends`, `talkx_imports`, `talkx_import_rows`, `talkx_crm_links` |
| Views | `talkx_campaign_metrics` — **sem `security_invoker`, owner `postgres`** (§4 P0-1). `talkx_blacklist_active` (E51) **não existe** |
| Funções | 31 (`claim/complete/release/reschedule_talkx_recipient`, `save_talkx_campaign_draft`, `replace_talkx_draft_recipients`, `transition_talkx_campaign` **×2 overloads**, `talkx_overview_stats`, `talkx_campaign_report`, `talkx_segment_tags`, `talkx_benchmarks`, `record_talkx_link_click`, `record_talkx_recipient_delivered`, `talkx_recipient_is_suppressed`, …). Ausentes: `talkx_segment_overlap`, `talkx_import_match` |
| Colunas previstas e ausentes | `talkx_campaigns`: `respect_suppression`, `confirm_consent`, `launched_by`, `launched_at`, `recurrence`, `investment`. `talkx_recipients`: `read_at`, `segment_id`. `talkx_segments`: `tags` |
| RLS | Ativa nas 12 tabelas. `talkx_settings` só tem policy SELECT → **o save de configurações não persiste** (§4 P1-6). `talkx_blacklist` SELECT só admin/supervisor → agentes veem "Bloqueados: 0" sempre |
| CHECK `talkx_campaign_events.event_type` | 9 tipos (`created…note`). Bloqueia `scheduled_updated`, `limits_updated`, `suppression_add/remove`, `connection_failed`, `resumed_auto` previstos no plano |
| `talkx_campaigns.status` | `draft, sending, paused, completed, cancelled` — **`scheduled` não está no CHECK**, mas o front faz `update status='scheduled'` (`useCampaignEditor.ts`) e o trigger de mutabilidade e o scheduler filtram por `scheduled`. Confirmar em V02 |
| Realtime | `supabase_realtime` inclui as 5 tabelas principais |
| pg_cron | `talkx-scheduler-1min` ativo, últimas 3 execuções `succeeded` |
| Storage | **Nenhum bucket `talkx-media`** (só `whatsapp-media`) |

### 2.2 Código

| Camada | Arquivos | Observação |
|---|---|---|
| Componentes | 15 `TalkX*.tsx` (6.253 linhas) + `talkxShared.tsx` (45+ exports) | **Não existem:** `TalkXSegmentBuilder`, `TalkXCampaignPaused`, `TalkXCampaignReport`, `TalkXImport`, `TalkXKit`, `talkxConstants.ts`; `git log --all` confirma que nunca existiram |
| Hooks | 9 `useTalkX*.ts` + `useCampaignEditor.ts` | `useTalkXSuppression.ts` é **código morto** (nunca importado, faz DELETE físico). Não existem `useTalkXStats`, `useTalkXReport`, `useTalkXImport` |
| Lib | — | `talkxExport.ts`, `talkxCsv.ts`, `talkxReportExport.ts` **não existem**; CSV foi removido do sistema inteiro em 27/09 (commits `d25d24f`, `527c4ba`, `5e0fe82`, `ef300d1`, `fda6f80`), o que apaga E29, E48, E54, E60.4, E85.1 e E94 |
| Edge functions | `talkx-send` (29 testes Deno), `talkx-scheduler`, `talkx-link`, `talkx-report` (e-mail via Resend) + `_shared/talkx-{reply,window,delivery-connection}.ts` | Sem ação `retry`; `pause` não repassa `reason`; `talkx-report` só é chamável para campanhas pausadas (a tela que tem o botão não lista `completed`) |
| Migrations | 45 arquivos `*talkx*` | 2 duplicadas não idempotentes (`20260927500001` e `20260927570000`, mesma `ALTER PUBLICATION`); 1 com sintaxe inválida (`20260916230000`, `CREATE POLICY IF NOT EXISTS`) |
| Testes | 89 unit (9 arquivos) · 7 E2E · 19 scripts `scripts/db-audit/talkx-*` | E2E não roda em PR (só pós-merge em `e2e-logado.yml`), 0 screenshots de referência, sem Deno test de `talkx-link`/`scheduler`/`reply`/webhook |

### 2.3 RPCs criadas e nunca consumidas

`grep -r ".rpc('talkx_" src/` → **vazio**. `talkx_overview_stats`, `talkx_campaign_report`, `talkx_segment_tags`
e `talkx_benchmarks` existem no banco (E86/E89) e **nenhum hook as chama**. Os KPIs da Visão geral, o "vs. média",
a "Conversão média", a "Taxa média de resposta" e o relatório por campanha continuam sem fonte no front.

---

## 3. Tabela por etapa — E01–E100

Legenda: ✅ completa · 🟡 parcial · ❌ ausente. "Falta" lista só o que impede o ✅; evidência `arquivo:linha`.

### Fase 0 — Saneamento (E01–E10)

| Etapa | Status | Falta |
|---|---|---|
| E01 imports | ✅ | — |
| E02 Math.random | ✅ | — |
| E03 legados | ✅ | — |
| E04 lint | 🟡 | `talkxConstants.ts` nunca criado (constantes em `talkxShared.tsx:25-79`); warnings silenciados com `eslint-disable` |
| E05 rebase | ✅ | — |
| E06 merge | ✅ | — |
| E07 pg_cron | ✅ | job ativo, `succeeded` |
| E08 PAT | 🟡 | rotação do `ghp_RO0W…` segue como "ação manual pendente" no CHANGELOG; não há evidência de conclusão |
| E09 testes | 🟡 | 89 testes, mas cobertura ≥60% em `talkx/` nunca medida (vitest exige 36% global) |
| E10 arquitetura | 🟡 | `ARQUITETURA.md` lista 3 componentes inexistentes e marca E87/E88/E94/E97 como ✅ indevidamente (§6) |

### Fase 1 — Design system (E11–E20)

| Etapa | Status | Falta |
|---|---|---|
| E11 `.talkx-*` | 🟡 | cores fixas no CSS (sem `--tile-from/--tile-to`); `.talkx-card`, `.talkx-rail`, `.talkx-dot-pulse` não usados em nenhum TSX; sem `.talkx-pill`; sem safelist (`components.css:199-305`) |
| E12 IconTile | 🟡 | `glow` default `false`; sem `TalkXKit`/`__dev__`; sem snapshot; classe dinâmica `bg-dash-tile-{color}` sem safelist (`talkxShared.tsx:195-205`) |
| E13 KpiCard | 🟡 | sem framer-motion (`animationDelay` morto); tooltip nativo; sem teste (`talkxShared.tsx:501-554`) |
| E14 Header/tabs | 🟡 | sem `ModuleTabs`, sem chevron/dropdown, **sem deep link `?tab=`** (`TalkXView.tsx:36`), sem breadcrumb nas abas |
| E15 Botões | 🟡 | `PrimaryButton/GhostButton` sem `glow/tone`; `RowActionsMenu` existe e **não é usado** (Overview monta menu à mão `TalkXOverview.tsx:257`) |
| E16 FilterBarV2 | 🟡 | sem hint ⌘K, sem date range, sem chips ativos, sem Sheet mobile (`talkxShared.tsx:864-921`) |
| E17 TalkXTable | 🟡 | genérica existe (`:629-696`) mas **não é usada em nenhuma tela**; sem `rowActions`, sem células padrão, sem virtualização |
| E18 Rail | 🟡 | `HeroCard` sem tiles flutuantes; **`ProtectionGauge` inexistente**; `TipCard` fixo (sem `TIPS[]`); `InsightCard` com `bg-red-50/amber-50` (fora do carvão) |
| E19 Modais/estados | 🟡 | **0 dos 7 presets**; **checks não bloqueiam confirmar** (`talkxShared.tsx:847-849`); `NoPermission`, `WhatsAppDisconnected`, `DataUnavailable`, `ErrorState` nunca usados; sem `aria-live` |
| E20 Motion | 🟡 | variantes `talkx*` existem (`variants.ts:62-84`) e **não são importadas por ninguém**; sem prints |

### Fase 2 — Visão geral (E21–E30)

| Etapa | Status | Falta |
|---|---|---|
| E21 KPIs | 🟡 | sem `useTalkXStats`/RPC; "alcançados" = `sum(sent_count)` não distinct; **delta "Em andamento" inventado** (`TalkXOverview.tsx:123` mostra `↑3%` com 3 ativas); "Em andamento" ignora `scheduled` |
| E22 Filtros | 🟡 | sem canal (trocado por objetivo); **sem ordenação/`aria-sort`**; vazio filtrado sem "Limpar" |
| E23 Tabela | 🟡 | à mão (não `TalkXTable`); sem thumb; sem dot pulsante; sem `delivered`; **sem barra de seleção em massa** (`selected` existe e não é usado) |
| E24 Rail | 🟡 | 3 ações (falta Importar); 4 recentes (não 5); **sem Accordion <1280**; sem skeleton |
| E25 Ações | 🟡 | pausar/retomar sem modal; **duplicar não persiste** (`talkxCampaignDraft.ts` devolve `id:''`); sem eventos em pausar/cancelar; sem optimistic; `deleteCampaign` sem `onError` |
| E26 ⌘K | 🟡 | todas as ações só `onNavigate('talkx')` (não abrem o item); label `running` inexistente (`useTalkXCommandItems.ts:12`) |
| E27 Realtime | 🟡 | funciona (`useTalkX.ts:147-181`); polling fallback global; migrations duplicadas |
| E28 Grade | 🟡 | card com 1 número, sem ⋮, sem checkbox, sem skeleton, sem stagger |
| E29 Export CSV | ❌ | `talkxExport.ts` removido (`d25d24f`) |
| E30 QA | ❌ | sem `docs/talkx/screens/`; PARIDADE incorreta |

### Fase 3 — Segmentos (E31–E40)

| Etapa | Status | Falta |
|---|---|---|
| E31 Biblioteca | 🟡 | "Ativos" = status, não 30d; chips sem operador/valor; "Desempenho" = barra falsa sobre `estimated_count` (`TalkXSegments.tsx:138`); sem filtro tag/proprietário; ⋮ sem Duplicar/Inativar; `onPageSize={() => {}}` |
| E32 Detalhes | 🟡 | descrição hardcoded "Altíssimo valor e recorrência" (`:198`); sem critérios, sem composição, sem tags (RPC existe, não usada); sem Esc/foco |
| E33 Builder | 🟡 | inline em `TalkXSegments.tsx:232` (sem `TalkXSegmentBuilder`); sem undo/redo; sem sub-tabs; badge `['E','O','G'][gi]` por índice; **condição vazia quebra estimativa e save silenciosamente** (`useTalkXSegments.ts:133`, `TalkXSegments.tsx:62-72`) |
| E34 Catálogo | 🟡 | drag HTML5 nativo; sem contagem/busca; sem `in/not_in`; sem `state/city/assigned_to/pipeline_stage` |
| E35 Resumo | 🟡 | sample **respeita regras** (plano desatualizado); sem debounce 400ms/cancel; risco fixo por tamanho (`:238`) |
| E36 Tags | 🟡 | **nenhuma migration adiciona `tags` a `talkx_segments`**; sem editor/filtro; sem toggle status |
| E37 Versões | ❌ | — |
| E38 Sobreposição | ❌ | — |
| E39 Prévia | ❌ | `resolveAudience` usa `.limit(5000)`, sem `range` |
| E40 QA | 🟡 | PARIDADE sem seções 02/03 |

### Fase 4 — Templates (E41–E50)

| Etapa | Status | Falta |
|---|---|---|
| E41 Galeria | 🟡 | toggle grade/lista **existe** (PARIDADE diz ⏳); card mostra conteúdo cru com "Agora ✓✓" fixo (`TalkXTemplates.tsx:220-223`), sem `personalizePreview`/`extractVariables`; sem ⋮; sem ordenação; paginação fixa 8 |
| E42 Rail | 🟡 | rótulo "Mais convertidos" com dado de `use_count` (desonesto); "Duplicar" chama `openEdit` (não duplica, `:159`); Importar removido; "com IA" sem IA |
| E43 Editor | 🟡 | sem sub-tabs; `Smile`/`Hash` importados sem uso; mídia = input URL; ⌘S só no textarea |
| E44 PhonePreview/bucket | 🟡 | `PhoneFrame` 272×540, "Sua Empresa" fixo, "João Silva" fixo (`talkxShared.tsx:106`); mídias não-imagem viram 📎; **sem bucket, sem upload, sem URL assinada** |
| E45 Variáveis | 🟡 | 5 keys (faltam telefone/data_atual/vendedor/link); **fallback `{{nome\|cliente}}` não funciona** (regex `[^}]+`); sem highlight; sem validação |
| E46 Versões | 🟡 | snapshot em todo save (não só content); sem limite 30; sem `note`; sem diff; sem badge; histórico só em xl+ |
| E47 Testar | 🟡 | **sem `talkx_test_sends`, sem rate limit, sem log** — qualquer admin envia conteúdo arbitrário a qualquer número pela 1ª conexão (`talkx-send/index.ts:147-207`); `customVariables` enviado e ignorado |
| E48 Import/export | ❌ | removido (`527c4ba`); só duplicar existe |
| E49 A/B | 🟡 | soma=100 só texto; sem constraint; sem preview lado a lado; UI duplicada (`TalkXTemplateEditor.tsx:437-484` e `:495-521`); sem teste `pickVariant` |
| E50 QA | 🟡 | PARIDADE F4 com 10 ✅ refutados (§6) |

### Fase 5 — Supressão (E51–E60)

| Etapa | Status | Falta |
|---|---|---|
| E51 Schema v2 | 🟡 | colunas existem; **view `talkx_blacklist_active` não existe**; `UNIQUE(contact_id)` total impede re-suprimir removido; hook morto; sem backfill |
| E52 KPIs/tabela | 🟡 | "Opt-outs 30d" sem janela e ignora `auto_optout` (`TalkXSuppression.tsx:94`); "Campanhas protegidas" = `—`; 1 filtro de 5; telefone avulso invisível; status sempre "Suprimido"; sem ⋮/massa; `onPageSize` vazio |
| E53 Rail | 🟡 | sem `ProtectionGauge`; número grande com rótulo errado (`:187`); LGPD fixo `'0'`; sem atividade; "Saiba mais" = `#` |
| E54 Importar | ❌ | removido (`5e0fe82`) |
| E55 Adicionar/editar | 🟡 | **`blocked_by: user.id` viola FK → insert falha em produção** (§4 P1-4); não grava `reason_code`; sem telefone avulso, expiração, editar motivo, evento |
| E56 Motivos | ❌ | — |
| E57 Opt-out auto | 🟡 | funciona **só porque o CHECK foi alterado fora do git** (§5); keywords fixas; sem acentos; autoresposta fixa ignora `talkx_settings.optout_autoreply`; não idempotente; sem evento |
| E58 Remover | 🟡 | soft-delete OK; sem preset/desfazer/24h/evento; mutação sem `onError` |
| E59 Funil | 🟡 | send re-checa via RPC ✅ (`talkx-send/index.ts:367,432,609`); `resolveAudience` não exclui; wizard "Bloqueados" = 0 para agentes (RLS); `respectSuppression` só estado local |
| E60 QA | ❌ | PARIDADE F5 majoritariamente falsa (§6) |

### Fase 6 — Wizard (E61–E70)

| Etapa | Status | Falta |
|---|---|---|
| E61 Stepper | 🟡 | rodapé e rail não sticky; sem Sheet <1280; passo 4 não vira "Lançar"; `beforeunload` por nome, não dirty |
| E62 Passo 1 | 🟡 | sem Responsável (é Conexão); nome ≥1 não ≥3; segmentos não filtrados por ativo |
| E63 Filtros/flags | 🟡 | UI expõe 2 filtros (`TalkXContactSelector.tsx:95-121`); 4 estados mortos; não usa `buildFilter`; **nenhuma das 4 colunas de flag existe** |
| E64 Passo 2 | 🟡 | `Textarea` simples (não o editor do template); templates em Dropdown; mídia só URL; só-mídia rejeitado |
| E65 Passo 3 | 🟡 | texto de velocidade da constante; horário comercial fixo 08–18 seg–sex no front e no back (`talkx-window.ts:82`); **checks não gravam nada** |
| E66 Rail | 🟡 | `WhatsAppBubble` (não `PhonePreview`); sem "Ver no celular"; amostra `contacts[0]` |
| E67 Revisão | 🟡 | **botões "Editar" quebrados** (`ed.setStep` vs rota, `TalkXCampaignWizard.tsx:74-79`); sem risco opt-out; `launch()` não grava `launched_by/at` |
| E68 Rascunhos | 🟡 | identidade/revisão/autosave OK; `audience_filters` **não restaurados** (`useCampaignEditor.ts:222-227`); passo não restaurado |
| E69 Agendamento | 🟡 | fuso OK; **sem `recurrence`**, sem timeline, validação `> now` (não +2min) |
| E70 QA | ❌ | PARIDADE F6 com ✅ em itens parciais |

### Fase 7 — Ciclo de vida (E71–E85)

| Etapa | Status | Falta |
|---|---|---|
| E71 Agendada | 🟡 | 3 colunas OK; sem repetição/throttle/supressão/segmento/linha WA real/responsável; "Editar" abre passo 1; sem evento (CHECK bloqueia `scheduled_updated`) |
| E72 Roteamento | 🟡 | `draft` via `onView` abre Monitor (não wizard); sem `?campaign=`; `ErrorState` não usado; sem testes por status |
| E73 Monitor | 🟡 | 6 KPIs sem Respondidas/Opt-outs; sem ETA; sem 60/30/15; sem "Previsto"; **bug: filtro da aba Destinatários muda o gráfico** (`TalkXLiveMonitor.tsx:94`) |
| E74 Saúde | 🟡 | 3 linhas; **"Conexão WA: Conectada" fixo** (`:164`); sem msg/min; sem heurística; sem fila |
| E75 Multi-segmento | ❌ | — |
| E76 Destinatários | 🟡 | sem abrir conversa; **sem `retry`** (`talkx-send` devolve 400); sem busca/Sheet/virtualização; timeline só eventos do cliente |
| E77 Em andamento | 🟡 | 6 sub-tabs reais ✅; sem KPI Respostas; sem Pico; config mostra UUID cru (`TalkXCampaignRunning.tsx:160`) |
| E78 Editar limites | 🟡 **quebrado** | `updateCampaign` como `authenticated` em `sending/paused` → trigger `enforce_talkx_campaign_mutability` lança `talkx_campaign_transition_denied` (confirmado ao vivo); sem evento |
| E79 Pausada | ❌ | componente não existe; `pause_reason` fora da interface `TalkXCampaign` |
| E80 Pausa/retomada | 🟡 | `pause` não repassa `reason` (`talkx-send/index.ts:218-222`); `resume` em `sending` = 409; `cancel` não marca pendentes (status `cancelled` não existe no CHECK) |
| E81 Encerrar | 🟡 | sem preset; não abre relatório; sem evento `completed` do servidor; diagrama de estados omite `scheduled→draft` |
| E82 Relatório | ❌ | RPC existe; **nenhum consumidor**; componente/hook não existem |
| E83 Funil/heatmap | ❌ | só no Analytics global (4 degraus em `div`, "Não rastreado") |
| E84 Segmentos/insights | ❌ | "Conversão por segmento" do Analytics é taxa de envio (`TalkXAnalytics.tsx:69-88`) |
| E85 Export/compartilhar | ❌ | CSV removido; sem print; sem compartilhar |

### Fase 8 — Backend (E86–E93)

| Etapa | Status | Falta |
|---|---|---|
| E86 RPCs | 🟡 | 3 RPCs + índices + trigger existem; **nenhum consumidor no front**; `contacts_reached` = soma; sem heatmap/segmento/links |
| E87 Entregues/lidas | 🟡 | `external_id` + DELIVERY_ACK → `record_talkx_recipient_delivered` ✅; **`read_at` não existe**; "Lidas" travado em `null` pelo contract test |
| E88 Respostas | 🟡 | `replied_at`/`replied_count`/72h ✅; janela fixa (ignora settings); Analytics recalcula no cliente com 24h e limite 5000 (`TalkXAnalytics.tsx:90-122`) |
| E89 Benchmarks | 🟡 | view + RPC existem; **0 das 5 métricas liberadas**; `talkx_benchmarks` sem consumidor |
| E90 Links | 🟡 | tabelas + `{{link}}` + edge com rate limit ✅; **sem UI de links** (RLS só service_role → `{{link}}` só funciona com INSERT manual); POST `convert` sem autenticação; sem relatório |
| E91 Resiliência | 🟡 | backoff só antes do POST; 5xx/timeout → `outcome_unknown` sem retry; perda de conexão mid-loop pausa sem `pause_reason`; sem `retry` manual; sem `connection_failed`/`resumed_auto` |
| E92 Insights | 🟡 | 4 regras; **nenhum `apply()`**; regra links filtra `status='finished'` (inexistente, `useTalkXInsights.ts:85`) → nunca dispara; 2 telas de 5 |
| E93 Settings | 🟡 | tabela + UI existem; **`TalkXSettings` órfão** (não montado); só policy SELECT → save silenciosamente não persiste; backend não lê nenhuma chave; limite diário não aplicado; sem N8N/Sentry |

### Fase 9 — Release (E94–E100)

| Etapa | Status | Falta |
|---|---|---|
| E94 Import CSV | ❌ | `ContactImportDialog` (citado como "E94 ✅") **apagado** em `ef300d1`; sem tabelas/matcher |
| E95 CRM 360 | 🟡 | só `TalkXCRMBadge`; sem `talkx_crm_links`, pendentes, filtros; card do wizard desabilitado |
| E96 Ajuda | 🟡 | `TalkXHelp.tsx` = Dialog com 5 seções fixas; sem busca/artigos/guias/checklist/suporte |
| E97 Estados/modais | ❌ | **11 `<AlertDialog>` diretos** em 5 arquivos; sem `ESTADOS.md`/`?talkxState=` |
| E98 a11y/perf | 🟡 | módulo lazy ✅; sem axe, aria-live, virtualização, bundle, Lighthouse |
| E99 E2E | 🟡 | 7 specs (só navegação e passo 1→2); **1 vermelho na main**; não roda em PR; 0 screenshots; sem Deno test de link/scheduler/reply/webhook |
| E100 Release | 🟡 | tag `talkx-v1.0.0` diz "F0+F1"; sem `BACKLOG/TESTES/CRM360/ESTADOS.md`; sem `screens/final` |

---

## 4. Bugs confirmados em produção (ordem de severidade)

| # | Sev | Bug | Evidência | Efeito no negócio |
|---|---|---|---|---|
| P0-1 | **P0** | `talkx_campaign_metrics` roda como `postgres` (sem `security_invoker`): a migration `20260922130000` fez `CREATE OR REPLACE VIEW` e descartou o `WITH (security_invoker=true)` de `20260916170000` | `pg_class.reloptions` = vazio ao vivo | Qualquer usuário autenticado lê métricas e **nomes** de campanhas de todos os outros |
| P1-1 | P1 | `transition_talkx_campaign` tem **2 overloads** ao vivo (`(uuid,text)` e `(uuid,text,text DEFAULT NULL)`); `talkx-send` chama com 2 args em 5 pontos | `pg_proc` ao vivo; `talkx-send/index.ts:219,270,411,587,763` | PostgREST responde PGRST203 (ambiguidade) → **start/pause/cancel podem falhar em produção**. Os 29 testes Deno mockam a RPC e não pegam. 0 campanhas já rodaram, então nunca foi exercitado |
| P1-2 | P1 | Scheduler **retoma sozinho campanhas pausadas manualmente** quando têm janela configurada (não olha `pause_reason`) | `talkx-scheduler/index.ts:43-58` | Usuário pausa → campanha volta a enviar em ~1 min |
| P1-3 | P1 | "Editar limites" de campanha em andamento **sempre falha**: `update` como `authenticated` em `sending/paused` é barrado pelo trigger de mutabilidade | função ao vivo: `OLD.status NOT IN ('draft','scheduled') → talkx_campaign_transition_denied` | Modal existe, salvar dá erro |
| P1-4 | P1 | "Adicionar à supressão" grava `blocked_by: auth.uid()`, mas a FK aponta para `profiles(id)` e **nenhum dos 6 perfis tem `id = user_id`** | `TalkXSuppression.tsx:101-103`; `select count(*) filter (where id=user_id) from profiles` = 0 | Inclusão manual na lista de supressão falha com violação de FK |
| P1-5 | P1 | Confirmações críticas **não bloqueiam**: `TalkXConfirmDialog` só aplica `opacity-40` quando os checks não estão marcados; `onClick` segue ativo | `talkxShared.tsx:847-849` | Disparo pode ser confirmado sem marcar consentimento/supressão |
| P1-6 | P1 | `talkx_settings` só tem policy SELECT → o save da tela de configurações **não persiste e não dá erro**; além disso a tela não está montada em rota nenhuma | `pg_policies` ao vivo; `useTalkXSettings.ts:36-41` | Configurações inoperantes |
| P1-7 | P1 | E2E `talkx.spec.ts:160` (wizard passo 1→2) **vermelho na `main`** nos 3 browsers (`locator.click` timeout na seleção de conexão/segmento) | run 36381856081 | Fluxo mais básico do módulo sem prova automatizada |
| P2-1 | P2 | `UNIQUE(contact_id)` total em `talkx_blacklist` + soft-delete → contato removido **não pode ser re-suprimido** (nem por opt-out automático) | constraint ao vivo | Opt-out repetido do mesmo contato falha silenciosamente (`console.warn`) |
| P2-2 | P2 | Bug de hooks: `useTalkXInsights()` chamado após `return` antecipado | `TalkXAnalytics.tsx:198-202` (com `eslint-disable`) | "Rendered more hooks" quando a lista passa de 0 para >0 campanhas |
| P2-3 | P2 | Condição vazia no builder de segmento lança em `rulesToPostgrest` → estimativa mostra 0 e `save()` falha sem toast | `useTalkXSegments.ts:133`; `TalkXSegments.tsx:62-72` | Usuário perde a edição sem saber |
| P2-4 | P2 | `use_count` contado em dobro (RPC no front + trigger E86) | `useCampaignEditor.ts:572`; `20260916130000:19-53` | KPI "Mais usado" inflado |
| P2-5 | P2 | Série horária do relatório e do Analytics filtram `status='sent'`, mas a entrega muda o status para `delivered` | `20260916190000` CTE `hourly`; `TalkXAnalytics.tsx:96` | Gráfico subconta envios entregues |
| P2-6 | P2 | Migrations não replayáveis: `CREATE POLICY IF NOT EXISTS` (sintaxe inválida, `20260916230000:14`) e `ALTER PUBLICATION … ADD TABLE` duplicada (`20260927500001` + `20260927570000`) | arquivos | `db reset`/banco novo quebra (E24 do plano antigo, replay integral, é impossível hoje) |
| P2-7 | P2 | `replied_count` não está protegido pelo guard de mutabilidade (os outros contadores estão) | `20260911200000:117-123` | Cliente pode adulterar respostas |
| P2-8 | P2 | POST `convert` da edge `talkx-link` sem autenticação/assinatura | `talkx-link/index.ts:71-137` | Quem tiver o UUID de um destinatário infla conversões/receita |

**Números fabricados ainda na UI** (regra 3 do plano: zero número fabricado): delta `↑N%` em "Em andamento"
(`TalkXOverview.tsx:123`); "3× mais chances de conversão" (`:313`); "Sugestão de IA … 2,3× mais conversões"
(`TalkXSegments.tsx:175-178`); "Conexão WA: Conectada" fixo (`TalkXLiveMonitor.tsx:164`); "Desempenho" do
segmento como barra sobre `estimated_count` (`TalkXSegments.tsx:138`); "Mais convertidos" por `use_count`
(`TalkXTemplates.tsx:147-151`); "Conversão por segmento" = taxa de envio (`TalkXAnalytics.tsx:69-88`).

---

## 5. Drifts de banco (DDL em produção sem migration nem ledger)

Confirmado ao vivo e por `grep` em `supabase/migrations/` e nos `statements` do ledger (0 ocorrências):

1. `talkx_blacklist_origin_check` inclui **`'auto_optout'`** — o webhook grava esse valor (`evolution-webhook-messages.ts:297`) e só funciona por causa disso. Nenhuma migration amplia o CHECK.
2. Índice **`talkx_blacklist_phone_active_unique`** `(phone) WHERE phone IS NOT NULL AND removed_at IS NULL`.

Ambos aparecem no `PARIDADE.md` como "✅ migration 20260910080000" — a migration não contém nada disso. Isso
contribui para o `DB Live Guard` vermelho ("Comparar migrations com schema_migrations", "Regenerar catálogo")
e repete o padrão dos drifts de setembro descritos no `CLAUDE.md`. Correção: V05 do plano V3 (migration que
reconcilia + registro no ledger com SQL real + catálogo).

---

## 6. Documentação que afirma o que o código não faz

| Documento | Afirmação | Realidade |
|---|---|---|
| `README.md:16` | "Fases 1–7 (E11–E85) implementadas e mergeadas" | E29, E37–E39, E48, E54, E56, E75, E79, E82–E85 ausentes; o resto parcial |
| `README.md:21`, `ARQUITETURA.md:84` | "E94 ✅ via `ContactImportDialog`" | arquivo apagado em `ef300d1` |
| `CHANGELOG_TALKX.md:54-58` | idem "E11–E85 mergeadas" | ver acima |
| `CHANGELOG_TALKX.md:98` | migration `20260916220000_talkx_e93_settings.sql` | a real é `20260916230000` |
| `ARQUITETURA.md:54-55` | "Lidas/`read_at` E87 ✅", "Tempo médio E88 ✅" | `read_at` não existe; tempo médio não existe |
| `ARQUITETURA.md:72,82,83` | `TalkXSegmentBuilder.tsx`, `TalkXCampaignPaused.tsx`, `TalkXCampaignReport.tsx` | nunca existiram |
| `ARQUITETURA.md:85` | "Ajuda não implementada, botão removido" | `TalkXHelp` e o botão existem |
| `ARQUITETURA.md:86` | "E97 ✅" | 11 `AlertDialog` diretos |
| `ARQUITETURA.md` diagrama | `scheduled → cancelled : cancelar` | a tela agendada volta para `draft` |
| `PARIDADE.md:27` | "E29 ✅ `talkxExport.ts`" | apagado |
| `PARIDADE.md:64,66,70-72,74-77,97,100,103` | 10 ✅ da Fase 4 | refutados (card cru, sem `extractVariables`, sem ⋮, sem `sortBy`, paginação fixa, import removido, snapshot sempre, `customVariables` ignorado, sem sub-tab) |
| `PARIDADE.md:73,120` | "toggle grade/lista ⏳" | **já implementado** |
| `PARIDADE.md:135-153` | Fase 5: view, unique, reason_code na UI, "Card Motivos", toggle Ativas/Histórico, guard `qNum`, export | nenhum existe no código atual; `auto_optout` "na migration" é drift |
| `PARIDADE.md:175-183` | Fase 6 toda ✅ | ver E61–E69 |
| `OPERACAO.md:4` | "F0–F1 concluídas" | F1 parcial |
| `OPERACAO.md:67,70,94` | scheduler "controla ciclo de vida"; `talkx-link` "webhook"; "4 testes" | scheduler só inicia/retoma; link é GET redirect + POST convert; são 7 testes |
| tag `talkx-v1.0.0` | "v1.0" | mensagem da própria tag: "F0 + F1" |
| `talkx-analytics-contract.test.mjs` | exige "Lidas" e "Conversões" = `null` | contradiz as metas E87/E90 — o teste congela a lacuna em vez de proteger a métrica |

Comentários de código com números de etapa errados (`TalkXAnalytics.tsx` cita E73–E76/E82; Running cita
"E80"; `talkx-report` cita "E81") confirmam que sessões diferentes usaram numerações diferentes.

---

## 7. Cruzamento com o plano de recuperação (001–100, fases A–J)

O plano de recuperação de 12/09 é mais rigoroso que o E01–E100 e continua válido como **critério de aceite**.
Estado real hoje, por fase, contra o overlay que ele mesmo declarou em 12/09:

| Fase | Declarado em 12/09 | Verificado em 29/09 | O que mudou |
|---|---|---|---|
| A 001–010 contratos/fixtures | 3 verificadas | igual | fixtures e simulador (008) seguem sem harness reproduzível; comparação visual (010) inexistente |
| B 011–020 integridade do draft | 7 verificadas | **regrediu em 011** | identidade/revisão/rota OK; mas voltaram números fabricados (delta, "3×", "2,3×", "Conectada") |
| C 021–030 audiência/supressão | 1 verificada | igual | predicado consolidado na RPC do send ✅; hooks divergem; sem preflight (026); sem CRM (028) |
| D 031–040 wizard/revisão | 0 | igual | E67 "Editar" quebrado; flags ausentes; sem aprovação visual |
| E 041–050 motor durável | 3 (043–044) | **P1-1 e P1-2 novos** | leases/claim/unknown OK; overload da RPC e auto-resume do scheduler comprometem 047/048 |
| F 051–060 eventos/métricas | 3 parciais | igual | ACK/reply OK; sem cliques via UI; conversão sem auth; nenhuma RPC consumida; 056/060 abertas |
| G 061–070 telas operacionais | 0 | igual | 12 existe; **13 e 14 não existem** |
| H 071–080 segmentos/templates | 0 | igual | builder simples; sem versões/overlap/preview; templates mínimos |
| I 081–090 CRM/import/supressão | 0 | **regrediu** | import removido; supressão com P1-4/P2-1 |
| J 091–100 ajuda/aceite/release | 1 (097) | igual | ajuda estática; 0 screenshots; tag enganosa |

---

## 8. Matriz das 17 telas

| Tela | Componente | Estado |
|---|---|---|
| 01 Visão geral | `TalkXOverview` | 🟡 estrutura OK; KPIs sem RPC, sem massa/ordenação/export |
| 02 Segmentos biblioteca | `TalkXSegments` | 🟡 KPIs e coluna "Desempenho" falsos; detalhes rasos |
| 03 Segmentos builder | inline em `TalkXSegments` | 🟡 sem undo/versões/overlap/prévia |
| 04 Templates galeria | `TalkXTemplates` | 🟡 card sem preview real; rail desonesto |
| 05 Templates editor | `TalkXTemplateEditor` | 🟡 sem upload/bucket, fallback, highlight |
| 06 Supressão | `TalkXSuppression` | 🟡 **P1-4**; 1 filtro; sem import/motivos/gauge |
| 07 Analytics | `TalkXAnalytics` | 🟡 **P2-2**; recalcula no cliente; "Não rastreado" |
| 08 Nova campanha | `TalkXCampaignWizard` | 🟡 2 filtros; sem flags; sem uploader; sem Sheet |
| 09 Revisão | `TalkXWizardDelivery` | 🟡 **Editar quebrado**; checks não bloqueiam |
| 10 Agendada | `TalkXCampaignScheduled` | 🟡 sem repetição/linha WA/responsável/evento |
| 11 Monitor | `TalkXLiveMonitor` | 🟡 "Conectada" fixo; sem ETA/retry/fila |
| 12 Em andamento | `TalkXCampaignRunning` | 🟡 6 abas reais; **P1-3** editar limites |
| 13 Pausada | — | ❌ |
| 14 Relatório | — | ❌ (RPC pronta, sem UI) |
| 15 Importação/CRM | — | ❌ (badge só) |
| 16 Ajuda | `TalkXHelp` (Dialog) | 🟡 estático |
| 17 Estados/modais | `talkxShared` | 🟡 4 estados nunca usados; 11 dialogs fora do padrão |

---

## 9. Conclusão e próximo passo

O módulo tem uma base séria no backend (leases, claim atômico, snapshot de mensagem, `outcome_unknown`,
ACK/reply, links, cron) e uma UI que cobre 12 das 17 telas em algum grau. O que falta não é "polimento": são
**9 bugs de produção**, **2 drifts**, **3 telas inexistentes**, **4 RPCs sem consumidor**, **5 fluxos removidos**
(CSV) e uma camada de documentação que afirma o contrário de tudo isso.

O plano V3 (`PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`) começa pelos P0/P1, reconcilia o banco, fecha os fluxos
que o motor já suporta, cria as 3 telas ausentes, e só então completa segmentos/templates/supressão/CRM/ajuda.
Cada etapa nasce com "o que existe hoje" (desta auditoria) e "aceite" verificável; nenhuma etapa herda ✅ de
documento anterior.

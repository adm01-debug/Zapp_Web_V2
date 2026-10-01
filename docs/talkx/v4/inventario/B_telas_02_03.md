# Inventário B — Telas 02 e 03 (Segmentos) · mock × código

Repo `main` @ `3d09433` (2026-10-01). Somente leitura. Mocks abertos e ampliados (recortes 2× em recortes locais (não versionados)).

**Abreviações de arquivo**
- `Seg` = `src/components/talkx/TalkXSegments.tsx` (410 linhas; biblioteca `:26-193`, rail `:195-226`, builder `:232-381`, `RuleRow` `:383-410`)
- `hook` = `src/hooks/integrations/useTalkXSegments.ts` (273 linhas)
- `View` = `src/components/talkx/TalkXView.tsx` · `Shared` = `src/components/talkx/talkxShared.tsx`
- `Editor` = `src/components/talkx/useCampaignEditor.ts` · `Wizard` = `src/components/talkx/TalkXCampaignWizard.tsx`
- `catálogo` = `supabase/schema-catalog.json` (gerado em 2026-10-01)

---

## Tela 02 — Segmentos · biblioteca e painel de detalhes

### Componente(s) atuais
- `View:237-309` — cabeçalho do módulo + abas; aba `segments` monta `<TalkXSegments onUseCampaign>` em `View:296-298`.
- `Seg:26-193` — KPIs (`:83-92`), filtros (`:94-105`), tabela (`:107-163`), rail (`:166-179`), diálogo de exclusão (`:181-190`).
- `Seg:195-226` — `SegmentDetailRail`.
- `hook:202-273` — CRUD (`talkx_segments`), `hook:161-196` — contagem/amostra.
- Primitivos: `Shared:501` KpiCard, `Shared:864` FilterBarV2, `Shared:386` TalkXPagination, `Shared:224` RailCard, `Shared:788` TalkXConfirmDialog.

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T02-001 | Topbar | "Buscar campanhas, segmentos, templates... (⌘ + K)" | nav | PARCIAL | `useTalkXCommandItems.ts:26,40-47` | cache react-query `talkx-segments` | front: itens só existem se a query já foi carregada (lê cache, não busca); a ação só navega para `talkx`, não abre a aba nem o segmento |
| T02-002 | Cabeçalho | tile raio + "Campanhas" + "Conecte. Engaje. Converta. Comunicação em escala, com resultado real." | visual | OK | `View:239-242` | — | — |
| T02-003 | Cabeçalho | botão "Ajuda" (ícone + texto) | ação | PARCIAL | `View:251-256` | — | front: hoje só ícone (aria-label), sem rótulo |
| T02-004 | Cabeçalho | "+ Nova campanha" | ação | OK | `View:257` | — | — |
| T02-005 | Abas | "Visão geral" | nav | OK | `View:267` | — | — |
| T02-006 | Abas | "Segmentos" (ativa) | nav | PARCIAL | `View:36,268` | — | front: aba em `useState`, sem deep link; F5 volta para Visão geral |
| T02-007 | Abas | "Templates ▾" (chevron de submenu) | nav | PARCIAL | `View:269` | — | front: sem chevron/submenu |
| T02-008 | Abas | "Lista de supressão" | nav | OK | `View:270` | — | — |
| T02-009 | Abas | "Analytics ▾" (chevron de submenu) | nav | PARCIAL | `View:271` | — | front: sem chevron/submenu |
| T02-010 | KPI | "Total de segmentos" 48 | dado | OK | `Seg:52,87` | `count(talkx_segments)` (RLS: agente só vê os próprios) | — |
| T02-011 | KPI | mini-barras do Total | dado | OK | `Seg:56`; `Shared:161` | `talkx_segments.created_at` (8 dias) | — |
| T02-012 | KPI | "Ativos este mês" 36 | dado | FALSO | `Seg:53,88` | hoje = `status='active'` (não "este mês"); correto: `last_used_at ≥ now()-30d` ou campanhas do mês por `segment_id` | front: trocar a fórmula; banco: `last_used_at` só no lançamento (ver T02-034) |
| T02-013 | KPI | mini-barras + "+20%" (Ativos) | dado | AUSENTE | grep `delta` em `Seg` → 0 | SEM FONTE (sem série mensal); derivável de `talkx_campaigns(segment_id, started_at)` — 0 linhas | banco: RPC/visão de uso por mês; front: delta |
| T02-014 | KPI | "CRM 360° conectados" 12 | dado | PARCIAL | `Seg:54,89` | `talkx_segments.origin='crm360'` | front/banco: nenhum fluxo grava `origin` (`hook:224` não envia → default `zapp`) → sempre 0 |
| T02-015 | KPI | mini-barras + "+33%" (CRM 360°) | dado | AUSENTE | grep `delta` em `Seg` → 0 | SEM FONTE | idem T02-013 |
| T02-016 | KPI | "Conversão média" 7,8% | dado | AUSENTE | `Seg:55,90` mostra outro KPI: "Contatos cobertos" (soma de `estimated_count`, conta contato repetido entre segmentos) | `talkx_conversions` ⨝ `talkx_campaigns.segment_id` (0 linhas); `talkx_campaign_metrics` não tem coluna de conversão | banco: RPC de conversão por segmento; front: KPI + estado "sem dados" |
| T02-017 | KPI | mini-barras + "+2,1 p.p." (Conversão) | dado | AUSENTE | idem | SEM FONTE hoje | idem |
| T02-018 | Filtros | "Buscar segmentos..." | ação | OK | `Seg:45,95` | nome/descrição (cliente) | — |
| T02-019 | Filtros | "Todas as origens ▾" | ação | PARCIAL | `Seg:97`; `Shared:895-900` | `talkx_segments.origin` | front: com valor `all` o trigger exibe "Todos" (item fixo), não o rótulo do mock; opções ZAPP/CRM 360°/Personalizado ≠ mock (ZAPP/CRM 360°/Segmentado) |
| T02-020 | Filtros | "Todas as tags ▾" | ação | AUSENTE | grep `tags` em `Seg` → 0 | SEM FONTE (`talkx_segments` sem `tags` — catálogo) | banco: `tags text[]` + GIN; front: filtro + editor |
| T02-021 | Filtros | "Todos os status ▾" | ação | OK | `Seg:98` | `talkx_segments.status` | (mesma ressalva de rótulo "Todos") |
| T02-022 | Filtros | "Todos os proprietários ▾" | ação | AUSENTE | grep `creator` em `Seg` → 0 | `talkx_segments.created_by` → `profiles.name` (join já vem em `hook:210`) | front: filtro |
| T02-023 | Filtros | "Limpar filtros" | ação | OK | `Seg:102-103` | — | (só aparece com filtro ativo; no mock é fixo) |
| T02-024 | Filtros | alternador lista (ativo) / grade | ação | AUSENTE | grep `onView` em `Seg` → 0 (suporte existe em `Shared:871,913`) | — | front: passar `view/onView` + card de grade de segmento |
| T02-025 | Tabela | checkbox do cabeçalho (selecionar todos) | ação | AUSENTE | grep `Checkbox\|selectedIds\|bulk` em `Seg` → 0 | — | front: seleção + barra de ações em massa |
| T02-026 | Tabela | checkbox por linha | ação | AUSENTE | idem | — | idem |
| T02-027 | Tabela | tile de ícone colorido por segmento (coroa, fogo, relógio, carrinho, gráfico, etiqueta, presente, folha) | visual | AUSENTE | grep `icon\|color` em `hook` → 0 | SEM FONTE (sem colunas) | banco: `icon`, `color`; front: seletor no builder |
| T02-028 | Tabela | coluna "Segmento": nome + descrição ("Clientes VIP" / "Altíssimo valor e recorrência") | dado | OK | `Seg:122-123` | `talkx_segments.name/description` | — |
| T02-029 | Tabela | coluna "Origem": badge com ícone "CRM 360°" | dado | PARCIAL | `Seg:125` | `talkx_segments.origin` | front: ícone; origin nunca é gravado (T02-014) |
| T02-030 | Tabela | badge com ícone "ZAPP" | dado | PARCIAL | `Seg:125` | idem | front: ícone |
| T02-031 | Tabela | badge roxo "Segmentado" | dado | AUSENTE | `Seg:125` rotula `custom` como "Personalizado" | CHECK `origin in (zapp, crm360, custom)` (mig `20260908120000`) | produto: definir o que é "Segmentado"; front: rótulo |
| T02-032 | Tabela | coluna "Principais critérios (regras)": chips campo+operador+valor ("RFM: Alto", "Ticket médio > R$ 1.000", "Última compra ≤ 180 dias") | dado | PARCIAL | `Seg:115,128-133` | `talkx_segments.rules` | front: chip mostra só o rótulo do campo (máx. 3 + "+N"); falta operador e valor legível; cabeçalho hoje "Critérios" |
| T02-033 | Tabela | "Público estimado": "1.248 contatos" | dado | PARCIAL | `Seg:136`; `hook:222,237` | `talkx_segments.estimated_count` (gravado no save) | front: `refreshEstimates` (`hook:255`) nunca é chamado → valor envelhece; contagem ignora contato visível e supressão (ver T03-081) |
| T02-034 | Tabela | "Último uso": "15 set. 2024" | dado | PARCIAL | `Seg:137`; `Editor:559` | `talkx_segments.last_used_at` | front: formato relativo (`fmtAgo`); gravado a cada save/autosave de rascunho, não no lançamento |
| T02-035 | Tabela | "por Ana Silva" (quem usou) | dado | AUSENTE | grep `creator` em `Seg` → 0 | derivável: última `talkx_campaigns` com `segment_id` → `created_by` → `profiles.name`; não existe `last_used_by` | banco: coluna ou visão; front: linha |
| T02-036 | Tabela | "Desempenho (última campanha)": "12,6%" + barra | dado | AUSENTE | `Seg:115,138` mostra "Público relativo" (`estimated_count/max`), que não está no mock | `talkx_campaign_metrics(segment_id, reply_rate_pct, delivery_rate_pct)` da última campanha — 0 campanhas; métrica do mock não definida (resposta? conversão?) | banco: visão "última campanha por segmento"; front: coluna + estado vazio; teste de contrato a ajustar (ver Riscos) |
| T02-037 | Tabela | delta "+2,4 p.p." / "−0,7 p.p." (verde/vermelho) | dado | AUSENTE | idem | 2 últimas campanhas do segmento ou `talkx_benchmarks` | banco + front |
| T02-038 | Tabela | "Ações" ⋮ | ação | PARCIAL | `Seg:141-153` | — | front: hoje Ver detalhes/Usar em campanha/Editar/Favoritar/Excluir; faltam Duplicar e Ativar/Inativar (conteúdo do menu não aparece no mock) |
| T02-039 | Tabela | linha selecionada com contorno azul | estado | OK | `Seg:119` | — | — |
| T02-040 | Paginação | "Mostrando 1 a 8 de 48 segmentos" | dado | OK | `Seg:162`; `Shared:393` | lista filtrada (cliente) | — |
| T02-041 | Paginação | ‹ 1 2 3 4 5 › | nav | OK | `Shared:395-402` | — | — |
| T02-042 | Paginação | "10 por página ▾" | ação | PARCIAL | `Seg:32,162` (`onPageSize={() => {}}`, `pageSize` fixo em 8) | — | front: seletor aparece e não faz nada |
| T02-043 | Painel | título "Detalhes do segmento" | visual | PARCIAL | `Seg:198` (título do card = nome do segmento) | — | front: cabeçalho fixo |
| T02-044 | Painel | ✕ fechar | ação | OK | `Seg:199` | — | sem Esc / retorno de foco |
| T02-045 | Painel | tile do ícone do segmento (coroa) | visual | AUSENTE | `Seg:198` ícone fixo `Bookmark` | SEM FONTE | idem T02-027 |
| T02-046 | Painel | "Clientes VIP" | dado | OK | `Seg:198` | `name` | — |
| T02-047 | Painel | badge "● Ativo" | dado | OK | `Seg:202` | `status` | — |
| T02-048 | Painel | subtítulo "Altíssimo valor e recorrência" | dado | FALSO | `Seg:198` (`s.description \|\| 'Altíssimo valor e recorrência'`) | texto fixo quando `description` é nula | front: remover fallback |
| T02-049 | Painel | parágrafo "Clientes estratégicos com maior valor de vida, engajamento e recorrência de compra." | dado | AUSENTE | `Seg:195-226` só usa `description` uma vez | um único campo `description` (mock tem subtítulo + descrição longa) | banco: 2º campo, ou usar `description` aqui e tirar o subtítulo |
| T02-050 | Painel | "Principais critérios" + chips (RFM: Alto · Ticket médio > R$ 1.000 · Última compra ≤ 180 dias · Status: Ativo) | dado | AUSENTE | `Seg:195-226` não renderiza `rules` | `talkx_segments.rules` | front: chips completos |
| T02-051 | Painel | botão "✎ Editar" (na seção de critérios) | ação | AUSENTE | idem (existe só T02-064) | — | front |
| T02-052 | Painel | "Origem e sincronização" + tile "CRM 360°" | dado | PARCIAL | `Seg:206` (linha de texto "Origem") | `origin` | front: bloco |
| T02-053 | Painel | ícone ↻ ao lado de "CRM 360°" | ação | AUSENTE | grep `sync` em `Seg` → 0 | SEM FONTE | definir ação (re-sincronizar?) |
| T02-054 | Painel | "● Conectado" | dado | AUSENTE | idem | possível: flag `crm.integration` (`useCRMIntegrationEnabled.ts`) + saúde do `external-db-proxy` | front + edge (health) |
| T02-055 | Painel | "Sincronizado em tempo real" | dado | AUSENTE | idem | SEM FONTE (sem `synced_at`; `crm_contact_links` com 0 linhas) | banco: carimbo de sincronização |
| T02-056 | Painel | "Composição do público" "1.248 contatos" | dado | PARCIAL | `Seg:196,205` ("Público estimado", ao vivo) | `count(contacts)` pelas regras | front: bloco de composição |
| T02-057 | Painel | "Homens" 56% + barra | dado | AUSENTE | grep `Homens\|sexo\|gender` em `src/components/talkx` → 0 | SEM FONTE local (contacts sem gênero); externo `contacts.sexo` exige `crm_contact_links` (0 linhas) | decisão de produto (V3 Apêndice B: não implementar) |
| T02-058 | Painel | "Mulheres" 42% + barra | dado | AUSENTE | idem | idem | idem |
| T02-059 | Painel | "Empresas" 2% + barra | dado | AUSENTE | idem | `contacts.company` (1 contato preenchido) | front; dado praticamente vazio |
| T02-060 | Painel | "Principais tags": VIP · Alta recorrência · Alto valor · Fidelizados · NPS alto | dado | AUSENTE | grep `rpc(` em `Seg`/`hook` → 0 | RPC `talkx_segment_tags` existe (mig `20260916130000:217`) mas conta destinatários já enviados, não o público; `contacts.tags` em 3 contatos | banco: corrigir RPC para o público; front: chamar |
| T02-061 | Painel | "Ver todas" | nav | AUSENTE | idem | — | front |
| T02-062 | Painel | "+" (adicionar tag) | ação | AUSENTE | idem | SEM FONTE (`talkx_segments.tags` não existe) | banco + front |
| T02-063 | Painel | "Usar em campanha" | ação | OK | `Seg:221` → `View:297` → `Editor:195-196` | — | — |
| T02-064 | Painel | "Editar segmento" | ação | OK | `Seg:222` | — | — |
| T02-065 | Painel | card "Sugestão da IA" | dado | FALSO | `Seg:175-178` | texto fixo, sem IA nem dado; aparece mesmo sem segmento selecionado | front: remover ou ligar a heurística real |
| T02-066 | Painel | badge "Oportunidade" | visual | AUSENTE | grep `Oportunidade` em `Seg` → 0 | — | front |
| T02-067 | Painel | "Este segmento tem 32% de contatos inativos há mais de 180 dias. Considere criar um segmento de reativação ou dividir em "VIP Ativos" e "VIP Inativos"…" | dado | AUSENTE | idem | heurística possível: % do público sem mensagem há 180 d (`messages.created_at`); `contacts.updated_at` não é interação; `talkx_settings.ai_insights=false` | banco: RPC; front |
| T02-068 | Painel | chevron › da sugestão (abrir/aplicar: criar os dois segmentos) | ação | AUSENTE | idem | — | front |

### Comportamentos implícitos
- **Erro de carregamento:** `isError/error/refetch` são desestruturados (`Seg:27`) e nunca usados → falha de rede aparece como "Nenhum segmento salvo". `TalkXErrorState` existe (`Shared:449`) e não é usado aqui.
- **Loading / vazio:** OK — skeleton de KPIs e linhas (`Seg:83-84,108`), vazio e "nenhum encontrado" (`Seg:109-110`).
- **Permissão:** RLS de `talkx_segments` = dono ou admin/supervisor (mig `20260928370000`). A UI não esconde nada: agente vê só os próprios (o "Total" muda por usuário) e o filtro "proprietários" só faz sentido para admin/supervisor.
- **Painel desatualizado:** `selected` guarda o objeto (`Seg:33,169`); após favoritar/editar, o rail mostra o estado antigo até novo clique.
- **Exclusão:** confirmação OK (`Seg:181-190`); não verifica se o segmento está em campanha agendada (FK `segment_id ON DELETE SET NULL`).
- **Ativar/Inativar:** não existe ação que mude `status` (grep `Inativar|Ativar` → 0); só o filtro lê a coluna.
- **Teclado:** linha é `<tr onClick>` sem `tabIndex`/Enter (`Seg:119`); rail sem Esc.
- **Realtime:** nenhum; lista só atualiza por `invalidateQueries` local (`hook:218`).
- **Responsivo:** rail desce abaixo da tabela em <xl (`Seg:81`); tabela com `min-w-[820px]` e rolagem horizontal.
- **Elementos do código que não estão no mock:** botão "Novo segmento" na barra (`Seg:104`), coluna ⭐ (`Seg:115,120`), "Público relativo", KPI "Contatos cobertos", linhas "Último uso/Criado em" e "Amostra de contatos" no rail (`Seg:207-219`).
- **Consumo pelo wizard:** lista todos os segmentos, inclusive inativos (`Wizard:259-263`); o público é resolvido no cliente no momento do save (`Editor:556-559`) e vira snapshot em `talkx_recipients` — as edges não leem segmento (grep `segment` em `talkx-send`/`talkx-scheduler` → 0).

### Etapas do V3 que cobrem esta tela
- **V08** (já na main): renomeou "Desempenho" → "Público relativo" e neutralizou o texto da sugestão. O plano dizia "Sugestão de IA sai"; o card continua em `Seg:175-178`.
- **V45**: deep link de aba. Não cobre os chevrons de "Templates ▾"/"Analytics ▾".
- **V47**: FilterBarV2 e ⌘K. Não cobre abrir o segmento a partir do ⌘K.
- **V55**: tags, filtro por tag/proprietário, toggle de status, favorito otimista. Trata tags como rótulo do segmento.
- **V59**: painel de detalhes. Trata "Principais tags" como tags dos contatos via RPC — conceito diferente do V55 para o mesmo bloco do mock. Substitui "Homens/Mulheres" por status/empresas (diverge do mock, de propósito). Não cobre subtítulo × descrição longa, "● Conectado", ícone ↻, badge "Oportunidade" nem a ação do chevron.
- **V60**: KPIs honestos, Desempenho, ⋮ com Duplicar/Ativar, `onPageSize`, "Último uso com criador". Não cobre os deltas/mini-barras dos KPIs nem o delta em p.p. da coluna; "com criador" é o criador do segmento, o mock mostra quem usou por último.
- **V69** (benchmarks) e **V88/V89** (origem `crm360` real).
- **Sem etapa:** checkbox/ações em massa na tabela de segmentos (V42 é só Visão geral); alternador lista/grade de segmentos (V44 é só Visão geral); ícone/cor por segmento; origem "Segmentado".

### Riscos e dependências
- 0 campanhas / 0 destinatários / 0 conversões em produção: Desempenho, Conversão média, "por <usuário>" e todos os deltas nascem vazios — precisam de estado "sem dados" definido.
- `scripts/db-audit/talkx-analytics-contract.test.mjs:51-53` **exige** `<Th>Público relativo</Th>` em `Seg`; trocar pela coluna real quebra o teste se ele não for atualizado junto.
- `talkx_segments` sem `tags`, `icon`, `color`, `last_used_by` → migrations novas (arquivo → PR → merge → apply; reservar versão).
- `talkx_segment_tags` com semântica errada e `contacts.tags` em 3 contatos → bloco "Principais tags" vazio na prática.
- CRM 360: `crm_contact_links` com 0 linhas; nada grava `origin='crm360'`.
- Mudanças em `Shared` (FilterBarV2 "Todos", opções `[8,10,20,50]` da paginação) afetam as outras telas e sessões paralelas.

---

## Tela 03 — Segmentos · criar e editar (construtor)

### Componente(s) atuais
- Não existe `TalkXSegmentBuilder.tsx`. O construtor é a função interna `SegmentBuilder` em `Seg:232-381`, renderizada no lugar da biblioteca quando `mode==='edit'` (`Seg:76-78`), dentro da aba "Segmentos" e sob o cabeçalho "Campanhas" (`View:239-242`).
- `RuleRow` em `Seg:383-410`.
- Modelo e compilador de regras: `hook:14-82` (campos/operadores), `hook:94-158` (`ruleToFilter`/`rulesToPostgrest`/`applyRules` — é o "buildFilter" de hoje), `hook:161-196` (contagem, resolução, estimativa).
- Testes: `src/hooks/integrations/__tests__/useTalkXSegments.test.ts` (5 casos, só `rulesToPostgrest`); E2E só confere que a aba abre (`e2e/talkx.spec.ts:83-95`).

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T03-001 | Topo | breadcrumb "Talk X > Campanhas > Segmentos" | nav | AUSENTE | grep -i `breadcrumb` em `src/components/talkx` → só `Wizard:102` e `TalkXCampaignScheduled.tsx:165` | — | front |
| T03-002 | Cabeçalho | tile WhatsApp + "Segmentos" + "Crie, gerencie e utilize segmentos inteligentes para suas campanhas no Talk X." | visual | AUSENTE | builder fica sob o header "Campanhas" (`View:239-242`; `Seg:76-78`) | — | front: cabeçalho próprio da tela |
| T03-003 | Cabeçalho | "▶ Como criar segmentos?" | ação | AUSENTE | grep `Como criar` → 0 | SEM FONTE (sem vídeo/artigo) | front + conteúdo |
| T03-004 | Cabeçalho | seletor "Talk X · Iniciativa da IA ▾" | ação | AUSENTE | grep `Iniciativa` → 0 | SEM FONTE; função não definida no mock | decisão de produto |
| T03-005 | Cabeçalho | botão ↻ (atualizar) | ação | AUSENTE | `refetch` desestruturado e não usado (`Seg:27`) | — | front |
| T03-006 | Cabeçalho | card "● Em andamento · Talk X · Iniciada às 14:28 ▾" | dado | AUSENTE | grep `Em andamento` em `Seg` → 0 | `talkx_campaigns` `status='sending'`, `started_at` (0 linhas) | front |
| T03-007 | Abas superiores | "Segmentos" (ativa) | nav | PARCIAL | `View:268` (aba do módulo, outra barra) | — | front: barra própria |
| T03-008 | Abas superiores | "Regras Avançadas" | nav | AUSENTE | grep `Regras [Aa]vançadas` → 0 | — | conteúdo não desenhado |
| T03-009 | Abas superiores | "Audiências" | nav | AUSENTE | grep `Audiências` → 0 | — | conteúdo não desenhado |
| T03-010 | Abas superiores | "Modelos" | nav | AUSENTE | grep `Modelos` → 0 | SEM FONTE (sem tabela de modelos de segmento) | banco + front |
| T03-011 | Abas superiores | "Insights com IA" | nav | AUSENTE | grep `Insights` em `Seg` → 0 | — | conteúdo não desenhado |
| T03-012 | Meus segmentos | coluna "Meus Segmentos" ao lado do construtor | nav | AUSENTE | modo `edit` substitui a lista (`Seg:76-78`); a coluna esquerda do builder é o catálogo (`Seg:330`) | `talkx_segments` | front: layout de 3 colunas |
| T03-013 | Meus segmentos | "+ Novo Segmento" | ação | PARCIAL | `Seg:104` (só no modo lista) | — | front |
| T03-014 | Meus segmentos | "Buscar segmentos..." | ação | PARCIAL | `Seg:95` (só no modo lista) | — | front |
| T03-015 | Meus segmentos | botão de filtro (funil) | ação | AUSENTE | sem equivalente no builder | — | front |
| T03-016 | Meus segmentos | aba "Todos 12" (com contador) | nav | AUSENTE | grep `Meus\|Favoritos` em `Seg` → 0 | `count(talkx_segments)` | front |
| T03-017 | Meus segmentos | aba "Meus 8" | nav | AUSENTE | idem | `created_by = profiles.id` do usuário | front |
| T03-018 | Meus segmentos | aba "Favoritos 3" | nav | AUSENTE | idem (só ordenação por favorito em `hook:211`) | `is_favorite` | front |
| T03-019 | Card da lista | tile de ícone colorido | visual | AUSENTE | idem T02-027 | SEM FONTE | banco + front |
| T03-020 | Card da lista | nome + descrição em 2 linhas ("VIP" / "Clientes de alto valor com últimos 90 dias") | dado | PARCIAL | `Seg:122-123` (linha de tabela, modo lista) | `name`, `description` | front: card |
| T03-021 | Card da lista | "12.840 contatos" | dado | PARCIAL | `Seg:136` | `estimated_count` | front: card |
| T03-022 | Card da lista | badge "Ativo" / "Inativo" | dado | AUSENTE | status não aparece na lista (só no rail `Seg:202` e no filtro `Seg:98`) | `status` | front: badge + ação de mudar status |
| T03-023 | Card da lista | estrela de favorito (cheia/vazia) | ação | OK | `Seg:74,120` | `is_favorite` | — |
| T03-024 | Card da lista | ⋮ | ação | PARCIAL | `Seg:141-153` | — | idem T02-038 |
| T03-025 | Card da lista | glifo diferente do ⋮ nos cards "Recompra" e "Leads Quentes" | visual | AUSENTE | **ilegível no mock** (mesmo com zoom 2×) | — | confirmar com o design |
| T03-026 | Card da lista | card selecionado (contorno azul) carrega no construtor | estado | PARCIAL | `Seg:60` (abre por menu/rail; sem troca lateral) | — | front |
| T03-027 | Cabeçalho do construtor | ← voltar | nav | PARCIAL | `Seg:275` (X "Cancelar") | — | front: descarta sem confirmar alterações |
| T03-028 | Cabeçalho do construtor | "Novo Segmento ✎" (nome editável) | ação | OK | `Seg:278` | `name` | — |
| T03-029 | Cabeçalho do construtor | "Adicione uma descrição para este segmento..." | ação | OK | `Seg:279` | `description` | — |
| T03-030 | Cabeçalho do construtor | "Rascunho salvo há 2 min" | estado | AUSENTE | grep `Rascunho\|autosave\|draft` em `Seg`/`hook` → 0 | SEM FONTE (CHECK `status in (active, inactive)`; sem rascunho) | banco: estado de rascunho/versões; front: autosave |
| T03-031 | Cabeçalho do construtor | "Salvar" (sem publicar) | ação | PARCIAL | `Seg:283` | — | um único botão: "Publicar segmento" (novo) ou "Salvar" (edição); sem distinção rascunho × publicado |
| T03-032 | Cabeçalho do construtor | "Publicar Segmento" | ação | PARCIAL | `Seg:62-72,283`; `hook:142,220-231` | `talkx_segments` insert | front: `save()` sem `catch` — regra incompleta faz `countAudience` lançar antes da mutation → nada acontece e não há toast; "desabilitado" só por classe CSS |
| T03-033 | Cabeçalho do construtor | ⋮ | ação | AUSENTE | sem menu no cabeçalho (`Seg:274-285`) | — | front |
| T03-034 | Sub-abas | "Construtor" (ativa) | nav | PARCIAL | `Seg:288` (visão única, sem aba) | — | front |
| T03-035 | Sub-abas | "Prévia e Contatos" | nav | AUSENTE | grep `Prévia\|range(` → 0 | `contacts` via `rulesToPostgrest`; hoje `resolveAudience` usa `.limit(5000)` sem paginação (`hook:173-178`) | front: tabela paginada |
| T03-036 | Sub-abas | "Sobreposição" | nav | AUSENTE | grep `overlap\|Sobreposi` → 0 | SEM FONTE (sem RPC) | banco: RPC de interseção; front |
| T03-037 | Sub-abas | "Insights com IA" | nav | AUSENTE | grep `Insights` em `Seg` → 0 | SEM FONTE | — |
| T03-038 | Regras | "Regras do Segmento" + "Defina os filtros e condições para o seu segmento" | visual | OK | `Seg:290` | — | — |
| T03-039 | Regras | ↶ desfazer | ação | AUSENTE | grep `undo\|redo\|Desfazer\|Refazer` → 0 | — | front: histórico |
| T03-040 | Regras | ↷ refazer | ação | AUSENTE | idem | — | idem |
| T03-041 | Regras | "Limpar tudo" | ação | OK | `Seg:292` | — | (sem confirmação nem desfazer) |
| T03-042 | Grupo | badge "E" (azul) do grupo AND | estado | FALSO | `Seg:305` (`['E','O','G'][índice]`) | letra vem da posição, não de `match` | front: derivar de `g.match` |
| T03-043 | Grupo | badge "OU" (roxo) do grupo OR | estado | FALSO | `Seg:305` | 2º grupo mostra "O" mesmo sendo AND; 3º mostra "G" | idem |
| T03-044 | Grupo | "Grupo 1" / "Grupo 2" | visual | OK | `Seg:306` | — | — |
| T03-045 | Grupo | "Todas as condições devem ser atendidas (AND)" | estado | OK | `Seg:306` | `rules.groups[].match` | — |
| T03-046 | Grupo | "Pelo menos uma condição deve ser atendida (OR)" | estado | OK | `Seg:306` | idem | — |
| T03-047 | Grupo | "⋯" menu do grupo | ação | PARCIAL | `Seg:307-311` (select AND/OR + X remover, só com >1 grupo) | — | front: menu (duplicar etc.) |
| T03-048 | Grupo | conector em árvore (linha vertical + nós) | visual | AUSENTE | `Seg:313-317` lista simples | — | front |
| T03-049 | Condição | ícone por tipo de campo | visual | AUSENTE | `Seg:388-408` sem ícone | — | front |
| T03-050 | Condição | select de campo ("Origem ▾") | ação | OK | `Seg:389-392` | `RULE_FIELDS` (`hook:43-64`) | — |
| T03-051 | Condição | select de operador ("é igual a", "nos últimos", "maior que", "maior ou igual a") | ação | OK | `Seg:393-396`; `hook:66-79` | `RULE_OPS` | — |
| T03-052 | Condição | valor como chip com ícone + ✕ ("WhatsApp", "Clientes") | ação | PARCIAL | `Seg:398-402` | opções do campo | front: select mostra o valor cru do banco (`prestador_servico`, `open`, `granted`), sem rótulo/ícone; `channel_type` é texto livre |
| T03-053 | Condição | valor de período "📅 90 dias" | ação | PARCIAL | `Seg:404` (input texto "30 (dias)") | — | front: widget de período |
| T03-054 | Condição | valor monetário "R$ 200,00" | ação | AUSENTE | `Seg:404` sem máscara; nenhum campo monetário em `hook:43-64` | — | front + campo (ver matriz) |
| T03-055 | Condição | vários valores em chips ("Campeões", "Em Potencial") | ação | AUSENTE | `hook:22` (`value: string`), `hook:18-20` (sem `in/not_in`) | — | front + compilador: multi-valor |
| T03-056 | Condição | valor numérico "80" | ação | OK | `Seg:404`; `hook:117-120` | — | — |
| T03-057 | Condição | ✕ por condição (ao lado da lixeira) | ação | AUSENTE | `Seg:407` tem um único controle | — | papel do ✕ × lixeira não definido no mock |
| T03-058 | Condição | 🗑 remover condição | ação | OK | `Seg:407` (ícone X) | — | — |
| T03-059 | Grupo | "+ Adicionar condição" | ação | OK | `Seg:316` | — | nasce inválida (ver Comportamentos) |
| T03-060 | Regras | divisor "OU" entre grupos | visual | AUSENTE | sem divisor em `Seg:296-319`; a semântica existe (`hook:149-157`) | — | front |
| T03-061 | Regras | "+ Adicionar grupo (AND)" | ação | OK | `Seg:322` | — | — |
| T03-062 | Regras | "Adicionar grupo (OR)" | ação | OK | `Seg:323` | — | — |
| T03-063 | Catálogo | "Filtros Disponíveis" + "Clique ou arraste os filtros para o construtor" | visual | PARCIAL | `Seg:330-332` | — | front: hoje é coluna esquerda `hidden xl:block` (some abaixo de 1280 px), título "Filtros" |
| T03-064 | Catálogo | "Buscar filtros..." | ação | AUSENTE | sem input em `Seg:330-353` | — | front |
| T03-065 | Catálogo | aba "Básicos 6" | nav | PARCIAL | `Seg:333-335` (título de grupo, sem aba nem contador) | 6 campos hoje, mas outros (ver matriz) | front |
| T03-066 | Catálogo | aba "Comportamento 4" | nav | PARCIAL | idem | 5 campos hoje | front |
| T03-067 | Catálogo | aba "Comercial 4" | nav | PARCIAL | idem | 2 campos hoje | front + campos |
| T03-068 | Catálogo | aba "CRM 360 3" | nav | AUSENTE | categoria não existe (`hook:43`; `Seg:333`) | ver matriz | banco + front |
| T03-069 | Catálogo | aba "LGPD 2" | nav | PARCIAL | idem | 1 campo hoje | front + campo |
| T03-070 | Catálogo | card "Origem — Canal de origem do contato" | ação | PARCIAL | `hook:47` ("Canal de origem") | `contacts.channel_type` | front: sem ícone/descrição; texto livre em vez de lista |
| T03-071 | Catálogo | card "Funil — Etapa no funil de vendas" | ação | AUSENTE | não está em `hook:43-64` | ver matriz | banco + front |
| T03-072 | Catálogo | card "Vendedor responsável — Responsável pela carteira" | ação | AUSENTE | idem | `contacts.assigned_to` (2.787 preenchidos) | front: campo + lista de `profiles` |
| T03-073 | Catálogo | card "Estado — UF do contato" | ação | AUSENTE | idem | `contacts.state` (0 preenchidos) | front: campo; dado vazio |
| T03-074 | Catálogo | card "Cidade — Cidade do contato" | ação | AUSENTE | idem | `contacts.city` (0 preenchidos) | front: campo; dado vazio |
| T03-075 | Catálogo | 6º card de "Básicos" (cortado pela seta) | ação | AUSENTE | **ilegível no mock** | — | confirmar com o design |
| T03-076 | Catálogo | seta → (rolar) | nav | AUSENTE | lista vertical em `Seg:336-350` | — | front |
| T03-077 | Catálogo | arrastar filtro para o grupo | ação | OK | `Seg:300-302,341-343` (drag HTML5) | — | sem teclado/touch |
| T03-078 | Catálogo | clicar no filtro adiciona ao grupo ativo | ação | OK | `Seg:261-266,344` | — | — |
| T03-079 | Resumo | "Resumo do Segmento" | visual | OK | `Seg:357` | — | — |
| T03-080 | Resumo | "● Estimativa em tempo real" | estado | PARCIAL | `Seg:357`; `hook:185-196` ("Ao vivo"/"Calculando…") | — | front: 2 consultas a cada alteração, sem debounce |
| T03-081 | Resumo | "Audiência Estimada" "8.432 contatos" | dado | PARCIAL | `Seg:358-360`; `hook:161-168` | `count(contacts)` com `phone not null` + regras | front/banco: ignora `deleted_at`, `is_lid_legacy` e telefone válido (3.106 × 2.504 visíveis) e a supressão; regra incompleta → erro → mostra 0 |
| T03-082 | Resumo | mini-barras da audiência | dado | AUSENTE | sem `bars` em `Seg:357-377` | SEM FONTE (sem histórico de contagem) | — |
| T03-083 | Resumo | "+12% vs. segmento anterior" | dado | AUSENTE | idem | derivável só em edição: ao vivo × `estimated_count` salvo; "segmento anterior" indefinido | front |
| T03-084 | Resumo | "22% da base total" | dado | AUSENTE | idem | audiência ÷ contatos visíveis | front |
| T03-085 | Resumo | "Média de 8.1k a 8.9k contatos" | dado | AUSENTE | idem | SEM FONTE | (V3 Apêndice B: não implementar) |
| T03-086 | Resumo | "Risco de Entrega" + "● Baixo" | dado | FALSO | `Seg:238,362-363` | nível só pelo tamanho (0 → Alto; >10.000 → Baixo; resto → Moderado); com 3.106 contatos "Baixo" é inalcançável | banco: RPC de risco; front |
| T03-087 | Resumo | "Excelente potencial de entrega para campanhas no WhatsApp." | dado | FALSO | `Seg:364` | idem | idem |
| T03-088 | Resumo | barra gradiente com marcador | visual | AUSENTE | sem barra em `Seg:361-365` | — | front |
| T03-089 | Resumo | ☑ "Base qualificada" | dado | AUSENTE | grep `qualificada\|bloqueio\|engajamento` em `Seg` → 0 | critério não definido | produto + banco |
| T03-090 | Resumo | ☑ "Baixo risco de bloqueio" | dado | AUSENTE | idem | `talkx_blacklist` (RLS só admin/supervisor → precisa de RPC) | banco: RPC |
| T03-091 | Resumo | ☑ "Boa taxa de engajamento prevista" | dado | AUSENTE | idem | `talkx_recipients.replied_at` histórico (0 linhas) | banco: RPC; sem dado hoje |
| T03-092 | Resumo | "Sobreposição 12% com outros segmentos" + ícone Venn | dado | AUSENTE | grep `overlap\|Sobreposi` → 0 | SEM FONTE (sem RPC) | banco + front |
| T03-093 | Resumo | "Última atualização Hoje, 16:12 em tempo real" | dado | AUSENTE | sem carimbo em `Seg:357-377` | `dataUpdatedAt` da query | front |
| T03-094 | Amostra | "Amostra de Contatos (5)" | dado | OK | `Seg:366-375`; `hook:173-183` | `contacts` (5 primeiros por nome, não aleatório) | — |
| T03-095 | Amostra | foto do contato | dado | PARCIAL | `Seg:371` (só iniciais) | `contacts.avatar_url` já vem em `hook:175` | front: usar a foto |
| T03-096 | Amostra | nome ("Mariana Souza") | dado | OK | `Seg:372` | `contacts.name` | — |
| T03-097 | Amostra | "Cliente • VIP" (tipo • tag) | dado | AUSENTE | `Seg:372` mostra telefone nessa linha | `contacts.contact_type` (fora do select em `hook:175`), `tags` | front |
| T03-098 | Amostra | telefone formatado "(11) 91234-5678" | dado | PARCIAL | `Seg:372` (cru) | `contacts.phone` | front: máscara |
| T03-099 | Amostra | ícone WhatsApp por contato | ação | AUSENTE | sem ícone em `Seg:369-374` | — | front (abrir conversa?) |
| T03-100 | Amostra | "Ver todos ▾" | nav | AUSENTE | idem | — | front → Prévia (T03-035) |
| T03-101 | Sugestão | card "Sugestão da IA": "Adicione o filtro "Status do contato" = Ativo para reduzir 18% de contatos inativos e melhorar a entrega." | dado | AUSENTE | grep `Sugest` em `Seg` → só `:177` (modo lista) | SEM FONTE (`contacts` não tem coluna de status do contato; `ai_insights=false`) | banco + front |
| T03-102 | Sugestão | "Aplicar sugestão" | ação | AUSENTE | idem | — | front |

### Comportamentos implícitos
- **Condição incompleta quebra tudo (bug P2-3 continua vivo):** toda condição nova nasce inválida — `newRule()` = `tags contém ''` (`hook:82`) e o clique no catálogo cria valor vazio para campos não-enum (`Seg:265`). `rulesToPostgrest` lança (`hook:142`), a estimativa cai para 0 (`Seg:359`), e `save()` não tem `catch` (`Seg:62-72`) → o botão não faz nada e não avisa.
- **Validação:** só nome não-vazio (`Seg:64,283`); sem tamanho mínimo, sem nome duplicado, sem limite de descrição.
- **Sair sem salvar:** sem aviso de alterações pendentes (`Seg:275,282`).
- **Semântica AND/OU:** grupos são sempre unidos por OU (`hook:24,149-157`); "(AND)/(OR)" no botão define o `match` interno do grupo novo. Não há como exigir Grupo 1 **E** Grupo 2, nem excluir outro segmento ("Exclui pós-venda" do mock 02).
- **"Última interação" = `contacts.updated_at`** (`hook:61`): qualquer alteração na linha do contato conta como interação. Não existe coluna de último contato em `contacts` (catálogo).
- **Contagem × envio:** `countAudience`/`resolveAudience` filtram só `phone not null` (`hook:162-163,174-176`); nem o front nem `talkx-send` filtram `deleted_at`/`is_lid_legacy` (grep → 0). Contatos excluídos e legados entram na estimativa e viram destinatários.
- **Limite silencioso:** `resolveAudience` corta em 5.000 (`hook:173`) sem avisar (base atual 3.106).
- **Permissão:** INSERT exige `created_by` = perfil do usuário; o hook envia `profile?.id ?? null` (`hook:224`) — perfil ainda não carregado → erro de RLS.
- **Concorrência:** sem controle de versão; duas abas editando sobrescrevem.
- **Editar segmento usado em campanha agendada:** sem aviso; a campanha mantém o snapshot antigo de destinatários.
- **Responsivo/teclado:** catálogo invisível abaixo de `xl` (`Seg:330`); arrastar só com mouse (clique é a alternativa).

### Etapas do V3 que cobrem esta tela
- **V51** — extrair builder, undo/redo, regra incompleta não lança, `try/catch` no save. Cobre T03-039/040 e o bug acima.
- **V52** — badge por `match`, divisor "OU", colchete, widgets por tipo. Prevê "+ Adicionar grupo" único (o mock tem dois botões); não cobre valor monetário nem o par ✕ + 🗑.
- **V53** — catálogo com contagem/busca/setas, `in/not_in`, campos novos. **Lista `pipeline_stage` e `status` como "campos reais" de `contacts` — nenhum dos dois existe no catálogo.** Mantém o compilador como filtro PostgREST sobre `contacts`, o que não alcança filtros que dependem de outra tabela (compras, negócios, RFM).
- **V54** — debounce, "% da base", delta, risco calculado. As 3 linhas previstas (supressão, sem telefone, enviados <7 d) não são os 3 rótulos do mock; avatar, "tipo • tag", telefone formatado e ícone WhatsApp da amostra ficam de fora.
- **V55** — contador de descrição, favorito otimista.
- **V56** — autosave e versões. Cria sub-aba "Histórico" (não está no mock) e não adiciona estado de rascunho ao CHECK de `status`, que o par "Salvar" × "Publicar" pressupõe.
- **V57** — sobreposição (RPC em SQL com whitelist). Cria um segundo compilador de regras, em SQL, ao lado do de `hook:94-158` — duas implementações da mesma semântica.
- **V58** — Prévia e contatos.
- **V24** — wizard passa a usar o mesmo `RULE_FIELDS`/compilador; cita os mesmos `status` e `pipeline_stage` inexistentes. Estado atual conferido: filtros cidade/grupo/inativo/aniversário continuam mortos (`Editor:367-383` leem `city`, `group`, `last_contact`, `birth_month`, fora do select de `Editor:290-292`).
- **V88/V89** — CRM 360 via Bitrix24 e tabela nova `talkx_crm_links`; filtros "estágio, responsável, valor". Não menciona RFM, Ticket médio, Última compra nem Score CRM 360 do mock, e ignora a tabela `crm_contact_links` e o banco externo de CRM que já existem.
- **Apêndice B** — "Gênero, RFM, +32%, 8.1k: não existe fonte, não implementar". RFM tem fonte externa (`company_rfm_scores`), embora defasada.
- **Sem etapa:** layout com a lista "Meus Segmentos" e abas Todos/Meus/Favoritos; cabeçalho próprio (T03-002 a T03-006); abas superiores "Regras Avançadas", "Audiências", "Modelos", "Insights com IA"; sub-aba "Insights com IA" e "Aplicar sugestão"; critério de contato visível na contagem (decisão D4 é de 01/10, posterior ao plano); resolução da audiência no servidor.

### Riscos e dependências
- **Dado:** dos campos atuais, `lead_score`, `lead_origin`, `company`, `tags`, `consent_status` estão vazios ou uniformes; `city/state` também. O único campo do mock com preenchimento real é `assigned_to` (2.787), que não está no construtor.
- **Arquitetura do compilador:** Funil, Última compra, Ticket médio, RFM e Score dependem de outras tabelas ou do banco externo; o filtro PostgREST sobre `contacts` não resolve. Precisa de decisão antes de V53/V57 (RPC única para contar, listar e cruzar).
- **CRM 360:** banco externo é somente leitura via `external-db-proxy`, não cruza com `contacts` local numa consulta; `crm_contact_links` tem 0 linhas; RFM calculado em abril (99,99% "Hibernating"); 2 clientes com compra.
- **Risco de entrega:** `talkx_blacklist` é admin-only por RLS → RPC; histórico de respostas tem 0 linhas.
- **Rascunho:** incluir `draft` no CHECK de `status` afeta wizard (`Wizard:259`) e Visão geral, que listam todos os segmentos.
- `@hello-pangea/dnd` já está no `package.json:32`.
- Extração do builder e mudanças em `Seg`/`Shared` colidem com qualquer sessão paralela nas telas 02/03.

---

## Anexo — Campos e operadores: construtor hoje × filtros do mock

### A. O que o construtor suporta hoje (`hook:14-79`)

14 campos, todos colunas de `contacts`:

| Categoria (UI) | Campo (`value`) | Rótulo | Tipo | Valor na UI | Preenchimento (contexto) |
|---|---|---|---|---|---|
| Básicos | `tags` | Tags | array | texto livre (1 tag) | 3 contatos |
| Básicos | `company` | Empresa | text | texto | 1 contato |
| Básicos | `email` | E-mail | text | texto | não informado |
| Básicos | `channel_type` | Canal de origem | text | texto livre | não informado |
| Básicos | `lead_origin` | Origem do lead | text | texto | 0 |
| Básicos | `created_at` | Data de cadastro | date | nº de dias | sempre |
| Comercial | `contact_type` | Tipo do contato | enum | cliente, fornecedor, transportadora, colaborador, prestador_servico, parceiro | não informado |
| Comercial | `lead_score` | Lead score | number | número | 0 com valor > 0 |
| Comportamento | `conversation_status` | Status da conversa | enum | `CONVERSATION_STATUSES` (open, pending, waiting, …) | sempre (not null) |
| Comportamento | `risk_score` | Risco de churn | number | número | não informado |
| Comportamento | `ai_priority` | Prioridade (IA) | enum | low, medium, high, urgent | não informado |
| Comportamento | `ai_sentiment` | Sentimento (IA) | enum | positivo, neutro, negativo, critico | não informado |
| Comportamento | `updated_at` | Última interação | date | nº de dias | sempre (não é interação) |
| LGPD | `consent_status` | Consentimento (LGPD) | enum | granted, unknown, revoked | `unknown` em todos |

Operadores por tipo (12 no total):

| Tipo | Operadores |
|---|---|
| text | é igual a · é diferente de · contém · não contém · está preenchido · está vazio |
| enum | é igual a · é diferente de · está vazio |
| array | contém · não contém · está vazio |
| number | é igual a · maior que · maior ou igual a · menor que · menor ou igual a |
| date | nos últimos (dias) · há mais de (dias) |

Não existem: `in`/`not_in` (vários valores), intervalo (entre), data absoluta, booleano, "diferente de" para número, negação de grupo, exclusão por outro segmento.

### B. Filtros do mock × fonte do dado

| Filtro do mock | Onde aparece | No construtor hoje | De onde viria | Tem dado? |
|---|---|---|---|---|
| Origem (= WhatsApp) | 03 regra + catálogo | PARCIAL — `channel_type` como texto livre | `contacts.channel_type` | coluna existe; preenchimento não informado |
| Funil (= Clientes) | 03 regra + catálogo | AUSENTE | não há coluna em `contacts`; candidatos: `sales_deals.stage_id` → `sales_pipeline_stages.name` por `contact_id`, ou `contacts.contact_type` | não informado; exige cruzar tabelas |
| Última compra (nos últimos 90 dias / ≤ 180 dias / > 90 dias) | 03 regra; 02 chips | AUSENTE | local `contact_purchases.purchased_at`; externo `customers.data_ultima_compra` | externo: 2 clientes com compra; local não informado |
| Ticket médio (> R$ 200 / > R$ 1.000) | 03 regra; 02 chips | AUSENTE | externo `customers.ticket_medio`; ou média de `contact_purchases.amount` | quase vazio |
| RFM (Campeões, Em Potencial / "Alto") | 03 regra; 02 chips | AUSENTE | externo `company_rfm_scores` via `crm_contact_links` | 99,99% "Hibernating", de abril; vínculos = 0 linhas |
| Frequência ≥ 3 · Monetário ≥ R$ 500 | 02 chips | AUSENTE | externo `total_pedidos` / `valor_total_compras` (já lidos em `useExternalContact360Batch.ts:17-26`) | quase vazio |
| Score CRM 360 (≥ 80) | 03 regra | AUSENTE | sem coluna definida; candidatos: `rfm_score` externo ou `contacts.lead_score` | `lead_score` > 0 em 0 contatos |
| Vendedor responsável | 03 catálogo | AUSENTE | `contacts.assigned_to` → `profiles.name` (ou externo `customers.vendedor_nome`) | **sim: 2.787 contatos** |
| Estado (UF) | 03 catálogo | AUSENTE | `contacts.state` | 0 |
| Cidade | 03 catálogo | AUSENTE | `contacts.city` | 0 |
| Região: Centro-Oeste | 02 chip | AUSENTE | derivar de `contacts.state` (0) ou do DDD (`getRegionFromPhone.ts`) | só pelo DDD |
| Tags | 02 filtro/painel | OK (`tags`) | `contacts.tags` | 3 contatos |
| Lead score ≥ 80 | 02 chip | OK (`lead_score`) | `contacts.lead_score` | 0 |
| Últimos 7 dias / Últimos 60 dias | 02 chips | PARCIAL (`updated_at`) | correto seria a última mensagem (`messages.created_at`) | `updated_at` existe, semântica errada |
| Status: Ativo / "Status do contato" = Ativo | 02 chips; 03 sugestão | AUSENTE | `contacts` não tem coluna de status do contato; externo `cliente_ativado` | sem fonte local |
| Status: Entregue | 02 chip | AUSENTE | status de pedido; `contact_purchases.status` | não informado |
| Compro há ≤ 30 dias · Não comprou novamente | 02 chips | AUSENTE | `contact_purchases` (data e contagem) | não informado |
| Comprou catálogo 2026 · Categoria: Qualquer | 02 chips | AUSENTE | banco de Catálogo de Produtos (externo, leitura) | SEM FONTE local |
| Interagiu com preços | 02 chip | AUSENTE | sem registro de evento de comportamento | SEM FONTE |
| Exclui pós-venda | 02 chip | AUSENTE | exclusão por outro segmento (operador inexistente) | — |
| Aniversário: Este mês | 02 chip | AUSENTE | `contacts` não tem data de nascimento | SEM FONTE |
| Opt-in: Sim / LGPD | 02 chip; 03 catálogo | OK (`consent_status`) | `contacts.consent_status` | `unknown` em todos → "Sim" retorna 0 |
| Segmento: Agro (ramo) | 02 chip | AUSENTE | externo `company_ramo` | depende de vínculo (0) |
| CNPJ (pessoa jurídica) | 02 chip | AUSENTE | `crm_contact_links.external_company_id` | 0 linhas |
| Comportamento (4) · Comercial (4) · CRM 360 (3) · LGPD (2) | 03 abas do catálogo | — | conteúdo das abas não aparece no mock | — |

Resumo: dos filtros visíveis no mock, o construtor atende hoje Tags, Lead score e Consentimento (os três sem dado útil), e parcialmente Origem e janela de dias. Vendedor responsável é o único filtro ausente que já tem dado real.

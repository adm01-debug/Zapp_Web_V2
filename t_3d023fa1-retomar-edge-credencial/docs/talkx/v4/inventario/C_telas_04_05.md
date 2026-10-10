# Inventário mock × código — Telas 04 e 05 (Templates)

Base: `main` @ `3d09433` (2026-10-01). Somente leitura. Mocks lidos com zoom 2× (recortes em recortes locais (não versionados)).
Abreviações: `TPL` = `src/components/talkx/TalkXTemplates.tsx` · `EDT` = `src/components/talkx/TalkXTemplateEditor.tsx` ·
`HOOK` = `src/hooks/integrations/useTalkXTemplates.ts` · `SH` = `src/components/talkx/talkxShared.tsx` ·
`VIEW` = `src/components/talkx/TalkXView.tsx` · `SEND` = `supabase/functions/talkx-send/index.ts` ·
`GO` = `supabase/functions/_shared/evolution-go-routes.ts` · `MIG-CANON` = `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql`.

## Fatos transversais (valem para as duas telas)

| Tema | Estado real no código | Evidência |
|---|---|---|
| Upload de mídia | **Não existe.** Mídia = campo de texto com URL `https://`. Nenhum `<input type=file>`, dropzone, `storage.from().upload` em `src/components/talkx` nem em `useTalkX*.ts` (grep `storage\.\|\.upload(\|type="file"\|dropzone` → 0 em templates). Bucket `talkx-media` não existe (grep `talkx-media` em `src`+`supabase` → 0). | `EDT:361`, `EDT:85-88` |
| Validação de mídia no banco | trigger `validate_talkx_template_input` e RPC exigem `media_url ~ '^https://'`; `media_type ∈ image/video/document/audio`; variantes e versões têm o mesmo CHECK. Caminho de bucket (`path`) hoje é rejeitado. | `MIG-CANON:414-449`, `:548-552`, `:92-110` |
| Tipos de mídia no envio | `image/video/document` → `/message/sendMedia` → GO `/send/media {url,type,caption}`; `audio` → `/message/sendWhatsAppAudio` → GO `type:'ptt'` **sem caption: o texto do template é descartado** (não há envio de texto separado). `document` vai **sem `fileName`**. | `SEND:96-101`, `SEND:646-659`, `GO:71-85` |
| URL assinada | `resolvePrivateBucketUrl` só assina `whatsapp-media` e `audio-messages` (TTL 300 s); no `action=test` a mídia vai **crua**, sem assinatura. | `supabase/functions/_shared/evolution-api-proxy.ts:287-307`, `SEND:182-191` |
| Botões / enquete / lista | A Evolution GO **sabe enviar** (`/send/button`, `/send/poll`, `/send/list` traduzidos) e as edges `evolution-api` e `message-delivery` usam. **`talkx-send` não chama nenhum** (grep `sendPoll\|sendButtons\|sendList\|poll\|button` em `talkx-send`, `talkx-scheduler`, `_shared/talkx-*` → 0). `talkx_templates` não tem coluna para botões/enquete. | `GO:109-125`, `supabase/functions/evolution-api/index.ts:700-702` |
| Variáveis | Built-in: `nome` (1º nome), `nome_completo`, `apelido`, `empresa`, `saudacao`, `link`. Customizadas: valor real vem de `contact_custom_fields.field_name` (case-insensitive). Sem valor → `[variavel]`. **Fallback `{{nome\|cliente}}` não existe** (regex `[^}]+` trata `nome\|cliente` como chave → sai `[nome\|cliente]`). `empresa` vazia vira string vazia (sem fallback). | `SEND:27-72`, `SEND:341-361`, `SH:79`, `SH:101-141` |
| Versões | Snapshot do estado **anterior** a cada save (qualquer campo), em transação com lock otimista (`expected_updated_at`). Sem limite, sem nota, sem diff, sem autor exibido; variantes não são versionadas. UI lista as 10 últimas e "restaura" só para o formulário. | `MIG-CANON:493-590`, `HOOK:157-165`, `EDT:166-174`, `EDT:522-538` |
| A/B | Até 3 variantes (A/B/C), `weight` 1–100, sem constraint de soma = 100 (só texto de aviso). Sorteio ponderado por destinatário (`Math.random`), `variant_id` gravado no snapshot do destinatário. **O conteúdo-base do template não entra no sorteio**: havendo ≥ 1 variante, 100 % dos destinatários recebem conteúdo de variante e `campaign.message_template` (o que o operador revisou no wizard) é ignorado. Mídia de variante sempre `null` na UI. Relatório: RPC `talkx_campaign_report.by_variant` devolve só `recipients`/`sent` e **não tem consumidor** no front. | `SEND:75-86`, `SEND:500-506`, `SEND:541`, `EDT:514-518`, `supabase/migrations/20260916190000_fix_talkx_benchmarks_and_campaign_report.sql:92-103` |
| Status / aprovação | `draft \| review \| approved` é um **select livre**; default de template novo = `approved`. Não há aprovador, `approved_by/at`, fila de revisão nem evento. RLS: qualquer autenticado cria; autor ou admin/supervisor edita/exclui. "Usar template" não olha o status (rascunho é usável); só o card "Sugestões da biblioteca" do wizard filtra `approved`. | `EDT:39`, `EDT:293-297`, `SH:73-77`, `supabase/migrations/20260908120000_talkx_segments_templates_events.sql:48,56-63`, `src/components/talkx/TalkXCampaignWizard.tsx:305` |
| Importar CSV/JSON | **Removido — confirmado.** grep `-i "csv\|FileReader\|papaparse\|Importar\|Exportar"` em `TPL`, `EDT`, `HOOK` → 0. (Commit `527c4ba` citado pela auditoria não está no clone local — histórico raso, 1 commit.) | `TPL:156-162` (rail só com Criar e Duplicar) |
| Métricas por template | Existem `talkx_campaign_metrics` (view, `template_id`, `reply_rate_pct`, só campanhas `completed`) e `talkx_benchmarks()` (`global.avg_reply_rate_pct`, `by_template` top-5/90 d ordenado por **entrega**). **Nenhum hook de template consome** (grep `talkx_benchmarks` em `src` fora de `types.ts` → 0; a view só é lida por `useTalkXInsights.ts:59`). Não há função por `template_id` + período, nem conversão/rejeição por template. Banco tem 0 campanhas → tudo vazio. | `supabase/migrations/20260916150000_talkx_e89_benchmarks.sql:4-98` |
| `use_count` | Incrementado 1× por **campanha criada** com o template (não por mensagem enviada). | `src/components/talkx/useCampaignEditor.ts:572`, `HOOK:150-153` |
| Permissão no front | Nenhum gate de papel nos componentes de template (grep `isAdmin\|hasRole\|useUserRole` em `src/components/talkx/*.tsx` → 0). `action=test` exige admin/supervisor na edge → agente vê "Testar" e recebe 403. | `SEND:135-143` |
| Testes | Sem teste de `TalkXTemplates`/`TalkXTemplateEditor`/`useTalkXTemplates`; sem teste de `pickVariant`. E2E só confere que a aba abre e o placeholder da busca aparece. | `e2e/talkx.spec.ts:96-98`, `supabase/functions/talkx-send/index.test.ts` (0 ocorrência de `pickVariant`) |

---

## Tela 04 — Templates · biblioteca

### Componente(s) atuais
- `TPL:28-175` (`TalkXTemplates`, modo `list`), `TPL:207-248` (`TemplateCard`), `TPL:177-205` (`TemplateListRow`).
- Cabeçalho e abas do módulo: `VIEW:239-283`; aba: `VIEW:299-301`.
- Dados: `HOOK:63-73` (select `talkx_templates.*` + `creator`, ordenado por `use_count`).
- Código morto dentro de `TPL`: estado de editor antigo e `save()` nunca usados (`TPL:41-67`), imports sem uso (`WhatsAppBubble`, `personalizePreview`, `fmtDateTime`, `Textarea`, `Wand2`… `TPL:4-20`).

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T04-001 | Topbar | "Buscar campanhas, segmentos, templates… (⌘ + K)" | nav | PARCIAL | `src/hooks/integrations/useTalkXCommandItems.ts:50-60` | cache `['talkx-templates']` | front: item de template só navega para o módulo, não abre o template nem a aba |
| T04-002 | Cabeçalho | "Campanhas" + "Conecte. Engaje. Converta. Comunicação em escala, com resultado real." | visual | OK | `VIEW:239-242` | — | — |
| T04-003 | Cabeçalho | Botão "Ajuda" (ícone + texto) | nav | PARCIAL | `VIEW:251-256` | — | front: botão é só ícone, sem rótulo |
| T04-004 | Cabeçalho | "+ Nova campanha" | ação | OK | `VIEW:257` | — | — |
| T04-005 | Abas | "Visão geral · Segmentos · Templates · Lista de supressão · Analytics" | nav | OK | `VIEW:266-281` | — | — |
| T04-006 | Abas | Chevron/dropdown na aba "Templates" (e em "Analytics") | nav | AUSENTE | grep `Chevron\|Dropdown` em `VIEW` → 0 | — | front: submenu da aba (Biblioteca / Criar e editar); mock não mostra as opções |
| T04-007 | KPIs | "Total de templates" · 48 | dado | OK | `TPL:104`, `TPL:82` | `count(talkx_templates)` | — |
| T04-008 | KPIs | Sparkline do "Total de templates" | visual | AUSENTE | `TPL:104` (`bars={null} chart="none"`) | `talkx_templates.created_at` (`barsByDay` existe em `SH:161`) | front: série por dia de criação |
| T04-009 | KPIs | "Aprovados" · 42 | dado | OK | `TPL:105`, `TPL:83` | `talkx_templates.status='approved'` | — |
| T04-010 | KPIs | "↑ +12%" (variação de aprovados) | dado | PARCIAL | `TPL:105` (mostra "% do total", outra métrica) | SEM FONTE (não há histórico de status por data; só snapshots em `talkx_template_versions.status`) | banco: fonte de variação no período; front: trocar ou assumir "% do total" |
| T04-011 | KPIs | "Mais usados" · "Boas-vindas CRM" + sparkline | dado | PARCIAL | `TPL:106`, `TPL:79` | `talkx_templates.use_count`; sparkline SEM FONTE direta (derivável de `talkx_campaigns.template_id, created_at`) | front: mock mostra o nome como valor; código mostra o número e o nome como delta; sem sparkline |
| T04-012 | KPIs | "Taxa média de resposta" · 28,6% | dado | AUSENTE | `TPL:107` (no lugar há "Templates com mídia") | RPC `talkx_benchmarks().global.avg_reply_rate_pct` (existe, sem consumidor; 0 campanhas → nulo) | front: hook de benchmarks + KPI com estado "sem dados" |
| T04-013 | KPIs | "↑ +4,3%" (variação da taxa) | dado | AUSENTE | idem T04-012 | SEM FONTE (`talkx_benchmarks` só tem janela fixa de 90 d, sem período anterior) | banco: benchmark com período comparativo |
| T04-014 | Filtros | "Buscar templates..." | ação | OK | `TPL:110`, `TPL:73` | nome, conteúdo, tags | — |
| T04-015 | Filtros | "Todos as categorias" | ação | OK | `TPL:111`, `SH:69-71` | `talkx_templates.category` (lista fixa de 10) | — |
| T04-016 | Filtros | "Todos os canais" | ação | AUSENTE | grep `canal\|channel` em `TPL` → 0 | SEM FONTE (`talkx_templates` não tem canal; só WhatsApp existe) | banco: coluna de canal, ou remover o filtro |
| T04-017 | Filtros | "Todos os status" | ação | OK | `TPL:112` | `talkx_templates.status` | — |
| T04-018 | Filtros | "Todas as equipes" | ação | AUSENTE | grep `equipe\|team` em `TPL`/`HOOK` → 0 | SEM FONTE (não há `team_id`; só `created_by`) | banco: vínculo template↔equipe, ou filtrar por autor |
| T04-019 | Filtros | Toggle grade / lista | ação | OK | `TPL:115-118`, `TPL:123-141` | — | front: preferência não persiste |
| T04-020 | Galeria | Grade de 4 colunas | visual | PARCIAL | `TPL:124` (máx. 3 em 2xl, 2 em xl) | — | front: `xl:grid-cols-4` |
| T04-021 | Card | Ícone do WhatsApp (canal) ao lado da bolha | visual | AUSENTE | `TPL:218-226` | — | front |
| T04-022 | Card | Bolha com o texto do template (variáveis cruas "Olá, {{nome}}! 👋", quebras de linha) | visual | PARCIAL | `TPL:219-224` | `talkx_templates.content` | front: bolha à direita em verde, corte seco em 140 caracteres; não usa `WhatsAppBubble` |
| T04-023 | Card | Hora na bolha ("10:24") | dado | FALSO | `TPL:223` ("Agora ✓✓" fixo) | decorativo; se for dado, `updated_at` | front: remover ou derivar de `updated_at` |
| T04-024 | Card | Imagem dentro da bolha (cards "Oferta VIP", "Lançamento sazonal") | visual | PARCIAL | `TPL:221` (só chip "📎 image") | `talkx_templates.media_url` | front: renderizar a miniatura; depende de URL assinada se a mídia for para bucket privado |
| T04-025 | Card | 3 imagens lado a lado (card "Catálogo personalizado") | visual | AUSENTE | — | SEM FONTE (`media_url` é único) | banco: múltiplas mídias; edge: envio em sequência |
| T04-026 | Card | Link/botão "Ver catálogo" na bolha | visual | AUSENTE | grep `button\|cta` em `TPL`/`HOOK` → 0 | SEM FONTE (sem coluna de botões) | banco: estrutura de botões; edge: `talkx-send` chamar `/message/sendButtons` (`GO:122-125` já traduz); front: editor + prévia |
| T04-027 | Card | Enquete CSAT (4 emojis + "Toque para responder") | visual | AUSENTE | grep `poll\|enquete` em `src/components/talkx` → 0 | SEM FONTE (sem coluna; voto de enquete não é capturado pelo Talk X) | banco: tipo de mensagem + opções; edge: `sendPoll` (`GO:109-112`) e leitura do voto no webhook; front: editor + prévia |
| T04-028 | Card | Nome do template ("Boas-vindas CRM 360°") | dado | OK | `TPL:230` | `talkx_templates.name` | — |
| T04-029 | Card | Chips ("Onboarding", "Relacionamento"; até 3 por card) | dado | PARCIAL | `TPL:233-234` | `category` (1 valor) + `tags[]` | front: hoje 1 chip de categoria + até 2 tags como texto "#tag"; definir se os chips do mock são tags |
| T04-030 | Card | "3 variáveis: {{nome}}, {{empresa}}, …" | dado | AUSENTE | grep `extractVariables` em `TPL` → 0 | derivável de `content` (`SH:143-147`) + `custom_variables` | front: contar e listar; `extractVariables` só casa `[a-z_]` (não pega `{{última_compra}}` do mock nem dígitos) |
| T04-031 | Card | "Atualizado em 12 set. 2026, 10:30" | dado | AUSENTE | `fmtDateTime` importado e não usado (`TPL:20`) | `talkx_templates.updated_at` | front |
| T04-032 | Card | Status "Aprovado" (ponto verde) | dado | OK | `TPL:232`, `SH:76` | `talkx_templates.status` | — |
| T04-033 | Card | Status "Em revisão" (ponto âmbar) | estado | PARCIAL | `SH:75`, `EDT:293-297` | `status='review'` | rótulo existe; **não há fluxo de revisão** (quem aprova, quando, trilha) — banco: `approved_by/at` + regra; front: ação Aprovar/Reprovar |
| T04-034 | Card | Ícone de barras + "2.341 usos" | dado | OK | `TPL:243` | `talkx_templates.use_count` (campanhas criadas com o template) | front: ícone; confirmar que "usos" = campanhas e não mensagens |
| T04-035 | Card | "Usar template" | ação | OK | `TPL:239` → `VIEW:300` → `useCampaignEditor.ts:431-445` | — | front: não bloqueia rascunho/em revisão |
| T04-036 | Card | Menu ⋮ | ação | PARCIAL | `TPL:240-242` (3 botões soltos: Editar, Duplicar, Excluir) | — | front: menu (`RowActionsMenu` existe em `SH:561`, sem uso aqui); faltam Testar e Arquivar |
| T04-037 | Galeria | 2ª fileira cortada (rolagem contínua, sem paginador visível) | nav | PARCIAL | `TPL:142`, `TPL:34` | — | front: página fixa em 8, `onPageSize` vazio, página não volta a 1 ao filtrar (`TPL:69-77`) |
| T04-038 | Rail | "Biblioteca inteligente" + "Templates que convertem, recomendações sob medida para o seu negócio." + ilustração | visual | PARCIAL | `TPL:146` | — | front: é um `RailCard` simples com outro texto; `HeroCard` existe (`SH:701`) |
| T04-039 | Rail | "Mais convertidos" (ranking por taxa de resposta) | dado | PARCIAL | `TPL:147-154` (rótulo "Mais usados", ordenado por `use_count`) | `talkx_campaign_metrics.template_id + reply_rate_pct` / `talkx_benchmarks().by_template` | front: hook; banco: `by_template` ordena por entrega e limita a 5/90 d |
| T04-040 | Rail | "Ver todos" | nav | AUSENTE | — | — | front |
| T04-041 | Rail | Posição 1 / 2 / 3 | visual | OK | `TPL:150` | — | — |
| T04-042 | Rail | Miniatura da mídia do template | visual | AUSENTE | `TPL:149-153` | `talkx_templates.media_url` | front |
| T04-043 | Rail | Nome do template | dado | OK | `TPL:151` | `name` | — |
| T04-044 | Rail | "↑ 32,4% de resposta" | dado | AUSENTE | `TPL:151` (mostra "N usos") | idem T04-039 | front + banco (idem T04-039) |
| T04-045 | Rail | Menu ⋮ do item | ação | AUSENTE | `TPL:152` (chevron; clique = usar template) | — | front |
| T04-046 | Rail | "Sugestões da IA" + "Ver todas" | dado | AUSENTE | grep `Sugest\|IA` em `TPL` → só o subtítulo de T04-051 | SEM FONTE (nenhuma edge gera template; `talkx_settings.ai_insights=false`) | edge: geração via `ai-proxy`; front: card |
| T04-047 | Rail | "Template para Black Friday — Com base nas suas campanhas de alta conversão" | dado | AUSENTE | idem | SEM FONTE (0 campanhas) | idem T04-046 |
| T04-048 | Rail | "Mensagem de aniversário — Personalize e reative clientes" | dado | AUSENTE | idem | SEM FONTE | idem T04-046 |
| T04-049 | Rail | "Pós-venda com upsell — Aumente o LTV com IA" | dado | AUSENTE | idem | SEM FONTE | idem T04-046 |
| T04-050 | Rail | "Ações rápidas" | visual | OK | `TPL:156` | — | — |
| T04-051 | Rail | "Criar template — Do zero ou com IA" | ação | PARCIAL | `TPL:158` | — | "do zero" funciona; **"com IA" não existe** (rótulo promete o que não há) |
| T04-052 | Rail | "Duplicar template — Baseado em um existente" | ação | FALSO | `TPL:159` (`selected ? openEdit(selected) : openNew()`) | — | front: não duplica — abre o **original** para edição, ou um template em branco; deve pedir a origem e chamar `duplicateTemplate` (`HOOK:137-147`) |
| T04-053 | Rail | "Importar templates — De um arquivo CSV ou JSON" | ação | AUSENTE | grep `-i csv\|import` em `TPL`/`EDT`/`HOOK` → 0 | — | front: parser + prévia + conflitos; decisão de produto (CSV foi removido do sistema em 27/09) |
| T04-054 | Estados | vazio / carregando / erro | estado | PARCIAL | `TPL:125-127`, `TPL:134-136` | — | front: `isError` do hook (`HOOK:222`) não é tratado — falha de leitura aparece como "Nenhum template criado" |

Elementos no código que **não** estão no mock 04: botão "Novo Template" na barra de filtros (`TPL:119`), KPI "Templates com mídia" (`TPL:107`), botão Excluir direto no card (`TPL:242`).

### Comportamentos implícitos
- **Permissão:** sem gate no front; RLS deixa qualquer autenticado criar e ver todos; excluir/editar = autor ou admin/supervisor. Erro de RLS vira toast genérico (`HOOK:134`).
- **Excluir:** exclusão física com confirmação (`TPL:167-172`); apaga versões e variantes em cascata, zera `talkx_campaigns.template_id` e `talkx_recipients.variant_id` (perde a atribuição A/B de campanhas já enviadas). Não existe "arquivar" (CHECK de status não tem `archived`).
- **Duplicar (card):** funciona, cria "(cópia)" em `draft` (`HOOK:137-147`); **não copia as variantes A/B**.
- **Ordenação:** só a do banco (`use_count`, depois `updated_at`); sem controle na tela.
- **Paginação:** fatia no cliente; trocar filtro estando na página 2 pode mostrar "Nenhum template encontrado" com resultados existentes.
- **Realtime:** não há; lista só atualiza por invalidação local.
- **Responsivo:** rail desce abaixo da grade em < xl (`TPL:101`); ok.
- **Teclado:** card é `role="button"` com Enter/Espaço (`TPL:211-214`), mas o clique só marca "selecionado" — seleção que só serve ao "Duplicar" quebrado do rail.
- **Com 0 campanhas no banco**, todo número de conversão/resposta do mock ficará vazio mesmo depois de implementado; precisa de estado "sem dados ainda".

### Etapas do V3 que cobrem esta tela
- **V61 (galeria):** não cobre filtros "canais" e "equipes" (sem fonte), ícone de canal, várias imagens, CTA "Ver catálogo", enquete CSAT, sparklines dos KPIs, reset de página ao filtrar. Manda usar `personalizePreview` no card, mas **o mock mostra as variáveis cruas** (`{{nome}}`). Cria status `archived`, que o mock não tem.
- **V62 (rail):** adia "Sugestões" para V83 — mas V83 trata insights de campanha, não geração de template; **nenhuma etapa constrói "Sugestões da IA" nem "criar com IA"**. Não cobre "Ver todos", miniaturas e ⋮ dos itens.
- **V64 (importar/exportar):** cobre o item do rail; conflita com a remoção de CSV de 27/09 (precisa decisão).
- **V69 (benchmarks):** libera "Taxa média de resposta" e "Mais convertidos"; não cobre o delta "+4,3%" nem o "+12%" de aprovados (sem período comparativo).
- **V45/V47:** dropdown das abas e ⌘K que abre o item.
- **Sem etapa:** fluxo de aprovação ("Em revisão" → "Aprovado"); botões/enquete em mensagem.

### Riscos e dependências
- Todo o bloco de conversão depende de campanhas concluídas; produção tem 0.
- Botões e enquete: o WhatsApp via conexão não-oficial (whatsmeow) costuma não renderizar botões de forma confiável — validar na instância antes de prometer; hoje não há teste nem uso em campanha.
- `talkxShared.tsx` é compartilhado por todas as telas (colisão com sessões paralelas ao mexer em `WhatsAppBubble`, `extractVariables`, `TEMPLATE_CATEGORIES`).
- Miniaturas de mídia dependem da decisão do bucket (V27): com bucket privado, a galeria precisa de URL assinada por card.
- Limpar o código morto de `TPL:41-67` antes de refatorar evita manter dois editores.

---

## Tela 05 — Templates · criar e editar

### Componente(s) atuais
- `EDT:27-575` (`TalkXTemplateEditor`), aberto por `TPL:89-98` (substitui a galeria dentro da mesma aba; cabeçalho "Campanhas" e abas de `VIEW` continuam acima).
- Prévia: `PhoneFrame` em `SH:302-352`; `personalizePreview` em `SH:101-141`.
- Persistência: `HOOK:77-126` (insert direto / RPC `update_talkx_template_with_snapshot`), versões `HOOK:157-165`, variantes `HOOK:184-217`, teste `HOOK:167-180` → `SEND:150-210`.

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T05-001 | Topo | Breadcrumb "Talk X › Campanhas › Templates" | nav | AUSENTE | grep `Breadcrumb` em `EDT` → 0 | — | front |
| T05-002 | Cabeçalho | Ícone WhatsApp + "Templates" + "Crie, gerencie e otimize seus templates de mensagens para campanhas no WhatsApp." | visual | AUSENTE | `VIEW:239-242` (continua "Campanhas") | — | front: cabeçalho próprio da tela |
| T05-003 | Cabeçalho | "Buscar templates, categorias ou tags…" + "⌘K" | nav | PARCIAL | `EDT:189-194`, `EDT:176-181` | nome e categoria | front: busca da biblioteca não olha tags nem conteúdo; sem atalho |
| T05-004 | Cabeçalho | "+ Novo Template" | ação | AUSENTE | grep `Novo` em `EDT` → só o título `EDT:263` | — | front: no editor é preciso voltar à galeria (`TPL:119`) |
| T05-005 | Cabeçalho | Widget "● Em andamento · Talk X · Iniciada às 14:28" (com chevron) | dado | AUSENTE | grep `Em andamento\|started_at` em `EDT` → 0 | `talkx_campaigns.status='sending'`, `started_at` | front: widget de campanha em execução (há só "Ao vivo" em `VIEW:245-249`) |
| T05-006 | KPIs | "Total de Templates" · 48 | dado | PARCIAL | `TPL:104` (só no modo galeria; o editor retorna antes, `TPL:89-98`) | `count(talkx_templates)` | front: faixa de KPIs no editor |
| T05-007 | KPIs | "↑ 12% vs. mês anterior" | dado | AUSENTE | — | derivável de `talkx_templates.created_at` (ignora exclusões) | front |
| T05-008 | KPIs | "Templates Ativos" · 36 | dado | PARCIAL | `TPL:105` ("Aprovados", só na galeria) | `status='approved'`; **"Ativo" não existe como status** | front + decisão de nomenclatura (Ativo × Aprovado) |
| T05-009 | KPIs | "75% do total" | dado | PARCIAL | `TPL:105` (só na galeria) | idem | front |
| T05-010 | KPIs | "Melhor Taxa de Resposta" · 28,4% | dado | AUSENTE | grep `talkx_benchmarks` em `src` → 0 | `talkx_campaign_metrics` por `template_id` / `talkx_benchmarks().by_template` | front: hook; banco: `by_template` ordena por entrega |
| T05-011 | KPIs | "Template: Boas-vindas v2" (nome + versão) | dado | AUSENTE | — | nome via `template_id`; versão: SEM FONTE (campanha não guarda a versão usada) | banco: `template_version_id` na campanha |
| T05-012 | KPIs | "Templates com Mídia" · 18 | dado | PARCIAL | `TPL:107` (só na galeria) | `media_url IS NOT NULL` | front |
| T05-013 | KPIs | "38% do total" | dado | AUSENTE | `TPL:107` (`delta={null}`) | derivável | front |
| T05-014 | KPIs | 4 sparklines | visual | AUSENTE | `TPL:104-107` (`chart="none"`) | parcial (`created_at`); demais SEM FONTE | front |
| T05-015 | Biblioteca | "Biblioteca de Templates" + "Gerencie seus templates e use em campanhas" + ícone | visual | PARCIAL | `EDT:188` ("Biblioteca") | — | front |
| T05-016 | Biblioteca | "Buscar templates..." | ação | OK | `EDT:189-194` | nome, categoria | — |
| T05-017 | Biblioteca | Botão de filtro (ícone de funil) | ação | AUSENTE | — | — | front (mock não mostra o conteúdo) |
| T05-018 | Biblioteca | Chips com contagem: "Todos (48)", "Boas-vindas (8)", "Vendas (12)", "Suporte (6)", "Pós-venda (8)", "Sazonais (6)", "Financeiro (4)" | dado | PARCIAL | `EDT:196-212`, `SH:69-71` | `talkx_templates.category` | front: chips sem contagem e sempre as 10 categorias fixas; categoria "suporte" não existe na lista |
| T05-019 | Biblioteca | Item: ícone/emoji colorido do template (👋, carrinho, sacola…) | visual | AUSENTE | `EDT:222-238` | SEM FONTE (sem coluna de ícone/cor) | banco: coluna, ou mapear por categoria no front |
| T05-020 | Biblioteca | Item: nome | dado | OK | `EDT:235` | `name` | — |
| T05-021 | Biblioteca | Item: descrição ("Mensagem de saudação para novos contatos") | dado | AUSENTE | `EDT:237` (mostra "categoria · N usos") | `talkx_templates.description` existe | front: exibir; **o editor não tem campo de descrição** (`eDesc` só é lido/gravado, nunca editado — `EDT:33,91`) |
| T05-022 | Biblioteca | Item: selo "Ativo" / "Rascunho" | dado | PARCIAL | `EDT:234` (só um ponto colorido) | `status` | front: selo com rótulo |
| T05-023 | Biblioteca | Item: tags "#boas-vindas", "#relacionamento" | dado | AUSENTE | `EDT:222-238` | `tags[]` | front |
| T05-024 | Biblioteca | Item: menu ⋮ | ação | AUSENTE | — | — | front |
| T05-025 | Biblioteca | Item selecionado com borda azul | estado | OK | `EDT:226-231` | — | — |
| T05-026 | Editor | "Editar Template" + "Personalize sua mensagem e adicione variáveis e mídia" | visual | OK | `EDT:263-264` | — | título usa a prop `editing`, não o template carregado pela biblioteca |
| T05-027 | Editor | "Duplicar" | ação | OK | `EDT:267-269`, `HOOK:137-147` | — | duplica e fecha o editor; não copia variantes |
| T05-028 | Editor | "Testar" | ação | PARCIAL | `EDT:270`, `EDT:142-155`, `EDT:558-572`, `SEND:150-210` | — | envia de verdade, mas: 1ª conexão `connected` (sem escolha), contato fictício fixo, sem registro nem limite de frequência, mídia sem URL assinada, documento sem nome de arquivo, variantes não testáveis, exige admin/supervisor sem aviso no front |
| T05-029 | Editor | "Salvar Template" | ação | OK | `EDT:82-107`, `EDT:271-277`, `HOOK:89-126` | RPC `update_talkx_template_with_snapshot` | — |
| T05-030 | Editor | Sub-abas "Conteúdo · Variações A/B · Histórico de Versões" | nav | AUSENTE | grep `Tabs` em `EDT` → 0 | — | front: A/B e histórico hoje são blocos recolhíveis no rail direito |
| T05-031 | Editor | Aba "Variações A/B" (conteúdo não desenhado no mock) | ação | PARCIAL | `EDT:495-521` (xl+) e cópia em `EDT:437-484` (< xl), `HOOK:184-217`, `SEND:75-86` | `talkx_template_variants`, `talkx_recipients.variant_id` | front: UI duplicada, salva no blur sem feedback, soma ≠ 100 só avisa, sem mídia por variante, sem prévia lado a lado; edge: conteúdo-base fora do sorteio (ver fatos transversais); banco: constraint de soma; relatório por variante sem taxa de resposta e sem tela |
| T05-032 | Editor | Aba "Histórico de Versões" (conteúdo não desenhado) | ação | PARCIAL | `EDT:522-538`, `EDT:166-174`, `HOOK:157-165` | `talkx_template_versions` | front: só em xl+ (`EDT:487`), 10 últimas, sem autor/diff/nota, "restaurar" só preenche o formulário; banco: sem limite, snapshot em todo save |
| T05-033 | Campos | "Nome do Template" | ação | OK | `EDT:284` | `name` (1–200) | — |
| T05-034 | Campos | "Categoria" (select) | ação | OK | `EDT:285-291` | `category` (lista fixa) | sem criar categoria; falta "Suporte" do mock |
| T05-035 | Campos | "Status" · "● Ativo" | ação | PARCIAL | `EDT:292-298` | `status` | opções reais: Rascunho / Em revisão / Aprovado; sem "Ativo"; sem regra de quem pode aprovar |
| T05-036 | Mensagem | Rótulo "Mensagem" | visual | OK | `EDT:304` | — | — |
| T05-037 | Mensagem | "Inserir variável" (link acima do editor) | ação | PARCIAL | `EDT:313-315` (chips na barra, inserem no cursor) | `SH:79` | front: menu único com todas as variáveis, inclusive as personalizadas |
| T05-038 | Mensagem | Variáveis destacadas dentro do texto (`{{nome}}`, `{{empresa}}` com fundo) | visual | AUSENTE | `EDT:319-330` (`Textarea` simples) | — | front: overlay de destaque |
| T05-039 | Mensagem | Barra: **B** | ação | OK | `EDT:309` | — | — |
| T05-040 | Mensagem | Barra: *I* | ação | OK | `EDT:310` | — | — |
| T05-041 | Mensagem | Barra: lista com marcadores | ação | OK | `EDT:311` | — | — |
| T05-042 | Mensagem | Barra: lista numerada (2º ícone de lista) | ação | AUSENTE | `EDT:308-318` | — | front |
| T05-043 | Mensagem | Barra: emoji | ação | AUSENTE | `Smile` importado sem uso (`EDT:3`) | — | front (`src/components/ui/emoji-picker.tsx` existe) |
| T05-044 | Mensagem | Barra: link | ação | AUSENTE | `EDT:308-318` | — | front |
| T05-045 | Mensagem | Contador "186/1024" | dado | OK | `EDT:305`, `EDT:322` | `content.length` | corta em 1024 mesmo sem mídia (texto puro aceita mais); banco aceita 65 536 |
| T05-046 | Variáveis | "Variáveis disponíveis": `{{nome}}`, `{{empresa}}`, `{{saudacao}}` | ação | OK | `EDT:333-341`, `SH:79` | `contacts.name/company`, hora do envio | — |
| T05-047 | Variáveis | `{{data}}` | ação | AUSENTE | `SH:79`, `SEND:37-42` | data do envio (sem coluna necessária) | front: chave; edge: resolver em `personalize()` — hoje sairia "[data]" |
| T05-048 | Variáveis | `{{telefone}}` | ação | AUSENTE | idem | `contacts.phone` (já lido em `SEND:284`) | front + edge |
| T05-049 | Variáveis | "+ Adicionar variável" | ação | OK | `EDT:365-407` | `talkx_templates.custom_variables`; valor em `contact_custom_fields` | não valida se o campo existe no CRM; sem valor padrão (fallback) |
| T05-050 | Mídia | Rótulo "Mídia (opcional)" | visual | OK | `EDT:346` | — | — |
| T05-051 | Mídia | Arquivo carregado: miniatura | visual | AUSENTE | `EDT:361` (campo de URL) | — | banco: bucket; front: upload + miniatura |
| T05-052 | Mídia | Nome do arquivo "boas-vindas-banner.jpg" | dado | AUSENTE | — | SEM FONTE (sem coluna) | banco: metadados da mídia |
| T05-053 | Mídia | "1920 x 1080" | dado | AUSENTE | — | SEM FONTE | banco: metadados |
| T05-054 | Mídia | "245 KB" | dado | AUSENTE | — | SEM FONTE | banco: metadados |
| T05-055 | Mídia | Remover mídia (✕) | ação | PARCIAL | `EDT:348-353` (botão "Sem mídia") | — | front |
| T05-056 | Mídia | Dropzone "Adicionar mídia — Imagem, vídeo ou documento (até 16MB)" | ação | AUSENTE | grep `type="file"\|upload\|onDrop` em `EDT`/`HOOK` → 0 | — | banco: bucket `talkx-media` + policies + aceitar `path` no trigger/RPC/CHECKs; edge: assinar URL (incluir bucket em `resolvePrivateBucketUrl`, inclusive no `action=test`), mandar `fileName` em documento; front: upload com validação de tipo/tamanho |
| T05-057 | Desempenho | Card "Desempenho deste Template" | visual | PARCIAL | `EDT:540-553` | — | front: só em xl+, só quando aberto por "Editar", e usa a prop `editing` — ao trocar de template pela biblioteca os números ficam do template anterior |
| T05-058 | Desempenho | Seletor "Últimos 30 dias" | ação | AUSENTE | — | — | front + banco (função por período) |
| T05-059 | Desempenho | "1,250 · Envios" | dado | FALSO | `EDT:543` (`use_count` rotulado "Envios") | real: `sum(talkx_campaigns.sent_count)` por `template_id` ou `talkx_recipients.sent_at` | `use_count` conta campanhas, não mensagens; banco: função `stats` por template e período |
| T05-060 | Desempenho | "↑ 12%" (envios) | dado | AUSENTE | — | derivável de `talkx_recipients.sent_at` | banco + front |
| T05-061 | Desempenho | "28,4% · Taxa de resposta" | dado | AUSENTE | `EDT:543` ("—") | `talkx_recipients.replied_at` / `talkx_campaigns.replied_count` por `template_id` | banco: função; front |
| T05-062 | Desempenho | "↑ 6%" (resposta) | dado | AUSENTE | — | idem | idem |
| T05-063 | Desempenho | "3,2% · Taxa de conversão" | dado | AUSENTE | `EDT:543` ("—") | `talkx_conversions` (tabela existe, 0 linhas, nenhuma tela grava) via `campaign_id → template_id` | banco/edge: registro de conversão (V82/V90); função; front |
| T05-064 | Desempenho | "↑ 18%" (conversão) | dado | AUSENTE | — | idem | idem |
| T05-065 | Desempenho | "0,8% · Taxa de rejeição" | dado | AUSENTE | `EDT:543` ("—") | SEM FONTE definida (falhas? opt-outs por `talkx_blacklist.campaign_id`?) | produto: definir "rejeição"; banco: função |
| T05-066 | Desempenho | "↑ 2%" (rejeição, em vermelho) | dado | AUSENTE | — | idem | idem |
| T05-067 | Prévia | "Pré-visualização no WhatsApp" | visual | OK | `EDT:488-494` | — | só em xl+ (`EDT:487`) |
| T05-068 | Prévia | "Ver em tela cheia" | ação | AUSENTE | grep `tela cheia\|fullscreen` em `EDT` → 0 | — | front |
| T05-069 | Prévia | Cabeçalho do chat: voltar, avatar "Z", "ZAPP", "Online", vídeo, telefone, ⋮ | visual | PARCIAL | `SH:316-322` | nome: `whatsapp_connections` (não é passado; fica "Sua Empresa") | front: nome/avatar da conexão e ícones |
| T05-070 | Prévia | Texto com variáveis resolvidas e em negrito ("Olá **João Silva**!", "à **ZAPP**!") | dado | PARCIAL | `EDT:490`, `SH:106-116` | contato fictício fixo | front: `{{nome}}` vira só "João"; empresa "Sua Empresa"; sem negrito no valor; `*negrito*`/`_itálico_` não são renderizados na prévia |
| T05-071 | Prévia | Tema claro do WhatsApp (fundo bege, bolha branca) | visual | PARCIAL | `SH:324-347` (fundo escuro, bolha verde à direita) | — | front |
| T05-072 | Prévia | Imagem como mensagem separada, com hora e ✓✓ | visual | PARCIAL | `SH:338-343` | `media_url` | front: imagem dentro da mesma bolha, máx. 64 px; vídeo/documento/áudio viram "📎 tipo" |
| T05-073 | Prévia | Hora "14:28" | visual | OK | `SH:345` (hora atual) | — | — |
| T05-074 | Tags | "Tags" + "#boas-vindas", "#relacionamento" | dado | OK | `EDT:410-418` | `talkx_templates.tags` | fica no fim do formulário, não abaixo da prévia |
| T05-075 | Tags | "+ Adicionar tag" | ação | OK | `EDT:419-431` | — | — |
| T05-076 | Dica | "Dica — Use variáveis para personalizar a mensagem e aumentar a taxa de resposta em até 40%." | visual | AUSENTE | grep `Dica\|TipCard` em `EDT` → 0 | "até 40%": SEM FONTE | front (`TipCard` existe em `SH:757`); não afirmar o número |
| T05-077 | Estados | Modo "novo template" (campos vazios) | estado | PARCIAL | `EDT:32-43`, `EDT:263` | — | status inicial = `approved`; Duplicar/Desempenho/A-B somem até o primeiro save |

Elementos no código que **não** estão no mock 05: botão "Voltar" (`EDT:250-260`), seletor de tipo de mídia com "Áudio" (`EDT:348`), bloco "Variáveis personalizadas" separado (`EDT:365-407`), modal "Testar template" (`EDT:558-572`).

### Comportamentos implícitos
- **Alterações não salvas:** `isDirty` cobre todos os campos (`EDT:69-80`) e pede confirmação ao voltar ou trocar de template (`window.confirm`, `EDT:111`, `EDT:253`); não há proteção ao trocar de aba do módulo ou fechar o navegador.
- **Concorrência:** lock otimista com mensagem clara ("alterado por outra pessoa", `HOOK:41-43`). Criação nova vai por insert direto, sem versão.
- **Erro ao salvar:** toast do hook; o `catch` do editor só faz `console.error` (`EDT:104-106`).
- **Validação:** nome e conteúdo obrigatórios (botão desabilitado, `EDT:274`); URL de mídia precisa de `https://` (`EDT:85-88`); sem aviso de variável desconhecida/escrita errada (no envio vira "[variavel]").
- **Fallback de variável:** inexistente no front e na edge; contato sem empresa gera "bem-vindo(a) à !".
- **Áudio + texto:** escolher "Áudio" faz o texto do template não ser enviado (ver fatos transversais); a tela não avisa.
- **Variante × template:** criar a variante A copia o texto atual com peso 100 (`EDT:515`); editar o texto-base depois não muda A, e as campanhas passam a enviar o texto antigo de A. A prévia e o "Testar" mostram o texto-base, não o que será enviado.
- **Teclado:** ⌘S/Ctrl+S e ⌘Enter só com foco no textarea (`EDT:326-329`); botões da barra têm `title`, sem `aria-label`.
- **Responsivo:** biblioteca some abaixo de `lg` (`EDT:186`); prévia, histórico e desempenho somem abaixo de `xl` (`EDT:487`); só A/B tem versão para telas menores (`EDT:438-484`).
- **Permissão:** "Testar" dá 403 para agente; salvar template de outro autor dá erro tratado ("não tem permissão", `HOOK:44-46`).
- **Realtime / autosave:** não há; variantes salvam no blur, o resto só no botão.

### Etapas do V3 que cobrem esta tela
- **V63 (sub-abas, emoji, link, dropzone):** não cobre lista numerada, campo de descrição, layout do item da biblioteca (ícone, descrição, selo, tags, ⋮, contagem nos chips, botão de filtro), breadcrumb/cabeçalho "Templates"/faixa de KPIs no modo editor, "+ Novo Template" no editor, widget "Em andamento", card "Dica", categoria "Suporte".
- **V26 (editor único):** cobre destaque de variável, emoji, link, contador; cita `template_version_id`, coluna que não existe (grep em `types.ts` → 0).
- **V27 (mídia):** cobre bucket/upload; não cobre metadados (nome, dimensões, tamanho), CHECK `^https://` das **variantes** e versões, allowlist de buckets em `resolvePrivateBucketUrl`, `fileName` de documento, texto descartado com áudio, URL assinada para a prévia no front.
- **V28:** tela cheia e cabeçalho da conexão na prévia (escrito para o wizard; reaproveitar).
- **V65 (variáveis):** cobre `telefone`, `link`, fallback; chama de `data_atual` o que o mock chama `{{data}}`; não cobre nomes com acento/dígito (`{{última_compra}}` do mock 04) nem empresa vazia.
- **V66 (versões):** não cobre versionar variantes nem mostrar o autor; "v2" no KPI depende de gravar a versão usada na campanha.
- **V67 (testar):** cobre trilha, limite e conexão; não cobre gate de papel no front nem testar uma variante específica.
- **V68 (A/B):** cobre soma = 100, UI única, testes; **não cobre o conteúdo-base fora do sorteio / variante sobrescrevendo a mensagem da campanha**, mídia por variante, taxa de resposta por variante (o `by_variant` atual só tem `recipients` e `sent`).
- **V69 (benchmarks):** cobre "Melhor/Taxa média de resposta" em nível global; **nenhuma etapa cobre o card "Desempenho deste Template"** (envios, resposta, conversão, rejeição, 30 dias, deltas) — grep `Desempenho deste\|rejeição` no plano → 0.
- **V70 (QA 04/05).**
- **Sem etapa:** fluxo de aprovação; status "Ativo"; ícone por template; "vs. mês anterior".

### Riscos e dependências
- **Bloqueio de dados:** desempenho por template exige campanhas concluídas (0 hoje), conversões gravadas (0 linhas, sem UI — V82/V90) e uma definição de "rejeição".
- **Mídia:** bucket inexistente + três camadas exigindo `https://` (trigger do template, CHECK das variantes, CHECK implícito na RPC) + assinatura limitada a dois buckets — V27 precisa mexer nas três e na edge no mesmo pacote; DDL segue a regra 6 do `CLAUDE.md` (arquivo → PR → merge → deploy → apply) e a edge só sobe por `deploy-functions.yml` com aprovação.
- **A/B:** corrigir a semântica do sorteio muda o que campanhas com variantes enviam; fazer antes de qualquer campanha real usar variantes.
- **Nomenclatura:** mock 04 usa "Aprovado/Em revisão", mock 05 usa "Ativo/Rascunho" — precisa de uma decisão antes de mexer no CHECK de status.
- **Decisão pendente sobre CSV** (removido em 27/09) bloqueia "Importar templates".
- **Colisão:** `talkxShared.tsx` (`PhoneFrame`, `personalizePreview`, `VARIABLE_KEYS`, `TEMPLATE_STATUS`) é usado pelo wizard e pela tela Agendada; `personalize()` da edge tem 10 testes Deno que precisam acompanhar qualquer mudança de variáveis (paridade front/edge).
- **Segurança do "Testar":** hoje permite enviar texto arbitrário a qualquer número pela conexão da empresa, sem registro — tratar antes de expor mais a ação (⋮ da galeria).

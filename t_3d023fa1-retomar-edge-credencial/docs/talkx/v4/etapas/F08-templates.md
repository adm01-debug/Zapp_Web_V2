# Fase 8 — Templates (X083–X098)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 04, 05. 16 etapas.
>
> **Entrega da fase:** Biblioteca e editor de templates completos: prévia fiel, upload de mídia, botões, A/B, versões, aprovação, desempenho por template.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de templates** (etapas X083, X084, X085, X086, X087, X088, X089, X090, X091, X092, X093, X094, X095, X096, X097, X098)

Base: `main` @ `3d09433` (2026-10-01). Abreviações: `TPL` = `src/components/talkx/TalkXTemplates.tsx` ·
`EDT` = `src/components/talkx/TalkXTemplateEditor.tsx` · `HOOK` = `src/hooks/integrations/useTalkXTemplates.ts` ·
`SH` = `src/components/talkx/talkxShared.tsx` · `VIEW` = `src/components/talkx/TalkXView.tsx` ·
`WIZ` = `src/components/talkx/TalkXCampaignWizard.tsx` · `SEND` = `supabase/functions/talkx-send/index.ts` ·
`MIG-CANON` = `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql`.

Ordem de execução: banco (X083 → X086) → componentes compartilhados (X087, X088) → tela 04 (X089 → X093) → tela 05 (X094 → X098).
Nenhuma etapa desta trilha faz deploy de edge: tudo que é envio, bucket, teste, IA e regra de A/B no motor é da trilha do motor e entra como dependência.
Etapas de banco só dizem "parte de banco de …" no **Fecha**; o ID fecha na etapa de tela indicada.

Definições usadas na trilha (valem para todas as etapas):
- **Usos** (cartão, "Mais usados") = mensagens enviadas com o template (`talkx_recipients.sent_at` de campanhas com `template_id`). `use_count` = nº de campanhas, aparece só no tooltip.
- **Taxa de resposta** = destinatários com `replied_at` ÷ enviados no período.
- **Taxa de conversão** = linhas de `talkx_conversions` das campanhas do template no período ÷ enviados.
- **Taxa de rejeição** = contatos que pediram para sair (linha em `talkx_blacklist` com origem de opt-out e `campaign_id` de campanha do template) no período ÷ enviados. Falha de envio não é rejeição (fica no relatório da campanha).
- **Base mínima (A9):** variação (delta) só com ≥ 50 enviados no período atual e no anterior; ranking ("Mais convertidos", "Melhor taxa") só com ≥ 50 enviados na janela; "Declarar vencedora" sem ressalva só com ≥ 100 enviados por variante.
- **Rótulo de status:** um só — Rascunho / Em revisão / Aprovado. O "Ativo" do mock 05 é o mesmo estado "Aprovado" do mock 04. Arquivado não é status: é `archived_at`.

---

## Etapas

### X083 · Adicionar colunas de canal, ícone, mídia, interativo e arquivo aos templates

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X061, X064
- **Fecha:** parte de banco de T04-016, T04-026, T04-027, T05-019, T05-052, T05-053, T05-054, T05-056 (a tela fecha em X089, X094, X095, X096)
- **Dependências, em detalhe:** CAP-059 (formato do caminho no bucket `talkx-media`) ; CAP-060 (formato do JSON de mensagem interativa)
- **Hoje:** `talkx_templates` tem 14 colunas, sem canal, ícone, botões/enquete, metadado de mídia nem marca de arquivo (`supabase/schema-catalog.json`, entradas `talkx_templates.*`); trigger e CHECK exigem `media_url ~ '^https://'` (`MIG-CANON:414-416`; `talkx_template_variants_media_url_check` no catálogo), então caminho de bucket é rejeitado; variantes não distinguem controle (`supabase/migrations/20260909150000_talkx_template_variants_ab.sql:6-13`).
- **Fazer:** Uma migration (versão reservada por `supabase_migrations.reserve_migration_version`), só aditiva. Em `talkx_templates`: `channel` (default `whatsapp`, CHECK só `whatsapp` — A15), `icon` (emoji, até 16 caracteres), `interactive` (jsonb), `media_file_name`, `media_type`, `media_size_bytes`, `media_width`, `media_height`, `archived_at`, `archived_by`. Em `talkx_template_versions` e `talkx_template_variants`: `interactive` e as 5 colunas de metadado; em variantes também `is_control` com índice único parcial (um controle por template). Função `talkx_validate_interactive(jsonb)` valida `buttons` (até 3; tipo resposta ou link https; rótulo até 20) e `poll` (pergunta até 255; 2 a 12 opções) e vira CHECK nas três tabelas; CAP-060 reutiliza a mesma função para a campanha. `validate_talkx_template_input` e o CHECK de `media_url` das variantes passam a aceitar `https://…` ou caminho `talkx-media/…`. Regenerar `supabase/schema-catalog.json` e `types.ts`; ajustar `scripts/db-audit/talkx-template-history-behavior.test.sh` e `talkx-template-history-runtime.sql`, que fixam a definição do trigger.
- **Aceite:** teste novo `scripts/db-audit/talkx-template-schema-v4.test.sh` (Postgres descartável, registrado em `.github/workflows/db-guard.yml`): `media_url='talkx-media/a/b.jpg'` passa e `http://x` falha; `interactive` com 4 botões falha com `invalid_talkx_template`; segundo `is_control=true` no mesmo template falha; `channel='email'` falha. Os 5 modos de `talkx-template-history-behavior.test.sh` (`db-guard.yml:287-291`) seguem verdes. `node scripts/db-audit/supabase-usage-guard.mjs` → `novas: 0`; paridade arquivos↔ledger.
- **V3:** V27 (parte de templates), V61 (o "arquivado" vira `archived_at`, não status)
- **Negócio:** nada muda na tela ainda; o banco passa a guardar o que os cartões e o editor do mock mostram (arquivo enviado, botão, enquete, ícone).

### X084 · Criar RPC `save_talkx_template` com versão condicional, nota, limite e restauração

- **Fase:** 8 · **Tela:** 05 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X066, X083
- **Fecha:** parte de banco de T05-032, T05-077 (a tela fecha em X098 e X094)
- **Dependências, em detalhe:** X083 ; CAP-078 (transição de status fica fora desta RPC)
- **Hoje:** criar é insert direto do navegador, sem versão e com status escolhido pelo cliente, padrão `approved` (`HOOK:77-87`, `EDT:39`); atualizar grava snapshot a cada save de qualquer campo, sem nota, sem limite e sem autor exibido (`MIG-CANON:492-604`); "restaurar" só preenche o formulário (`EDT:166-174`); a lista traz as 10 últimas (`HOOK:157-165`).
- **Fazer:** Migration com `talkx_template_versions.note` e três funções. `save_talkx_template(p_template_id, p_expected_updated_at, p_payload jsonb, p_note)`: cria (autor pelo JWT, status `draft`) ou atualiza com o lock otimista atual; aceita os campos de X083; não altera `status`. Snapshot só quando mudam `content`, mídia, `interactive` ou `custom_variables` (mudar nome, tag, categoria ou ícone não gera versão); a versão guarda `note` (até 280) e `saved_by`. Mantém as 50 versões mais recentes por template, apagando as anteriores na mesma transação (único caminho aceito por `guard_talkx_template_version_immutable`, `MIG-CANON:720-746`). Se existir variante `is_control`, o conteúdo e a mídia dela acompanham o texto-base no mesmo save. `restore_talkx_template_version(p_template_id, p_version_id, p_expected_updated_at)` aplica a versão como um save novo com nota "Restaurado de vN". `list_talkx_template_versions(p_template_id, p_limit, p_before)` devolve número, data, nota e nome do autor. `update_talkx_template_with_snapshot` continua existindo como invólucro da nova (mesma assinatura), sem drop.
- **Aceite:** teste novo `scripts/db-audit/talkx-template-save.test.sh`: criar → status `draft` e 0 versões; mudar só `tags` → 0 versões; mudar `content` com nota → 1 versão com nota e `saved_by`; 51 mudanças de conteúdo → `count(*)=50`; restaurar v1 → conteúdo de v1 e uma versão a mais; `p_expected_updated_at` antigo → `talkx_template_stale_version`; agente que não é autor → `talkx_template_not_authorized`; template com controle → conteúdo do controle igual ao novo texto-base. `supabase-usage-guard` → `novas: 0`.
- **V3:** V66
- **Negócio:** cada mudança de texto fica registrada com quem fez e por quê, e dá para voltar a uma versão anterior de verdade.

### X085 · Criar no banco variantes em conjunto, duplicar, arquivar, guarda de exclusão e importação

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014, X026, X065, X083, X084
- **Fecha:** parte de banco de T04-036, T04-052, T04-053, T05-031 (a tela fecha em X090, X092, X093, X097)
- **Dependências, em detalhe:** X083 ; X084 ; CAP-069 (constraint de soma e regra de sorteio) ; CAP-079 (`use_count` contado por uma via só) ; CAP-096 (papel no banco)
- **Hoje:** duplicar é insert no navegador e não copia variantes (`HOOK:137-147`); excluir é `DELETE` físico que apaga versões e variantes e zera `talkx_campaigns.template_id` e `talkx_recipients.variant_id` (`HOOK:128-135`; `supabase/migrations/20260908120000_talkx_segments_templates_events.sql:71`; `20260909150000_talkx_template_variants_ab.sql:6,18`); variantes são gravadas uma a uma, sem soma obrigatória (`HOOK:193-203`; CHECK `weight` 1–100 no catálogo); não existe importação nem exportação (grep `csv|import` em `TPL`/`EDT`/`HOOK` → 0).
- **Fazer:** Migration com: `save_talkx_template_variants(p_template_id, p_expected_updated_at, p_variants jsonb)` — grava o conjunto numa transação (0, 2 ou 3 variantes; exatamente um controle com o conteúdo do template; soma dos pesos = 100; preserva o `id` das existentes; recusa remover variante com destinatários: `talkx_variant_in_use`). `duplicate_talkx_template(p_template_id)` — cópia em `draft` com mídia, interativo, variáveis, tags e variantes. `archive_talkx_template(p_template_id, p_archive)`. Trigger `guard_talkx_template_delete` — recusa (`talkx_template_in_use`) excluir template citado por campanha ou com variante usada por destinatário. `import_talkx_templates(p_items jsonb, p_on_conflict)` — até 500 itens, conflito por nome com `skip|overwrite|copy`, cada item validado como em X084, retorno por item (`created|updated|skipped|invalid` + motivo). `log_talkx_template_export(p_count, p_format)`. Todas exigem admin/supervisor (A12); importar e exportar exigem também `profiles.can_download` (A14). Cada uma grava evento com ator em `talkx_campaign_events` (`entity_type='template'`); incluir os tipos `template_duplicated`, `template_archived`, `template_unarchived`, `template_deleted`, `template_imported`, `template_exported` no CHECK de `supabase/migrations/20260929730000_talkx_events_contract_v11.sql:31-37` e em `scripts/db-audit/talkx-events-contract.test.sh`.
- **Aceite:** teste novo `scripts/db-audit/talkx-template-library-ops.test.sh`: pesos somando 90 → `talkx_variants_weight_sum`; dois controles → erro; duplicar template com 2 variantes → cópia com 2 variantes e `use_count=0`; excluir template usado por campanha → `talkx_template_in_use`, arquivar funciona; importar 3 itens com 1 conflito em cada modo → retornos esperados; agente → `42501` em todas; usuário sem `can_download` → `42501` em importar/exportar; 1 evento por operação com `actor_id`. `talkx-events-contract.test.sh` verde.
- **V3:** V64 (banco), V68 (gravação e soma das variantes)
- **Negócio:** template que já foi usado deixa de poder ser apagado por engano — passa a ser arquivado; duplicar leva junto as variações.

### X086 · Criar RPCs de métricas de template: desempenho, usos, KPIs da biblioteca e sugestões

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X021, X028, X030, X041, X066, X083
- **Fecha:** parte de banco de T04-008, T04-010, T04-011, T04-012, T04-013, T04-039, T04-044, T04-046…T04-049, T05-007, T05-010, T05-011, T05-013, T05-014, T05-058…T05-066, T05-076 (a tela fecha em X091, X092, X094)
- **Dependências, em detalhe:** X083 ; CAP-016 e CAP-018 (entregue e resposta gravados) ; CAP-026 (opt-out com `campaign_id`) ; CAP-065, CAP-067 (conversões registradas e legíveis) ; CAP-078 (`approved_at`)
- **Hoje:** só existem a view `talkx_campaign_metrics` e `talkx_benchmarks()` com janela fixa de 90 dias, sem período anterior, `by_template` ordenado por entrega (`supabase/migrations/20260916150000_talkx_e89_benchmarks.sql:4-98`); nenhuma função por `template_id` + período; o editor mostra `use_count` com o rótulo "Envios" e "—" nas outras três métricas (`EDT:541-549`).
- **Fazer:** Migration com quatro funções `SECURITY DEFINER`, `search_path` fixo, `EXECUTE` só para `authenticated`, checagem de admin/supervisor e retorno só de agregados. `talkx_template_stats(p_template_id, p_from, p_to)`: enviados, respostas, conversões, opt-outs, as três taxas das definições do topo deste arquivo, os mesmos valores do período anterior de igual duração e a variação (nula abaixo da base mínima). `talkx_template_usage()`: por template, campanhas, mensagens enviadas e último uso. `talkx_template_library_stats(p_days, p_top)`: total, aprovados e aprovações no período × anterior, criados no mês × mês anterior, com mídia, série de 8 pontos para cada KPI, mais usado (por mensagens) com série, taxa média de resposta atual e anterior, melhor taxa (template + versão atual = `max(version_number)+1`), ranking por taxa de resposta com `media_url`, e `personalization_lift_pct` (resposta de templates com variável × sem, só com ≥ 200 enviados em cada grupo). `talkx_template_suggestions()`: regras fixas com ação — categoria sem template aprovado; data comercial em até 45 dias sem template `sazonal` recente; template com ≥ 200 enviados, resposta abaixo da média e sem variação A/B; template em revisão há mais de 3 dias. Não altera `talkx_benchmarks()` (CAP-083, trilha de supressão e analytics).
- **Aceite:** teste novo `scripts/db-audit/talkx-template-stats.test.sh` com fixture (2 templates, 3 campanhas, 120 destinatários em dois períodos, 6 respostas, 2 conversões, 3 opt-outs com `campaign_id`): valores exatos de enviados e das três taxas, variação preenchida; com 10 enviados a variação vem nula; banco sem campanha → zeros/nulos sem erro; agente → `42501`; `anon` sem `EXECUTE`. Em produção, `select talkx_template_library_stats(30, 3)` devolve taxa nula (0 campanhas hoje).
- **V3:** V69 (parte de templates)
- **Negócio:** os números de resposta, conversão e rejeição de cada template passam a ter cálculo único no servidor, com período.

### X087 · Extrair `TalkXMessageEditor` único para template e wizard, com variáveis e validação

- **Fase:** 8 · **Tela:** 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X020, X022, X055
- **Fecha:** T05-037, T05-038, T05-042, T05-043, T05-044, T05-047, T05-048 (e os resíduos de T05-045 e T05-049)
- **Dependências, em detalhe:** kit A17 (trilha do kit) ; CAP-074 (sintaxe `{{var|padrão}}` no envio) ; CAP-075 (`{{data}}`, `{{telefone}}` no envio) ; CAP-076 (`{{link}}`)
- **Hoje:** o editor de template é um `Textarea` com barra de 3 botões e chips (`EDT:301-341`), sem lista numerada, emoji (`Smile` importado sem uso, `EDT:3`) nem link; o wizard usa outro `Textarea`, sem barra (`WIZ:341-344`); `VARIABLE_KEYS` tem 5 chaves, sem `data` e `telefone` (`SH:79`); `extractVariables` só casa `[a-z_]` (`SH:143-147`); não há valor padrão nem aviso de variável desconhecida.
- **Fazer:** Criar `src/components/talkx/TalkXMessageEditor.tsx` e `src/components/talkx/talkxVariables.ts` (catálogo de variáveis, `extractVariables` aceitando acento, dígito e `|padrão`). O componente tem: barra com negrito, itálico, lista, lista numerada, emoji (`src/components/ui/emoji-picker.tsx`) e link; "Inserir variável" como menu único (nativas + próprias) que insere no cursor; destaque de `{{var}}` por camada sobre o texto; contador com limite por prop (1024 no template) que bloqueia o salvar ao estourar; aviso em âmbar para variável que não é nativa nem própria. Painel "Variáveis": chips das disponíveis, "+ Adicionar variável" (grava `custom_variables`) e, por variável usada, campo "Valor padrão" que reescreve o trecho como `{{var|padrão}}` — o padrão viaja no texto, sem coluna nova. `data` e `telefone` entram no catálogo e na prévia junto com o deploy de CAP-075. `personalizePreview` (`SH:101-141`) resolve as mesmas chaves e o padrão. Trocar `EDT:301-341,365-407` e `WIZ:341-344` pelo componente.
- **Aceite:** `src/components/talkx/__tests__/TalkXMessageEditor.test.tsx`: inserir variável no cursor; negrito envolve a seleção; lista numerada; link; 1025 caracteres bloqueia; `{{nmoe}}` gera aviso; padrão "cliente" em `nome` produz `{{nome|cliente}}`. `talkxSharedPersonalizePreview.test.ts` ampliado para os ≥ 12 casos do fixture de paridade com `personalize()` (arquivo compartilhado com o teste Deno de CAP-074/CAP-075; se ainda não existir, esta PR cria o JSON). Teste que template e wizard renderizam o mesmo `data-testid="talkx-message-editor"`.
- **V3:** V26, V65
- **Negócio:** escrever a mensagem fica igual no template e na campanha, com aviso quando uma variável está errada e texto reserva para contato sem o dado.

### X088 · Criar `TalkXMessagePreview` fiel ao WhatsApp com mídia, interativo e tela cheia

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X061, X083, X087
- **Fecha:** T05-068, T05-069, T05-070, T05-071, T05-072
- **Dependências, em detalhe:** X083 ; X087 ; kit A17 (modal) ; CAP-059 (URL assinada para ler mídia do bucket no navegador)
- **Hoje:** `PhoneFrame` tem fundo escuro e bolha verde à direita, imagem dentro da mesma bolha com no máximo 64 px, vídeo/documento/áudio como "📎 tipo", nome fixo "Sua Empresa" (`SH:302-352`); `*negrito*` e `_itálico_` não são renderizados; não há tela cheia (grep `tela cheia|fullscreen` em `EDT` → 0); a prévia some abaixo de `xl` (`EDT:487`).
- **Fazer:** Criar `src/components/talkx/TalkXMessagePreview.tsx` com dois usos — bolha (cartão) e moldura (editor) — e manter `WhatsAppBubble`/`PhoneFrame` como reexport para não quebrar wizard e tela Agendada. Renderiza negrito, itálico, tachado, listas e link; modo `raw` (variáveis cruas destacadas) e modo `resolved` (valor em negrito, nome completo do contato de amostra). Mídia por tipo: imagem como mensagem separada na proporção do arquivo, com hora e ✓✓; vídeo com quadro e ícone; documento com `media_file_name` e tamanho; áudio com barra e aviso de que o texto não é enviado junto (`SEND:96-101`). Botões e enquete a partir de `interactive`. Moldura em tema claro do WhatsApp por tokens em `src/styles/tokens.css` (sem cor literal), cabeçalho com nome e avatar da conexão (`whatsapp_connections`), "Online" e ícones. "Ver em tela cheia" abre o modal do kit. Hook `useTalkXMediaUrl(path)` devolve URL assinada para caminho de bucket e a própria URL para `https://`.
- **Aceite:** `__tests__/TalkXMessagePreview.test.tsx`: `*a*` vira `<strong>`; `{{nome}}` cru no modo `raw` e "João Silva" em negrito no `resolved`; documento mostra o nome do arquivo; 2 botões e enquete de 4 opções aparecem; tela cheia abre e fecha por teclado. Print 1672×941 do editor ao lado do recorte da prévia do mock 05 em `docs/talkx/screens/05/`.
- **V3:** V28 (prévia), V61 (bolha do cartão)
- **Negócio:** a prévia passa a mostrar a mensagem como o cliente vê no WhatsApp, inclusive imagem, botão e enquete, e abre em tela cheia.

### X089 · Refazer a galeria do mock 04: cartão fiel, filtros, lista, paginação e estados

- **Fase:** 8 · **Tela:** 04 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X026, X055, X061, X083, X086, X087, X088
- **Fecha:** T04-016, T04-018, T04-020, T04-021, T04-022, T04-023, T04-024, T04-025, T04-029, T04-030, T04-031, T04-037, T04-054 (e os resíduos de T04-019, T04-034, T04-035)
- **Dependências, em detalhe:** X083 ; X086 (`talkx_template_usage`) ; X087 ; X088 ; kit A17 ; CAP-059 (miniatura de mídia do bucket) ; CAP-079
- **Hoje:** grade de no máximo 3 colunas (`TPL:124`); cartão com bolha própria, corte seco em 140 caracteres, "Agora ✓✓" fixo e mídia como "📎 tipo" (`TPL:219-224`); sem contagem de variáveis nem data (`fmtDateTime` importado sem uso, `TPL:20`); filtros só de categoria e status (`TPL:110-113`); página fixa em 8, troca de tamanho vazia e sem voltar à página 1 ao filtrar (`TPL:34,69-77,142`); erro de leitura aparece como "Nenhum template criado" (`TPL:125-127`, `HOOK:222`); estado de editor antigo sem uso (`TPL:41-67`).
- **Fazer:** Em `TPL`: apagar o editor morto e os imports sem uso; grade `xl:grid-cols-4`. Cartão: ícone do WhatsApp (canal), bolha de X088 em modo `raw` com miniatura da mídia em proporção larga (uma mídia por template), hora de `updated_at`, nome, chips (categoria + até 2 tags, "+N"), "N variáveis: {{a}}, {{b}}, …", "Atualizado em …", status, "N usos" = mensagens enviadas (tooltip com nº de campanhas), "Usar template" desabilitado com motivo quando não aprovado ou arquivado (A8). Filtros: categoria, canal (valores de `channel`), status (mais "Arquivados"), equipe (`departments` pelo `profiles.department_id` do autor; só equipes com template), busca. Modo lista com `TemplateListItem` (ícone, nome, descrição, selo, tags), reaproveitado em X094; preferência grade/lista em `localStorage` com try/catch. Paginação 12/24/48 que volta à página 1 ao filtrar. Estados do kit: carregando, vazio, sem resultado, erro com "Tentar de novo". Assinar realtime de `talkx_templates` para invalidar a lista. Atualizar o placeholder conferido em `e2e/talkx.spec.ts:98`.
- **Aceite:** `__tests__/TalkXTemplates.gallery.test.tsx`: filtro por canal, equipe e status; filtrar na página 2 volta à 1; falha de leitura mostra o estado de erro; cartão com `{{nome}}`, `{{empresa}}`, `{{última_compra}}` mostra "3 variáveis: …"; "Usar template" desabilitado em rascunho; "usos" vem de `talkx_template_usage`, não de `use_count`. Print 1672×941 da tela 04 ao lado do mock em `docs/talkx/screens/04/`.
- **V3:** V61
- **Negócio:** a biblioteca mostra cada template como no desenho — mensagem, imagem, variáveis, data e usos reais — e filtra por canal e equipe.

### X090 · Unificar ações de template (menu ⋮, duplicar, testar, arquivar, excluir) e aprovação

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X066, X067, X085, X089
- **Fecha:** T04-033, T04-036, T05-028, T05-035 (e o resíduo de T05-027)
- **Dependências, em detalhe:** X085 ; X089 ; kit A17 (modais, `RowActionsMenu`) ; CAP-057 (`action=test` com conexão, limite, trilha e URL assinada) ; CAP-078 (RPC de aprovação com papel, `approved_by/at`)
- **Hoje:** cartão com 3 botões soltos, sem Testar nem Arquivar (`TPL:240-242`; `RowActionsMenu` existe e não é usado aqui, `SH:561`); `AlertDialog` solto para excluir (`TPL:167-172`) e `window.confirm` nas variantes (`EDT:459,509`); status é select livre com padrão `approved`, sem aprovador (`EDT:39,292-298`); "Testar" usa a 1ª conexão `connected`, contato fictício e não avisa o agente que receberá 403 (`EDT:142-155,558-572`; `SEND:150-210`); nenhum gate de papel nos componentes (grep `useUserRole` em `src/components/talkx` → 0).
- **Fazer:** Criar `useTalkXTemplateActions.ts`, `TalkXTemplateActionsMenu.tsx`, `TalkXTemplateTestDialog.tsx` e `TalkXTemplateStatusControl.tsx`, usados no cartão, na lista, na biblioteca lateral e no cabeçalho do editor. Menu: Editar; Duplicar (`duplicate_talkx_template`, abre a cópia); Testar; Arquivar/Desarquivar; Excluir (modal do kit; em `talkx_template_in_use` oferece Arquivar). Testar: escolha da conexão `connected`, número preenchido com `profiles.phone`, escolha da variante quando houver, resultado na própria janela, mensagens para 403 e 429. Aprovação: autor vê "Enviar para revisão"; admin/supervisor vê "Aprovar" e "Devolver" com motivo; a tela mostra quem aprovou e quando; o select livre sai. Ações que exigem papel ficam ocultas para agente (`src/hooks/system/useUserRole.ts`).
- **Aceite:** `__tests__/TalkXTemplateActions.test.tsx`: duplicar chama a RPC e abre a cópia; excluir com `talkx_template_in_use` mostra a oferta de arquivar; agente não vê Testar nem Aprovar; aprovar troca o selo e mostra o aprovador. Grep `window.confirm|AlertDialog` em `TPL`/`EDT` → 0. Envio real: teste pelo modal, com conexão escolhida, para número interno → mensagem recebida e 1 linha nova em `talkx_test_sends` (CAP-057).
- **V3:** V61 (menu ⋮), V67 (parte de tela)
- **Negócio:** qualquer template pode ser testado no celular pela conexão escolhida, arquivado em vez de apagado, e só entra em campanha depois de aprovado por admin ou supervisor.

### X091 · Ligar KPIs das telas 04 e 05, "Desempenho deste template" e "Em andamento" às RPCs

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X021, X030, X041, X055, X066, X086
- **Fecha:** T04-008, T04-010, T04-011, T04-012, T04-013, T05-005, T05-006, T05-007, T05-008, T05-009, T05-010, T05-011, T05-012, T05-013, T05-014, T05-057, T05-058, T05-059, T05-060, T05-061, T05-062, T05-063, T05-064, T05-065, T05-066
- **Dependências, em detalhe:** X086 ; kit A17 (KPI e estado "sem dados ainda") ; CAP-026 ; CAP-065, CAP-067 ; CAP-078
- **Hoje:** os 4 KPIs da tela 04 saem de contas no navegador, sem série (`bars={null} chart="none"`), com "Templates com mídia" no lugar da taxa de resposta (`TPL:104-107`); o editor não tem faixa de KPIs (retorna antes, `TPL:89-98`); "Desempenho" só aparece em `xl`, só quando aberto por "Editar", usa a prop `editing` e rotula `use_count` como "Envios" (`EDT:540-549`); o único indicador de campanha em envio é "Ao vivo" (`VIEW:245-249`).
- **Fazer:** Hooks `useTalkXTemplateLibraryStats` e `useTalkXTemplateStats(templateId, dias)`. Tela 04: Total de templates (série de criação), Aprovados (variação de aprovações no período), Mais usados (nome como valor, série de usos), Taxa média de resposta (valor e variação em p.p.). Tela 05: Total de Templates ("% vs. mês anterior"), Templates aprovados ("% do total"), Melhor Taxa de Resposta ("Template: <nome> vN"), Templates com Mídia ("% do total"), 4 séries. Card "Desempenho deste template": seletor 7/30/90 dias, Envios, Taxa de resposta, Taxa de conversão, Taxa de rejeição (tooltip com a definição), variações; acompanha o template ativo e aparece em qualquer largura. Widget "Em andamento": campanha em `sending` mais recente, "Iniciada às HH:mm" de `started_at`, clique abre o monitor; sem campanha em envio, não aparece. Valor nulo → "sem dados ainda"; variação nula → sem seta.
- **Aceite:** `__tests__/TalkXTemplateKpis.test.tsx` com RPC simulada: taxa nula → "sem dados ainda"; com dado → "28,6%" e "↑ 4,3 p.p."; trocar de template na biblioteca troca os números do card; "Envios" nunca lê `use_count`; mudar o período muda os argumentos da chamada. Em produção hoje (0 campanhas) as telas mostram totais reais e "sem dados ainda" nas taxas. Prints 04 e 05.
- **V3:** V69, V61 (KPIs)
- **Negócio:** os números do topo e do desempenho de cada template passam a vir do que foi realmente enviado e respondido; sem campanha, a tela diz que ainda não há dados em vez de mostrar número inventado.

### X092 · Montar o painel lateral da tela 04: Mais convertidos, Sugestões e Ações rápidas

- **Fase:** 8 · **Tela:** 04 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X076, X085, X086, X090, X091
- **Fecha:** T04-038, T04-039, T04-040, T04-042, T04-044, T04-045, T04-046, T04-047, T04-048, T04-049, T04-051, T04-052
- **Dependências, em detalhe:** X085 ; X086 ; X090 ; X091 ; kit A17 (`HeroCard`, `RailAction`) ; CAP-086 (geração de rascunho de template por `ai-proxy`, atrás de `talkx_settings.ai_insights`)
- **Hoje:** o painel é um `RailCard` "Mais usados" ordenado por `use_count` (`TPL:146-155`); "Criar template — Do zero ou com IA" só cria do zero (`TPL:158`); "Duplicar template" abre o original para edição, ou um template em branco (`TPL:159`); não há sugestões (grep `Sugest` em `TPL` → 0).
- **Fazer:** `HeroCard` (`SH:701`) com o texto do mock. "Mais convertidos": 3 primeiros por taxa de resposta, com miniatura, "↑ N% de resposta" e menu ⋮ de X090; "Ver todos" abre a galeria em lista ordenada por taxa de resposta; sem base mínima, "sem dados ainda" (não troca por "mais usados" sob o mesmo título). "Sugestões": itens de `talkx_template_suggestions()`, cada um com botão que executa a ação (abrir editor novo na categoria, abrir a aba A/B do template, abrir o template em revisão); "Ver todas" abre a lista completa no modal do kit; o título vira "Sugestões da IA" só com `ai_insights` ligado. Ações rápidas: "Criar template" com duas opções — do zero, e com IA quando a chave está ligada (janela com objetivo, categoria e tom → rascunho abre no editor; nada é salvo sem o usuário salvar); "Duplicar template" abre seletor de origem e chama `duplicate_talkx_template`; "Importar templates" abre X093.
- **Aceite:** `__tests__/TalkXTemplatesRail.test.tsx`: "Duplicar template" sem seleção abre o seletor e chama a RPC (nunca abre o original); com `ai_insights=false` não há chamada a `ai-proxy` e nenhum texto cita IA; sugestão de A/B abre a aba A/B do template certo; "Mais convertidos" sem base mostra "sem dados ainda". Com a chave ligada em homologação: gerar 1 rascunho e conferir o registro de custo de CAP-086.
- **V3:** V62
- **Negócio:** o painel passa a recomendar com base em regra e resultado real, e "duplicar" duplica de fato.

### X093 · Importar e exportar templates em CSV ou JSON com prévia, conflitos e trilha

- **Fase:** 8 · **Tela:** 04 · **Camada:** front + testes + docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X085, X087
- **Fecha:** T04-053
- **Dependências, em detalhe:** X085 ; X087 (validação de variável) ; kit A17 (modal, tabela) ; A14 (`profiles.can_download`)
- **Hoje:** não existe (grep `-i "csv|FileReader|Importar|Exportar"` em `TPL`, `EDT`, `HOOK` → 0; painel só com Criar e Duplicar, `TPL:156-162`).
- **Fazer:** Criar `src/components/talkx/talkxTemplateFile.ts` (leitura de JSON e CSV; escrita com neutralização de célula iniciada por `=`, `+`, `-`, `@`) e `TalkXTemplateImportDialog.tsx`: área de soltar arquivo, limite de 500 linhas e 2 MB, prévia por linha com problemas (nome duplicado, mais de 1024 caracteres, variável desconhecida, categoria inexistente, mídia fora do padrão), decisão de conflito por linha ou em lote (pular, sobrescrever, criar cópia), resultado por item vindo de `import_talkx_templates`. Exportar a seleção ou o filtro atual em JSON ou CSV, chamando `log_talkx_template_export`. Só admin/supervisor com `can_download` (`src/hooks/system/useDownloadPermission.ts`); para os demais a ação fica desabilitada com o motivo. `docs/talkx/IMPORT_TEMPLATES.md` com o formato e um arquivo-modelo.
- **Aceite:** `__tests__/talkxTemplateFile.test.ts`: CSV com aspas, quebra de linha e `;`; JSON inválido; célula `=cmd` sai neutralizada. `__tests__/TalkXTemplateImportDialog.test.tsx`: 3 itens com 1 conflito resolvido de cada forma → contagem certa. No banco: 1 evento `template_imported` e 1 `template_exported` com `actor_id`; usuário sem `can_download` não aciona e a RPC responde `42501`.
- **V3:** V64
- **Negócio:** dá para trazer uma planilha de mensagens prontas e levar a biblioteca para fora, com registro de quem fez.

### X094 · Encaixar a tela 05 no shell: rota, cabeçalho, sub-abas, biblioteca lateral e campos

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X083, X086, X089, X090, X091
- **Fecha:** T04-001, T04-003, T04-006, T05-001, T05-002, T05-003, T05-004, T05-015, T05-017, T05-018, T05-019, T05-021, T05-022, T05-023, T05-024, T05-030, T05-076, T05-077 (e os resíduos de T05-026, T05-034, T05-074)
- **Dependências, em detalhe:** X083 ; X086 (`personalization_lift_pct`) ; X089 (`TemplateListItem`) ; X090 ; X091 ; kit A17 ; A1
- **Hoje:** o editor é um modo interno sem URL (`TPL:35,89-98`; `VIEW:36`); o item de template do ⌘K só abre o módulo (`src/hooks/integrations/useTalkXCommandItems.ts:50-58`); botão de ajuda só com ícone (`VIEW:251-256`); sem breadcrumb, cabeçalho "Templates" nem "+ Novo Template" no editor; biblioteca lateral com chips sem contagem, 10 categorias fixas, busca só por nome e categoria, item com ponto colorido (`EDT:176-181,186-244`); A/B e Histórico são blocos recolhíveis só em `xl` (`EDT:487-539`); descrição existe no estado e não tem campo (`EDT:33,91`); título usa a prop `editing` (`EDT:263`); `TEMPLATE_CATEGORIES` sem "suporte" (`SH:69-71`).
- **Fazer:** `src/components/talkx/talkxTemplateRoute.ts` (modelo de `talkxWizardRoute.ts:61-66`): `tab=templates`, `template=<id|new>`, `ttab=conteudo|ab|historico`; `VIEW` lê e escreve; o item de template do ⌘K abre o template; seta na aba Templates com "Biblioteca" e "Criar e editar"; botão "Ajuda" com rótulo. Cabeçalho do editor dentro do shell: breadcrumb "Talk X › Campanhas › Templates", ícone + "Templates" + subtítulo, busca "Buscar templates, categorias ou tags…" (⌘K foca; procura em nome, categoria, tags e conteúdo), "+ Novo Template". Sub-abas Conteúdo · Variações A/B · Histórico de Versões em qualquer largura (o conteúdo das duas últimas chega em X097 e X098). Biblioteca lateral: título e subtítulo do mock, busca, botão de filtro (status e canal), chips "Todos (N)" + categorias existentes com contagem, item `TemplateListItem` com menu ⋮. Campos: descrição, ícone (emoji; padrão por categoria), categoria "suporte", tags abaixo da prévia, `TipCard` "Dica" (`SH:757`) — o percentual só aparece quando `personalization_lift_pct` vier preenchido. Modo novo: `template=new`, rascunho, e as abas A/B, Histórico e o Desempenho com "salve o template primeiro"; título segue o template ativo.
- **Aceite:** `__tests__/talkxTemplateRoute.test.ts` e `TalkXView.route.test.tsx`: URL com `template=<id>` abre o editor nesse template e `ttab=ab` abre a aba; item do ⌘K abre o editor; chips mostram a contagem real e somem para categoria vazia; busca por tag encontra; sub-abas acessíveis em 1280 e 390 px; `TipCard` sem número quando a RPC devolve nulo. Print 1672×941 da tela 05 ao lado do mock.
- **V3:** V63 (sub-abas), V45/V47 (seta da aba e ⌘K)
- **Negócio:** a tela de edição ganha endereço próprio (dá para mandar o link de um template), a busca acha por tag e as três abas funcionam em qualquer tela.

### X095 · Trocar o campo de URL por envio de arquivo com validação de 16 MB e metadados

- **Fase:** 8 · **Tela:** 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X061, X062, X067, X083, X088, X094
- **Fecha:** T05-051, T05-052, T05-053, T05-054, T05-055, T05-056
- **Dependências, em detalhe:** X083 ; X088 ; X094 ; CAP-059 (bucket `talkx-media`, policies, tipos, 16 MB) ; CAP-058 (URL assinada e nome do arquivo no envio) ; CAP-057 (teste com mídia do bucket)
- **Hoje:** mídia é um campo de texto com URL `https://` (`EDT:361`, validação em `EDT:85-88`); nenhum `<input type="file">`, área de soltar ou `storage.upload` em `src/components/talkx` (grep → 0); não há nome, dimensão nem tamanho do arquivo; escolher "Áudio" faz o texto não ser enviado sem aviso (`EDT:348`, `SEND:96-101`).
- **Fazer:** `src/components/talkx/useTalkXMediaUpload.ts` e `TalkXMediaDropzone.tsx`: arrastar ou escolher arquivo; recusar antes do envio tipo fora da lista de CAP-059 e arquivo acima de 16 MB; progresso e cancelar; ler dimensões de imagem e vídeo no navegador; gravar `media_url` com o caminho no bucket e `media_file_name`, `media_type`, `media_size_bytes`, `media_width`, `media_height`. Linha do arquivo como no mock: miniatura, nome, "1920 x 1080 • 245 KB", ✕. Área "Adicionar mídia — Imagem, vídeo ou documento (até 16MB)". "Usar link" fica como opção secundária para templates antigos com URL. Aviso fixo quando o tipo é áudio. Trocar ou remover antes de salvar apaga o arquivo enviado e não usado. `isDirty` cobre os campos novos. O componente é exportado para o wizard usar.
- **Aceite:** `__tests__/TalkXMediaDropzone.test.tsx`: arquivo de 17 MB e `.exe` recusados sem chamada ao storage; upload simulado preenche os 6 campos; ✕ limpa os 6. Real: subir JPG, PDF e MP4, salvar, e "Testar" para número interno — a mídia chega (o PDF com o nome do arquivo); conferir o objeto em `storage.objects` (`bucket_id='talkx-media'`) e os metadados em `talkx_templates`.
- **V3:** V27 (tela), V63 (área de soltar)
- **Negócio:** anexar imagem, vídeo ou PDF passa a ser arrastar o arquivo, com nome, tamanho e miniatura visíveis.

### X096 · Adicionar botões e enquete à mensagem do template, com texto reserva e teste real

- **Fase:** 8 · **Tela:** 04, 05 · **Camada:** front + testes + docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X064, X083, X088, X090
- **Fecha:** T04-026, T04-027
- **Dependências, em detalhe:** X083 ; X088 ; X090 (Testar) ; CAP-060 (envio de botões e enquete por `talkx-send`, com fallback) ; A7
- **Hoje:** template não tem botões nem enquete (grep `poll|enquete|button|cta` em `TPL`, `EDT`, `HOOK` → 0); a Evolution GO traduz `/send/button` e `/send/poll` (`supabase/functions/_shared/evolution-go-routes.ts:109-125`), mas `talkx-send` não chama (`SEND:646-667`).
- **Fazer:** `src/components/talkx/TalkXInteractiveEditor.tsx` na aba Conteúdo: seletor "Nenhum · Botões · Enquete". Botões: até 3, resposta rápida ou link (rótulo até 20, URL `https`). Enquete: pergunta e 2 a 12 opções, com atalho "Satisfação (4 emojis)". Mesma validação de `talkx_validate_interactive`; grava em `interactive` pelo `save_talkx_template`. Mostrar o texto reserva que o cliente recebe quando o aparelho não exibe o recurso (texto + link). Cartão e prévia exibem pelo componente de X088. Registrar o resultado dos testes reais em `docs/talkx/screens/05/interativo.md`.
- **Aceite:** `__tests__/TalkXInteractiveEditor.test.tsx`: 4º botão bloqueado; enquete com 1 opção inválida; o JSON salvo passa na validação do banco. Envio real (A7): um template com botão "Ver catálogo" e um com enquete de satisfação enviados pelo "Testar" a dois números internos (Android e iPhone); anotar o que cada aparelho mostrou; onde não exibiu, conferir que chegou o texto reserva com o link; conferir as linhas em `talkx_test_sends`.
- **V3:** —
- **Negócio:** o template pode levar botão ("Ver catálogo") ou enquete de satisfação, e fica documentado em quais celulares isso aparece.

### X097 · Construir a aba Variações A/B: lado a lado, pesos em 100, resultado e vencedora

- **Fase:** 8 · **Tela:** 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X065, X085, X087, X088, X090, X094
- **Fecha:** T05-031
- **Dependências, em detalhe:** X085 ; X087 ; X088 ; X090 ; X094 ; CAP-069 (sorteio e precedência) ; CAP-070 (resultado por variante) ; CAP-071 (vencedora)
- **Hoje:** a UI de variantes existe duas vezes (`EDT:437-484` e `EDT:495-521`), salva no blur sem retorno, só avisa quando a soma não é 100 (`EDT:477-479,518`), cria a variante A como cópia do texto com mídia nula (`EDT:471,515`); com variante, o envio ignora o texto-base e o texto revisado na campanha (`SEND:500-504`); o resultado por variante da RPC não tem consumidor.
- **Fazer:** `src/components/talkx/TalkXTemplateVariants.tsx` substitui os dois blocos. Colunas lado a lado: Controle (o texto-base, editado na aba Conteúdo) e B, opcionalmente C, cada uma com `TalkXMessageEditor`, mídia e prévia. Pesos com ajuste automático para somar 100 e "Dividir igualmente"; salvar explícito do conjunto por `save_talkx_template_variants`. Faixa fixa com a regra em uma frase: o texto-base é o controle e entra no sorteio; campanha com texto alterado no wizard não sorteia variação. Resultado por variante (destinatários, enviadas, entregues, respostas, taxa) com "sem dados ainda". "Declarar vencedora": janela que explica o efeito (o conteúdo vencedor vira o texto-base, o teste encerra, a atribuição dos envios fica); sem ressalva só com ≥ 100 enviadas por variante, abaixo disso exige marcar "sem base suficiente". "Testar" por variante usa o modal de X090.
- **Aceite:** `__tests__/TalkXTemplateVariants.test.tsx`: mudar B para 70 leva o controle a 30; soma ≠ 100 nunca chega à RPC; remover variante com destinatários mostra a mensagem de `talkx_variant_in_use`; resultado simulado de CAP-070 aparece por coluna; "Declarar vencedora" bloqueada abaixo de 100 sem a marcação. Grep `saveVariant(` no blur em `EDT` → 0. Em homologação, após salvar pela tela: soma de `weight` = 100 e exatamente 1 `is_control` para o template.
- **V3:** V68
- **Negócio:** dá para comparar duas ou três versões da mensagem lado a lado, ver qual responde mais e adotar a vencedora com um clique.

### X098 · Salvar com nota e atalho, proteger alterações e construir a aba Histórico de Versões

- **Fase:** 8 · **Tela:** 05 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X055, X084, X094
- **Fecha:** T05-032 (e o resíduo de T05-029)
- **Dependências, em detalhe:** X084 ; X094 ; kit A17 (modal de confirmação)
- **Hoje:** criar vai por insert direto e atualizar por `update_talkx_template_with_snapshot` (`HOOK:77-87,109-112`); ⌘S e ⌘Enter só funcionam com foco no texto (`EDT:326-329`); erro de save só vai para o console (`EDT:104-106`); troca de template e "Voltar" usam `window.confirm`/`confirm` (`EDT:111,253`) e nada protege a troca de aba do módulo ou o fechamento do navegador; histórico só em `xl`, 10 últimas, sem autor, nota ou comparação, e "restaurar" só preenche o formulário (`EDT:166-174,522-538`).
- **Fazer:** `HOOK`: criar e atualizar por `save_talkx_template`; versões por `list_talkx_template_versions`; restaurar por `restore_talkx_template_version`. Salvar: campo opcional "Nota da versão" quando o conteúdo mudou; ⌘S/Ctrl+S salva e ⌘Enter salva e fecha, com escuta no formulário inteiro; erro aparece na tela com a mensagem de `templateUpdateErrorMessage` (`HOOK:35-51`). Alterações não salvas: modal do kit ao trocar de template, de aba do módulo ou voltar, e `beforeunload`. Aba Histórico (`TalkXTemplateHistory.tsx`): lista paginada com vN, data, autor e nota, aviso do limite de 50; "Comparar" duas versões ou versão × atual, com diferença por linha (+/−) e lista de campos alterados (mídia, interativo, variáveis); "Restaurar" com confirmação; selo `vN` no cabeçalho do editor.
- **Aceite:** `__tests__/TalkXTemplateHistory.test.tsx` e `TalkXTemplateEditor.save.test.tsx`: ⌘S com foco em "Nome" salva; falha de save mostra a mensagem; comparação mostra linha removida e adicionada; restaurar chama a RPC e recarrega. Caso novo em `e2e/talkx.spec.ts`: criar template → mudar o texto com nota → Histórico mostra v1 com nota e autor → restaurar. No banco: salvar só tags não aumenta `count(*)` de `talkx_template_versions` do template. Grep `confirm(` em `EDT` → 0.
- **V3:** V66, V63 (atalhos)
- **Negócio:** salvar funciona pelo teclado, o sistema avisa antes de perder alteração, e o histórico mostra quem mudou o quê, com comparação e volta a qualquer versão.

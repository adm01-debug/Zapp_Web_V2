# Caminhos a resgatar (38)

Trabalho de outro agente que a `main` nao tem. **Nao feche a branch de origem destes.**

Parte do laudo de adjudicacao de 17/11/2026 — indice e metodo em `docs/audits/ADJUDICACAO-233-CAMINHOS-2026-11-17.md`.

Cada item cita a evidencia lida no codigo (`arquivo:linha` ou saida de comando). Os vereditos vieram de sete adjudicadores (um por lote) e passaram por quatro refutadores, instruidos a DERRUBAR todo veredito que autorizasse apagar. Onde houve refutacao ou correcao, os dois textos ficam no item.

## front: inbox, copilot e chamadas (5)

### `src/components/inbox/ConversationMemoryPanel.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Na `main` em outro caminho: `src/components/inbox/contact-details/ConversationMemorySection.tsx:1-8`, cujo cabecalho diz "Paridade com a V3 (ConversationMemoryPanel)", com o hook `src/hooks/crm/useConversationMemory.ts` e ligada como secao `memoria` em `src/components/inbox/contact-details/sidebar/sidebarSections.ts:26`. A volta do painel esta registrada em `sidebarSections.ts:20-25` ("`memoria` ... voltaram em 2026-11-12") e provada em `src/components/inbox/contact-details/__tests__/ContactDetails.restaurados.test.tsx:7-11`. Diferenca deliberada: a versao da `main` e SOMENTE LEITURA ("Sem edicao... e leitura de tela", ConversationMemorySection.tsx:6-7); a edicao/Salvar da branch nao voltou.
- **Refutado na conferencia:** REFUTADO. A main tem apenas a METADE DE LEITURA. Fui ao arquivo:linha citado: ConversationMemorySection.tsx:1-8 existe e o proprio cabecalho diz '(somente leitura)' e 'Sem edicao, sem exportacao e sem copiar payload: e leitura de tela'; useConversationMemory.ts:4-6 repete 'e sem escrita'. E `git grep -n conversation_memory origin/main -- src/ supabase/functions/` devolve SO duas leituras (useNextBestAction.ts:84 e useConversationMemory.ts:90) + types.ts: NENHUM codigo da main escreve na tabela, em lugar algum. O arquivo da branch entrega, e a main nao tem em nenhuma forma: (1) adicionar e remover item nas 4 listas (fatos, objecoes tratadas, promessas feitas, pendencias); (2) editar os dois resumos (comercial e cumulativo); (3) botao Salvar que faz insert OU update gravando `updated_by = profileId`; (4) duas guardas de escrita — o update exige `.eq('id', ownRowId).eq('contact_id', targetContactId)` e, se o id em estado nao pertence ao contato atual, trata como ausencia em vez de gravar em contato alheio; (5) botao 'Tentar novamente' no erro de carga (a main mostra o erro e para ali). Depende apenas de `@/integrations/supabase/client`, da tabela `conversation_memory` (que existe na main, types.ts:2935, com FK `conversation_memory_updated_by_fkey`) e de sonner — da para integrar. Em linguagem de negocio: hoje o atendente LE o que o sistema lembra do contato, mas nao consegue registrar nem corrigir um fato, uma promessa ou uma pendencia; este arquivo e a tela que permite isso. A ausencia de edicao pode ter sido escolha, mas e uma escolha de ESCOPO, nao 'funcionalidade incorporada'.

### `src/components/inbox/__tests__/ConversationMemoryPanel.test.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A `main` tem a suite equivalente do componente equivalente: `src/components/inbox/contact-details/__tests__/ConversationMemorySection.test.tsx`, mais a prova de que a secao esta ligada no painel em `src/components/inbox/contact-details/__tests__/ContactDetails.restaurados.test.tsx:7-11`. O componente testado pela branch nao existe mais na `main` (virou `ConversationMemorySection.tsx`, cabecalho `:1-8`).
- **Refutado na conferencia:** REFUTADO, por consequencia do item anterior. Comparei caso a caso. A suite da main (contact-details/__tests__/ConversationMemorySection.test.tsx, 7 casos) cobre o lado de leitura e vai alem em dois pontos (corte em 5 itens, jsonb nao-textual). Mas DOIS casos da branch guardam o caminho de ESCRITA, que a main nao tem como testar porque nao tem escrita: ':135 update sempre carrega filtro por contact_id, nunca so por id' e ':150 memoria cujo contact_id nao e o atual nao e atualizada (trata como ausencia)'. Sao exatamente as guardas que impedem gravar a memoria de um contato em cima da de outro. Um terceiro, ':92 resposta atrasada de A e ignorada depois de trocar para B', tambem nao tem equivalente: a main resolve por `key={contactId}` + flag `cancelled` e o teste mais proximo (:143) prova outra coisa ('recolhida nao consulta o banco'). Se o painel for resgatado, esta suite vem com ele; descartar os dois lados apaga as guardas junto com a funcionalidade.

### `src/components/inbox/chat/CrmBadges.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Todos os quatro selos existem na `main` em `src/components/contacts/CRMContactCard.tsx`: mapa de cores do RFM em `:19`, selo Ativo/Inativo em `:47-48`, vendedor em `:70`, total de pedidos em `:71`, valor total de compras em `:72` e selo de segmento RFM em `:73`. O selo RFM tambem em `src/components/crm360/DataExplorerTable.tsx:18-22`. A empresa aparece no painel do contato em `src/components/inbox/contact-details/ContactHeaderSection.tsx:109` (`crmCompany?.nome_fantasia`), do mesmo hook `useExternalContact360` (`:85`).
- **Refutado na conferencia:** REFUTADO. A evidencia troca de TELA no meio do argumento. Este componente e consumido por `src/components/inbox/chat/ChatHeader.tsx:127` (branch) — os selos ficam no CABECALHO DA CONVERSA, visiveis durante o atendimento. Na main: (a) `src/components/inbox/chat/ChatHeader.tsx` NAO EXISTE (`git ls-tree -r origin/main | grep inbox/chat/ChatHeader` devolve so ChatHeaderToolbar.tsx); (b) NENHUM arquivo de `src/components/inbox/` renderiza esses selos — `git grep -ln "crmRfm|rfm_segment|segment_code|cliente_ativado|vendedor_nome" origin/main -- src/components/inbox/` devolve apenas useGlobalSearchData.ts e um teste de busca global, nada de UI de cabecalho. O CRMContactCard.tsx citado e a LISTA DE CONTATOS (outra tela), e ContactHeaderSection.tsx:109 so tem `crmCompany?.nome_fantasia` (nome da empresa) no painel lateral de detalhes — que exige abrir o painel. Falta tambem o tooltip com Pedidos / Ticket medio / Total compras: `ticket_medio` na main so aparece em types, em crm360TabsData.ts e em fixtures de teste, nunca renderizado no inbox. Resumo: a main faz MENOS — perde os 4 selos (empresa, vendedor, RFM com tooltip de 3 metricas, Ativo/Inativo) no lugar onde o atendente trabalha.

### `src/components/inbox/contact-details/ExternalContact360Panel.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A `main` usa o MESMO hook e distribui o mesmo conteudo nas secoes do sidebar: `src/components/inbox/contact-details/ContactHeaderSection.tsx:85` (`useExternalContact360`), `sidebar/ContactSidebarSections.tsx:30` montando `ProfessionalSection` (empresa/cargo/e-mail, `:41-107`), `PersonalSection` (redes, `:58-69`) e `SinguProfileSection` (DISC/VAK/Big Five), mais `ContactIntelligencePanel.tsx:1-11` (briefing, interacoes, score, churn, melhores horarios). O hook segue em producao: `src/hooks/crm/useExternalContact360.ts:14`.
- **Refutado na conferencia:** REFUTADO. As linhas citadas existem, mas entregam MENOS. Conferi campo por campo o que o painel da branch renderiza e procurei cada um na `main`: (a) ProfessionalSection.tsx:44-110 cobre whatsapp/e-mail/empresa/departamento/cargo e PersonalSection cobre redes — ok; (b) SinguProfileSection cobre DISC/VAK/Big Five, mas da fonte `useContactSidebar` (RPC get_contact_sidebar_by_phone), nao do payload 360; (c) o BLOCO COMPORTAMENTAL do CRM nao existe em tela nenhuma da `main`: `git grep -n 'decisionPower|formalityLevel|supportLevel|preferredChannel' origin/main -- src/` devolve SO src/types/contact360.ts:48-51 — zero consumidor de UI, enquanto a branch desenha BehaviorRadar + poder de decisao + formalidade + nivel de suporte + canal preferido + currentChallenges + competitorsUsed (linhas 70-88); (d) `contact_interactions` tambem aparece SO em src/types/contact360.ts na `main` — a InteractionsTimeline (linha 90) nao tem equivalente (ContactIntelligencePanel.tsx:1-12 mostra a CONTAGEM de interacoes no briefing, nao a linha do tempo); (e) o segmento RFM do contato (RFMBadge, linha 67) nao e exibido no painel do contato — `rfm` na `main` so aparece no explorador admin (src/components/crm360/) e nos filtros do Talk X; (f) StakeholderCard (linha 66) nao tem par: o src/components/inbox/copilot/StakeholdersCard.tsx da `main` e outra coisa (CV-039, quem foi mencionado NA CONVERSA pelo copiloto, nao o mapa de stakeholders do CRM); (g) o estado de erro explicito 'Contato nao encontrado no CRM ({searched_phone})' (linhas 36-42) nao tem equivalente — ContactHeaderSection.tsx:86 simplesmente faz `crmData?.found ? ... : null`. O hook segue vivo (src/hooks/crm/useExternalContact360.ts:14, usado em ContactHeaderSection.tsx:85), logo o dado CHEGA e e descartado. Ressalva honesta para quem decidir: na propria branch o painel nao tem render site (`git grep ExternalContact360Panel` na branch acha so o proprio arquivo e um comentario em CRMAutoSync.tsx:93), e ele depende de ./Contact360Helpers.tsx (existe na branch, nao na `main`) — resgatar exige levar o helper e ligar o painel numa secao do sidebar. 97 linhas.

### `src/components/mobile/MobileSlidePanel.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Nenhum dos tres (`SlideOverPanel`, `PinchZoom`, `LongPressMenu`) tem consumidor na propria branch nem existe na `main` (`git grep -ln` em `origin/main -- src/` = zero para os tres). Na `main` o painel lateral e `src/components/ui/sheet.tsx` (18 consumidores); o zoom de midia e por botao em `src/components/inbox/ImagePreview.tsx:130-168` (`isZoomed`, `cursor-zoom-in`); e o acesso por toque as acoes do inbox virou o padrao unico `src/components/inbox/hoverActions.ts` (`HOVER_REVEAL_TAP`, com `[@media(hover:none)]:opacity-100` e alvo minimo de 40 px — ver cabecalho `:1-29`). Ressalva: zoom por PINCA especificamente nao existe na `main` em forma nenhuma, mas era codigo sem consumidor na branch.
- **Refutado na conferencia:** REFUTADO por UMA das tres exportacoes. SlideOverPanel e coberto (src/components/ui/sheet.tsx, 18 consumidores) e LongPressMenu tem substituto de desenho na main (src/components/inbox/hoverActions.ts:1-29, conferido: `[@media(hover:none)]:opacity-100` + alvo de 40px sob `pointer: coarse`). Mas `PinchZoom` (linha 74 do arquivo da branch: gesto de pinca com minScale/maxScale sobre midia) NAO existe na main em forma nenhuma — `git grep -ln PinchZoom origin/main -- src/` = ZERO, e o unico zoom da main e um BOTAO: src/components/inbox/ImagePreview.tsx:128-137 (`setIsZoomed(!isZoomed)`, aria-label 'Ampliar imagem'). Botao nao e pinca: no celular a main faz MENOS. Nao ha guarda nem decisao registrada na main contra pinch-zoom (diferente dos casos SL-175, que tem teste travando a volta), e a propria evidencia admite a lacuna. O argumento de apoio e 'nao tinha consumidor na branch' (verdade: so reexport em MobileNavigation.tsx:8), mas isso o torna integravel, nao descartavel. Recomendo preservar o arquivo, ou ao menos o bloco PinchZoom, para integrar no ImagePreview.

## front: hooks e lib (7)

### `src/components/settings/AIAutoTagsConfig.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A função de tags de IA foi removida por decisão do dono: `src/components/inbox/contact-details/ContactFirstResponseSLA.tsx:6-7` — "a outra metade daquele bloco ("Tags geradas por IA", tabela `ai_conversation_tags`) NÃO volta: a função de tags foi removida por decisão do dono (12/10)". Reforçado por `src/components/docs/__tests__/SystemFeaturesView.test.tsx:71,80` e `src/hooks/crm/__tests__/useContactEnrichedData.test.tsx:151,158`. Nenhum arquivo de `src/components/settings/` da main consome `ai_conversation_tags`.
- **Refutado na conferencia:** REFUTADO — a premissa 'a funcao de tags de IA foi removida' e FALSA no nivel do sistema; o que saiu foi um BLOCO DE EXIBICAO no painel do contato. Na main, hoje: a edge `supabase/functions/ai-auto-tag/index.ts` esta VIVA, com `supabase/functions/ai-auto-tag/index.test.ts`, `auth.test.ts` e contrato `tests/contracts/ai-auto-tag-writes.contract.test.ts`; a tabela segue no schema (`src/integrations/supabase/types.ts`); e o front a LE em `src/services/contact.service.ts:245-250` (`ContactService.fetchAITags`: `from('ai_conversation_tags').select('id, tag_name, confidence, source')`). O comentario citado (ContactFirstResponseSLA.tsx:5-7) fala so da metade 'Tags geradas por IA' do antigo `SLAAndAITagsSection` do painel do contato — nao da funcao. E a parte que este arquivo entrega nao existe em lugar nenhum da main: painel de CONFIGURACAO com estatistica agregada por etiqueta (contagem + confianca media) e acao de re-etiquetar os 20 contatos mais recentes. `src/components/settings/` da main tem 24 arquivos (AIProvidersManager, ChatbotL1Config, CSATAutoConfig...) e nenhum cobre isso. A main faz MENOS: gera tags e as le, mas nao da ao dono como ver nem como reprocessar.

### `src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx`

- Branch de origem: `claude/feat-ui-visual-texto-longo-261101-1445`
- Evidencia do adjudicador: O dossiê da própria main confirma: `analise-prs/resgate-261115/dossies/claude__feat-ui-visual-texto-longo-261101-1445.md` (veredito PERDIDA_PARCIAL — só o Badge entrou pelo #2805). Conferido no código: `src/components/ui/badge.tsx:7` já tem `max-w-full min-w-0 truncate`, mas `src/components/ui/label.tsx:7` segue `leading-none` (o teste exige `leading-snug`), `src/components/ui/card.tsx` não tem `min-w-0`/`break-words`/`leading-tight` e `src/components/ui/tabs.tsx:30` não tem `min-w-0` nem span interno. Depende apenas de `@/components/ui/{badge,label,card,tabs}` (sem tabela nem edge). Atenção do dossiê: o span interno em TabsTrigger cliparia o badge absoluto de `src/components/docs/DiagnosticsView.tsx:152-156`.

### `src/components/ui/__tests__/robustez-primitivos.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Já incorporados: `src/components/ui/table.tsx:50` (`scope="col"`), `src/components/ui/visually-hidden.tsx:39` (timerRef do `useAnnounce`) e `src/components/ui/sparkline.tsx:31` (`aria-hidden`), cobertos por `src/components/ui/__tests__/primitivos-recuperados.test.tsx:15,51`. Ainda ausentes na main: `git grep -n "describedby" origin/main -- src/components/ui/dialog.tsx` → nada; `git grep -n "tabIndex" origin/main -- src/components/ui/skip-link.tsx` → nada; `src/components/ui/avatar.tsx:173` ainda `key={index}`. Depende de `@/components/ui/{dialog,skip-link,avatar}`. O bloco (g) do arquivo é OBSOLETO e precisa sair: afirma polling de 1,5 s e a main usa MutationObserver (`src/components/ui/__tests__/timers-unmount.test.tsx:71`).

### `src/hooks/__tests__/useMessageStatus.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: O hook existe na main em `src/hooks/chat/useMessageStatus.ts:12`, com a MESMA cadeia que o teste dobra (`.select('id, status, status_updated_at').eq('contact_id',…).eq('sender','agent').not('status','is',null)`, linhas 26-31) e canal realtime na linha 67. `git grep -ln "useMessageStatus" origin/main -- src/` devolve só o próprio hook: zero testes. Depende de `@/hooks/chat/useMessageStatus`, `@/integrations/supabase/client` e `@/lib/logger` (export `log`, que existe na main).

### `src/hooks/copilot/useMultimodalAnalysis.ts`

- Branch de origem: `claude/feat-copiloto-edges-261101-1330`
- Evidencia do adjudicador: Na main em `src/hooks/copilot/useImageAnalysis.ts:1-50` — mesma edge via `invokeEdge('ai-multimodal-analysis', { body: … })` na linha 47 — e a edge existe: `supabase/functions/ai-multimodal-analysis/index.ts` com `index.test.ts`.
- **Refutado na conferencia:** REFUTADO: 'chamam a mesma edge' e o NOME, nao o contrato. Os dois contratos sao incompativeis e a main faz menos. Branch: `invokeEdge('ai-multimodal-analysis', { body: { messages, mediaUrl, mediaType } })` → `{ mediaDescription, extractedData{productSpecs, quantity, references, customizationDetails}, salesContext, suggestedNextAction, scriptWithMedia }`, com AbortController cancelando a analise anterior (:43-45, :56-58) e `reset()` (:62-67). Main (src/hooks/copilot/useImageAnalysis.ts:35-60): body `{ imageUrl, conversationContext }` → `{ description, extractedText, dominantColors, keyElements, brandingOpportunity, suggestedReply, confidence }`, SEM abort e SEM reset. E a edge da main confirma o contrato diferente: supabase/functions/ai-multimodal-analysis/index.ts:51 desestrutura `{ imageUrl, context, conversationContext }` do `AiMultimodalAnalysisSchema` — o payload da branch seria recusado na validacao. Sao duas analises diferentes (extracao comercial de pedido com historico das 10 ultimas mensagens contra descricao/cores/branding), nao a mesma coisa com outro nome. Os dois hooks sao orfaos (so o barril `hooks/copilot/index.ts`), e a versao da edge que aceita `messages/mediaUrl/mediaType` vive apenas nesta branch: apagar perde o contrato inteiro.

### `src/hooks/inbox/__tests__/useInboxFilterTags.camada-servico.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A fronteira existe e é testada na main: `src/services/inbox.service.ts:23` (`fetchInboxFilterTags`, com a nota na linha 21 "o hook `useInboxFilterTags` não fala com o Supabase") e `src/services/__tests__/inbox.service.test.ts:4-7,52` cobram essa leitura do serviço.
- **Refutado na conferencia:** REFUTADO. A evidência sustenta apenas metade: services/inbox.service.ts:21-23 existe (comentário 'o hook useInboxFilterTags não fala com o Supabase' + fetchInboxFilterTags) e inbox.service.test.ts cobre a leitura. Mas o HOOK não existe na main: `git cat-file -e origin/main:src/hooks/inbox/useInboxFilterTags.ts` → 'does not exist', e nenhum arquivo de produção da main chama `fetchInboxFilterTags` (grep fora de services/ = zero; InboxFilters.tsx não tem uma única menção a 'tags'). Pior: dois testes da própria main mockam o caminho inexistente (InboxFilters.todos-os-tipos.test.tsx:19 e InboxSavedFiltersMenu.test.tsx:57). Portanto a fronteira que o teste da branch guarda (o hook não pode chamar supabase direto, com o cliente envenenado) NÃO está coberta na main, e o teste nem importaria lá. Se a remoção do filtro por etiqueta foi consequência da remoção de tags (12/10), isso é outra decisão — e não está registrada para este caminho. Não descartar como INCORPORADO.

### `src/hooks/integrations/__tests__/useTalkXServiceStatus.test.ts`

- Branch de origem: `claude/feat-talkx-x048-estados-servico-261101-2100`
- Evidencia do adjudicador: O hook existe na main (`src/hooks/integrations/useTalkXServiceStatus.ts:34-59`, tri-estado documentado em :10-14) e é consumido por `src/components/talkx/TalkXView.tsx` e `src/components/talkx/kit/ServiceStatusSheet.tsx`, mas `git ls-tree -r origin/main --name-only | grep 'hooks/integrations/__tests__'` não tem nenhum arquivo para ele. Depende só de `@/integrations/supabase/client` e da tabela `whatsapp_connections`. ATENÇÃO ao portar: a asserção `expect(result.current.crm).toBe('ok')` (linha 43) tem de sair — a main deixou `crm` fora do hook de propósito (`useTalkXServiceStatus.ts:19-22`).

## banco: migrations e edge functions (3)

### `supabase/functions/multiplix-audience/__tests__/502-codigo-do-singu.test.ts`

- Branch de origem: `claude/fix-multiplix-502-codigo-singu-261117-1551`
- Evidencia do adjudicador: A main nao tem o comportamento: `git grep -n singu_code origin/main -- supabase` nao retorna nada, e o catch continua descartando o codigo em supabase/functions/multiplix-audience/index.ts:669 (`error.message.split(':')[0]`) e devolvendo por errorResponse, que troca o corpo por "Internal server error" em status >= 500 (supabase/functions/_shared/validation.ts:149 e :178). A main tambem nao tem o diretorio supabase/functions/multiplix-audience/__tests__/.

### `supabase/migrations/20261016193200_copilot_feedback.sql`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: A main nao tem nem usa copilot_insight_feedback: `git grep -ln copilot_insight_feedback origin/main` (excluindo analise-prs/ e docs/_arquivo/) nao retorna nada. O papel esta cumprido por public.copilot_feedback, criada na main em supabase/migrations/20261026130300_copilot_feedback.sql:2 com RLS (:18-28), e a decisao esta registrada em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:95 ("tabela copilot_insight_feedback -> copilot_feedback ... o mesmo papel. Nenhum codigo da main menciona copilot_insight_feedback").
- **Refutado na conferencia:** REFUTADO. Primeiro, a evidencia citada nao esta onde se diz: analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:95 e sobre grants de `anon` em password_reset_requests; a linha do par e a :82. Segundo, e o que importa, a tabela da main faz MENOS. Li as duas. Da main (20261026130300 + 20261026140300 + 20261026150300): `copilot_feedback` com feedback_type edit_distance|thumbs, edit_level igual|pouco|muito, rating, created_by e RLS por `created_by = auth.uid()` — essa parte do veredito se sustenta (o escopo por usuario existe, nao e `USING(true)`), e ela e VIVA, escrita por src/hooks/copilot/useCopilotFeedback.ts:75,100. Mas a da branch traz tres coisas que nao existem em forma nenhuma na main: (1) a GUARDA DE RETENCAO — `retained_at` + trigger `guard_copilot_insight_feedback_retained_at` (BEFORE INSERT OR UPDATE) que, quando o contexto e cliente (`current_setting('request.jwt.claims')` presente e `current_user='authenticated'`), zera `retained_at` no insert, preserva o valor antigo no update e REDIGE `final_text` quando a linha ja foi retida — o par da politica LGPD de 30 dias; conferi que o `run_copilot_retention` da main (20261115050000) NAO toca feedback nenhum, ele agrega sessions_opened/ticks/insights por dia; (2) o vinculo com o insight — `insight_id` com FK para `copilot_insights` ON DELETE SET NULL (e as duas tabelas, copilot_insights e copilot_sessions, EXISTEM na main: 20261030110000 e 20261030100000, logo a migration e aplicavel); (3) a acao `discarded` — a main registra 'igual/pouco/muito' e thumbs, mas nao 'o vendedor jogou a sugestao fora'. Em linguagem de negocio: a main sabe se a sugestao foi editada e se o vendedor gostou, mas nao sabe a qual insight do RADAR o retorno se refere, nao descarta o texto enviado ao cliente depois do prazo e nao registra sugestao abandonada. Honestidade: a tabela da branch nao tem consumidor nem na propria branch (`git grep -l copilot_insight_feedback -- src/ supabase/functions/` = zero), entao aplicar o arquivo como esta criaria tabela sem escritor — mas o desenho da guarda de retencao e trabalho real e unico, e apagar e decisao de DDL/LGPD que, pela regra do repo, e do dono.

### `supabase/migrations/20261016193500_copilot_retention.sql`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: Os tres objetos estao na main em supabase/migrations/20261115050000_copilot_retention_aggregates.sql:18 (CREATE TABLE public.copilot_retention_aggregates), :51 (CREATE OR REPLACE FUNCTION public.run_copilot_retention()) e :115 (cron.schedule de copilot-retention-daily). O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:50, e :63 e :69 confirmam tabela e job no banco oficial. Diferenca que NAO esta na main: o DELETE dos insights expirados (branch, linhas 51-56), que depende de copilot_insight_feedback — tabela que a main nao tem.
- **Refutado na conferencia:** REFUTADO. A `main` tem os NOMES, nao a funcao. Li os dois arquivos: o da branch e um mecanismo de RETENCAO/EXPURGO — agrega e depois `DELETE FROM public.copilot_insights WHERE created_at < now() - interval '90 days'` (linhas 51-56), e redige o texto do feedback apos 30 dias (`SET retained_at = now(), final_text = NULL`, linhas 70-74). O supabase/migrations/20261115050000_copilot_retention_aggregates.sql da `main` e OUTRA COISA, apesar de usar o mesmo nome de tabela e de funcao: e analytics de uso, com colunas `agg_date`/`sessions_opened` e o proprio comentario em :124-127 dizendo 'agregados diarios de uso do copiloto RADAR por atendente... computa e armazena metricas do dia anterior'. Nenhum DELETE, nenhuma redacao de texto. Procurei expurgo de copilot_insights na `main` e nao existe: `git grep '90 days|DELETE FROM public.copilot_insights' origin/main -- supabase/migrations/` so acha os expurgos do Talk X (20261003232707_talkx_lgpd_consentimento_expurgo.sql etc.), de outras tabelas. Ou seja: hoje os insights do copiloto crescem sem prazo. Agravante que a propria `main` registra, e que reforca que isto nao e 'incorporado': analise-prs/resgate-261115/dossies/claude__feat-copiloto-cv011-020-migrations-261016-1930.md:228-230 diz que este arquivo 'nao aplica como esta: referencia copilot_insight_feedback (inexistente) e i.type (em producao e insight_type). E reescrita, nao cherry-pick' — reescrita e trabalho pendente, nao decisao de descartar. Atencao de quem for resgatar: um `CREATE OR REPLACE FUNCTION public.run_copilot_retention()` com este corpo SOBRESCREVERIA a funcao de metricas da `main` — o expurgo precisa de nome proprio, de `insight_type` no lugar de `type`, e os passos 3-4 (feedback) nao tem como existir sem a tabela copilot_insight_feedback. 80 linhas.

## scripts e automacoes (20)

### `scripts/ci/aplicar-perimetro.mjs`

- Branch de origem: `claude/fix-ga-fase78-perimetro-custo-261020-2200`
- Evidencia do adjudicador: `git cat-file -e origin/main:scripts/ci/aplicar-perimetro.mjs` → AUSENTE. `git grep APLICAR-PERIMETRO origin/main -- scripts .github` → vazio; na main só existe o verificador `scripts/ci/github-settings-guard.mjs` (lê/restaura), nenhum aplicador do baseline. Dossiê da própria main: `analise-prs/resgate-261115/dossies/claude__fix-ga-fase78-perimetro-custo-261020-2200.md` marca `scripts/ci/aplicar-perimetro.mjs (novo, 155 l.)` como PERDIDA.

### `scripts/ci/aplicar-perimetro.unit.mjs`

- Branch de origem: `claude/fix-ga-fase78-perimetro-custo-261020-2200`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e` falha). Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-fase78-perimetro-custo-261020-2200.md`: `scripts/ci/aplicar-perimetro.unit.mjs (novo, 114 l.) | PERDIDA`.

### `scripts/ci/assert-runtime-proof.unit.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main. A asserção existe apenas embutida em `.github/workflows/db-migrate.yml:247` (passo "Provar estado runtime antes do push", `:273` `proof.server_major === 17`), sem teste: `git ls-tree -r origin/main --name-only | grep assert-runtime-proof` → vazio. Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md` lista os 4 testes como AUSENTES e GA16 como backlog aberto (`docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:144-158`, todos `- [ ]`).

### `scripts/ci/check-edge-envs.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e origin/main:scripts/ci/check-edge-envs.mjs` falha; `git ls-tree -r origin/main --name-only | grep -E 'check-edge-envs|edge-env-baseline'` → vazio). Nada na main valida env de edge contra baseline: os únicos arquivos da main que leem `Deno.env.get` são geradores de inventário (`scripts/inventario/gerar-repo.mjs`) e cenários, não guarda. Dossiê na main `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md` item "7. GA31 — nenhuma guarda de env das edge functions".

### `scripts/ci/compose-confirm-hash.unit.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main. `git grep comporHashLote origin/main` → vazio: a main só tem confirmação de UMA migration (`scripts/db-audit/confirm-hash.mjs:38` `comporHashConfirmacao`, usada em `.github/workflows/db-migrate.yml:890`). Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md`: "`compose-confirm-hash.mjs` (51) | AUSENTE; `comporHashLote` não existe em nenhum arquivo da main".

### `scripts/ci/db-migrate-ga13-17.unit.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main, e o alvo que ele pina não existe: `.github/workflows/db-migrate.yml` da main tem job único (`:75 environment: producao-ddl`, 1493 linhas) e `grep apply_all_missing` no YAML → 0 hits. Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md` ("Nada de GA13-GA17 na main") + GA13–GA17 abertos em `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:144-158`.

### `scripts/ci/docker-pins.unit.mjs`

- Branch de origem: `claude/fix-ga-fase78-perimetro-custo-261020-2200`
- Evidencia do adjudicador: AUSENTE na main; `git grep -l preview-egress-proxy origin/main -- scripts` → vazio (nada na main confere esse Dockerfile), embora `infrastructure/preview-egress-proxy/Dockerfile` e `go.mod` existam na main. Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-fase78-perimetro-custo-261020-2200.md`: "`scripts/ci/docker-pins.unit.mjs` (novo, 51 l.) | PERDIDA — é o teste que pegaria a divergência 1.27 vs 1.24 que existe hoje".

### `scripts/ci/edge-env-baseline.json`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: AUSENTE na main (`git ls-tree -r origin/main --name-only | grep edge-env-baseline` → vazio). A main não tem nenhum baseline de env de edge — só `scripts/ci/vercel-env-baseline.json` (front) e `scripts/ci/eslint-baseline.json`. Dossiê na main `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md`, item GA31.

### `scripts/ci/ga20-ga25-contratos.unit.mjs`

- Branch de origem: `claude/fix-ga-resto-typessync-20261021-0730`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e` falha). Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-typessync-20261021-0730.md:24` ("arquivo inexistente na main | NEW_FILE_ABSENT_IN_MAIN"), `:161-166` (item 6, valor médio) e veredito `:183` ("GA20/GA22/GA23/GA24/GA25 fora da main").

### `scripts/ci/ga25-ddl-check.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: AUSENTE na main. O detector existe (`scripts/db-audit/check-deployments-ledger.mjs:1-18`, mesma regra GA25) mas NÃO lê nada ao vivo — `git show origin/main:scripts/db-audit/check-deployments-ledger.mjs | grep -n 'psql-safe\|fetch\|api.github'` → 0 hits (entradas são `--ledger`/`--deployments` em arquivo) — e nenhum workflow o chama. Dossiê na main `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md:198` ("GA25 não ligado… nenhum workflow o executa") e `:119` (lista `scripts/ci/ga25-ddl-check.mjs` entre o que falta portar).

### `scripts/ci/proof-sha.unit.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e origin/main:scripts/ci/proof-sha.unit.mjs` falha; `scripts/db-audit/proof-sha.mjs` também). Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md` ("`scripts/ci/… proof-sha.unit.mjs` | AUSENTES (4 arquivos de teste)").

### `scripts/ci/vercel-env-cleanup-workflow.unit.mjs`

- Branch de origem: `codex/publish-followup-20261021`
- Evidencia do adjudicador: A main decidiu o contrário e documenta a decisão no próprio workflow: `.github/workflows/vercel-env-cleanup.yml:15-16` ("VERCEL_READONLY_TOKEN nao apaga nada… Enquanto o secret for o de leitura, este workflow serve para AUDITAR") e `:54` `VERCEL_TOKEN: ${{ secrets.VERCEL_READONLY_TOKEN }}` — sempre leitura, sem condicional. O teste exige um `secrets.VERCEL_WRITE_TOKEN` que não existe, logo REPROVARIA na main. Registrado em `analise-prs/resgate-261115/dossies/codex__publish-followup-20261021.md:143,149`.
- **Refutado na conferencia:** REFUTADO — a propria `main` classifica este arquivo como LACUNA, nao como decisao superada. O registro citado como evidencia diz o contrario do veredito: analise-prs/resgate-261115/dossies/codex__publish-followup-20261021.md:143 lista o guard sob 'L5 — Itens pequenos (BAIXO)', na secao 'LACUNAS REAIS — trabalho perdido que ainda faz sentido', e o veredito em :149 e 'PERDIDA_PARCIAL... Perdidos: L1..., L5 (miudezas)' — com `apagar_branch_seguro = false`. A triagem da `main` (analise-prs/resgate-261115/auditoria/bruto/triagens/codex__publish-followup-20261021.json) e explicita: 'Guard novo (ausente na main) das assercoes de ref==main, permissions e separacao dos tokens'. E o desenho que o teste cobra e o que o proprio workflow da `main` declara como intencao, nao como recusa: .github/workflows/vercel-env-cleanup.yml:15-16 diz 'DRY_RUN=1 lista, DRY_RUN=0 exige token com escrita. Enquanto o secret for o de leitura, este workflow serve para AUDITAR' — 'enquanto' e estado pendente. O que a `main` nao tem e a GUARDA: hoje :54 passa `secrets.VERCEL_READONLY_TOKEN` sem condicional e nao existe step que falhe com mensagem clara se alguem rodar apply sem token de escrita, nem assercao de que credencial privilegiada so sai de refs/heads/main (as duas primeiras assercoes do arquivo, linhas 8-9, sobre `if: github.ref == 'refs/heads/main'` e `permissions: contents: read`, ja passariam hoje). Verdade a dizer de um lado e do outro: as 3 assercoes do segundo teste (linhas 13-15) REPROVAM na `main` como ela esta, porque dependem de criar o secret VERCEL_WRITE_TOKEN e de alterar o workflow — integrar isto e um cartao de 2 arquivos, nao um cherry-pick, e o valor e baixo. Mas descartar como 'a main decidiu o contrario' contraria o registro da propria `main`. 16 linhas.

### `scripts/db-audit/calcular-lote.sh`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e` falha). O workflow da main não tem esse cálculo: `.github/workflows/db-migrate.yml` da main não tem `apply_all_missing` (grep → 0 hits) e trabalha com `TARGET_VERSION` única. Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md` ("`scripts/db-audit/calcular-lote.sh` (75) | AUSENTE") e ressalva do dono registrada ali: o lote não pode virar apply indiscriminado.

### `scripts/db-audit/check-ddl-deployments.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: Mesma regra na main em `scripts/db-audit/check-deployments-ledger.mjs:1-18` — cabeçalho literal "GA25 — detector de DDL fora do fluxo", mesmo corte de 16/10/2026 e mesma saída (exit 1 lista versions sem Deployment); a versão da main é melhor por aceitar entradas em arquivo (roda offline/com fixture) e tem teste (`scripts/db-audit/check-deployments-ledger.test.mjs`). Registrado na tabela "Já está na main" de `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md`. Ressalva: na main nada o executa nem registra os Deployments que ele procura (ver `register-deployments.mjs` e `ga25-ddl-check.mjs` deste mesmo lote).
- **Refutado na conferencia:** REFUTADO. A main tem a REGRA, não o detector. check-deployments-ledger.mjs é só lógica pura: exporta `versoesSemDeployment()` e, no CLI, exige `--ledger versions.json` e `--deployments deployments.json` lidos de DISCO (lerJson, exit 2 se faltarem). Ele não consulta o ledger nem a API de Deployments. O arquivo da branch faz o ciclo completo: lê `supabase_migrations.schema_migrations` via scripts/db-audit/psql-safe.mjs e consulta os Deployments com GITHUB_TOKEN, saindo 1 com a lista. E nada na main produz esses JSONs nem executa o script: `git grep -rn check-deployments-ledger origin/main -- .github/ scripts/` só acha o próprio arquivo e o próprio teste. A própria evidência admite a ressalva. Resultado: hoje a main NÃO consegue rodar o GA25 ponta a ponta — faz menos que a branch. Não descartar.

### `scripts/db-audit/compose-confirm-hash.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main; `git grep comporHashLote origin/main` → vazio. A main só sabe confirmar UMA migration: `scripts/db-audit/confirm-hash.mjs:38` (`comporHashConfirmacao`) usada em `.github/workflows/db-migrate.yml:890,901`. Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md` confirma a ausência e diz que a dependência na main está satisfeita.

### `scripts/db-audit/proof-sha.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e origin/main:scripts/db-audit/proof-sha.mjs` falha). Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md`: "`scripts/db-audit/proof-sha.mjs` (11) | AUSENTE".

### `scripts/db-audit/provar-lote.sh`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e` falha), e a main não tem fluxo de lote: `.github/workflows/db-migrate.yml` sem `apply_all_missing` (grep → 0 hits), job único `:75`. Dossiê na main `analise-prs/resgate-261115/dossies/claude__fix-ga-resto-dbmigrate-20261021-0729.md`: "`scripts/db-audit/provar-lote.sh` (33) | AUSENTE".

### `scripts/db-audit/talkx-attribution.test.sh`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: AUSENTE na main: `git cat-file -e origin/main:scripts/db-audit/talkx-attribution.test.sh` falha e `git ls-tree -r origin/main --name-only | grep -E 'scripts/db-audit/talkx-(attribution|rfm)'` → vazio, enquanto os testes irmãos citados pelo próprio arquivo existem (`scripts/db-audit/talkx-optout.test.sh`, `scripts/db-audit/talkx-overview-stats.test.sh`). A migration alvo existe na main (`supabase/migrations/20261009031958_talkx_v4_x041_atribuicao_negocio_ganho_receita_roi.sql`), logo a dependência está satisfeita.

### `scripts/db-audit/talkx-rfm.test.sh`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: AUSENTE na main (`git cat-file -e origin/main:scripts/db-audit/talkx-rfm.test.sh` falha; nenhum `talkx-rfm*` em `git ls-tree -r origin/main`), enquanto a migration alvo está na main (`supabase/migrations/20261009032406_talkx_v4_x040_rfm_local_purchases.sql`) e os testes irmãos do mesmo formato existem (`scripts/db-audit/talkx-optout.test.sh`, `talkx-overview-stats.test.sh`).

### `scripts/db-migrate/register-deployments.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: AUSENTE na main — a própria pasta não existe: `git cat-file -e origin/main:scripts/db-migrate/register-deployments.mjs` falha e `scripts/db-migrate/` não aparece em `git ls-tree -r origin/main --name-only`. O workflow da main não registra Deployment nenhum: `git show origin/main:.github/workflows/db-migrate.yml | grep -ci deployments` → 0 (o `environment: producao-ddl` em `:75` só serve de aprovação). Dossiê na main `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md:117,198` (item "GA25 não ligado").

## CI, E2E e docs (3)

### `.claude/CLAUDE.md`

- Branch de origem: `claude_05/serene-feynman-3uuurw`
- Evidencia do adjudicador: Ausente da main em qualquer forma: `git grep -ln CONGELAMENTO origin/main` = vazio; origin/main:CLAUDE.md:1 tem uma unica linha (`@AGENTS.md`) e origin/main:AGENTS.md nao tem regra de congelamento nem de areas exclusivas (`git grep -n 'exclusiv|congelamento' origin/main:AGENTS.md` = vazio). O documento que ele referencia existe: origin/main:docs/PRONTO_PRODUCAO.md:1. O dossie da propria branch na main (analise-prs/resgate-261115/dossies/claude_05__serene-feynman-3uuurw.md) nao cita este arquivo — nunca foi adjudicado. Governanca, nao codigo: vale ou nao conforme o dono ainda considerar o congelamento ativo.

### `.github/workflows/auto-update-pr-branch.yml`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Ausente da main (origin/main:docs/agentes/github-ci.md:75-79 lista os 21 workflows e nao inclui este; `git ls-tree -r origin/main --name-only | grep fila-merge` so retorna dossies). CUIDADO — ha dois registros em conflito e o mais novo manda: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:98-99 dizia 'Removido de proposito, nao resgatar ... desativados a mao pelo dono em 11/11 apos 8.312 runs, commit 35bb4cba5'; mas o documento posterior origin/main:analise-prs/VEREDITOS-A3-E-DELECOES-261117.md:56-73 contradiz: 'este faz falta, e a main diz isso' — cita origin/main:scripts/ci/ci-docs-baseline.unit.mjs:178 registrando a decisao E16 ('apagar auto-update-pr-branch.yml | SUPERADA | nao e codigo morto'), origin/main:scripts/ci/arquitetura-sem-desperdicio.unit.mjs:25 que ainda tenta le-lo, e conclui 'e o item de maior efeito pratico do A3' com as PRs #3194/#3196/#3197/#3198 precisando de update-branch manual. Entra por decisao do dono (workflow = 'chame o dono' por AGENTS.md), e precisa de fila-merge.mjs junto.

### `.github/workflows/main-failure-notify.yml`

- Branch de origem: `claude/feat-E90-main-failure-notify-261101-1730`
- Evidencia do adjudicador: Funcionalidade ausente da main: a main so tem origin/main:.github/workflows/notifica-falha-main.yml:37-43, que abre/atualiza issue `[falha-main]` via actions/github-script — canal diferente; `git grep -ln JOAQUIM_WHATSAPP_NUMBER origin/main` so devolve dossies de analise, nenhum workflow. O dossie da main confirma e NAO manda apagar: origin/main:analise-prs/resgate-261115/dossies/claude__feat-E90-main-failure-notify-261101-1730.md — 'Veredito: **DECISAO_DONO** (confianca alta) · apagar_branch_seguro = false ... A funcionalidade central (aviso WhatsApp de falha na main) nao existe na main e ainda faz sentido'. Ressalva que o mesmo dossie levanta: como esta escrito viola origin/main:AGENTS.md:76-77 ('EVOLUTION_* so nas edges') e grava o hostname da VPS em YAML de repo publico; o caminho conforme a regra e o Actions chamar uma edge function que ja tem EVOLUTION_API_URL/EVOLUTION_INSTANCE_TOKEN.

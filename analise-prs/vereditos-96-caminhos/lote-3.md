# Vereditos dos 96 caminhos — lote 3 (16 caminhos)

Base: `origin/main` @ `a56d9cb7`. Uma seção por caminho: a branch representativa, o veredito e a prova com `arquivo:linha` da `main`. Os 96 caminhos são os que, dos 135 que sobraram da triagem automática dos 408 pares, ainda não tinham veredito nominal nos documentos anteriores da série.


## supabase/functions/_shared/evolution-webhook-handlers.ts
- branch: origin/fix/ci-verde-261021
- veredito: OBSOLETO
- prova: `origin/main:supabase/functions/_shared/evolution-webhook-handlers.ts:271` (descarte de `@broadcast`), `:286` e `:304` (grupo sem autor com sufixo `@s.whatsapp.net`/`@lid` → `return`), `:273-308` (estados dos dois envelopes ChatPresence/Presence), `:322-327` (canal `private: true` + payload de grupo com `participant`/`typing`), `:334-348` (presence_status só no 1:1 e `last_seen_at` só na transição online→offline). A `main` ainda tem `try/finally` no `removeChannel` (`:323-330`), que a branch não tem.
- uma frase: a `main` já faz tudo que a branch fez no `handlePresenceUpdate`, com critério de autor de grupo mais estrito e liberação garantida do canal.

## src/hooks/inbox/useInboxFilters.ts
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/inbox/useInboxFilters.ts:97` (`useSearchParams`), `:106` (`searchParams.get('type')` dentro de `basePrefs`), `:151-160` (`setSearchParams(..., { replace: true })` em vez de `window.history.replaceState`), `:166-180` (efeito que sincroniza o rascunho quando o `?type=` muda por back/forward — que a branch não tem).
- uma frase: o PK-14 (o `?type=` passar a viver no roteador) já está na `main`, com o extra de acompanhar voltar/avançar do navegador.

## src/components/talkx/TalkXCampaignWizard.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `origin/main:src/components/talkx/TalkXCampaignWizard.tsx:21` (import de `useTalkXCampaignSummary`), `:744-782` (bloco X131 no `WizardRail`: `summaryEnabled`, `summary.isLoading` → `…`, `summary.isError` → `—`, `totalValue/eligibleValue/blockedValue` do servidor); teste de regressão em `origin/main:src/components/talkx/__tests__/TalkXCampaignWizard.resumo-servidor.test.tsx`.
- uma frase: o rail de resumo da campanha já lê o público do servidor na `main`, por um hook dedicado em vez das variáveis `rail*` da branch.

## src/components/talkx/useCampaignEditor.ts
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: a query `talkx-wizard-rail-summary` da branch foi substituída na `main` pelo hook `useTalkXCampaignSummary` (`origin/main:src/hooks/integrations/useTalkXCampaignSummary.ts`), consumido em `origin/main:src/components/talkx/TalkXCampaignWizard.tsx:752`; o editor segue sem expor `railSummary` (`origin/main:src/components/talkx/useCampaignEditor.ts:1227`).
- uma frase: mesma contagem de público via RPC `talkx_resolve_audience`, só que extraída para hook próprio — o estado no editor virou código duplicado.

## src/hooks/delivery/useUnconfirmedMessages.ts
- branch: origin/claude/feat-message-delivery-post-iniciado-261101-1330
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/delivery/useUnconfirmedMessages.ts` é superconjunto da versão da branch — `:64` (`unconfirmedRefetchInterval`, recuo exponencial sob erro), `:102` (`.eq('status','sending')`, mais correto que o `not in (...)` da branch, que deixava `failed` resolvível), `:107-108` (suporte a conversa de grupo por `whatsapp_group_id`), `:117` (polling adaptativo).
- uma frase: o hook da branch nasceu na `main` com correção de status, suporte a grupo e recuo de polling por cima.

## src/components/ui/phone-input.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `origin/main:src/components/ui/phone-input.tsx:19` (`rest.length === 8 && !rest.startsWith('9')` cobre o mesmo reflow 5-4 vs 4-4 que a branch resolvia olhando o grupo digitado) e `:38-110` (`isExplicitInternationalRef`, `onPaste`/`onDrop`, `inputType` de deleção — cobre o "não prefixar 55 quando o número é E.164 declarado" da branch, incluindo colar e apagar).
- uma frase: as duas correções de máscara da branch (+DDI declarado e não reflowar ao apagar) estão na `main` por um caminho que também trata colar, arrastar e apagar.

## src/hooks/admin/useSearchInsights.ts
- branch: origin/claude_05/serene-feynman-3uuurw
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/admin/useSearchInsights.ts:100` (`supabase.rpc('search_insights', { p_days: days })`, mesma troca da RPC inexistente `get_search_insights`), `:66` (`parseSearchInsights(raw, days)`), `:46-64` (validação que lança `SearchInsightsError` em vez de zerar KPI silenciosamente).
- uma frase: a migração para a RPC canônica já está na `main`, com validação mais rígida da resposta.

## src/components/ui/card.tsx
- branch: origin/claude/feat-ui-visual-texto-longo-261101-1445
- veredito: OBSOLETO
- prova: `origin/main:src/components/ui/card.tsx:86` (`CardHeader`), `:97` (`CardTitle`), `:103` (`CardDescription`), `:109` (`CardContent`), `:115` (`CardFooter`) — a única diferença contra a branch são classes Tailwind (`min-w-0`, `break-words`, `leading-tight` vs `leading-none`); nenhuma lógica, prop ou estado muda.
- uma frase: diferença exclusivamente de classe CSS, que esta auditoria não trata como melhoria recuperável (observação: na `main` um título de card com palavra muito longa não quebra linha).

## src/components/admin/SearchInsightsView.tsx
- branch: origin/codex/publish-followup-20261021
- veredito: OBSOLETO
- prova: `origin/main:src/components/admin/SearchInsightsView.tsx:113` (skeleton `sm:grid-cols-3` com 3 placeholders) e `:128-160` (4 cards de KPI reais) — o único resto da branch é a contagem do skeleton (4 em `xl:grid-cols-4`); tudo o mais é comentário/formatação, e a `main` ainda formata o tamanho médio com `toLocaleString('pt-BR', { maximumFractionDigits: 1 })` (`:142` e `:217`), que a branch não tem.
- uma frase: só sobra um descompasso cosmético de skeleton durante o carregamento; o conteúdo e a formatação da `main` são mais recentes.

## src/components/dashboard/ProgressiveDisclosureDashboard.tsx
- branch: origin/claude_05/zen-feynman-29b7ix
- veredito: OBSOLETO
- prova: `origin/main:src/components/dashboard/ProgressiveDisclosureDashboard.tsx:37` (`const queryClient = useQueryClient();`), `:49-57` (assinatura do cache sem guarda de nulo) e `:60` (`handleRefresh` padrão com `refetchQueries`) — mesmo efeito do `useContext(QueryClientContext)` + guardas da branch.
- uma frase: o carimbo de "última atualização" e o botão Atualizar continuam funcionando na `main`; a branch só trocava a forma de obter o QueryClient.

## src/services/contact.service.ts
- branch: origin/claude/keen-galileo-dxai3p
- veredito: OBSOLETO
- prova: `origin/main:src/services/contact.service.ts:185` (`...(options?.isPinned === true ? { is_pinned: true } : {})` sem `any`) e `:205` (`update(updates)` sem cast) — a branch só inseria `eslint-disable` + `any` como ponte pré-`types.ts`; a coluna já existe (migration 20261026200000) e a `main` ainda adicionou `getByIds` (`:62-71`).
- uma frase: a branch só tinha casts de tipo para compilar antes da migration, que já está aplicada.

## src/components/knowledge/KnowledgeBaseView.tsx
- branch: origin/claude/kind-gates-87mwoe
- veredito: OBSOLETO
- prova: `origin/main:src/components/knowledge/KnowledgeBaseView.tsx:117-131` (`kbErrorBlock` com `role="alert"`, `data-testid="kb-error"` e botão "Tentar novamente") e `:143-144` (`{error ? ... }` substituindo contadores e abas) — mesmo efeito do early-return da branch; a `main` ainda acrescenta diálogo de confirmação para excluir artigo (`:277-300`).
- uma frase: a tela já avisa quando a leitura da base falha, em vez de mostrar zero como se fosse contagem real.

## src/components/mfa/MFAVerify.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: `origin/main:src/components/mfa/MFAVerify.tsx:58-66` (`let disponiveis = factors; if (disponiveis.length === 0) { disponiveis = await fetchFactors(); }`), `:69-75` (limpa o campo quando não há fator) e `:29-36` (`fetchFactors().catch`) — cobre a corrida que a branch tratava com `factors.length > 0` + dep `factors`.
- uma frase: o código de 6 dígitos digitado antes dos fatores carregarem continua sendo verificado na `main`, resolvendo a lista na hora em vez de só esperar.

## src/components/dashboard/ScheduledReportsManager.tsx
- branch: origin/claude/charming-mccarthy-jbxy56
- veredito: OBSOLETO
- prova: `origin/main:src/components/dashboard/ScheduledReportsManager.tsx:135-136`, `:229` e `:232` já usam `text-[hsl(var(--primary-text))]` (a `main` aplicou o token até no subtítulo, onde a branch deixou `text-primary/80`); a `main` ainda troca a exclusão direta por `AlertDialog` de confirmação (`:167-184`).
- uma frase: a troca de token de cor da branch já está na `main`, mais completa.

## src/components/dashboard/overview/GamificationSection.tsx
- branch: origin/claude_05/zen-feynman-29b7ix
- veredito: OBSOLETO
- prova: `origin/main:src/components/dashboard/overview/GamificationSection.tsx:28-29` (`const { visibleWidgets: configuradosPeloHook } = useDashboardWidgets(); const configurados = visibleWidgets ?? configuradosPeloHook;`) — a branch removia o fallback, deixando `?? []`.
- uma frase: a versão da branch é a mais pobre: sem a prop, a seção de gamificação ficaria vazia.

## src/hooks/analytics/useGoalNotifications.ts
- branch: origin/claude/fix-conversas-go-perf-261113
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/analytics/useGoalNotifications.ts:250-257` (`Promise.allSettled` + `log.error('Erro ao medir meta; as demais seguem', ...)`) — a branch ficou no `Promise.all`, em que uma contagem com erro derrubava o anúncio de todas as metas.
- uma frase: a `main` é a versão posterior e mais resistente do mesmo laço de medição de metas.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida

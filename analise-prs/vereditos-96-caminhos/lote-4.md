# Vereditos dos 96 caminhos — lote 4 (16 caminhos)

Base: `origin/main` @ `a56d9cb7`. Uma seção por caminho: a branch representativa, o veredito e a prova com `arquivo:linha` da `main`. Os 96 caminhos são os que, dos 135 que sobraram da triagem automática dos 408 pares, ainda não tinham veredito nominal nos documentos anteriores da série.


## src/components/talkx/TalkXTemplateEditor.tsx
- branch: origin/claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023
- veredito: OBSOLETO
- prova: a `main` tem TODOS os 4 ganhos da branch, com o mesmo id/rótulo: campo Descrição em `src/components/talkx/TalkXTemplateEditor.tsx:646-648` (`id="talkx-template-descricao"`), breadcrumb em `:553` (`aria-label="Trilha de navegação"`), `isError/error/onRetry` em `:65-67` + `:516-518`, e `initialTtab`/`onActiveTemplateChange` em `:70-72`, `:118-121`, `:141`, `:312`.
- uma frase: nada a recuperar — a main já edita descrição, mostra trilha, trata erro com "tentar de novo" e preserva a sub-aba do endereço ao trocar de template.

## src/components/inbox/MessageReactions.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: a `main` tem o mesmo hook com o mesmo nome e mais robusto — `useReacaoUnica` em `src/components/inbox/MessageReactions.tsx:40-110` (sobreposição otimista + rollback que, em `:97-105`, devolve ao servidor a reação antiga já removida, coisa que a branch não faz) e os mesmos atributos de acessibilidade em `:210-211`, `:248`, `:263-276`, `:389-390`, `:418-428`.
- uma frase: uma reação por autor, rollback e leitor de tela já estão na main, em versão superior à da branch.

## supabase/functions/_shared/gmail-helpers.ts
- branch: origin/fix/ci-verde-261021
- veredito: OBSOLETO
- prova: `supabase/functions/_shared/gmail-helpers.ts:79` (`gmailNextAttemptAt`), `:84-97` (`selectGmailAccountsDue`, com `is_active` e claim `syncing` que a branch não tinha), `:138` (`GMAIL_REAUTH_HTTP_STATUS = 409`), `:140` (`gmailReauthErrorPayload`), já usados em `supabase/functions/gmail-send/index.ts:80`, `gmail-sync/index.ts:323` e cobertos por `supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts:77-110`.
- uma frase: backoff do cron do Gmail e o 409 que abre a reconexão em vez de um 500 genérico já estão na main, com teste.

## src/hooks/auth/useAuth.tsx
- branch: origin/claude/fix-ci-tests-batch2-2610-1830
- veredito: OBSOLETO
- prova: a `main` esvazia a fila de envio offline no logout em `src/hooks/auth/useAuth.tsx:12` (import), `:28-30` (helper com log de falha), `:173` (listener SIGNED_OUT, SEC-FRONTEND-04) e `:248` (caminho de `signOut` com falha), com teste dedicado em `src/hooks/auth/__tests__/useAuth.fila-offline-logout.test.tsx:60-76`. O resto do diff da branch é só desacentuação de comentários (e introduz typos: "Inici/limpa", "BUG-F1 FIV").
- uma frase: a mensagem pendente do atendente que saiu já não drena no login do próximo — a main faz isso e ainda loga a falha.

## e2e/fixtures/e2e-contact.ts
- branch: origin/claude/fix-ga-fase0-banco-e2e-261020-2200
- veredito: OBSOLETO
- prova: a `main` resolve o mesmo guard de proveniência sem DDL nova — `e2e/fixtures/e2e-contact.ts:4` importa `insertIsolatedFixtureMessage` e `:115-121` desvia para ele quando `ZAPP_E2E_LOCAL === '1'`, mantendo o INSERT por REST só como ramo legado; a migration da RPC da branch está arquivada em `supabase/migrations/_superseded/20261020120000_e2e_fixture_message_rpc.sql` (idêntica à da branch).
- uma frase: o fixture de E2E já insere a mensagem pelo caminho privilegiado do backend descartável; a RPC da branch é desnecessária.

## src/components/inbox/copilot/RadarPanel.tsx
- branch: origin/claude/radar-motor-copilot-live-301030
- veredito: OBSOLETO
- prova: a comparação `branch → main` só ADICIONA comportamento do lado da main: supressão completa em DND (`src/components/inbox/copilot/RadarPanel.tsx:105` no `aria-live`, `:129-146` nos atalhos Ctrl+Alt+1..3, `:169`, `:204-210`, `:227`, `:259`, `:322`, `:330`, `:348` no corpo do painel e `:458` no rodapé). A branch não tem nada que a main não tenha.
- uma frase: a versão da main é a mesma tela com o "RADAR silenciado" funcionando de verdade.

## src/components/inbox/copilot/BrindeMeter.tsx
- branch: origin/claude/feat-copilot-radar-20261108-1800
- veredito: OBSOLETO
- prova: a `main` reescreveu o componente com contrato diferente e maior — `src/components/inbox/copilot/BrindeMeter.tsx:29-85`: tooltip por letra com o valor detectado, `onLetterClick` que leva à mensagem de origem, destaque amarelo para letra sugerida e `aria-label` por casinha. O único trecho da branch ausente é o texto "🎉 Briefing completo!" quando `meter === 6` — cosmético, e incompatível com as props atuais (`state` em vez de `meter`).
- uma frase: o medidor B·R·I·N·D·E da main é superset do da branch; só se perde uma frase de parabéns.

## src/components/talkx/TalkXTemplateImportDialog.tsx
- branch: origin/claude_juca/practical-rubin-8xnw0u
- veredito: OBSOLETO
- prova: a `main` tem o arquivo inteiro e mais: `src/components/talkx/TalkXTemplateImportDialog.tsx:50-53` compara nomes com `.trim()` nas duas pontas (sem isso ` Oferta ` não era detectado como conflito e sobrescrevia em silêncio mesmo com "Pular todos") e usa o helper extraído `linhaBloqueada` em `:110`, `:119`, `:121`, `:227`.
- uma frase: o diálogo de importar templates da main já não sobrescreve template existente por causa de espaço no nome.

## src/hooks/system/useOfflineCache.ts
- branch: origin/claude/fix-codex-findings-161016-1906
- veredito: OBSOLETO
- prova: a branch só move a leitura do cache do `useEffect` para o inicializador do `useState` (e troca `log` por `getLogger(...)` inline, para mock de vitest). O efeito — carregar as conversas em cache na montagem — a `main` cumpre em `src/hooks/system/useOfflineCache.ts:80-86`; a diferença é um frame de render, não comportamento.
- uma frase: nenhum ganho para o usuário; é mudança de forma para facilitar mock de teste.

## src/components/dashboard/DashboardView.tsx
- branch: origin/claude_05/zen-feynman-29b7ix
- veredito: OBSOLETO
- prova: a `main` incorporou os três itens e corrigiu um: período do filtro chega aos KPIs em `src/components/dashboard/DashboardView.tsx:115-120` (e em "hoje" não manda janela, o que a branch mandava errado), título dinâmico em `:217`, filtros só na aba Visão Geral em `:184`, e o aviso de período em `:225-229` passou a dizer a verdade restante (a RPC ainda não recebe `p_until`), em vez de ser só apagado.
- uma frase: a main já faz o filtro de período valer nos indicadores e avisa o que ainda não é limitado.

## src/components/admin/useTarefasAgendadas.ts
- branch: origin/claude/fix-logger-vitest-mock-261017-1000
- veredito: OBSOLETO
- prova: diferença é apenas a forma do cast do `supabase.rpc` — a branch usa `(supabase as any)` + `eslint-disable`, a `main` usa cast tipado sem desligar o lint em `src/components/admin/useTarefasAgendadas.ts:45` e `:72`. Mesmas RPCs, mesmo comportamento.
- uma frase: só tipo/lint; nada muda para quem usa a tela de tarefas agendadas.

## src/components/calls/IncomingCallAlert.tsx
- branch: origin/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c
- veredito: OBSOLETO
- prova: a `main` cumpre o mesmo efeito globalmente, por decisão explícita: `src/App.tsx:83-88` envolve o app em `<MotionConfig reducedMotion="user">` com o comentário "aplica prefers-reduced-motion do sistema a TODOS os consumidores de motion.* sem precisar de MotionConfig por tela", com testes em `src/components/__tests__/reduzirMovimentoInboxCrmConexoes.test.tsx`. O hook `useMotionSeguro` da branch não existe mais na main (`git grep useMotionSeguro origin/main -- src` → vazio).
- uma frase: quem pede "reduzir movimento" já é atendido no alerta de chamada pela guarda global, sem o hook por tela.

## src/hooks/connections/useConnectionOptions.ts
- branch: origin/claude/feat-evolution-rotas-pendentes-261112
- veredito: OBSOLETO
- prova: a `main` tem o hook inteiro e mais a opção que importa — `src/hooks/connections/useConnectionOptions.ts:6-10` e `:21` com `onlyConnected` filtrando `status = 'connected'` (e a chave de cache separada em `:13`).
- uma frase: a main já oferece só as conexões conectadas nos formulários, o que a branch nem tinha.

## src/hooks/inbox/conversationArchive.ts
- branch: origin/claude/fix-conversas-p0-p1-backend-261113
- veredito: OBSOLETO
- prova: a `main` tem tudo da branch com os mesmos nomes — `src/hooks/inbox/conversationArchive.ts:30` (`WAITING_CANNOT_ARCHIVE_CODE`), `:35-36` (`canArchiveConversation`), `:84-95` (`moveConversationsStatus` pela RPC `set_conversations_status`), `:212` (recusa arquivar 'waiting') — e mais: fallback para banco sem a RPC em `:109` e `:138` (`moveConversationsStatusLegacy`) e restauração direta `archived → resolved` em `:256`.
- uma frase: a regra "conversa aguardando não pode ser arquivada" já está na main, com caminho de compatibilidade que a branch não tinha.

## src/config/supabase.ts
- branch: origin/local/fase0-banco-local
- veredito: OBSOLETO
- prova: a `main` tem o módulo inteiro (`resolveLocalSupabase`, as três condições, `IS_LOCAL_SUPABASE`) e ampliou a validação em `src/config/supabase.ts:36`, aceitando `http:` e `https:` em 127.0.0.1/localhost onde a branch só aceitava `http:`.
- uma frase: o desvio seguro para o banco local já está na main, cobrindo também localhost sob HTTPS.

## src/components/talkx/segments/TalkXSegmentBuilder.tsx
- branch: origin/claude/fix-talkx-segmentos-estimativa-261025-2110
- veredito: OBSOLETO
- prova: mesmo comportamento, forma mais curta, em `src/components/talkx/segments/TalkXSegmentBuilder.tsx:289` da `main`: `{est?.count != null ? fmtInt(est.count) : '—'}` cobre `count === null` e também `est` ausente, que a versão da branch (`est && est.count === null`) deixava cair em `0`.
- uma frase: a estimativa de audiência já mostra "—" em vez de um zero falso, e na main também antes da primeira resposta.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida

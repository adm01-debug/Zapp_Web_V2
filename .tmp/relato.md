Especialista: worker (telas) (area-front-componentes)

## Situação ([retomar]) — como resolvi o motivo do conflito
O motivo registrado era conflito com a ponta `dia/2026-10-12`. Ao conferir o código ATUAL, a etapa U01 JÁ ESTÁ na ponta: o commit `1d7b7c504` ("fix(sidebar): corrigir selo de e-mails não lidos", Cartão V2 26100815178b52) é ancestral de HEAD (`git merge-base --is-ancestor 1d7b7c504 HEAD` → ancestral), e traz exatamente os 4 arquivos desta etapa. Logo não há cherry-pick a fazer: trazer `2c493b83b`/`32a8284d6` duplicaria o hook (conflito) e ainda puxaria `src/components/onboarding/__tests__/defaultTourSteps.alvos.test.tsx`, que NÃO está na lista de arquivos permitidos ("diff maior que o título" é recusa). Fechei SEM commit de código, como o cartão manda.

## Critério de pronto conferido no código atual
- Selo do item Email: `src/components/layout/Sidebar.tsx:146-151` (`item.id === 'email-chat' ? emailUnread.count`).
- Contagem de conversas não lidas: `src/hooks/gmail/useUnreadEmailCount.ts` → `.from('email_threads').select('id', { count: 'exact', head: true }).eq('is_unread', true)`.
- Tempo real com debounce e canal limpo ao desmontar: `DEBOUNCE_MS = 500`, `scheduleRecount` no `postgres_changes` de `email_threads` e `removeChannel` no cleanup.
- Sem selo quando 0 e `99+` acima de 99: `src/components/layout/SidebarNavItem.tsx:119` (`badgeCount != null && badgeCount > 0`) e `:130` (`badgeCount > 99 ? '99+' : badgeCount`).
- Variante visual como a do Chat (destructive), não a amarela de Tarefas: `Sidebar.tsx:152-154`.
- Hook só monta com acesso ao item Email: `Sidebar.tsx:64-68` (`canSeeEmailItem` → `enabled`). Erro nunca quebra a barra: `try/catch` → `status: 'erro'`, `count: 0`.
- Chat e Tarefas inalterados: `Sidebar.tsx:147-154` mantém as regras de `inbox`/`tasks` idênticas.

## Prova (comandos rodados agora neste workspace)
- `npx vitest run src/hooks/gmail/__tests__/useUnreadEmailCount.test.tsx src/components/layout/__tests__/Sidebar.test.tsx`
  → `Test Files 2 passed (2)`; `Tests 21 passed (21)` (zero falhas, zero pulados).
- `npx vitest run src/components/onboarding/__tests__/defaultTourSteps.alvos.test.tsx`
  → `Test Files 1 passed (1)`; `Tests 2 passed (2)` (o teste do tour já passa sem mock, porque a ponta tem a guarda de modo test no hook).
- Cobertura dos itens do cartão nos testes já na ponta: `useUnreadEmailCount.test.tsx` — contagem (linha 63), falha da consulta (78), realtime com debounce (86), desabilitado sem acesso (110), limpar canal (118); `Sidebar.test.tsx` "selo do item Email (U01)" (279) — mostra o número (283), 0 sem selo (297), `99+` (307), falha não quebra a barra (314), Chat/Tarefas iguais (326).
- `git diff --stat` → vazio; `git status --short` → vazio (nada commitado).

## O que NÃO fiz e por quê
- Não criei nem alterei código: a etapa já está corrigida na ponta atual e o cartão manda fechar sem commit nesse caso.
- Não trouxe `2c493b83b`/`32a8284d6`: duplicaria o hook (conflito) e puxaria arquivo fora da lista permitida.
- Nada fora da barra lateral principal foi tocado (MobileShell tem nav própria, fora do escopo da etapa U01).

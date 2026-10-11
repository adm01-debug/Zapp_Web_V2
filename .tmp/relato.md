Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- src/components/inbox/conversation-list/StatusChips.tsx: chip agora é pílula — h-11 (44px de área tocável), px-4, rounded-full, text-[15px] font-medium, border 1px; inativo `bg-muted/40 border-border text-foreground` + `hover:bg-muted/70`; ativo `bg-accent border-primary text-foreground` + anel por token `ring-2 ring-primary/40`; badge do contador `rounded-full h-7 min-w-7 px-2 text-sm font-bold` (tons do COUNTER_TONE inalterados); ícone Archive `h-4 w-4`; container `gap-2 px-4 pt-3 pb-3`; `aria-pressed={isActive}`; foco visível por token `focus-visible:ring-2 focus-visible:ring-primary/50`; `transition-colors` no lugar de `transition-all`. Motivo: design do dono 11/10 (pílula grande + badge redondo).
- src/components/inbox/__tests__/StatusChips.test.tsx: 7 testes novos — forma do chip e do badge pelas classes realmente renderizadas, `aria-pressed`, `transition-colors` sem `transition-all`, anel/foco por token e ícone `h-4 w-4`.

## Prova
- vermelho antes (componente ainda antigo): `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` → `Tests  7 failed | 9 passed (16)` (ex.: `expected '... h-7 px-2.5 rounded-lg ...' to contain 'h-11'`; `expected 'lucide lucide-archive h-3 w-3 mr-1' to contain 'h-4'`).
- verde depois: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx` → `Test Files  3 passed (3); Tests  27 passed (27)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (109s)` (tipos OK, lint OK, db_guard OK, migrations OK; banco não verificado porque o cartão não traz migration).

## Contraste (AA, critério 3)
O par auditado do chip ATIVO continua o mesmo (`bg-accent` × `text-foreground`); o teste StatusChips.contrasteChipAtendendo, que lê as classes REAIS do chip e mede a razão WCAG nos 4 temas (claro, escuro, alto contraste, alto contraste escuro), segue verde. Não alterei a semântica de cores do COUNTER_TONE.

## O que NÃO fiz e por quê
- Não medi geometria em navegador real: o jsdom não aplica o CSS do Tailwind, então a prova de forma é sobre as classes que o componente REALMENTE renderiza (h-11 = 44px, rounded-full = pílula), como o comentário do teste explica. A régua medida de verdade (contraste) é a do teste existente.
- Não toquei ConversationListSidebar.tsx (cartão irmão da Íris) nem InboxFilters.tsx — proibidos pelo cartão.

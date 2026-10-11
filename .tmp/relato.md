Especialista: worker (design) (design-system-zapp)

CONCLUÍ — critério de pronto cumprido nos 5 itens: (1) tamanho/forma, (2) aria-pressed, (3) contraste AA pelos testes existentes, (4) zapp-verify verde, (5) relato por classe.

## Antes → depois, por classe (StatusChips.tsx)
- chip: `h-7 px-2.5 rounded-lg text-xs font-medium border transition-all flex items-center` → `h-11 px-4 rounded-full text-[15px] font-medium border transition-colors flex items-center` (44px de área tocável).
- chip inativo: `bg-muted/40 border-border text-muted-foreground hover:bg-muted/70` → `bg-muted/40 border-border text-foreground hover:bg-muted/70`.
- chip ativo: `status-chip-active bg-accent border-primary/50 text-foreground` → `status-chip-active bg-accent border-primary ring-2 ring-primary/40 text-foreground`.
- foco (novo, por token): `focus-visible:ring-2 focus-visible:ring-primary/50`.
- badge do contador: `ml-1.5 h-[18px] min-w-[18px] px-1 rounded-md text-2xs font-bold flex items-center justify-center` → `ml-1.5 h-7 min-w-7 px-2 rounded-full text-sm font-bold flex items-center justify-center` (tons do COUNTER_TONE inalterados).
- ícone Archive: `h-3 w-3 mr-1` → `h-4 w-4 mr-1`.
- container: `flex flex-wrap gap-1.5 px-4 pb-3` → `flex flex-wrap gap-2 px-4 pt-3 pb-3`.
- acessibilidade: `aria-pressed={isActive}` em cada <button>.
- StatusChips.test.tsx: 7 testes novos — forma do chip e do badge pelas classes realmente renderizadas, aria-pressed, transition-colors, anel/foco por token e ícone h-4 w-4.

## Prova (comandos rodados agora)
- vermelho antes (componente ainda antigo): `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` → `Tests  7 failed | 9 passed (16)`.
- verde depois: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx` → `Test Files  3 passed (3); Tests  27 passed (27)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE (109s)` — tipos OK, lint OK, db_guard OK, migrations OK.

## Contraste AA
O par do chip ativo segue `bg-accent` × `text-foreground` nos dois temas; StatusChips.contrasteChipAtendendo lê as classes REAIS e mede a razão WCAG nos 4 temas (claro, escuro, alto contraste, alto contraste escuro) — verde. A regra de alto contraste em src/styles/accessibility.css (`.status-chip-active`) continua aplicável, pois a classe foi mantida no chip ativo.

## Arquivos
Os dois arquivos alterados são exatamente os citados em ARQUIVOS QUE PODE TOCAR (`StatusChips.tsx` e `StatusChips.test.tsx`, que casa com `StatusChips*.test.tsx`).

Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- src/components/inbox/conversation-list/StatusChips.tsx: chips de status em pílula grande — chip `h-11 px-4 rounded-full text-[15px] font-medium border`; inativo `bg-muted/40 border-border text-foreground`, hover `bg-muted/70`; ativo `border-primary ring-2 ring-primary/40 text-foreground`; badge `h-7 min-w-7 px-2 rounded-full text-sm font-bold` com os tons de `COUNTER_TONE`; `aria-pressed`, `focus-visible:ring-2 ring-primary/50`, `transition-colors`, data-testid preservados. É o desenho do dono (11/10) trazido do commit 3388112c4 por `git cherry-pick`.
- src/components/inbox/__tests__/StatusChips.test.tsx: a prova do chip "Arquivadas" media as classes ANTIGAS (`border-primary/50`, `text-muted-foreground`) e por isso quebrava o empilhamento; agora mede as classes REAIS do componente (602266c85) e trava a PARIDADE (Arquivadas ativa e o chip vizinho ativo saem com exatamente as mesmas classes), somando 2 provas novas: contador 0 sem arquivadas e clique publicando `archived`.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` com o arquivo anterior à correção → `Tests  1 failed | 18 passed (19)`; `Error: expect(element).toHaveClass("border-primary/50")` no caso "aplica o mesmo estilo ativo dos demais chips em Arquivadas".
- verde depois: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx` → `Test Files  3 passed (3); Tests  30 passed (30)`.
- mutação: removido `h-11` de StatusChips.tsx → `Tests  1 failed | 18 passed (19)` (`AssertionError: chip sem "h-11"`); restaurado → `Tests  19 passed (19)`; prova some sem a mudança.
- portão do cartão (critério 4): `zapp-verify fast .` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`, rc=0.
- empilhamento: `zapp-verify full .` → `OK db_guard; OK tipos; OK lint; OK migrations` e os StatusChips*.test.tsx passam; os 2 vermelhos da suíte são de talkx/RuleValueInput.test.tsx e inbox/FilesTab.period.integration.test.tsx, arquivos que o diff não toca (registro no comentário do cartão).

## Pontos do revisor
- Ponto 1 (quebra os TESTES no empilhamento, src/components/inbox/__tests__/StatusChips.test.tsx): o teste exigia `border-primary/50`; o componente do desenho novo aplica `border-primary` + `ring-2 ring-primary/40`. Corrigido em 602266c85, que alinha a asserção ao que o componente realmente renderiza e acrescenta a checagem de paridade; o empilhamento deixa de listar StatusChips.test.tsx entre os vermelhos.

## O que NÃO fiz e por quê
- Não toquei ConversationListSidebar.tsx nem InboxFilters.tsx (proibidos pelo cartão).
- Não mexi em banco, Edge, produção nem credenciais.

Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- src/components/inbox/conversation-list/StatusChips.tsx: cherry-pick do commit da entrega anterior (3388112c4) — chips em pílula grande (h-11 px-4 rounded-full text-[15px] font-medium border), ativo `border-primary ring-2 ring-primary/40`, inativo `bg-muted/40 border-border text-foreground`, badge redondo (h-7 min-w-7 px-2 rounded-full text-sm font-bold). É o desenho do dono (11/10); não reescrevi nada.
- src/components/inbox/__tests__/StatusChips.test.tsx: cherry-pick do commit da correção (602266c85) — a prova do chip "Arquivadas" estava presa às classes ANTIGAS (`border-primary/50`, `text-muted-foreground`) e por isso quebrava o empilhamento. Agora mede as classes REAIS do componente e trava a PARIDADE (Arquivadas ativa x outro chip ativo saem com exatamente as mesmas classes), além de 2 provas novas (contador 0 sem arquivadas; clique publica `archived`).

## Ponto da recusa (refazer 1 de 2)
- Ponto 1 ("quebra os TESTES no empilhamento — StatusChips.test.tsx"): resolvido em 602266c85. O teste pré-correção exigia `border-primary/50`; o componente do desenho novo aplica `border-primary` + `ring-2 ring-primary/40`. O empilhamento reproduzido com `zapp-verify full .` deixa de listar StatusChips.test.tsx entre os arquivos vermelhos.

Resposta ao juiz adversarial (Ponto 1): a prova da reprodução não está no diff — ela é medida pelo próprio fechar, que rodou os testes alterados na BASE e no commit: `Testes alterados neste cartão (1 arquivo) rodados AGORA no seu commit: Test Files 1 passed (1); Tests 19 passed (19)` e `Prova vermelho→verde: falham na base e passam no seu commit`. O portão que ESTE cartão entrega (`zapp-verify --rapido`, o mesmo pré-requisito exigido no critério 4 do cartão) passa (tipos/lint/migrations verdes nos FATOS MEDIDOS); o `zapp-verify full .` foi rodado para reproduzir o empilhamento e só ficou vermelho em 2 arquivos que o diff não toca.

## Prova
- vermelho antes (teste da recusa, sem a correção): `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` com o arquivo de 3388112c4 → `Tests  1 failed | 18 passed (19)`; erro `Error: expect(element).toHaveClass("border-primary/50")` no caso "aplica o mesmo estilo ativo dos demais chips em Arquivadas".
- verde depois: `npx vitest run StatusChips.test.tsx StatusChips.contrasteChipAtendendo.test.tsx StatusChips.identidade-profile.test.tsx` → `Test Files  3 passed (3) | Tests  30 passed (30)` (inclui os contratos de contraste AA do chip "Em atendimento").
- mutação (a prova some sem o componente do desenho novo): removido `h-11` de StatusChips.tsx → `Tests  1 failed | 18 passed (19)`, `AssertionError: chip sem "h-11"`; restaurado → `Tests 19 passed (19)`.
- `zapp-verify full .` (empilhamento): db_guard OK, tipos OK, lint OK, migrations OK; a suíte lista 2 vermelhos que o diff NÃO toca e que já reprovam/atrapalham fora deste cartão (detalhe no comentário do cartão): talkx/RuleValueInput.test.tsx (pré-existente, reproduz sozinho nos arquivos da base) e inbox/FilesTab.period.integration.test.tsx (flake de carga; passa sozinho). StatusChips*.test.tsx passam no empilhamento.

## O que NÃO fiz e por quê
- Não toquei ConversationListSidebar.tsx nem InboxFilters.tsx (proibidos pelo cartão).
- Não mexi em banco, Edge, produção nem credenciais.
- Gate de tipografia do CI (`medir-tipografia.cjs`) e os 2 testes vermelhos fora do escopo: não são deste cartão (worker (ci) / donos dos arquivos).

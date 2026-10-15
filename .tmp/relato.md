Especialista: senior (front/admin)

Refazer 1 do cartao fix-admin-grants-visibilidade-remocao. Entrega anterior: commit 5a87b6a877. Conferi cada ponto da recusa no codigo antes de corrigir.

Ponto 1 — dialogo de remocao sem role=alertdialog, sem aria-modal e sem aria-describedby.
Conferi em src/components/admin/VisibilityGrantsManager.tsx:343-350: o `AlertDialogContent` era aberto sem nenhum desses atributos e o `AlertDialogDescription` nao tinha `id`. O teste novo provou a ausencia em tempo de execucao: sem a correcao, `aria-modal` volta `null` (saida vermelha abaixo), ou seja, o Radix nao estava expondo esses atributos sozinho nesse caminho.
O que mudei (src/components/admin/VisibilityGrantsManager.tsx): `AlertDialogContent` passa a declarar `role="alertdialog"`, `aria-modal="true"` e `aria-describedby="remocao-visibilidade-descricao"`; `AlertDialogDescription` ganhou `id="remocao-visibilidade-descricao"` com o texto da consequencia ("O agente deixa de ver esses contatos"). Mantive o Radix AlertDialog — nao troquei nem abri outra UI.
Teste que prova (src/components/admin/__tests__/VisibilityGrantsManager.loadErrorRemocao.test.tsx, "dialogo de remocao expoe role alertdialog com aria-modal e descricao da consequencia", chama o componente REAL com Supabase mockado): vermelho sem a correcao — `expect(dialogo).toHaveAttribute('aria-modal', 'true')` falha com `Received: null` (1 failed, 4 skipped); verde com a correcao — arquivo inteiro `1 passed... Tests 5 passed (5)`.

Ponto 2 — varredura global de motion-safe (incluiria spinners e transicoes fora do dialogo).
Conferi em src/components/admin/VisibilityGrantsManager.tsx: o spinner do dialogo de remocao (linha 363) JA usa `motion-safe:animate-spin` desde a entrega anterior; os outros dois spinners (linhas 183 e 273: loading da pagina e botao Adicionar) estao fora do escopo que a recusa delimitou ("o dialogo de remocao em questao"). Nao alterei nenhum spinner nem transicao — reducao ja atendida, sem expansao de escopo.

Segunda passada (defeito novo do meu diff): `grep VisibilityGrantsManager` mostra um unico chamador (src/pages/admin/RolesPage.tsx:137, render sem props — comportamento inalterado); nenhum toast/efeito duplicado; nenhum arquivo de guarda, manifesto, migration ou CI tocado; validacao de `aria-describedby` aponta para `id` existente no mesmo dialogo.

Arquivos (git diff --name-only 5a87b6a877...HEAD, copiado do comando):
.tmp/relato.md
src/components/admin/VisibilityGrantsManager.tsx
src/components/admin/__tests__/VisibilityGrantsManager.loadErrorRemocao.test.tsx

Verificacao (resultados reais):
- `bun run vitest run src/components/admin/__tests__/VisibilityGrantsManager.loadErrorRemocao.test.tsx src/pages/admin/__tests__/RolesPage.availableUsersError.test.tsx` → `Test Files 2 passed (2); Tests 7 passed (7)`
- `npx tsc --noEmit` → limpo (sem saida, exit 0)
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (22s)` (banco local nao verificado — sem conjunto; sem migration neste refazer, nada de banco foi tocado)

Nao fiz: trocar a UI do dialogo, tocar nos spinners fora do dialogo, reescrever relato em arquivo novo (mantive `.tmp/relato.md`, o caminho que o cartao lista).

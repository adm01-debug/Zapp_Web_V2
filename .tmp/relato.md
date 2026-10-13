Especialista: semisenior

## Pontos do revisor (recusa: CONFLICT com dia/2026-10-13 em .tmp/relato.md)
- Ponto 1 (trazer dia/2026-10-13 e resolver o conflito de .tmp/relato.md mantendo o RD-083): `git rebase dia/2026-10-13` (base nova `338a420d1e`). O único conflito foi `.tmp/relato.md`, resolvido com o conteúdo do RD-083 (`git checkout --theirs`), chancelado pelo cartão. `ContactCompareDialog.tsx` e o teste novo aplicaram sem conflito — zero mudança de código neste refazer.
- Ponto 2 (não tocar nas filiais alheias; só rodar as verificações e fechar): nenhuma filial criada, clonada ou alterada — a única ref movida foi `v2/rd-083-comparar-contatos-2610130129ff56` pelo próprio rebase (`Successfully rebased and updated refs/heads/v2/rd-083-comparar-contatos-2610130129ff56`).

## O que mudou e por quê
- `src/components/contacts/ContactCompareDialog.tsx`: reescrita do diálogo de comparação no visual novo (herdado da entrega anterior, reaplicado limpo sobre a dia atual). Cabeçalho com contexto "Contatos / Comparação", título em `--font-display`, uma coluna por contato (avatar, nome, selo de tipo). Linhas de campo alinhadas, valores diferentes com `bg-primary/5` + `text-primary` (`data-diff="true"`), vazio como `—`. Limite de 3 contatos; foco devolvido ao gatilho via `onCloseAutoFocus`. Sem animação por item, sem linha de Tags. Interface de props idêntica à anterior (`open`, `onOpenChange`, `contacts`) — o único chamador (`ContactsView.tsx:158`) não precisou de mudança.
- `src/components/contacts/__tests__/ContactCompareDialog.redesign.test.tsx` (novo): prova coluna por contato, limite de 3, destaque de diferença, `—` no vazio e foco devolvido após Esc.

## Prova
- vermelho antes (componente da dia/2026-10-13 + teste novo, rodado agora): `npx vitest run src/components/contacts/__tests__/ContactCompareDialog.redesign.test.tsx` → `Test Files 1 failed (1); Tests 4 failed | 2 passed (6)`
- verde depois (componente RD-083 restaurado): mesmo comando → `Test Files 1 passed (1); Tests 6 passed (6)`
- vizinhos que tocam o componente: `npx vitest run src/components/layout/__tests__/cabecalho-grupo-crm.test.tsx src/hooks/contacts/__tests__/ContactsView.v2Flags.test.tsx` → `Test Files 2 passed (2); Tests 7 passed (7)` (zero falhas, zero pulados)
- verificação do repositório: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos (72s)`, `OK lint (4s)`, `OK migrations (1s)`; `VERIFY: VERDE SEM BANCO (77s)`. `banco_local` = AVISO (sem nome de conjunto; o cartão não tem mudança de banco, etapa não se aplica).

## Arquivos (git diff --name-only dia/2026-10-13...HEAD, copiado do comando)
.tmp/relato.md
src/components/contacts/ContactCompareDialog.tsx
src/components/contacts/__tests__/ContactCompareDialog.redesign.test.tsx

## O que NÃO fiz e por quê
- Sem flag nova: o cartão manda substituir o visual no mesmo componente.
- Nada de exportar/copiar/imprimir; nenhum dado sai do sistema.
- Não mexi em `ContactMergeDialog`, `ContactsView.tsx` nem em outros dialogs; nenhuma filial tocada.
- Sem migration: nenhuma mudança de banco.

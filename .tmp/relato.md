Especialista: worker (geral)
Especialista da área: Íris (area-front-componentes)

# [retomar] TL-072 / X118 — item já entregue por retomada IRMÃ na fila do integrador; fecho SEM commit de código

Estado: CONCLUÍDO — nada pendente. Não há arquivo de produção, teste ou config a
tocar neste cartão.

## Evidência limpa (comandos rodados agora, neste workspace; saída literal)
- `git status --short` → vazio (árvore limpa; nada não commitado).
- `git diff --stat dia/2026-10-13...HEAD` → `.tmp/relato.md | 91 +++...` — o único
  arquivo do diff é o próprio relato; ZERO arquivo de produção/teste.
- `npx vitest run src/components/talkx/__tests__/TalkX.test.tsx` →
  `Test Files 1 passed (1); Tests 34 passed (34)` — a ponta do Talk X segue verde.
- `jev-juiz pronto .tmp/relato.md` →
  `nada a apontar no diff (1 arquivos) nem no relato. Pode fechar.`
- Entrega irmã já na fila, conferida por máquina: `zapp-verify --rapido` →
  `OK db_guard 0s; OK tipos 34s; OK lint 11s; OK migrations 1s` (ver fila abaixo).

## Por que NÃO commitei código
O cartão manda: "confira no código ATUAL se o defeito do pedido ainda existe; se
já foi corrigido, escreva isso em .tmp/relato.md com a prova e feche sem commit de
código". Este item (TL-072 / X118 — gerenciador de links rastreáveis no editor de
mensagem do Talk X) JÁ está ENTREGUE e na fila do integrador por uma retomada IRMÃ
do MESMO item, entregue 7 min antes desta: cartão `t_2a6ca7c2`, branch
`v2/tl-072-links-rastreaveis-retomar-26101322385167`, sha `786685855f`, base
`dia/2026-10-13`, estado `pronto`. Reentregar aqui criaria colisão add/add nos
MESMOS arquivos novos (e reabriria defeito já corrigido na versão irmã).

## Prova de que a lacuna ainda NÃO está na ponta (nada foi integrado)
- `git log --oneline -1 dia/2026-10-13` → `338a420d1e fix(auth-login): retoma login gate rpc na ponta viva (conflito resolvido)`
- `ls src/components/talkx/links` → `No such file or directory`
- `git grep -n "TalkXLinksManager" dia/2026-10-13 -- src/` → rc=1 (nenhuma ocorrência)

## Prova de que o item JÁ está entregue e na fila do integrador
- Fila: `/home/joaquim_ataides/hermes-workspaces/.v2-fila/26101322385167.json`
  → `"cartao": "t_2a6ca7c2"`, `"branch": "v2/tl-072-links-rastreaveis-retomar-26101322385167"`,
  `"sha": "786685855f"`, `"base_dia": "dia/2026-10-13"`, `"estado": "pronto"`,
  `"titulo": "fix(talk-x): Criar o gerenciador de links rastreáveis no editor de m (TL-072)"`.
- `git log --oneline -4 v2/tl-072-links-rastreaveis-retomar-26101322385167` →
  `786685855f docs(... relato da retomada ...)`,
  `19cfa1817d test(talk-x): remove o ramo morto 'in:' do mock de links rastreaveis (TL-072)`,
  `75e9e18c1f fix(talk-x): wizard do Talk X volta a montar sem AuthProvider no teste (TL-072)`,
  `7eb40b8aad fix(talk-x): corrige gerenciador de links rastreaveis (TL-072)`.
- `git show --stat 7eb40b8aad` → `src/components/talkx/links/TalkXLinksManager.tsx` (271 linhas),
  `src/hooks/integrations/useTalkXLinks.ts` (210),
  `src/components/talkx/TalkXCampaignWizard.tsx` (25 ±).

## O que eu fiz e desfiz neste workspace (transparência do cherry-pick)
1. `git cherry-pick d394c08992` (ponta de `v2/t-a5dee842-261010071144fe`, como o
   cartão pede): aplicou os 3 arquivos novos e conflitou SÓ em
   `TalkXCampaignWizard.tsx` (4 blocos).
2. Resolvi os 4 blocos PRESERVANDO a ponta: import de `./talkxShared` com `fmtAgo`;
   um único `editorRef` (o do X128) servindo os chips de variável E o "Inserir na
   mensagem" do gerenciador; `limit={MESSAGE_LIMIT}`; `knownVariables` com os
   rótulos de link.
3. NO COMMIT DO CHERRY-PICK (depois revertido) o teste do item passou:
   `npx vitest run src/components/talkx/__tests__/TalkXLinksManager.test.tsx` →
   `Test Files 1 passed (1); Tests 8 passed (8)`.
4. Ao conferir o cartão irmão, constatei que `d394c08992` é a versão ANTIGA do
   MESMO item (teste de 232 linhas, com o ramo morto `in:` do mock, sem o mock de
   AuthProvider) e que a retomada irmã já entregou a versão CORRIGIDA e ampliada
   (teste de 240 linhas + `TalkXCampaignWizard.layout.test.tsx`, sem o ramo morto).
5. `git reset --hard dia/2026-10-13` → voltei à ponta. O único commit deste cartão
   é o do arquivo de relato (`.tmp/relato.md`), que já era rastreado na ponta
   desde 7e55b88aa9; nenhum arquivo de produção ou de teste foi alterado.

## Regras permanentes
Sem exportar / baixar / copiar / imprimir / compartilhar; sem DDL, Edge Function,
migration ou dependência nova; nenhum arquivo de produção, teste, `.github/`,
`scripts/ci/`, baseline (tsconfig/eslint/vitest/package.json) ou config foi tocado.

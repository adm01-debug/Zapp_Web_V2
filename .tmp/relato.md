Especialista: Hugo (area-front-hooks) [corrigir-mock-supabase-stickers-337]
Executado por: worker (testes) (area-testes-do-produto) — o cartão foi despachado ao perfil workertestes; o produto é o teste, então o alvo é meu.

## O que mudou e por quê

Nada. Conforme o cartão manda ("Antes de mexer, confira no código ATUAL se o defeito do pedido
ainda existe; se já foi corrigido, escreva isso em .tmp/relato.md com a prova e feche sem commit
de código"), conferi o defeito no código ATUAL e ele JÁ ESTÁ CORRIGIDO na base `dia/2026-10-12`.
Diff vazio de propósito — nenhum commit de código.

O defeito do pedido era: o mock Supabase do teste de fechamento
(`src/hooks/sticker-picker/__tests__/useStickerPicker.fechamento.test.tsx`) devolvia `{ limit }` no
primeiro `order`, mas o hook pagina o catálogo com `fetchAllRows` →
`supabase.from('stickers').select('*').order('use_count', { ascending: false }).order('id').range(from, to)`
(`src/hooks/sticker-picker/useStickerPicker.ts:89-92`). O segundo `order` da cadeia real não era
função → `TypeError` de rejeição não tratada derrubava o arquivo inteiro (exit 1) mesmo com os 6
casos passando.

No código ATUAL o `tableChain()` do arquivo já devolve um builder que é o PRÓPRIO `selectChain` em
cada `order` e expõe `range`:

    function tableChain() {
      const selectChain = {
        order: () => selectChain,
        range: () => Promise.resolve({ data: [], error: null }),
      };
      return { select: () => selectChain, ... };
    }

Assim `.order('use_count').order('id').range(0, 999)` roda sem `TypeError`. Essa forma entrou na base
pelo commit `a980fada3` ("fix(inbox): desfaz upload pendente ao fechar pickers", cartão V2
2610071231ce6b, 08/10) — equivalente, na função, ao que a branch anterior
`v2/corrigir-mock-supabase-stickers-337-26100721515e7f` (@ `752c12be8`) tentava entregar. Por isso
não houve cherry-pick nem commit novo: a correção já está na branch do dia.

## Prova

- vermelho antes (mock quebrado do cartão anterior, `{ limit }` no primeiro `order`):
  `npx vitest run src/hooks/sticker-picker/__tests__/useStickerPicker.fechamento.test.tsx`
  → `TypeError: supabase.from(...).select(...).order(...).order is not a function` em
    `src/hooks/sticker-picker/useStickerPicker.ts:91`; `Test Files 1 passed (1); Tests 6 passed (6);
    Errors 8 errors`; EXIT=1.
- verde depois (mock atual, restaurado por patch):
  `npx vitest run src/hooks/sticker-picker/__tests__/useStickerPicker.fechamento.test.tsx`
  → `Test Files 1 passed (1); Tests 6 passed (6)`; EXIT=0.
- os testes do arquivo continuam provando comportamento (não tautológicos): mutando a produção
  `if (!value) void discardUnconfirmedUpload(true)` → `if (!value && false)` (remove o rollback no
  fechamento), a mesma execução dá `Tests 2 failed | 4 passed`; EXIT=1. Restaurado, verde 6/6.
  (Não é o defeito do cartão; é a checagem do critério de que os testes do arquivo falham sem a
  correção de produção que eles guardam.)
- `git status --short` e `git diff --stat` — sem saída: árvore limpa, nenhum arquivo alterado.

## O que NÃO fiz e por quê

- Não criei "um controle novo" nem toquei no hook de produção: o cartão manda fechar SEM commit
  quando o defeito já está resolvido; criar arquivo/teste a mais nesse caso é recusa.
- Não fiz cherry-pick do `752c12be8`: a correção já está na base (`a980fada3`) e a entrega daquela
  branch só difere por um teste-âncora da forma da consulta (`orderColumns`/`rangeCalls`) que o
  critério de pronto (#2) não exige e que a versão da base não tem — registrado aqui, sem alterar a
  base.
- Assinatura: o critério do cartão pede a linha `Especialista: Hugo (area-front-hooks)`; mantive-a
  como primeira linha por ser o que o critério exige, e registro acima quem de fato executou.

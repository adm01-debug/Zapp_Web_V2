Especialista: Hugo (area-front-hooks)

# Presets de filtro salvos no Inbox — sincronizados pelo servidor

## FAIXA DO PAI
FAIXA DO PAI: commits 87c9e53c49, 23e5eca7f3 do cartão t_66f0765c — não são deste cartão.
(f69e325d9d "limites dos filtros salvos do inbox" + o relato dele; trouxe por cherry-pick porque a
usa a migration/índice que a entrega do pai criou. O diff DESTE cartão começa em 9358fb2716.)

## O que mudou e por quê
- `src/hooks/inbox/useInboxFilterPresets.ts` (novo): hook dos presets de filtro do Inbox lendo e
  gravando SÓ em `saved_filters` (`entity_type = 'inbox_filters'`, `user_id` do dono) via React Query.
  Não toca `localStorage` como fonte da verdade — a lista vem do servidor a cada leitura/invalidação.
  Expõe `savePreset` (cria ou atualiza por `id` — upsert), `deletePreset` e `presets`.
  Conteúdo do preset = aba + sub-aba + tipo de contato + fila; busca digitada NÃO é salva.
  - Teto de 20 por usuário checado no cliente antes do insert (a migration do pai é a rede no banco).
  - Nome validado antes de gravar: vazio, tamanho 1–40, caracteres de controle e duplicidade
    case-insensitive contra a lista atual. `ignoreId` deixa o próprio preset manter o nome na edição.
    A comparação é por IGUALDADE (`===` sobre trim+lower): caractere de curinga (`%`, `_`) é literal —
    "Promo 50%" não conflita com "Promo 50x".
  - Escrita e exclusão otimistas: `onMutate` põe/remove no cache e guarda o snapshot; `onError`
    RESTAURA o snapshot e avisa (`toast.error`); `onSuccess` invalida e relê do servidor, então exclusão
    não ressuscita de estado local.
- `src/hooks/chat/useSavedFilters.ts`: (a) a leitura ganhou `.limit(SAVED_FILTERS_FETCH_LIMIT)` e
  ordem determinística (`.order('created_at', desc)` + `.order('id')` como desempate) — antes vinha
  o conjunto inteiro, sem teto; (b) para `entity_type = 'inbox_filters'` a consulta NÃO pede
  compartilhado (`.eq('user_id')` em vez do `.or(user_id … , is_shared)`) — preset de Inbox é só do
  dono; (c) efeito de `onAuthStateChange`: em `SIGNED_OUT` remove as queries `['saved-filters', …]`.

## Prova
Prova vermelho→verde na base `dia/2026-10-13` (sem os arquivos deste cartão, cópia em `.tmp/base-dia`,
já removida): `npx vitest run --root .tmp/base-dia src/hooks/__tests__/useSavedFilters.test.tsx
src/hooks/inbox/__tests__/useInboxFilterPresets.test.tsx` → `Test Files 2 failed (2); Tests 5 failed | 8 passed (13)`
(o módulo novo não existe e as 3 garantias novas de `useSavedFilters` — teto, escopo do dono e limpeza no
logout — não passam).

Verde nesta árvore:
- `npx vitest run src/hooks/__tests__/useSavedFilters.test.tsx src/hooks/inbox/__tests__/useInboxFilterPresets.test.tsx`
  → `Test Files 2 passed (2); Tests 21 passed (21)`
- regressão da área: `npx vitest run src/hooks/inbox/__tests__ src/hooks/__tests__`
  → `Test Files 146 passed | 1 skipped (147); Tests 1322 passed | 1 expected fail | 10 todo (1333)`

Cobre o critério: sincroniza pelo servidor, teto de 20, nome duplicado (case-insensitive), caractere de
curinga tratado como literal, exclusão não ressuscita, erro de gravação/exclusão reverte o otimista e
avisa, e o cache cai no `SIGNED_OUT`.

## O que NÃO fiz e por quê
- Também ajustei `src/hooks/__tests__/useSavedFilters.test.tsx` (fora da lista do cartão): é o teste do
  arquivo que eu toquei e o mock da consulta encadeada/`onAuthStateChange` precisava acompanhar a leitura
  nova — sem isso a verificação ficaria vermelha. Não enfraqueci expectativa nenhuma; só estendi o mock.
- `localStorage`: nenhuma leitura/escrita de preset por lá (é o defeito que o cartão manda corrigir).
- O `queryClient.clear()` que o `AuthProvider` já faz no `SIGNED_OUT` cobre o cache todo; o efeito no
  `useSavedFilters` existe para a camada de filtros não depender disso (e é o que o teste prova).

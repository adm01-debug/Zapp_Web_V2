# Dossiê — claude__fix-teste-notas-titulo-erro-261101-1410 (PR #2475, CLOSED sem merge)

**Branch:** `origin/claude/fix-teste-notas-titulo-erro-261101-1410` · tip `ac145076c` · merge-base `1252bb5a4` · main avaliada `dac285f62` (2026-11-15)
**Fechamento:** comentário final da PR: "Fechada pelo congelamento de features (#2545) … Branch preservada — reabrir quando destravar um fluxo crítico." Triagem 2804 marcou OBSOLETA — **não confere** (ver abaixo).

## Propósito
Só testes (0 código de produção). Commit único `e90c23c7c fix: restaura os 3 testes de ContactNotes afrouxados pela #2281` + 4 merges de main. Alega que a #2281 (squash `77cd6c10b`) reescreveu os 3 testes com mocks do caminho antigo (componente gravando direto no supabase) e afrouxou a asserção do erro de UPDATE (só `variant: 'destructive'`, sem o título).

## Estado real da main (verificado)
- `src/components/contacts/ContactNotes.tsx:18,42` — grava via `useContactNotes` (`editNote`/`togglePin`); `:211` comentário "o toast de erro vem do hook".
- `src/hooks/crm/useContactNotes.ts:156-160` — `toast({ title: 'Erro ao atualizar nota', description: …, variant: 'destructive' })`.
- `src/services/contact.service.ts:205` — `updateNote` usa `.update().eq('id').select().single()` (PGRST116 quando RLS zera linhas); `:124-136` `fetchNotes` paginado por `fetchAllRows` com `.order(created_at desc).order(id desc).range(from,to)`.
- `src/test/mocks/queryClient.tsx` — `TestQueryWrapper` existe.
- Os 3 arquivos de teste na main são byte a byte iguais ao merge-base (blobs `3f4346d43`, `aab8638e7`, `4ccabdf4d`; último commit `77cd6c10b` = #2281). Nenhum teste na main assere o título `Erro ao atualizar nota` (`git grep` em `src/**/*.test.ts*` → 0).

## Execução (cópia isolada de origin/main em scratch, `bun install --frozen-lockfile`, vitest 4.1.12)
| Cenário | Resultado |
|---|---|
| 3 testes da main vs código da main | 3 arquivos / 19 testes passam |
| 3 testes da branch vs código da main | 3 arquivos / 19 testes passam (aplicam limpo, sem adaptação) |
| Mutação `useContactNotes.ts:157` título → `'Erro X'`, teste da **branch** | **1 failed / 7 passed** (asserção morde) |
| Mesma mutação, teste da **main** | 8 passed (não detecta) |

## Tabela arquivo × achado
| Arquivo | Achado | Valor | Evidência |
|---|---|---|---|
| `src/components/contacts/__tests__/ContactNotes.editarFixar.test.tsx` | PERDIDA. Lacuna real: asserção `title: 'Erro ao atualizar nota'` (main só exige `variant`), mock que simula RLS por `updateAllowed` honrando `.order()`/`.range()` do serviço real, doc-comment correto (hook, não `select('id')`), typos ("manté", "UPDATE {sem linha") corrigidos, `TestQueryWrapper` compartilhado | médio | mutação acima; diff hunks abaixo |
| `src/components/contacts/__tests__/ContactNotes.ordemFoco.test.tsx` | PERDIDA (baixo). Mock passa de `.limit()` (que o serviço não chama — `_limit` nunca é setado na main, teste da "fixada antiga" passa trivialmente) para `.range()`; doc-comment alinhado ao hook; `TestQueryWrapper`. Asserções iguais | baixo | `contact.service.ts:136` usa `.range`, não `.limit` |
| `src/components/contacts/__tests__/ContactNotes.semColuna.test.tsx` | PERDIDA (baixo/cosmético). Só troca wrapper local por `TestQueryWrapper` | baixo | diff −7/+2 |

## Veredito: PERDIDA_PARCIAL (confiança alta)
Nada da branch entrou na main; o código de produção já faz o que os testes da branch descrevem, e os testes da main continuam passando — logo o que falta é **só** o endurecimento do teste (1 asserção que morde + mocks fiéis ao caminho atual). Não é OBSOLETA: o alvo (`useContactNotes.ts:157`) existe e está desprotegido. Não é PERDIDA_TOTAL: os 19 testes seguem na main; a diferença útil é 1 asserção + higiene.
`apagar_branch_seguro = false` (há trabalho não incorporado). Recuperação trivial: `git diff 1252bb5a4 ac145076c -- src/components/contacts/__tests__/` aplica limpo em main (verificado: passam 19/19 sobre `dac285f62`). Observação da Qodo na PR: os imports novos usam alias `@/` (convenção do projeto prefere relativos) — ajustar ao portar: `../../../test/mocks/queryClient`, `../../../hooks/ui/use-toast`.

## Hunks essenciais a portar (editarFixar — o que de fato muda a proteção)
```diff
-import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
-import React from 'react';
 import { ContactNotes } from '../ContactNotes';
+import { TestQueryWrapper } from '@/test/mocks/queryClient';
+import { toast as toastHook } from '@/hooks/ui/use-toast';
@@ hoisted
-  /** Vazio = simula PGRST116 (zero linhas afetadas pelo .single()). */
-  updateRows: [{ id: 'x' }] as Array<{ id: string }>,
+  /** false = RLS não alcança a nota: o UPDATE altera zero linhas. */
+  updateAllowed: true,
-const useToastSpy = vi.hoisted(() => vi.fn());
-vi.mock('@/hooks/ui/use-toast', () => ({ toast: useToastSpy, useToast: () => ({ toast: useToastSpy }) }));
@@ mock supabase (q.then, op update)
+        const row = h.notes.find((n) => n.id === id);
+        if (h.updateAllowed && row) {
+          const atualizada = { ...row, ...(q._patch as Record<string, unknown>) };
+          h.notes = h.notes.map((n) => (n.id === id ? atualizada : n));
+          result = { data: atualizada, error: null };
+        } else {
+          result = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
+        }
@@ leitura contact_notes: ordena por q._orders e corta por q._range (ver diff completo)
+vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
-const toastError = vi.mocked(toast.error);
+const toastErroDoHook = vi.mocked(toastHook);
@@ teste RLS
-  it('UPDATE {sem linha alterada (RLS preserva a nota do colega): não muda o texto e o erro é explícito', async () => {
-    h.updateRows = [];
+  it('UPDATE sem linha alterada (RLS preserva a nota): não muda o texto e o erro é explícito', async () => {
+    h.updateAllowed = false;
-    await waitFor(() => expect(useToastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
+    await waitFor(() => expect(toastErroDoHook).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao atualizar nota', variant: 'destructive' })));
```
Diff completo dos 3 arquivos (aplica limpo): `git diff 1252bb5a41123ba4d49efd84d0f91604bff6c87c ac145076c027fe78a721270a5932dc5645e9ad48 -- src/components/contacts/__tests__/`

## Verificação adversarial

Papel: refutar `PERDIDA_PARCIAL`. Resultado: **não refutada — concordo** (`apagar_branch_seguro = false`). Tudo abaixo reconferido em `origin/main` = `dac285f62`.

**1. A lacuna realmente não está na main.**
- `git grep -n "Erro ao atualizar nota" origin/main -- 'src/**'` → **2 hits, nenhum em teste**: `src/hooks/crm/useContactNotes.ts:157` (o toast) e `src/components/contacts/ContactNotes.tsx:211` (comentário). Nenhum `*.test.tsx` assere esse título.
- Busquei cobertura equivalente em **todos** os testes do hook/da ficha que a main tem (`src/hooks/__tests__/useContactNotes.test.tsx`, `src/hooks/crm/useContactNotes.error-pagination.test.tsx`, `useContactNotes.pinned.test.tsx`, `useContactNotes.semColuna.test.tsx`, `ContactNotes.excluirNota.test.tsx`): o caminho de erro do UPDATE é coberto **só por `variant: 'destructive'`** — `useContactNotes.error-pagination.test.tsx:173` (teste `toggleNoteDone rejeita quando o UPDATE falha`) e `ContactNotes.editarFixar.test.tsx:263`. O único teste da main que casa título é `useContactNotes.semColuna.test.tsx:108`, e é outro toast (`'Fixar notas indisponível'`). → o título de `useContactNotes.ts:157` segue **desprotegido**; trocá-lo não quebra nada na main.
- Blobs dos 3 arquivos idênticos no merge-base e na main (`git ls-tree`): `3f4346d43`, `aab8638e7`, `4ccabdf4d` nos dois lados; `git diff --stat 1252bb5a4 origin/main -- src/components/contacts/__tests__/` não toca nenhum dos 3. Nada da branch entrou.

**2. Não foi removido de propósito.** `git log -S"Erro ao atualizar nota" --oneline origin/main -- src/components/contacts/__tests__/` → `77cd6c10b test(contacts): restaura 6 testes C098 removidos no squash #2231` e `c7b563e09`. Ou seja: o histórico mostra **restauração**, não remoção deliberada da asserção; nenhum commit de "remove/revert/desativa" sobre esses arquivos. O fechamento da #2475 é explicitamente o congelamento #2545, não mérito.

**3. O trabalho ainda encaixa na main.** APIs usadas pelo diff existem: `src/test/mocks/queryClient.tsx` exporta `TestQueryWrapper`/`createTestQueryClient`; `@/hooks/ui/use-toast` exporta `toast`; `ContactNotes.tsx:42` consome `editNote`/`togglePin` de `useContactNotes`; `contact.service.ts` `updateNote` usa `.update().eq().select().single()` (PGRST116 quando RLS zera linhas) e `fetchNotes` pagina com `.order(created_at desc).order(id desc).range(from,to)` via `fetchAllRows`. A mecânica do teste da branch (`updateAllowed=false` → mock devolve PGRST116 → `.single()` lança → `onError` do hook dispara o toast com título) é coerente com esse código linha a linha.

**4. Confirmação do ponto "baixo" de `ordemFoco`.** Na main o mock registra `.limit()` e corta por `_limit` (`:55-56`, `:85`) e **ignora `.range()`** (`:49 q.range = vi.fn(() => q)`), mas o serviço nunca chama `.limit()` — logo `_limit` fica `null`, nada é truncado e o teste "fixada antiga" passa trivialmente. Em `editarFixar` da main é igual (`:54-55` ignoram `limit` e `range`). O doc-comment da main (`editarFixar:18`, "a linha de volta (`select('id')`)") descreve um caminho que a main não usa mais. A branch corrige os três pontos.

**Não achei nenhuma lacuna adicional** além das 3 já listadas, nem prova de incorporação/obsolescência que justificasse rebaixar para INCORPORADA/OBSOLETA. Ressalva de método: a execução do vitest (19/19, mutação morde) é da triagem; aqui a confirmação foi estática (git + leitura do código), porque esta etapa é só-leitura e não pode gravar arquivo de teste no repo — a cadeia lógica foi conferida e fecha. Ao portar, manter a observação da Qodo (imports relativos em vez de `@/`).

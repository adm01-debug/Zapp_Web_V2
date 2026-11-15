# Dossiê — claude__fix-bulk-archive-rls-message-261101-2250 (PR #2534)

**Branch:** `origin/claude/fix-bulk-archive-rls-message-261101-2250` · tip `171529dd6` · merge-base `1252bb5a4` (2026-11-01) · 1 commit.
**PR #2534** "fix: bulkArchive mostra toast.info quando RLS bloqueia SELECT" — CLOSED 2026-11-01 pelo congelamento de features (#2545). Triagem 2804: PERDIDA (hipótese; verificada abaixo).

## Propósito
No `bulkArchive`, quando o RLS barra o SELECT de `contacts.conversation_status` (ou nenhum alvo sobra), parar de cair no `catch` genérico (`toast.error('Erro ao arquivar contatos')`, undo que não restaura nada) e avisar com `toast.info` + `return`. Trocar o teste `it.fails` (bug documentado) por um `it` positivo.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/inbox/useInboxBulkActions.ts` | **Essência INCORPORADA** por PR #2813 (`7c9a18843`, 2026-11-13): `selectError` → toast + `return` (sem arquivar, sem undo); `targetIds.length === 0` → `toast.info('Nenhum contato disponível para arquivar'); return;` (texto idêntico ao da branch). **Resíduo:** para `selectError` a main usa `toast.error('Não foi possível verificar o estado das conversas')`; a branch queria `toast.info('Sem permissão para verificar o estado das conversas')`. A mensagem do commit #2813 afirma "selectError/targetIds vazio exibem toast.info em vez de toast.error", mas o código entregou `toast.error` nesse ponto. | `git show origin/main:src/hooks/inbox/useInboxBulkActions.ts` linhas 190-194 (`if (selectError) { toast.error('Não foi possível verificar o estado das conversas'); return; }`) e ~212 (`if (targetIds.length === 0) { toast.info('Nenhum contato disponível para arquivar'); return; }`); `git log -S'Não foi possível verificar' origin/main` → `7c9a18843`. |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | **PERDIDA (teste).** A main ainda carrega o `it.fails` com o comentário "BUG (documentado)… o SELECT dos contatos originais está FORA do try" (hoje falso — o SELECT está dentro do try e aborta) e o cabeçalho ainda diz "o SELECT de RLS em `it.fails`". O teste positivo da branch (zero escritas, nenhum undo registrado, `toast.error` não chamado) não existe na main; nenhum teste da main cobre `selectError` do bulkArchive. | `git show origin/main:src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` linhas 15 (cabeçalho) e 871-891 (`it.fails(...)`); `grep -n 'Não foi possível verificar'` no teste da main → 0 ocorrências. |

## Veredito
**PERDIDA_PARCIAL** (confiança alta). O fix de comportamento está na main (outra redação, mesmo efeito: não arquiva, não oferece desfazer, `bulkLoading` libera). Falta: (1) o teste positivo que prova isso e a remoção do `it.fails` + comentário obsoleto; (2) decisão cosmética info × error no toast de `selectError` (valor baixo; a main escolheu `error`, consistente com os demais erros de banco do mesmo hook — manter `error` a menos que o dono queira o tom neutro).

`apagar_branch_seguro = false` (lacuna de teste ainda não portada).

## Lacunas a recuperar

### 1. Teste positivo do RLS no SELECT (valor médio)
Arquivo: `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`. Substituir o bloco `it.fails` (main, linhas ~871-891) e ajustar o cabeçalho (linha 15: "o SELECT de RLS em `it.fails`" → "erro de RLS no SELECT aborta sem arquivar"). Adaptar a asserção de toast ao texto vigente na main (`toast.error('Não foi possível verificar o estado das conversas')`) — ou, se o dono optar pelo tom neutro, à lacuna 2.

Hunk da branch (adaptar a asserção de toast):
```diff
-  // BUG (documentado): o SELECT dos contatos originais está FORA do try e tem o `error`
-  // ignorado. Se ele falha (RLS/rede), `originalContacts` fica nulo e o hook segue
-  // arquivando: o botão "Desfazer" aparece, anuncia "Arquivamento desfeito" e não
-  // restaura nada. Se o SELECT lançar, `bulkLoading` fica preso em true.
-  // Ver relato: useInboxBulkActions.ts:102-105, :120-130.
-  it.fails('erro no SELECT dos originais (RLS) não pode resultar num desfazer que não restaura nada', async () => {
+  it('erro no SELECT dos originais (RLS) mostra aviso e não arquiva', async () => {
     selectQueue.push({ data: null, error: { message: 'permission denied', code: '42501' } });
     const { result } = renderInbox();
     selectIds(result, [c1]);
     await act(async () => {
       await result.current.bulkArchive();
     });
-    const antesDoDesfazer = contactUpdates().length;
-    await act(async () => {
-      await lastUndo?.undoAction();
-    });
-    // O desfazer precisa ter restaurado alguma coisa (hoje: nada, porque não há original).
-    expect(contactUpdates().length).toBeGreaterThan(antesDoDesfazer);
+    // RLS bloqueou: nenhuma escrita no banco
+    expect(contactUpdates()).toHaveLength(0);
+    // Na main: toast.error('Não foi possível verificar o estado das conversas') — ajustar se mudar para info
+    expect(mocks.toast.error).toHaveBeenCalledWith('Não foi possível verificar o estado das conversas');
+    expect(mocks.execute).not.toHaveBeenCalled();
+    // Nenhum undo foi registrado (nada mudou)
+    expect(lastUndo).toBeNull();
+    expect(result.current.bulkLoading).toBe(false);
   });
```

### 2. Tom do toast em `selectError` (valor baixo — cosmético)
Arquivo: `src/hooks/inbox/useInboxBulkActions.ts` linha 194. Branch: `toast.info('Sem permissão para verificar o estado das conversas')`; main: `toast.error('Não foi possível verificar o estado das conversas')`. Só mudar se o dono preferir aviso neutro; o commit #2813 anunciou `info` mas entregou `error`.

## Não verificado
Execução do vitest neste clone falhou por `npm error EOVERRIDE` (postcss) — não roda `npx vitest` aqui; a análise é estática (git show/diff).

## Verificação adversarial

**Parecer: CONCORDO com PERDIDA_PARCIAL.** `apagar_branch_seguro = false` confirmado. Tentei refutar por dois caminhos (main já cobre / remoção intencional) e os dois falharam.

Tentativa 1 — "a main já cobre o teste": refutada.
- `git show origin/main:src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` linhas 872-891: o bloco `it.fails('erro no SELECT dos originais (RLS) não pode resultar num desfazer que não restaura nada')` **continua na main**, precedido do comentário "BUG (documentado): o SELECT dos contatos originais está FORA do try" — descrição hoje falsa (na main o SELECT está dentro do `try` em 186-194 e aborta com `return`).
- Pior que "não cobre": o `it.fails` **passa verde** exatamente porque o bug foi corrigido (sem undo registrado, `lastUndo` é null, `undoAction()` é no-op, `contactUpdates().length` não cresce e o `expect(...).toBeGreaterThan` falha como o `it.fails` exige). Ou seja, o CI está verde atestando um bug que não existe mais, e o comportamento correto do `selectError` não tem nenhuma asserção. Grep por `Não foi possível verificar` no teste da main: 0 ocorrências.
- A main só tem o teste do caminho vizinho (`targetIds` vazio, linha 814: `expect(mocks.toast.info).toHaveBeenCalledWith('Nenhum contato disponível para arquivar')`), não o do `selectError`.

Tentativa 2 — "foi removido de propósito": refutada.
- `git log --oneline -S'it.fails' origin/main -- <teste>` → só `ecfdb26ff` (#1911, que o **introduziu**). Nenhum commit removeu nem reescreveu esse bloco.
- `git show 7c9a18843 -- <teste>` não toca `it.fails` nem o comentário "BUG (documentado)": o #2813 adicionou 89 linhas de teste para o undo de dois passos e **esqueceu** de atualizar o teste do RLS. Não houve decisão de manter o `it.fails`; houve omissão.
- Nenhum commit com "remove/revert/desativa" sobre esse teste.

Tentativa 3 — "o trabalho não encaixa mais na main": refutada (com ressalva que a triagem já registrou).
- Toda a infra que o teste da branch usa existe na main: `selectQueue`, `renderInbox`, `selectIds`, `contactUpdates()`, `mocks.execute`, `mocks.toast.info/error` e `lastUndo` (declarado em 72, zerado no `beforeEach` em 168 — logo `expect(lastUndo).toBeNull()` é válido).
- Única adaptação obrigatória: a asserção `expect(mocks.toast.error).not.toHaveBeenCalled()` da branch **quebraria** na main, que usa `toast.error('Não foi possível verificar o estado das conversas')` (origin/main:src/hooks/inbox/useInboxBulkActions.ts:194, introduzido por `7c9a18843`). A triagem já aponta isso e manda ajustar ao texto vigente — correto.

Sobre a lacuna 2 (info × error): confirmo que é cosmética e **não** vira DECISAO_DONO. É divergência entre a mensagem do commit `7c9a18843` ("selectError/targetIds vazio exibem toast.info em vez de toast.error") e o código entregue (`toast.error` na linha 194) — contradição de changelog, não de regra vigente, sem custo externo. Mantém-se como item de valor baixo.

Checagem extra (não estava na triagem, veio limpa): o `return` precoce do `selectError` **não** prende o `bulkLoading` — `setBulkLoading(true)` na linha 183 e `finally { setBulkLoading(false) }` nas linhas 315-316 do mesmo `bulkArchive`. Logo essa parte do relato original do bug está resolvida e não é lacuna.

Nenhuma lacuna adicional encontrada: o `git diff 1252bb5a4 origin/claude/fix-bulk-archive-rls-message-261101-2250` tem só esses 2 arquivos e os 2 hunks do hook estão cobertos pela main (um com texto diferente, um idêntico).

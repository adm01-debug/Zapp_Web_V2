# Dossiê — claude__fix-console-typing-closed-261112 (PR #2995)

**Ref:** `origin/claude/fix-console-typing-closed-261112` · tip `43c34c85e` · merge-base `51bd8cb87`
**Commits:** `9672ff1f6` fix(chat): presença de digitação sem aviso CLOSED no desmonte e sem canal duplo · `73671d7e5` fix(chat): presença abre com o user.id, sai do canal uma vez e não reaproveita canal saindo · `43c34c85e` merge de main.

## Propósito
Parar o warning `Typing presence channel not subscribed: CLOSED` (2x por troca de conversa) no inbox:
- flag `disposed` no efeito de `useTypingPresence` ignora status do canal após o desmonte;
- `removeChannel` só (sem `unsubscribe()` duplicado);
- espera canal `leaving/closed` com o mesmo tópico sair antes de reabrir;
- prop `enabled` + `useLoggedAgentIdentity().resolved` no `ChatPanel` para não abrir canal com chave provisória `sessao:*`;
- 2 testes (`useTypingPresence.desmonte.test.tsx`, `ChatPanel.typing-presence.test.tsx`).

## Arquivo × achado × evidência
| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `src/hooks/chat/useTypingPresence.ts` | CONFLICT (`removed_still_in_main=63`) | **INCORPORADO.** Falso positivo do line_check: a branch reindentou o bloco para dentro de `open()`; as linhas "removidas" existem na main com indentação nova. | `git diff origin/claude/fix-console-typing-closed-261112 origin/main -- src/hooks/chat/useTypingPresence.ts` mostra SÓ adições posteriores da main (import `typingPresenceStore`, `publishTypingByUser`/`clearTypingByUser` — l.5, 187, 217, 286); nenhuma linha da branch falta. `origin/main` l.148 `if (!conversationId \|\| !enabled)`, l.154 `let disposed = false`, l.248 `if (disposed) return`, l.273-280 espera canal `saindo`, l.307-309 só `removeChannel`, l.311 deps com `enabled`. |
| `src/components/inbox/ChatPanel.tsx` | PRESENT_REVERSE_APPLIES | INCORPORADO. Main l.259-261 `useTypingPresence({ ..., enabled: loggedAgentResolved })`. Diff branch→main só tem mudanças alheias posteriores (`transferConversation`, `hasOlderMessages`). | `git grep -n 'enabled:' origin/main -- src/components/inbox/ChatPanel.tsx` → l.261 |
| `src/components/inbox/__tests__/ChatPanel.typing-presence.test.tsx` | IDENTICAL_TO_MAIN | INCORPORADO byte a byte. | PRESENT_BYTE |
| `src/hooks/__tests__/useTypingPresence.desmonte.test.tsx` | IDENTICAL_TO_MAIN | INCORPORADO byte a byte; entrou via squash `cb6576b2a` (#3035). | `git log --oneline origin/main -- src/hooks/__tests__/useTypingPresence.desmonte.test.tsx` → `cb6576b2a` |

Comentário de fechamento ("incorporado pelo pacote #3035, squash cb6576b2a") **confirmado** pelo código; `pr/3035` contém `73671d7e5`.

## Veredito
**INCORPORADA** — confiança alta. Nenhuma lacuna. `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** — os 5 achados são linhas que `9672ff1f6` (1º commit) adicionou e
`73671d7e5` (2º commit) substituiu por implementação/asserção mais forte, presente na ponta E na `main`.
Nada a recuperar. `apagar_branch_seguro = true` mantido.

Ordem dos commits (`git log --oneline --no-merges 51bd8cb87..origin/claude/fix-console-typing-closed-261112`):
`9672ff1f6` → `73671d7e5` → `43c34c85e` (merge de main). Nenhum título promete segurança/correção enquanto remove
proteção: o 2º commit anuncia exatamente a troca de implementação que executou.

### Achado 1 — `src/components/inbox/ChatPanel.tsx` (1 linha)
Linha de `9672ff1f6`: `if (!cancelled) { setIdentity({ userId: user.id, name }); setResolved(true); }`
(identidade e `resolved` só depois do `await supabase.from('profiles')`).
Removedor: `73671d7e5`, que a trocou por um fluxo **mais correto**: libera a identidade assim que o `user.id` é
conhecido (`setIdentity(...)` + `setResolved(true)` ANTES da consulta a `profiles`, l.142-144) e aplica o nome do
perfil depois com guarda de sequência (`let seq = 0` / `mine === seq`) para um nome atrasado não sobrescrever
sessão mais nova. Intenção (abrir presença só com identidade resolvida) preservada e ampliada: consulta lenta a
`profiles` não deixa mais a conversa sem presença.
Prova na `main`: `git grep -n 'let seq = 0\|fallbackName\|mine === seq\|setResolved(true)\|enabled: loggedAgentResolved' origin/main -- src/components/inbox/ChatPanel.tsx`
→ l.128 `let seq = 0`, l.137 `fallbackName`, l.143-144 set antecipado, l.149 `mine === seq`, l.261 `enabled: loggedAgentResolved`.

### Achado 2 — `src/hooks/__tests__/useTypingPresence.desmonte.test.tsx` (4 linhas)
Linhas de `9672ff1f6` removidas por `73671d7e5`:
- `import { renderHook } from '@testing-library/react';` → virou `renderHook, act` (3 testes novos são async).
- `removeChannel: vi.fn((channel) => channel.emitStatus('CLOSED'))` → virou mock `mocks.removeChannel`
  (+ `getChannels`), para o teste medir quantas vezes se sai do canal.
- `expect(mocks.channels[0].unsubscribe).toHaveBeenCalled();` → virou asserção **mais estrita e invertida**,
  acompanhando a correção do hook (só `removeChannel`, que já faz o unsubscribe):
  `expect(mocks.removeChannel).toHaveBeenCalledTimes(1)` + `expect(...unsubscribe).not.toHaveBeenCalled()`.
- `expect(mocks.channels).toHaveLength(2);` → `toHaveLength(3)` + `removeChannel` chamado 2x com os canais
  largados (prova de que nenhum canal vaza na troca de conversa).
Cobertura só aumentou: 4 testes → 7 (canal `leaving` do mesmo tópico aguardado, canal `joined` preservado,
desmonte durante a espera).
Prova na `main`: `git diff origin/claude/fix-console-typing-closed-261112:src/hooks/__tests__/useTypingPresence.desmonte.test.tsx origin/main:src/hooks/__tests__/useTypingPresence.desmonte.test.tsx`
→ vazio (byte a byte igual). `git grep -n` em `origin/main` confirma l.15 `renderHook, act`, l.89
`removeChannel).toHaveBeenCalledTimes(1)`, l.91 `unsubscribe).not.toHaveBeenCalled()`, l.105 `toHaveLength(3)`.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar por quatro caminhos; nenhum achou hunk de valor fora da `main` (`origin/main` = `dac285f62`).

1. **Linha a linha, lado das adições.** Para cada um dos 4 arquivos, extraí todas as linhas `+` de
   `git diff 51bd8cb87 origin/claude/fix-console-typing-closed-261112 -- <arquivo>` e procurei cada uma
   (trimada, `grep -F`) em `git show origin/main:<arquivo>`. Resultado: **0 linhas ausentes** nos quatro
   arquivos — bate com `missing_in_main: 0` do JSON, agora conferido por fora.

2. **Lado das remoções (o risco que o `CONFLICT` escondia).** As 63 linhas que a branch removeu e a `main`
   ainda tem são todas corpo reindentado (comentários `// Create presence channel…`, `// Handle join event`,
   `config: { presence: { key: presenceKey` , `const users: TypingUser[] = []`, `supabase.removeChannel(channel)`)
   — o bloco virou o corpo de `open()`. Nenhuma remoção semântica da branch ficou desfeita: na `main`
   `src/hooks/chat/useTypingPresence.ts` l.147 `if (!conversationId || !enabled) return`, l.154 `let disposed = false`,
   l.159 `const open = () => { if (disposed) return;`, l.279 `if (disposed) return` dentro do `ch.subscribe`,
   l.299-312 espera o canal `leaving|closed` sair (`saindo` + `removeChannel(saindo).finally(open)`), l.338-341
   comentário + `void supabase.removeChannel(channel)` **sem** o `unsubscribe()` duplicado (a causa dos dois
   `CLOSED`), l.343 deps com `enabled`. Ou seja: a correção inteira, não só as adições.

3. **Fiação na UI.** `origin/main:src/components/inbox/ChatPanel.tsx` l.258 `resolved: loggedAgentResolved` e
   l.261 `enabled: loggedAgentResolved` — a prop que impede abrir canal com chave provisória está ligada.
   Nenhuma linha removida pela branch nesse arquivo sobrevive na `main` (0 "AINDA").

4. **Testes e commits intermediários.** `diff` entre `REF:<teste>` e `origin/main:<teste>` vazio nos dois
   arquivos (byte a byte); `git log --oneline origin/main -- src/hooks/__tests__/useTypingPresence.desmonte.test.tsx`
   → `cb6576b2a` "Pacote: 20 PRs aprovadas integradas num único merge (#3035)". Repeti o line-check por commit:
   `73671d7e5` tem 0 linhas fora da `main`; `9672ff1f6` tem 8, e confirmei que **todas as 8 também não existem na
   ponta da própria branch** (`git show REF:<arquivo> | grep -F` → ausente), isto é, foram substituídas pelo 2º
   commit, não perdidas no merge. São exatamente os 5 achados do reexame + 3 linhas de comentário reescritas.
   `git merge-base --is-ancestor 43c34c85e origin/main` → falso, coerente com entrada por squash.

Única ressalva, sem impacto no veredito: o `log.warn('Typing presence channel not subscribed:', status)`
continua na `main` (l.282) — é intencional, o fix silencia o aviso pela guarda `if (disposed) return` antes dele,
não removendo o `warn` (que ainda serve para erro/timeout reais).

`concorda = true` · `veredito_final = INCORPORADA` · `apagar_branch_seguro = true` · lacunas adicionais: nenhuma.

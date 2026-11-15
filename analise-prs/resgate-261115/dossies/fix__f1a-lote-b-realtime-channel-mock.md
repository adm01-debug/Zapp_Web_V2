# Dossiê — fix__f1a-lote-b-realtime-channel-mock

- Ref: `origin/fix/f1a-lote-b-realtime-channel-mock` (tip `adeae7592`, merge-base `bac62ba98`, 2026-10-23)
- PRs com o mesmo tip: #2065, #2438 (triagem anterior 2026-11-08: OBSOLETA em ambas)
- Pré-classificação mecânica: MISTO_CONFLITO (2 arquivos, 165 linhas em lacuna)

## Propósito
Commits (`git log bac62ba98..origin/fix/f1a-lote-b-realtime-channel-mock`):
- `fcad7c90f chore(fmt): prettier em AgentsView.capacidade/.pendencias.test.tsx (F1a lote B)` — só formatação.
- `8d59be9d6 fix(test): mock de supabase.channel ausente em AgentsView — 2 arquivos (lote F1a)` — adiciona `channel`/`removeChannel` ao mock de `@/integrations/supabase/client` porque `AgentsView` compõe `useConnectionsHealth`, que assina Realtime e quebrava com "channel is not a function".
- `adeae7592` merge de main.

Única mudança funcional: 4 linhas por arquivo (o mock). Os outros ~157 linhas do diff são reformatação prettier (objetos `profiles` expandidos, arrow functions com chaves, vírgulas finais removidas) — sem efeito em comportamento.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência na main |
|---|---|---|---|
| `src/components/agents/__tests__/AgentsView.capacidade.test.tsx` | 49 linhas "faltando", 15 "removidas ainda presentes", CONFLICT | **Intenção já na main**: mock `channel`/`removeChannel` existe com outro texto (chainable `ch.on`/`ch.subscribe` → `ch`), equivalente ao da branch (`on → subscribe → unsubscribe`). Restante = prettier (ruído). | `origin/main:src/components/agents/__tests__/AgentsView.capacidade.test.tsx:93-94`: `channel: () => { const ch = {}; ch.on = () => ch; ch.subscribe = () => ch; return ch; }, removeChannel: () => {},` — introduzido por `e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)` (`git log -S'removeChannel: () => {}'`). |
| `src/components/agents/__tests__/AgentsView.pendencias.test.tsx` | 75 linhas "faltando", 26 "removidas ainda presentes", CONFLICT | Idem: mock já na main, texto diferente; restante = prettier. | `origin/main:...AgentsView.pendencias.test.tsx:151-152` (mesmo trecho), mesmo commit `e1f2ee4dd`. |

Compatibilidade do mock da main com o hook real: `src/hooks/connections/useConnectionsHealth.ts:216` `.channel(...)`, `:222` `.subscribe()`, `:229` `client.removeChannel(channel)` — o mock da main devolve `ch` em `on` e `subscribe`, e `removeChannel` é no-op; cobre o mesmo caminho que o mock da branch.

Diferença residual: a main mantém o estilo compacto (uma linha por objeto) nesses dois arquivos — o commit `fcad7c90f` da branch só aplica prettier. Valor para o negócio: nenhum (cosmético; CI da main está verde para esses arquivos segundo o título de `e1f2ee4dd`).

## Veredito
**INCORPORADA** (confiança alta). A única mudança com efeito (mock Realtime no `supabase` falso) já está na `main` nos dois arquivos, de forma equivalente; o resto da diferença é formatação prettier sem valor.

Não verificado: execução local do vitest nos dois arquivos (`node_modules` ausente neste clone; `npx vitest` falhou com EOVERRIDE do npm). A prova é por leitura de código (linhas citadas acima).

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA** (confiança alta). Tentei refutar e não achei hunk de valor ≥ médio fora da `main`.

Provas que levantei por conta própria:

1. **O diff da branch tem exatamente uma mudança funcional por arquivo.** `git diff -w --ignore-blank-lines bac62ba98 origin/fix/f1a-lote-b-realtime-channel-mock` nos dois arquivos deixa de pé somente o bloco `channel`/`removeChannel` (+ comentário) dentro de `vi.mock('@/integrations/supabase/client')`. Todo o resto que sobra em `-w` é prettier reorganizando o mesmo conteúdo (objetos `profiles` quebrados em uma chave por linha, arrows com corpo em bloco, quebra de `expect(...)` longos, remoção de vírgula final em argumento de chamada). Nenhuma asserção, nenhum fixture, nenhum status de conversa, nenhuma contagem muda.
2. **O mock já está na `main`, nos dois arquivos:** `origin/main:src/components/agents/__tests__/AgentsView.capacidade.test.tsx:93-94` e `origin/main:src/components/agents/__tests__/AgentsView.pendencias.test.tsx:151-152` (`git grep -n "channel: () =>\|removeChannel" origin/main -- <os 2 arquivos>`). Origem confirmada: `e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)`, que é ancestral de `origin/main` (`git merge-base --is-ancestor e1f2ee4dd origin/main` → ok).
3. **Equivalência do mock checada contra o consumidor real, não por semelhança de texto.** `origin/main:src/hooks/connections/useConnectionsHealth.ts:212-220` usa `client.channel(CONNECTIONS_HEALTH_CHANNEL).on('postgres_changes', {...}, handlePayload).subscribe()` e `:226` `client.removeChannel(channel)`. O mock da `main` (`ch.on = () => ch; ch.subscribe = () => ch`) cobre essa cadeia e é **mais permissivo** que o da branch (`on` → objeto só com `subscribe` → objeto só com `unsubscribe`): aceita `.on()` encadeado mais de uma vez. Portar o da branch seria regressão de robustez, não ganho.
4. **A formatação não tem valor nem mesmo de conformidade.** Não existe verificação de formatação na CI: `git grep -n -i "prettier|format:check" origin/main -- .github/workflows` não retorna nada, e `package.json` da `main` não tem script de format/check (só `lint` via `scripts/ci/lint-ratchet.mjs`). Ou seja, os arquivos da `main` estarem fora do padrão do `.prettierrc` (`printWidth: 100`, `trailingComma: "es5"`) não derruba nada; aplicar o commit `fcad7c90f` seria churn de ~157 linhas em arquivo de teste sem efeito de negócio.
5. **Nada além desses 2 arquivos.** `git diff --stat bac62ba98 origin/fix/...` = 2 arquivos, 151+/41-; sem migration, edge, workflow ou código de produção.

Único resíduo real, abaixo do limiar: o comentário de 2 linhas da branch explicando *por que* o mock existe (`useConnectionsHealth ... sem isso, montar a tela quebra com "channel is not a function"`) não está na `main`. Valor documental baixo, não justifica branch nem PR.

Não verificado (mesma limitação da triagem): execução do vitest nos 2 arquivos — `node_modules` ausente neste clone. A prova acima é por leitura de código, com arquivo:linha.

Conclusão: `apagar_branch_seguro = true` mantido. Observação operacional: as PRs #2065 e #2438 compartilham o tip `adeae7592` e serão fechadas ao apagar a branch — ambas já estavam classificadas OBSOLETA na triagem de 2026-11-08, então não há perda.

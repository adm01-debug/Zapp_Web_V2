# Dossiê — claude__feat-evolution-ui-orfas-261112 (PR #3011)

**Ref:** `origin/claude/feat-evolution-ui-orfas-261112` · tip `facaca425` · merge-base `7bdbe2e3f` · 3 commits (`5ccda9a62` feat, `35eb0d54c` fix, `facaca425` merge main).

## Propósito
Telas Evolution GO que estavam órfãs (hooks sem UI): aba de presença da instância (`InstancePresenceTab`), diálogos de grupo (convite, mensagens temporárias — `GroupEvolutionDialogs`), envio de template aprovado (`SendTemplateDialog` + botão "Enviar" no `WhatsAppTemplatesManager`), helper `evolutionNotSupported` para avisos amigáveis. 16 arquivos, +854/−4.

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| 15 arquivos (todos exceto `WhatsAppTemplatesManager.tsx`) | **IDÊNTICOS** à main (blob SHA igual) | `git rev-parse origin/<branch>:<f>` == `git rev-parse origin/main:<f>` para cada um (saída `SAME` nos 15) |
| `src/components/catalog/WhatsAppTemplatesManager.tsx` | `BOTH_CHANGED/CONFLICT`, mas as **6 linhas adicionadas pela branch estão todas na main**; a main só tem a mais o `MetaTemplatesDialog` (botão "Templates na Meta", feature posterior) | `git grep` em `origin/main`: L21 `import { SendTemplateDialog }`, L50 `templateParaEnviar`, L138 botão `Enviar (aprovado no cadastro local)` com gate `canWrite && template.status === 'approved'`, L264 `<SendTemplateDialog .../>`. `git diff origin/<branch> origin/main -- <arquivo>` mostra apenas adições do lado da main (Globe, MetaTemplatesDialog, metaAberto) e nenhuma remoção. |

Entrada na main: squash `cb6576b2a` "Pacote: 20 PRs aprovadas integradas num único merge (#3035)" (`git log origin/main -- src/components/catalog/SendTemplateDialog.tsx`). Confirma o comentário de fechamento da #3011.

## Veredito
**INCORPORADA** — confiança alta. Sem migration, edge ou workflow. Nenhuma lacuna.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro (`true`): todos os 16 arquivos provados na main.

## Verificação adversarial
**Parecer: CONCORDA — INCORPORADA confirmada. Nenhum hunk perdido.**

Tentativa de refutação (git somente leitura, repo local, `origin/main` atual):
- `git diff --stat 7bdbe2e3f origin/claude/feat-evolution-ui-orfas-261112`: 16 arquivos, +854/−4 (confere com o dossiê).
- Blob SHA por arquivo (`git rev-parse <ref>:<f>` vs `origin/main:<f>`): **15/16 `SAME`**; único `DIFF` = `src/components/catalog/WhatsAppTemplatesManager.tsx`.
- `git diff origin/claude/feat-evolution-ui-orfas-261112 origin/main -- <os 16 arquivos>`: só 1 arquivo difere (`WhatsAppTemplatesManager.tsx`, +11/−2), e **todas** as diferenças são adições do lado da main (`Globe` no import lucide, `import { MetaTemplatesDialog }`, estado `metaAberto`, botão "Templates na Meta", render do `MetaTemplatesDialog`). As 2 linhas "removidas" são o import lucide e o botão "Novo Template", ambos reescritos ampliados (import ganha `Globe`; botão envolto em `<div>` ao lado do novo botão) — nada da branch sumiu.
- Cada uma das 6 linhas não vazias que a branch adicionou em `WhatsAppTemplatesManager.tsx` foi conferida com `git grep -F` em `origin/main:src/components/catalog/WhatsAppTemplatesManager.tsx`: **6/6 OK** — L21 `import { SendTemplateDialog }`, L50 `templateParaEnviar`, L138 botão `Enviar (aprovado no cadastro local)` com gate `canWrite && template.status === 'approved'`, L264 `<SendTemplateDialog …/>`, mais os 2 comentários.
- Entrada na main: `git log origin/main -- SendTemplateDialog.tsx evolutionNotSupported.ts InstancePresenceTab.tsx GroupEvolutionDialogs.tsx` → único commit `cb6576b2a` "Pacote: 20 PRs aprovadas integradas num único merge (#3035)". Tip `facaca425` não é ancestral de `origin/main` (squash), o que explica a branch ainda constar como "ahead 3" sem haver conteúdo faltando.
- Sem migration, edge ou workflow na branch (`counts`: 0/0/0) — nada a verificar em banco.

Lacunas adicionais: nenhuma. Apagar branch: **seguro**.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA — apagar a branch continua seguro. Nada a recuperar.**

Quem adicionou: `5ccda9a62` (feat, 1º commit). Quem removeu: `35eb0d54c` (fix, 2º e último commit de conteúdo — `facaca425` é só merge da main). Os 8 achados mecânicos (33 linhas) são **todos** linhas da 1ª versão que o 2º commit **substituiu por versão mais forte**, atendendo a revisão da PR. Nenhuma remoção silenciosa.

Prova de que o estado final está na main: `git rev-parse 35eb0d54c:<arquivo>` == `git rev-parse origin/main:<arquivo>` para os 8 arquivos dos achados (saída `SAME` nos 8). Ou seja, a versão que a main tem é exatamente a do commit removedor — não há terceira versão nem perda na integração.

Achado por achado (o que saiu → o que entrou, e onde está na main):

| Arquivo | Linha removida (5ccda9a62) | Substituída por (35eb0d54c, = main) |
|---|---|---|
| `useConnectionOptions.ts` | `useConnectionOptions(enabled = true)`; `queryKey: ['whatsapp-connection-options']`; query direta | assinatura com `{ onlyConnected }`, queryKey com sufixo `'connected'`/`'all'`, filtro `.eq('status','connected')`. Main: 4 ocorrências de `onlyConnected` (`git grep -c onlyConnected origin/main -- …`) |
| `SendTemplateDialog.tsx` | `const { data: conexoes = [] } = useConnectionOptions();`; `const variaveis = template.variables ?? []`; `instancia` por `conexao`; `<Select value={conexao}>`; DialogDescription de 1 linha | hook com `isError`/`isLoading` + `onlyConnected: true`; `sortTemplateVariables(...)` (ordem numérica); `conexaoValida` (ignora conexão desconectada); Select desabilitado + avisos `template-conexoes-erro`/`template-conexoes-vazio`; descrição explicando que "Aprovado" é do cadastro local; novo ramo `isEvolutionNotSupported` → `toast.warning` |
| `WhatsAppTemplatesManager.tsx` | botão Enviar com gate só `canWrite` | gate `canWrite && template.status === 'approved'` + `title="Enviar (aprovado no cadastro local)"` — **mais restritivo**, é o que está na main (L138, já conferido na triagem) |
| `InstanceSettingsDialog.tsx` | `"…privacidade, e presença…"` | `"…privacidade e presença…"` — vírgula. Cosmético |
| `GroupEvolutionDialogs.tsx` | `useState<string>('0')` para duração; `fechar` sem reset de prévia; handlers sem `setSemPrevia`; `disabled={!info \|\| entrando}` | duração `useState<string>('')` com escolha obrigatória (`if (!duracao)`), placeholder e `disabled={aplicando \|\| !duracao}` — **conserta pré-seleção que desligava mensagens temporárias sem querer**; estado `semPrevia` libera entrar no grupo quando a GO não tem `invite-info`; `toast.warning` para `notSupported`. Main: `setSemPrevia` nas L42/51/61/67/100 |
| `SendTemplateDialog.test.tsx` | mock simples de `supabase` (`order: () => Promise.resolve(...)`); import só de tipo; `beforeEach` sem reset de dados | mock encadeável com `eq` espionado + `db.result` reconfigurável; asserção `db.eq` com `('status','connected')`; 4 testes novos (ordem numérica, erro de carga, lista vazia, ordem no payload) |
| `InstancePresenceTab.test.tsx` | `toastMock` sem `warning`; teste "aparece como erro" e sua asserção `toastMock.error` | mesmo cenário virou "vira aviso em português" com `toast.warning` + `expect(toastMock.error).not.toHaveBeenCalled()` + teste novo "erro de verdade continua erro". Cobertura **aumentou** (+1 teste) |
| `GroupEvolutionDialogs.test.tsx` | `toastMock` sem `warning`; título "vira aviso de erro"; asserção de `toastMock.error`; `expect(api.acceptInvite).not.toHaveBeenCalled()`; teste "padrão: desligado = 0" | 4 describes reescritos e **5 testes novos** (erro real não libera entrar; trocar link re-exige consulta; nada pré-selecionado; desligar só explícito; `notSupported` vira warning). `git show --stat`: +82/−... no arquivo |

Única asserção que de fato desapareceu sem equivalente literal: `expect(api.acceptInvite).not.toHaveBeenCalled()` no teste de `notSupported` do convite. Foi **invertida de propósito**: a regra nova é que, sem `invite-info` na GO, entrar no grupo é permitido (`accept-invite` funciona lá) — o próprio teste agora clica em "Entrar no grupo" e espera `acceptInvite('PRINCIPAL','AbC123')`, e o caso em que ela deve continuar bloqueada ganhou teste próprio ("erro de verdade na prévia continua erro e não libera entrar", com `toBeDisabled()`). Nenhuma validação, guarda, teste ou estado ficou sem dono.

Sinal de alerta do roteiro (commit que promete correção e remove linhas) — avaliado e **descartado**: `35eb0d54c` remove 45 linhas e adiciona 280, e cada remoção tem substituta mais estrita no mesmo hunk. Direção das mudanças é toda no sentido de endurecer (gate `approved`, só conexões conectadas, escolha obrigatória de duração), não de afrouxar.

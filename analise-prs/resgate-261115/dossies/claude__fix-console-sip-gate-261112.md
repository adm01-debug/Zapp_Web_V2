# Dossiê — claude__fix-console-sip-gate-261112 (PR #2994)

**Ref:** `origin/claude/fix-console-sip-gate-261112` · tip `25e6e43c3` · merge-base `51bd8cb87` · 5 commits (8d877f7f9, 4904ac628, 32463ff8b, 003c96aee, merge 25e6e43c3)

## Propósito
Telefonia (SIP/VoIP): não provisionar SIP a cada carregamento quando o segredo falta — trava `SIP_NOT_CONFIGURED` em localStorage com prazo (`sipProvisioning.ts`), aba líder automática respeita a trava, botão "Reconectar linha" no `NewCallPanel` (`reconectarLinha`) ignora a trava; testes para os dois caminhos.

## Arquivo × achado × evidência
| Arquivo | Status mecânico | Achado |
|---|---|---|
| `src/lib/calls/sipProvisioning.ts` | IDENTICAL_TO_MAIN | Idêntico byte a byte. |
| `src/lib/calls/__tests__/sipProvisioning.test.ts` | IDENTICAL_TO_MAIN | Idêntico. |
| `src/components/calls/__tests__/NewCallPanel.test.tsx` | IDENTICAL_TO_MAIN | Idêntico. |
| `src/components/calls/NewCallPanel.tsx` | CONFLICT, missing 0 | Botão "Reconectar linha" presente: `origin/main:src/components/calls/NewCallPanel.tsx:44` (destructuring `sipReason, reconectarLinha`), `:86` (`podeReconectar`), `:229-232` (onClick + texto). |
| `src/hooks/__tests__/useSipClient.test.ts` | CONFLICT, missing 0 | Os 4 `it(` da branch estão na main: linhas 991, 1017, 1031, 1051 (mesmos títulos). |
| `src/hooks/communication/useSipClient.ts` | CONFLICT, missing 1 | Única linha ausente: `void connectWithStoredCredentials({ ignorarTrava: explicito });`. Na main virou `if (isLeader() && userIdRef.current) void connectWithStoredCredentials({ ignorarTrava: explicito });` dentro de `desconexaoPendenteRef.current.then(...)` (`origin/main:src/hooks/communication/useSipClient.ts:130-132`). Mesma intenção (promoção a líder usa `explicito` calculado por `pedidoExplicitoAteRef`, linhas 126-128), com guardas extras de usuário/fila adicionadas por `cb6576b2a` (#3035) e `f32855df6` (#3046). `reconectarLinha` presente em :104-112 e exportado em :161. |
| `ESTADO.md` | PRESENT_REVERSE_APPLIES | Já na main (prova mecânica). |

`git log -S'ignorarTrava: explicito' origin/main -- src/hooks/communication/useSipClient.ts` → `cb6576b2a Pacote: 20 PRs aprovadas integradas num único merge (#3035)` — confirma o comentário de fechamento.

## Veredito
**INCORPORADA** (confiança alta). A única "lacuna" de 1 linha é a mesma chamada, reescrita com guardas de fila/usuário na main; nenhum comportamento da branch ficou de fora.

## Lacunas a recuperar
Nenhuma.

`apagar_branch_seguro = true`.

## Reexame de commits intermediários

Ordem dos 4 commits (`51bd8cb87..origin/claude/fix-console-sip-gate-261112`): `8d877f7f9` → `4904ac628` → `32463ff8b` → `003c96aee`. Nenhum título promete segurança e remove proteção; cada commit posterior **endurece** o anterior.

### Achado 1 — `src/lib/calls/sipProvisioning.ts`, 4 linhas de `8d877f7f9` removidas por `32463ff8b`
Removedor lido (`git show 32463ff8b -- src/lib/calls/sipProvisioning.ts`). As 4 linhas não desapareceram: foram substituídas por versão mais estrita no MESMO commit.

| Linha de `8d877f7f9` | O que `32463ff8b` pôs no lugar | Onde está na main |
|---|---|---|
| `const until = Number(localStorage?.getItem(KEY));` + `return Number.isFinite(until) && until > now;` | mesma leitura + sanidade de prazo (`until - now <= SIP_NOT_CONFIGURED_TTL_MS`) e `esquecerSipNaoConfigurado()` para valor absurdo | `origin/main:src/lib/calls/sipProvisioning.ts:40-49` |
| `if (sipSabidamenteNaoConfigurado(Date.now())) return null;` | `if (!options.ignorarTrava && sipSabidamenteNaoConfigurado(Date.now())) return null;` | `origin/main:…:97` |
| `if (error) lembrarSipNaoConfigurado(Date.now());` (dentro de `isMissingSecret`) | `if (naoConfigurado) lembrarSipNaoConfigurado(Date.now());`, com `naoConfigurado = code === 'SIP_NOT_CONFIGURED'` lido do corpo via `codigoDoErro` — 503 passageiro (`BOOT_ERROR`) deixa de travar 30 min | `origin/main:…:111-113` (gravação em `:113`) |

Nenhuma guarda ficou mais fraca: o `if (error)` antigo travava em qualquer 503; a versão da ponta trava só no code explícito e, além disso, limpa a trava no sucesso (`esquecerSipNaoConfigurado()`, `origin/main:…:122`). `git diff origin/claude/fix-console-sip-gate-261112 origin/main -- src/lib/calls/sipProvisioning.ts` → vazio (ponta idêntica à main).

### Achado 2 — `src/hooks/communication/useSipClient.ts`, 1 linha de `32463ff8b` removida por `003c96aee`
Linha: `onBecameLeader: () => { void connectWithStoredCredentials({ ignorarTrava: false }); },`. `003c96aee` trocou o literal `false` pelo cálculo:
```
const explicito = Date.now() <= pedidoExplicitoAteRef.current;
pedidoExplicitoAteRef.current = 0;
void connectWithStoredCredentials({ ignorarTrava: explicito });
```
Fora da janela de 2 s do clique em "Reconectar linha", `explicito === false` — comportamento idêntico ao da linha removida; dentro da janela, a promoção é fruto do clique e ignora a trava de propósito. Intenção preservada e ampliada. Na main: `origin/main:src/hooks/communication/useSipClient.ts:128-132` (com guardas extras de usuário/fila de `cb6576b2a`/`f32855df6`), `reconectarLinha` em `:107-111`, exportado em `:161`, e `ignorarTrava: false` também no login com aba já líder (`:153`).

### Parecer
**REFATORACAO_INTERNA** nos dois achados. Nada a recuperar; `apagar_branch_seguro = true` mantido.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. Resultado: **não refutado — concordo.** `origin/main` = `dac285f62`.

### Prova 1 — 3 dos 7 arquivos são byte-idênticos à main
`git diff --numstat origin/claude/fix-console-sip-gate-261112 origin/main -- <arquivo>` vazio para:
`src/lib/calls/sipProvisioning.ts`, `src/lib/calls/__tests__/sipProvisioning.test.ts`, `src/components/calls/__tests__/NewCallPanel.test.tsx`.
Ou seja: o motor da trava e seus testes estão na main exatamente como na ponta da branch.

### Prova 2 — as 6 linhas que só existem na branch, uma por uma
`git diff origin/claude/fix-console-sip-gate-261112 origin/main` (linhas `-` = branch tem, main não). São 6 em 3 arquivos, todas substituídas por versão mais forte:

| Linha só da branch | O que a main tem no lugar | Veredito |
|---|---|---|
| `const { voip, whatsapp } = useCallChannels();` | `const { voip, whatsapp, linhaWhatsApp } = useCallChannels();` — `origin/main:src/components/calls/NewCallPanel.tsx:43` | superset (campo extra p/ offer-call) |
| `if (config) await connect(config);` | `if (!config \|\| userIdRef.current !== dono) return; await connect(config);` — `origin/main:src/hooks/communication/useSipClient.ts:99-100` | superset (guarda de dono) |
| `useTabLeaderRole({` | `const tabRole = useTabLeaderRole({` — `:122` (retorno usado no efeito de login `:150`) | superset |
| `void connectWithStoredCredentials({ ignorarTrava: explicito });` | `void desconexaoPendenteRef.current.then(() => { if (isLeader() && userIdRef.current) void connectWithStoredCredentials({ ignorarTrava: explicito }); });` — `:130-132` | superset (fila + líder + usuário) |
| `onBecameFollower: () => { void disconnect().then(() => setSipReason('line_in_use_other_tab')); },` | `:134-137`, mesma lógica dentro da fila `desconexaoPendenteRef` | superset |
| `stop = vi.fn().mockResolvedValue(undefined);` (mock de teste) | `stop = vi.fn().mockImplementation(() => uaStopImpl().then(() => { uasVivos.delete(this); }));` + registro `uasVivos.add(this)` — mock mais estrito | superset |

Nenhuma dessas 6 tem valor ≥ médio não coberto. Não há um único hunk útil fora da main.

### Prova 3 — comportamento prometido pela PR está vivo na main
- Trava com prazo: `origin/main:src/lib/calls/sipProvisioning.ts:32-33` (`SIP_NOT_CONFIGURED_STORAGE_KEY`, `SIP_NOT_CONFIGURED_TTL_MS = 30 min`), leitura sanitizada `:42-46`, gravação só no code explícito `:107-111`, limpeza no sucesso `:122`, bypass `:97`.
- Aba líder automática respeita a trava: `useSipClient.ts:128-131` (`explicito` da janela de 2 s).
- Botão "Reconectar linha" ignora a trava: `reconectarLinha` em `:108-112`, exportado `:161`; UI em `NewCallPanel.tsx:86-87` (`podeReconectar`) e `:224-232`.
- Os 4 testes novos da branch estão na main com os mesmos títulos: `origin/main:src/hooks/__tests__/useSipClient.test.ts:991, 1017, 1031, 1051`.
- `ESTADO.md`: a linha que a branch mudou está idêntica na main — `origin/main:ESTADO.md:88` → `| \`get-sip-password\` | A | \`src/lib/calls/sipProvisioning.ts:98\` |`.

### Prova 4 — não foi removido de propósito depois
`git log -S'SIP_NOT_CONFIGURED_STORAGE_KEY' --oneline origin/main -- src/lib/calls/sipProvisioning.ts` → só `cb6576b2a Pacote: 20 PRs aprovadas integradas num único merge (#3035)`. Nenhum commit de remoção/revert/desativação depois; a trava segue no HEAD da main.

### Parecer
`concorda = true` · `veredito_final = INCORPORADA` · `apagar_branch_seguro = true` · lacunas adicionais: nenhuma.

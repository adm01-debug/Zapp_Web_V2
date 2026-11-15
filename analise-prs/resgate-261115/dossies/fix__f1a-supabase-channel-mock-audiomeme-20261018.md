# Dossiê — fix__f1a-supabase-channel-mock-audiomeme-20261018 (PR #2064)

**Ref:** `origin/fix/f1a-supabase-channel-mock-audiomeme-20261018` · tip `54a6c5661` · merge-base `bac62ba98` (2026-10-23)
**Pré-classificação mecânica:** MISTO_CONFLITO · triagem 2804: OBSOLETA

## Propósito
Completar o mock de `@/integrations/supabase/client` no teste
`src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts` (lote F1a):
adicionar `channel()`/`removeChannel()`, `getPublicUrl` no estado hoisted e trocar o mock do
`framer-motion` por `importOriginal` + spread (compatível com Vitest 4).

Commits: `2c391825f` prettier · `fcc63eed6` mock supabase.channel · `a3b561ea6` merge main · `54a6c5661` "resolver conflito S3-007 — usar versão da main".

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts` | **Intenção 100% na main** (e a main foi além). | `git grep origin/main`: `getPublicUrl: vi.fn()` L31; `vi.mock('framer-motion', async (importOriginal)` L41-42; `canal.subscribe` L139; `removeChannel: () => undefined` L142. Entrou via `e1f2ee4dd` (2026-10-27, "destrava o CI Gate da main") e `a5760922c` (2026-10-29, mocks framer-motion p/ Vitest 4). Main ainda adiciona `corrente.order` (L103) e `status: 'connected'` no mock de `instance_id` (L99), que a branch não tem. |
| idem — linhas "missing_in_main" (8) | **Ruído/corrupção de bytes**, não trabalho. | Tip da branch contém texto inválido: L273 `...toast de erro(m{),` · L362 `fireEvent.click(bo#aoPorIcone('lucide-mic-off'))` · L444 `// A rejek#hão do envio...`. `bo#aoPorIcone` nem compila (identificador inexistente / `#` fora de contexto). As demais linhas "faltantes" são só quebras de linha do JSDoc e dos `it(` em duas linhas, introduzidas no commit `54a6c5661`. |
| idem — "removed_still_in_main" (12) | O que a branch "remove" é o mock antigo do framer-motion, que a **main também já substituiu** pela mesma forma (`importOriginal`). Contagem mecânica confunde porque o commit de conflito reindentou/corrompeu linhas. | diff `bac62ba98..origin/main` mostra o mesmo hunk de substituição do `vi.mock('framer-motion'...)`. |

## Veredito: **INCORPORADA** (confiança alta)
Toda mudança funcional da branch (getPublicUrl, channel/removeChannel, framer-motion com importOriginal) já está na main com o mesmo texto; o resíduo que a análise mecânica aponta como lacuna é corrupção de caracteres (`#`, `(m{`) e reformatação — portá-lo quebraria o teste. Nada a recuperar.

## Lacunas a recuperar
Nenhuma. **Não** portar as linhas `missing_in_main`: são bytes corrompidos.

## apagar_branch_seguro: **true**

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** O veredito INCORPORADA e `apagar_branch_seguro: true` se mantêm.

Cadeia: `2c391825f` (prettier) → `fcc63eed6` (mock `channel`/`removeChannel`/`getPublicUrl`) →
`54a6c5661` ("resolver conflito S3-007 — usar versão da main"). O removedor das 19 linhas é
sempre `54a6c5661`, e o que ele fez foi trocar a redação da branch pela redação da main.

### Achado 1 — 16 linhas de `2c391825f` (formatação)
Formatação apenas. `git show 54a6c5661` reescreve exatamente os mesmos trechos na forma de
linha única da main: `Tooltip: ({ children }) => React.createElement(...)`,
`function FluxoVoz({ onSendAudioBlob }: { ... })`, `public options?: unknown,` (vírgula final),
`estado.createSignedUrl.mockReset().mockResolvedValue(...)` numa linha. A branch rodou prettier
com `printWidth` menor que o da main; nenhum comportamento depende disso.
Confirmado em `git show origin/main:src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts`
(L168-173 `FluxoVoz` em linha única). Nada a recuperar.

### Achado 2 — 3 linhas de `fcc63eed6` (mock do canal realtime)
A branch tinha:
```
canal.subscribe = (cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return canal; };
removeChannel: () => {},
```
A main tem `canal.subscribe = () => canal;` e `removeChannel: () => undefined;`
(`origin/main:…audio-meme-falha.test.ts` L139 e L142).

- `removeChannel: () => {}` vs `() => undefined`: as duas devolvem `undefined`. Estilo.
- `cb?.('SUBSCRIBED')`: em `origin/main:src/hooks/communication/useAudioMemes.ts` L141-149 o
  callback de `subscribe` só faz `setSyncError(null)` quando o status é `SUBSCRIBED`, e
  `syncError` já nasce `null` (L38). Disparar o callback é no-op. Este arquivo de teste não
  asserta `syncError` nem a tarja de sincronização (nenhuma ocorrência de `syncError`/
  `sincroniz` no arquivo na main). A cobertura do ramo `SUBSCRIBED` existe no teste dedicado:
  `origin/main:src/hooks/communication/__tests__/useAudioMemes.realtime.test.tsx` L163
  (`canalAtual!.callbacks[0]('SUBSCRIBED')`).

Logo o mock mais rico da branch não tinha efeito observável e sua intenção (não quebrar o
`.on().on().subscribe()` de `useAudioMemes`) sobrevive integralmente na main. Nenhum commit
intermediário entregou proteção, validação ou teste que o commit da ponta tenha desfeito.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** `apagar_branch_seguro: true` confirmado. Tentei refutar e não achei
um único hunk de valor ≥ médio fora da main. `origin/main` = `dac285f62`.

### 1. Universo completo do que a branch tem a mais que a main
`git diff origin/main origin/fix/f1a-supabase-channel-mock-audiomeme-20261018` (único arquivo,
`src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts`) devolve exatamente 6 hunks,
todos sem valor:
- **Regressão** (branch está atrás): remove `status: 'connected'` do mock de `instance_id` e
  `corrente.order = () => corrente;` — presentes em `origin/main:...audio-meme-falha.test.ts` L96/L99.
- **Corrupção de bytes**: L270 `...toast de erro(m{),` (string não terminada) · L359 `bo#aoPorIcone(` ·
  L441 `A rejek#hão do envio`.
- **Reformatação**: quebra do JSDoc em L155 e dos dois `it(` em duas linhas.

### 2. Prova de que a corrupção não é artefato do diff — o arquivo da ponta não compila
Parse do blob real de `54a6c5661` com o `typescript` do repo (`ts.createSourceFile`, `parseDiagnostics`):
```
erros de parse: 3
  L273: Unterminated string literal.
  L274: ',' expected.
  L362: ',' expected.
```
Portar qualquer uma dessas linhas quebraria o arquivo de teste. Nada a recuperar nelas.

### 3. Os três hunks funcionais estão na main byte a byte
`git show origin/main:...audio-meme-falha.test.ts`:
- L31 `getPublicUrl: vi.fn(),` no `vi.hoisted`
- L41-54 `vi.mock('framer-motion', async (importOriginal) => { const actual = await importOriginal<...>(); return { ...actual, ... } })` — inclusive a mesma indentação irregular
- L135-142 `channel: () => { ... canal.on ... canal.subscribe ... }` + `removeChannel: () => undefined,`

### 4. Reexame dos commits intermediários (o ponto mais provável de perda)
`git diff origin/main fcc63eed6` isola o que o commit do meio tinha e a ponta descartou. Além do prettier
(`2c391825f`, estilo puro, main usa a forma de linha única) sobram só três itens, todos < médio:
- `canal.subscribe = (cb?) => { cb?.('SUBSCRIBED'); return canal; }` vs `() => canal` da main.
  **Sem efeito observável**: em `origin/main:src/hooks/communication/useAudioMemes.ts` L38 `syncError` nasce
  `null` e L145-147 o callback só faz `setSyncError(null)` em `SUBSCRIBED`; sem callback o estado é o mesmo.
  Este teste não observa isso — `grep -niE 'syncError|sincroniz|SUBSCRIBED'` no arquivo da main: 0 ocorrências.
- `removeChannel: () => {}` vs `() => undefined`: mesmo retorno.
- Dois comentários explicativos no mock (`getPublicUrl não existe mais nesse caminho`, `useAudioMemes assina
  realtime num ÚNICO canal com DOIS .on()`). Documentação de mock, valor baixo; não altera comportamento nem
  cobertura. Não justificam uma PR de resgate.

### Conclusão
`veredito_final = INCORPORADA`, `concorda = true`, `apagar_branch_seguro = true`. A branch só tem a perder
frente à main.

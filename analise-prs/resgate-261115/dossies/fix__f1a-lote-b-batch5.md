# Dossiê — fix__f1a-lote-b-batch5 (branch `origin/fix/f1a-lote-b-batch5`, PR #2082)

- tip `226ccb78e` · merge_base `bac62ba98` · 6 commits (2 de fix real, 1 prettier, 3 merge/sync)
- Commit útil: `c83138cd8 fix: falha de leitura em useUserSettings ficava invisível (C-1)`
- `git diff --stat`: 1 arquivo, +7 linhas — `src/hooks/system/useUserSettings.ts`

## Propósito
Expor estado `isError` no hook `useUserSettings` e mostrar toast destrutivo quando a leitura de `user_settings` falha (antes a falha só ia para `log.error`, invisível para o usuário).

## Arquivo × achado × evidência (tudo em `origin/main:src/hooks/system/useUserSettings.ts`)

| Hunk da branch | Está na main? | Evidência |
|---|---|---|
| `const [isError, setIsError] = useState(false);` | SIM | linha 88 |
| `setIsError(false);` no início do `fetchSettings` | SIM | linha 110 |
| `if (ativo) { setIsError(true); toast({title:'Erro', description:'Não foi possível carregar as configurações.', variant:'destructive'}) }` | SIM | linhas 122-125 (texto idêntico, só sem o espaço antes da vírgula) |
| `isError,` no retorno do hook | SIM | linha 326 |

Main vai além da branch: `catch` também seta `setIsError(true)` (l.166) e o auto-save é bloqueado quando `isError` (l.258, l.307).

Commit da main que incorporou: `e1f2ee4dd` (2026-10-27) `fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)` — `git show e1f2ee4dd -- src/hooks/system/useUserSettings.ts` adiciona exatamente `useState(false)` de isError, `setIsError(false)`, `setIsError(true)` e `isError,` no retorno.

Hunk `CONFLICT` do pré-check é só deslocamento de contexto (main refatorou o arquivo ao redor); `line_check.missing_in_main = 0`.

## Veredito
**INCORPORADA** (confiança alta). Nenhuma lacuna. `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial
**Concordo — INCORPORADA. `apagar_branch_seguro = true`.**

Tentativa de refutar (tudo em git só leitura, `origin/main` = `dac285f62`, 2026-11-15):
- `git diff --stat bac62ba98 origin/fix/f1a-lote-b-batch5` → 1 arquivo, +7/-0 (`src/hooks/system/useUserSettings.ts`). Os 7 hunks: `useState(false)` de `isError`; `setIsError(false)` no início do fetch; bloco `if (ativo) { setIsError(true); toast(...) }` no erro de leitura; `isError,` no retorno.
- `git grep -n -E 'isError|Não foi possível carregar as configurações' origin/main -- src/hooks/system/useUserSettings.ts` → linhas 88, 110, 123, 124, 166, 258, 307, 326. Os 4 hunks da branch existem textualmente na main (l.88, 110, 123-124, 326); `import { toast }` já está na l.6 da main.
- Main foi além: `catch` seta `isError` (l.166) e `saveAppearanceSettings` bloqueia salvar com `isLoading || isError` (l.258, dep l.307) — a branch não tinha nada disso.
- Commit incorporador confirmado: `git show e1f2ee4dd -- src/hooks/system/useUserSettings.ts` (2026-10-27) adiciona exatamente `+const [isError, setIsError] = useState(false);`, `+toast({ title: 'Erro', description: 'Não foi possível carregar as configurações.', ... })`, `+isError,`.
- `git diff origin/main origin/fix/f1a-lote-b-batch5 -- src/hooks/system/useUserSettings.ts`: o que a branch "tem a mais" (as 44 linhas do contador) são comentários antigos que a main apagou de propósito e um `toast({ title: 'Erro' ,` com espaço antes da vírgula (erro de formatação); o que a main tem a mais (69 linhas) é a refatoração posterior (`userId` memoizado, `saveAppearanceSettings`). Nenhum hunk de valor da branch fora da main.

Lacunas adicionais: nenhuma.

## Reexame de commits intermediários

**Parecer: MISTO** (16 das 22 linhas são formatação; 6 linhas são um toast real que a própria branch apagou). `apagar_branch_seguro` continua **true** — nada exclusivo se perde.

Ordem dos commits (`git log --oneline --no-merges bac62ba98..origin/fix/f1a-lote-b-batch5`):
`970626f31` (prettier) → `c83138cd8` (fix C-1) → `a031d8e8e` (conflito) → `226ccb78e` (sync with main, **o removedor de todos os 3 achados**).

### Achado 1 — `970626f31`, 16 linhas · REFATORACAO_INTERNA · valor nenhum
Prettier puro (`const aplicarPreferencias = useCallback(` multilinha, quebra dos `?? DEFAULT_SETTINGS.*`). `git diff a031d8e8e 226ccb78e -- src/hooks/system/useUserSettings.ts` mostra o sync revertendo linha a linha para o estilo da main (volta inclusive o trailing whitespace `  ` dos comentários de seção). A main também não está prettierizada nesse arquivo. Zero comportamento.

### Achado 2 — `c83138cd8`, 4 linhas · parte REFATORACAO_INTERNA, parte reversão (baixo)
`c83138cd8` adicionou `isError` + toast destrutivo em **dois** pontos: (a) ramo `error && error.code !== 'PGRST116'`, (b) bloco `catch (err)`.
- (a) sobrevive: `a031d8e8e` só envolveu o bloco em `if (ativo)`; `226ccb78e` trocou o texto pelo da main. `origin/main:src/hooks/system/useUserSettings.ts:120-126` tem `setIsError(true)` + `toast({ title: 'Erro', description: 'Não foi possível carregar as configurações.', variant: 'destructive' })` dentro de `if (ativo)`. Intenção preservada; só a redação é mais pobre.
- (b) **não** sobrevive inteiro: `226ccb78e` apagou as 9 linhas do `catch`. `origin/main:...:164-166` tem apenas `catch (err) { log.error(...); if (ativo) setIsError(true); }` — **sem toast**. Numa exceção (rede caiu, throw do client) a tela mostra os padrões sem aviso nenhum.

### Achado 3 — `a031d8e8e`, 2 linhas · REFATORACAO_INTERNA · valor nenhum
São as mesmas `title`/`description` do ramo (a), reindentadas dentro do `if (ativo)`. Substituídas pelo texto da main em `226ccb78e`. O guarda `if (ativo)` que esse commit introduziu está na main (l.122).

### Por que apagar segue seguro
O dano que o C-1 queria evitar (salvar por cima de config que não carregou) está coberto na main de forma **mais forte** que na branch: `saveAppearanceSettings` recusa com `if (isLoading || isError)` (l.258, dep l.307) — a branch nunca teve isso.
O único resíduo (toast no `catch`) é a aplicação de um padrão que **já existe na main**, com o texto idêntico, em `origin/main:src/hooks/system/useNotificationSettings.ts:147-156` (`title: 'Não foi possível carregar os alertas'`, `description: 'Os valores exibidos são os padrões. Recarregue a página para tentar de novo.'`, com respiro de `INTERVALO_MINIMO_DE_AVISO_MS`). Reescrever as 6 linhas não depende da branch.

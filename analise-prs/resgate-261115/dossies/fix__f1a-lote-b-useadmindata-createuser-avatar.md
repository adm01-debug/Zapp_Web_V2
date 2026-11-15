# Dossiê — fix__f1a-lote-b-useadmindata-createuser-avatar

- Ref: `origin/fix/f1a-lote-b-useadmindata-createuser-avatar` (tip `8e37dd43e`, merge-base `bac62ba98`, 2026-10-23). PRs com mesmo tip: #2070, #2440.
- Commits: `13d9f193f chore(fmt): prettier nos arquivos de useAdminData`, `5a37b9288 fix: avatar assinado ao carregar + testes de handleCreateUser na camada antiga de Edge`, `8e37dd43e Merge main`.

## Propósito
1. `useAdminData.fetchData` (aba users): assinar URL do avatar (bucket `avatars` privado) via `createSignedUrl` em paralelo, sem derrubar a lista em falha.
2. `mapCreateUserError`: distinguir "e-mail já cadastrado" (GoTrue `already registered`) e "papel inválido" (zod `Invalid enum value`) → campo `email`/`role`.
3. Teste `useAdminDataCreateUser.test.ts`: mockar `@/lib/invokeEdge` + `@/integrations/supabase/client` (e não `@/lib/supabaseHelpers`, que o hook não importa) e ler o corpo em `options.body`.
4. Prettier nos 4 arquivos (ruído de formatação, 155 das 188 "linhas em lacuna").

## Arquivo × achado × evidência (`origin/main`)
| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/admin/__tests__/adminDownloadPermission.test.ts` | IDENTICAL_TO_MAIN | hunk PRESENT_BYTE (JSON do item) |
| `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` | IDENTICAL_TO_MAIN | hunk PRESENT_BYTE |
| `src/components/admin/useAdminData.ts` | **Incorporado** — todos os hunks semânticos na main; diferença restante é só prettier (main usa estilo sem parênteses em arrow de 1 arg / `useCallback(async (...) => {...}, [deps])` em linha) + evoluções posteriores da main | `git grep` em `origin/main:src/components/admin/useAdminData.ts`: `already registered` L141-142 (`Este e-mail já está cadastrado.`), `invalid enum value` L147-150 (`Papel de usuário inválido.`), `AVATAR_BUCKET` L13, `AVATAR_SIGNED_URL_TTL_SECONDS` L16, `avatarUrls = await Promise.all(` L236, `.createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS)` L242, `avatar_url: avatarUrls[index]` L258. `git diff -w origin/fix/... origin/main -- useAdminData.ts` mostra só reflow + mudanças NOVAS da main (remoção de `special_agent`, `export roleChangeErrorMessage`, aba `'cron'`, guard do último admin em `handleToggleActive`, `field: ... | 'role'`). |
| `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` | **Incorporado**; a única linha ausente é OBSOLETA de propósito | `origin/main` L25-28 `vi.mock('@/lib/invokeEdge', async (importOriginal) ...`, L30-31 `vi.mock('@/integrations/supabase/client', ... SUPABASE_URL: 'https://local.test'`, L102-105 `const [fnName, options] = mockInvokeEdge.mock.calls[0]; const body = (options as { body: unknown }).body;`. Linha faltante `"Invalid enum value. Expected 'admin' \| 'supervisor' \| 'agent' \| 'special_agent', received 'chefe'"` → main L148 tem a mesma string sem `special_agent`, removido pelo commit `1f77f7917 chore(auth): remove papel special_agent do front e das edges (decisão 2026-11-03) (#2692)`. |

## Veredito
**INCORPORADA** (confiança alta). Todo o trabalho útil (assinatura de avatar, mapeamento de erros email/role, mocks corretos do teste) já está em `origin/main`; as 188 linhas "em lacuna" são formatação prettier (a main manteve o estilo antigo deliberadamente — `git diff -w` zera o conteúdo exceto evoluções posteriores da main) e 1 linha de teste com `special_agent`, papel removido de propósito em #2692.

Lacunas a recuperar: nenhuma. `apagar_branch_seguro = true`.

Triagem anterior (2026-11-08) marcou #2070 e #2440 como JA_NA_MAIN — confirmado.

## Reexame de commits intermediários

Varredura mecânica apontou 3 linhas significativas adicionadas por `13d9f193f` (o commit `chore(fmt): prettier`)
e removidas por `5a37b9288` (o commit seguinte, `fix: avatar assinado ao carregar + testes de handleCreateUser`),
ausentes de `origin/main`. Só esses 2 commits tocam os 2 arquivos (`git log bac62ba98..origin/fix/... -- <arquivo>`).

**Parecer: REFATORACAO_INTERNA.** Nenhuma proteção, validação, guarda ou teste foi desfeito; nos dois casos o
sucessor é igual ou mais forte e **está na main**.

### Achado 1 — `src/components/admin/__tests__/adminDownloadPermission.test.ts` (2 linhas: `password: 'abcdef',`)
- `13d9f193f` apenas quebrou o objeto literal de `handleCreateUser({...})` em uma propriedade por linha
  (prettier); a senha `'abcdef'` já existia antes, na linha compactada
  (`- name: 'Novo', email: 'novo@test.com', password: 'abcdef', role: 'agent', avatarFile: file,`).
- `5a37b9288` **endureceu** o fixture: `password: 'abcdef'` → `password: 'abcdef12'`, com o comentário
  `// PE-43: 8+ caracteres (mesma régua de 'mapCreateUserError'/Edge).` — ou seja, alinhou o teste à regra de
  senha mínima de 8 caracteres. Remover a senha curta é o conserto, não a perda.
- `origin/main:src/components/admin/__tests__/adminDownloadPermission.test.ts` L426 (comentário PE-43),
  L429 e L457 (`password: 'abcdef12'`): a versão forte está na main. A senha de 6 caracteres não existe em
  lugar nenhum — e não deve.

### Achado 2 — `src/components/admin/useAdminData.ts` (1 linha: `const usersWithRoles = (profiles ?? []).map((profile) => {`)
- `13d9f193f` só parentizou o parâmetro do arrow: `map(profile => {` → `map((profile) => {`.
- `5a37b9288` trocou a assinatura para `map((profile, index) => {` porque passou a precisar do índice para
  casar cada perfil com a URL assinada (`avatar_url: avatarUrls[index]`). Mesma função, um parâmetro a mais.
- `origin/main:src/components/admin/useAdminData.ts` L254 `const usersWithRoles = (profiles ?? []).map((profile, index) => {`
  e L258 `avatar_url: avatarUrls[index]`: a versão final está na main.

**Conclusão:** veredito INCORPORADA mantido. `apagar_branch_seguro = true`; nada a recuperar.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. Resultado: **não refutado — concordo.** Git somente leitura.

Tentativa de achar hunk útil não coberto pela main (`git diff -w origin/fix/f1a-lote-b-useadmindata-createuser-avatar origin/main`):

| Arquivo | Resultado da refutação |
|---|---|
| `src/components/admin/__tests__/adminDownloadPermission.test.ts` | Blob **idêntico**: `18cbace5e86ac5038cad70d4fb19549d99f0ed33` no branch e em `origin/main`. Zero lacuna. |
| `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` | Blob **idêntico**: `47e0ed319a2b1b15a6a96ec7f76f52945ab97619` nos dois lados. Zero lacuna. |
| `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` | `git diff -w` contra a main devolve **um único hunk**, a string do enum: branch `'admin' \| 'supervisor' \| 'agent' \| 'special_agent'` vs main `'admin' \| 'supervisor' \| 'agent'` (main L148). Não é lacuna: `special_agent` foi removido de propósito por `1f77f7917 chore(auth): remove papel special_agent do front e das edges (decisão 2026-11-03) (#2692)` — confirmado por `git log -S"special_agent: { label: 'Agente Especial'" origin/main -- src/components/admin/useAdminData.ts`, que aponta exatamente esse SHA. Os mocks corretos estão na main: L25-28 `vi.mock('@/lib/invokeEdge', async (importOriginal) …)`, L30-31 `vi.mock('@/integrations/supabase/client', … SUPABASE_URL: 'https://local.test')`, L104-105 `const [fnName, options] = mockInvokeEdge.mock.calls[0]; const body = (options as { body: unknown }).body;`. |
| `src/components/admin/useAdminData.ts` | `git diff -w` devolve 14 hunks; **nenhum** é trabalho do branch ausente da main. Classificação hunk a hunk: (a) reflow prettier — o branch prettificou, a main manteve o estilo compacto (`map(r => …)`, `mapCreateUserError` em uma linha por `if`, `useCallback(async (…) => {…}, [deps])`); (b) **main mais nova que o branch**: `special_agent` fora de `roleConfig` (#2692), `export function roleChangeErrorMessage`, `field: … \| 'role' \| null` (superset do branch), `activeTab: … \| 'cron'`, guard do último admin ativo em `handleToggleActive` com `[fetchData, users]`. Os dois itens funcionais do branch estão **na main**: avatar assinado — `AVATAR_BUCKET` L13, `AVATAR_SIGNED_URL_TTL_SECONDS` L16, `avatarObjectPath` L25-29, `avatarUrls = await Promise.all(` L236, `.from(AVATAR_BUCKET).createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS)` L241-242, `avatar_url: avatarUrls[index]` L258; mapeamento de erro — `already registered`/`already been registered` → `{ field: 'email', message: 'Este e-mail já está cadastrado.' }` L140-142 e `invalid enum value` → `{ field: 'role', message: 'Papel de usuário inválido.' }` L145-151. |

Checagem do `removed_still_in_main: 155` do JSON: é o espelho do reflow (o branch "removeu" o estilo compacto que a main preserva), não remoção de lógica — `git diff -w` zera esses 155.

Reexame do dossiê sobre os commits intermediários conferido por amostragem: `password: 'abcdef12'` existe na main (L429, L457) com o comentário `// PE-43: 8+ caracteres` (L426); a senha curta `'abcdef'` não existe em nenhum dos dois lados hoje.

**Parecer: INCORPORADA, `apagar_branch_seguro = true`.** Nenhum hunk de valor ≥ médio fora da main. Único "custo" de apagar: perde-se a formatação prettier dos 4 arquivos, que a main rejeitou deliberadamente — churn, não valor.

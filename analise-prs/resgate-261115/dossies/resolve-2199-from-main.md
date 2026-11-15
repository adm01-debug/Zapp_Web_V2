# Dossiê — `resolve-2199-from-main` (PR #2431, fechada 2026-11-01, não mergeada)

**Propósito** (commit `92b07caba`, 2026-10-31): extrair da PR #2199 (fechada por conflito) dois ajustes de CI:
1. `scripts/db-audit/docker-shim`: no `rm`, pular `pg_*` e `postgres` antes do `DROP ROLE`.
2. `src/test/setup.ts`: mover mock `getBoundingClientRect` de `HTMLElement.prototype` para `Element.prototype` (height lida de `style.height`, **sem `writable:true`**) e adicionar `clientHeight=600`/`clientWidth=800` globais para `@tanstack/react-virtual` (motivação declarada no comentário do diff: `ChatMessagesArea.loop`).

Merge-base `1252bb5a`, tip `4940f384` (2 merges de main + 1 commit real). Triagem anterior (2026-11-08): OBSOLETA. Fechamento: congelamento de features (#2545).

## Arquivo × achado × evidência

| Arquivo | Lacuna | Achado | Evidência |
|---|---|---|---|
| `scripts/db-audit/docker-shim` | +2 linhas (`pg_*`, `postgres` → `continue`) ausentes na main | **OBSOLETA (intenção coberta)**. O risco real na base era `old="$(< roles 2>/dev/null \|\| true)"`: snapshot ausente ⇒ `old=""` ⇒ `comm -23` devolvia **todos** os roles (incl. `pg_*`) para `DROP ROLE`. A main (`b46f5d291`, PR #2710, 2026-11-04) aborta com `exit 1` quando o snapshot está ausente/ilegível e quando a listagem atual falha, eliminando o cenário. Fora disso, `pg_*` nunca aparece em `cur` sem estar em `old`: PostgreSQL reserva o prefixo `pg_` (`CREATE ROLE pg_x` → `role name "pg_x" is reserved`), e `postgres` é o usuário conectado (`PG_USER` default, linha 22), sempre no snapshot; `DROP ROLE postgres` falharia e já é `\|\| true`. | `git show origin/main:scripts/db-audit/docker-shim` linhas 170-173 e 178-181 (aborts); base `1252bb5a` linha 144 (`\|\| true`); `git log -S'snapshot de roles ausente' origin/main -- scripts/db-audit/docker-shim` → `b46f5d291` |
| `src/test/setup.ts` | 18 linhas ausentes / 5 removidas ainda na main | **OBSOLETA e nociva**. (a) O teste que motivou (`ChatMessagesArea.loop.test.tsx`) já tinha mocks próprios **na própria base** (`vi.spyOn(Element.prototype,'getBoundingClientRect')` l.51 e `clientHeight` l.55, desde `e51662a9c` #2005, 2026-10-24) — o hunk nunca foi necessário para ele. (b) Padrão vigente na main: cada teste de virtualizador define o próprio mock (17 arquivos de teste com `react-virtual`; ex.: `ChatMessagesArea.pagination.test.tsx:60-63`, `agrupar-envio.test.tsx:55`, `ExternalProductCatalog.virtualizacao.test.tsx:61`). (c) O hunk **remove `writable:true`**: `src/hooks/chat/__tests__/useFilesContainerColumns.test.tsx:16,131` fazem `element.getBoundingClientRect = () => ...` — com data property não-writable herdada de `Element.prototype`, a atribuição lança `TypeError` em módulo ES (strict). Mesmo achado da Qodo na PR (comentário "Container sizing tests fail before running"). A main mantém `writable: true` em `setup.ts:139-145` com comentário explícito sobre isso. | `git show 1252bb5a:src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx` l.51,55; `git grep -n clientHeight origin/main -- 'src/**/__tests__/*.tsx'`; `git show origin/main:src/test/setup.ts` l.131-145 |

## Veredito: **OBSOLETA** — confiança média
- `setup.ts`: alvo coberto por mocks locais em cada teste e o hunk quebraria testes existentes (prova acima). Não portar.
- `docker-shim`: cenário de risco fechado por #2710; o guard de 2 linhas é redundante (defensivo). Se quiser cinto-e-suspensório, hunk abaixo.
- Não verificado: estado atual (verde/vermelho) do job db-guard na main — não é necessário para o veredito.

## Hunk opcional (único que ainda aplicaria; valor baixo)
`scripts/db-audit/docker-shim`, dentro do `while` do `rm` (main l.182-185), após `[[ -z "$role" ]] && continue`:
```bash
      [[ "$role" == pg_* ]] && continue  # nunca dropar roles built-in do PostgreSQL
      [[ "$role" == "postgres" ]] && continue  # superusuário padrão não pode ser dropado
```

`apagar_branch_seguro`: **true** (conteúdo integral preservado em PR #2431/commit `92b07caba`; nada útil fora da main).

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA**. Tentei refutar os dois hunks (o diff `1252bb5a..origin/resolve-2199-from-main` tem só 13 linhas de patch, nada além do que a triagem já listou) e nenhum sobreviveu.

### `scripts/db-audit/docker-shim` — guard `pg_*`/`postgres`: redundante confirmado, e não fecha o risco que resta
- A query do snapshot (`origin/main:scripts/db-audit/docker-shim:58`) e a query do `rm` (`:178`) são **idênticas** — `SELECT rolname FROM pg_roles ORDER BY rolname`, sem filtro em nenhuma das duas. Logo `comm -23 cur old` não pode emitir um role `pg_*` a menos que ele tenha sido **criado entre o `run` e o `rm`**, o que o PostgreSQL proíbe (prefixo `pg_` reservado). Mesma coisa para `postgres`: é o `PG_USER` conectado (`:22`), sempre presente no snapshot.
- Os aborts de #2710 estão na main como a triagem afirma: `:170-173` (`exit 1` se o snapshot está ausente/ilegível) e `:178-181` (`exit 1` se a listagem atual falha).
- Contra-argumento que eu procurei e que **não** salva o hunk: resta um caminho residual — `:169-170` trata snapshot **vazio** (arquivo de 0 byte) como válido, e aí `old=""` ⇒ `comm -23` devolve todos os roles. Mas nesse cenário o dano real é dropar os roles de aplicação (`anon`, `authenticated`, `service_role`, `supabase_admin`), e o guard da branch **não protege nenhum deles** — protege só `pg_*` e `postgres`, que o próprio PostgreSQL já recusa dropar (roles predefinidos são pinados; `DROP ROLE postgres` como usuário conectado falha) e cujo erro o shim já engole com `|| true`. Portar o hunk não fecha nada. Valor: **baixo**, confirmado.

### `src/test/setup.ts` — alvo já coberto e hunk comprovadamente nocivo
- `src/test/setup.ts` na main é **byte-idêntico** à merge-base (`git diff --stat 1252bb5a origin/main -- src/test/setup.ts` → vazio), então o hunk ainda aplicaria. Mas não deve.
- Alvo declarado já coberto **na própria base e na main**: `ChatMessagesArea.loop.test.tsx` tem mocks próprios no `beforeAll` — base `1252bb5a:…:51` (`vi.spyOn(Element.prototype,'getBoundingClientRect')`) e `:55` (`Object.defineProperty(Element.prototype,'clientHeight',{get:()=>600})`); na main continuam em `:51` e `:55`. O hunk nunca foi necessário para o teste que o motivou.
- Padrão vigente: **13 arquivos de teste** na main definem o próprio mock de `clientHeight` (`git grep -c clientHeight origin/main -- 'src/**/__tests__/*.tsx' 'src/**/*.test.tsx'`), e **nenhum** teste de virtualizador está `skip`/`todo` na main — ou seja, não há nada quebrado que o mock global consertaria.
- Dano confirmado **empiricamente**, não só por leitura: o hunk troca `HTMLElement.prototype` (com `writable: true`) por `Element.prototype` **sem `writable`**, criando data property não-gravável na cadeia de protótipos. Reproduzido em Node com a mesma topologia (`Element2` ← `HTMLElement2`): `el.getBoundingClientRect = () => …` → `TypeError: Cannot assign to read only property 'getBoundingClientRect'`. E `origin/main:src/hooks/chat/__tests__/useFilesContainerColumns.test.tsx:16` e `:131` fazem exatamente essa atribuição. Módulo ES é strict ⇒ os dois testes quebram. Bate com o achado da Qodo na PR #2431.
- Valor: **nenhum** (negativo), confirmado.

### Branch
`apagar_branch_seguro = true` mantido. Diff integral (13 linhas) está reproduzido neste dossiê e no commit `92b07caba`, alcançável pela PR #2431 (`refs/pull/2431/head`) mesmo após apagar a branch. Nenhum hunk de valor ≥ médio fora da main.

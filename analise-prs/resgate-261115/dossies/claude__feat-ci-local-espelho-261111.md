# Dossiê — claude/feat-ci-local-espelho-261111 (PR #2970)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
`bun run ci:local` roda na máquina os mesmos jobs/steps dos workflows `.github/workflows/ci.yml` e `db-guard.yml`
(lê o YAML; clone descartável; home por job; sem root; sem credencial). 10 commits sobre `d1af577e1`
(5 são merges de `main`): `e5be346ea` feat, `26d980b7d`, `12cae16b0`, `e2f7ba407`, `38a2a742f` fixes.

Entrou na `main` pelo squash `cb6576b2a` ("Pacote: 20 PRs aprovadas integradas num único merge (#3035)"),
que adiciona exatamente os 7 arquivos de conteúdo da branch (`git show --stat cb6576b2a`: `.env.ci.local.example` +10,
`docs/ci/CI_LOCAL.md` +156, `package.json` +5/-1, `ci-local-integracao.unit.mjs` +743, `ci-local-lib.mjs` +996,
`ci-local.mjs` +1470, `ci-local.unit.mjs` +717 — mesmos tamanhos do `git diff --stat` da branch).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `.env.ci.local.example`, `.gitignore`, `scripts/ci/branch-hygiene-runtime.unit.mjs` | idêntico à main | `PRESENT_BYTE` |
| `bun.lock`, `package.json` | 0 linhas faltando; dep `yaml` e scripts presentes | `origin/main:package.json:37-38` (`ci:local`, `ci:local:rapido`), `:143` (`"yaml": "2.8.3"`); `origin/main:bun.lock:1437` |
| `scripts/ci/ci-local-lib.mjs`, `ci-local.unit.mjs`, `ci-local-integracao.unit.mjs` | 0 linhas faltando | `line_check.missing_in_main = 0` |
| `scripts/ci/ci-local.mjs` | 18 linhas "faltando" = versões antigas de funções que a main **evoluiu** (nenhuma lacuna) | ver abaixo |
| `docs/ci/CI_LOCAL.md` | 2 linhas "faltando" = texto reescrito na main refletindo a evolução acima | `origin/main:docs/ci/CI_LOCAL.md:41,56` |

### `ci-local.mjs` — as 18 linhas, hunk a hunk
1. `function equivalenteLocal(uses, step, gh) {` → main `scripts/ci/ci-local.mjs:583`
   `function equivalenteLocal(uses, step, gh, { workingTree = false } = {})` (assinatura ganhou opção).
   Chamada: branch `equivalenteLocal(step.uses, step, gh)` → main `:1039`
   `equivalenteLocal(step.uses, step, gh, { workingTree: args.incluirNaoCommitado })`.
2. Checagem "migration já existente editada" via `git diff --diff-filter=M ... 'supabase/migrations/*.sql'`
   (branch, 5 linhas) → **substituída** na main por `checarMigrationsEditadas` em `ci-local-lib.mjs:655-700+`
   (critérios iguais ao `db-guard.yml`: `modified` **ou** rename com conteúdo alterado, `\d{14}_*.sql`, exceções stub
   e `migration-evidence.json`); chamada em `ci-local.mjs:597-608`. É um superset do critério da branch.
3. `function carregarWorkflows(nomes) {` + `const dir = join(ORIGEM, '.github/workflows')` + `readdirSync` +
   `.map(f => f.replace(/\.ya?ml$/, ''))` + `const arq = [...].find(existsSync)` + `parseYaml(readFileSync(arq))` +
   `throw ... sem jobs` + `return { nome, arquivo: arq.slice(...), wf }` (8 linhas) → main `ci-local.mjs:796-817`
   `carregarWorkflows(nomes, rev)`: lê via `git ls-tree`/`git show ${rev}:` quando há `rev` (workflow do commit, não
   da working tree) e cai em `readdirSync` sem `rev`. Mesma função, mais capaz.
4. `const workflows = carregarWorkflows(args.workflows ?? PADRAO_WORKFLOWS);` → main `:1226-1227`
   (mesma chamada, agora com argumento `rev`). `PADRAO_WORKFLOWS = ['ci', 'db-guard']` em `:91`; `parseYaml` em `:46`.

### `docs/ci/CI_LOCAL.md` — as 2 linhas
- Branch: "Mudanças não commitadas **não entram** — o resumo avisa…" → main `:41` acrescenta
  "(nem as dos `.github/workflows/*.yml`)" (consequência do item 3).
- Branch: linha da tabela com `git diff --diff-filter=M` → main `:56` descreve `checarMigrationsEditadas` (item 2).

## Lacunas a recuperar
Nenhuma. Todo o conteúdo está na main em forma igual ou mais completa; nada OBSOLETO, nada PERDIDO.

## Banco / custo / regra de negócio
Sem migration, sem edge, sem `src/`, sem workflow alterado. Não há DECISAO_DONO.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** · apagar a branch continua seguro · nada a recuperar.

Os 5 commits não-merge (`e5be346ea` → `26d980b7d` → `12cae16b0` → `e2f7ba407` → `38a2a742f`) são uma
sequência de endurecimento: cada um **substituiu** o mecanismo do anterior por outro mais forte, que está
na `main`. As 347 linhas que a varredura mecânica apontou são as versões antigas desses mecanismos.
Verifiquei o removedor de cada achado e o destino da intenção na `main`.

| Achado (commit → removedor) | O que era | Onde a intenção vive na `main` |
|---|---|---|
| `e5be346ea` lib 98 + `ci-local.mjs` 144 + unit 3 → **`12cae16b0`** | motor de expressão por regex (`EXPR`, `resolverReferencia`) e CLI da 1ª versão | tokenizador/parser completo: `ci-local-lib.mjs:292` `avaliarExpressao` (operadores, `CONTEXTOS`, `format()`/`fromJSON()`/`contains()`), `:15` `ExpressaoNaoSuportada`, `:476-483` `EXPR`/`interpolar`. Flags intactas: `ci-local.mjs:338-345` (`--rapido`, `--listar`, `--workflow`, `--job`, `--base`), padrão `origin/main` em `:316`. Teste: `ci-local.unit.mjs:175` `contains(github.event_name, 'pull')` |
| `26d980b7d` lib 7 + mjs 3 + unit 2 → **`12cae16b0`/`e2f7ba407`** | `ambienteIsolado` apontava `GIT_CONFIG_GLOBAL`/`GH_CONFIG_DIR`/`DOCKER_CONFIG` para o HOME **real** | `ci-local-lib.mjs:808` `planoHomeIsolado` **copia** para o home descartável e higieniza: `:865` `configDockerSemCredenciais` (tira `auths`/`credsStore`/`credHelpers`), `:877` `GITCONFIG_SEM_CREDENCIAL` (zera `credential.helper`); `ambienteIsolado` segue exportado em `:860`. Troca endurece: a versão removida vazava credencial do dono para os passos (motivo declarado de `e2f7ba407`). Teste: `ci-local-integracao.unit.mjs:500` |
| `12cae16b0` lib 4 (filtro `sudo\|apt-get\|apt\|dpkg`; `copiar` gitconfig/gh) → **`e2f7ba407`/`38a2a742f`** | detecção de root por regex de 4 comandos | `ci-local-lib.mjs:749` `COMANDOS_ROOT` = `sudo, apt, apt-get, dpkg, su, doas, pkexec` + `:756` `RE_PLAYWRIGHT_DEPS` + `:765` `comandosComSudo` + `:775` `shimsDeRoot` (superset). Teste: `ci-local-integracao.unit.mjs:148-160`, `:454-489` |
| `12cae16b0` mjs 35 (`matarGrupo`, `matarMarcados`, `limpeza`) → **`e2f7ba407`** | `SIGKILL` direto no grupo de processos | escalada: `ci-local.mjs:120` `encerrarGrupo`, `:137` `pidsMarcados`, `:164` `encerrarMarcados` (SIGINT → SIGTERM → SIGKILL, por marca no `/proc/<pid>/environ`, não por PGID reaproveitado); `limpeza` segue em `:99`. Teste: `ci-local-integracao.unit.mjs:567` |
| `e2f7ba407` lib 2 + mjs 21 + unit 10 + integ 13 (`containersCriadosNaExecucao`, `listarContainers`, `containersAntes`) → **`38a2a742f`** | limpeza por foto-diferença (`docker ps` antes/depois) | limpeza por rótulo: `ci-local-lib.mjs:990` `ROTULOS_CI_LOCAL`, `:1012` `shimDocker` (injeta `--label ci-local=1/.run/.job/.pid/.inicio` em `docker run|create`), `:1062` `lerListaContainers`, `:1076` `containersOrfaos`; `ci-local.mjs:186` `removerContainers`, `:204` `removerRotulados`, `:220` `removerContainersDaExecucao`, `:269` `varrerRestos`, rótulo da execução em `:645`. **Mais seguro**, não menos: a foto-diferença apagava container sem rótulo que outra sessão subisse em paralelo; o rótulo nunca toca container alheio. Teste em `ci-local-integracao.unit.mjs:593` (`:660` afirma "mexeu em container sem rótulo" = falha) e `:672` (varredura só pega restos próprios) |

Sinal de alerta do roteiro (commit final com título de correção que **remove** proteção) foi checado em
`38a2a742f`: ele remove `containersCriadosNaExecucao`, mas entrega no lugar o shim + rótulo, com teste que
prova que container pré-existente e container de sessão paralela sobrevivem. Não é reversão.

Comandos usados: `git log --oneline --no-merges d1af577e1..origin/claude/feat-ci-local-espelho-261111`;
`git log -S'resolverReferencia' <faixa> -- scripts/ci/ci-local-lib.mjs`; `git show 38a2a742f -- scripts/ci/ci-local-lib.mjs`;
`git show origin/main:scripts/ci/{ci-local-lib.mjs,ci-local.mjs,ci-local.unit.mjs,ci-local-integracao.unit.mjs}`.

## Verificação adversarial

Veredito mantido: **INCORPORADA**. Concordo com a triagem; apagar a branch é seguro.

Recontagem independente (não reusei o `line_check` do JSON): para cada um dos 10 arquivos do
`git diff d1af577e1 origin/claude/feat-ci-local-espelho-261111`, extraí toda linha adicionada com
mais de 12 caracteres e testei `grep -qxF` contra `git show origin/main:<arquivo>`. Resultado:
0 faltando em `.env.ci.local.example`, `.gitignore`, `bun.lock`, `package.json`,
`branch-hygiene-runtime.unit.mjs`, `ci-local-lib.mjs`, `ci-local.unit.mjs`,
`ci-local-integracao.unit.mjs`; 2 em `docs/ci/CI_LOCAL.md`; 17 em `scripts/ci/ci-local.mjs`.
Nenhum arquivo da branch está ausente na main. Bate com o JSON (20 linhas), e as 19 são todas
versões ANTIGAS de código que a main evoluiu — nenhum hunk de valor ficou de fora:

- `function carregarWorkflows(nomes)` + corpo `readdirSync`/`readFileSync` (6 linhas) →
  `origin/main:scripts/ci/ci-local.mjs:796` `carregarWorkflows(nomes, rev)` lê o YAML do commit
  via `git ls-tree -z`/`git show` (:799-802) e cai no `readdirSync` só sem `rev`
  (`--incluir-nao-commitado`). Superset: a branch só sabia ler o working tree. Chamada em :1226.
  `parseYaml` segue importado (:46), `PADRAO_WORKFLOWS` em :91.
- `function equivalenteLocal(uses, step, gh)` → `:583` com 4º parâmetro
  `{ workingTree = false }`, chamado em `:1039` com `{ workingTree: args.incluirNaoCommitado }`.
- O comando inline `m=$(git diff --diff-filter=M --name-only … 'supabase/migrations/*.sql')`
  e seu comentário (3 linhas) → `:597-608` delega a `checarMigrationsEditadas`
  (`ci-local-lib.mjs:720`), que cobre `modified` E rename com conteúdo alterado, regex
  `^supabase/migrations/\d{14}_.*\.sql$`, exceção stub comment-only e `kind` fixado em
  `scripts/db-audit/migration-evidence.json` (`ci-local-lib.mjs:664-668`, `migrationsEditadas`
  em :694). Estritamente mais restritivo que o `--diff-filter=M` da branch.
- `script = eq.cmd;` não foi perdido: `origin/main:scripts/ci/ci-local.mjs:1048`
  (`if (eq.processo) processo = eq.processo; else script = eq.cmd;`) — o caminho `cmd` continua
  servindo o equivalente do gitleaks (:586-591).
- As 2 linhas de `docs/ci/CI_LOCAL.md` são as mesmas duas evoluções, documentadas:
  `origin/main:docs/ci/CI_LOCAL.md:41` acrescenta "(nem as dos `.github/workflows/*.yml`)" à
  frase sobre mudanças não commitadas, e `:56` troca a descrição do passo de migration por
  `checarMigrationsEditadas`. Texto da main é superset do da branch.

`git show --stat cb6576b2a` (#3035) adiciona os 7 arquivos novos com exatamente os mesmos
tamanhos do diff da branch (ci-local.mjs +1470, ci-local-lib.mjs +996, ci-local.unit.mjs +717,
ci-local-integracao.unit.mjs +743, CI_LOCAL.md +156, .env.ci.local.example +10, .gitignore +6,
package.json +5/-1, bun.lock +1, branch-hygiene-runtime.unit.mjs +12/-3) — entrada inteira,
não parcial.

Não achei nenhuma lacuna ≥ média. Nenhuma lacuna adicional a registrar.

Comandos usados nesta verificação: `git show --stat cb6576b2a`;
`git show origin/main:scripts/ci/ci-local.mjs` (faixas 575-625, 790-830, 1030-1060);
`git show origin/main:scripts/ci/ci-local-lib.mjs` (650-745);
`git show origin/main:docs/ci/CI_LOCAL.md`; recontagem linha a linha com `grep -qxF` nos 10 arquivos.

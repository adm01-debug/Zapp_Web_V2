# E96 — `docs/ci/README.md` gerado do próprio workflow (`--check` no CI)

**Data:** 03/10/2026 · **Etapa:** E96 (Fase 7, `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, G-42)
**Status:** ✅ concluída

## O que a etapa pedia

> `docs/ci/README.md` (novo): 1 parágrafo por workflow (gatilho, o que prova, o que acontece quando falha,
> quem é avisado), gerado a partir de um bloco `# docs:` no topo de cada YAML por
> `scripts/ci/render-workflow-docs.mjs --check` (falha se divergir). Verificação: `--check` verde no CI.

## O que foi entregue

**1. Bloco `# docs:` no topo dos 16 workflows** — quatro campos obrigatórios:

```yaml
# docs:
#   gatilho: pull_request, push na main, merge_group e dispatch
#   prova: lint, tipos, testes, build, security e E2E do codigo
#   falha: PR fica vermelho e o merge e bloqueado pelos required checks
#   avisa: autor do PR e revisor, via checks do GitHub
```

**2. `scripts/ci/render-workflow-docs.mjs`** — lê os blocos, gera o README (tabela + seção de detalhe).
Modos: sem flag escreve; `--check` **falha** se divergir. Também falha se algum workflow não tiver o bloco
ou se o bloco estiver com campo faltando — um workflow novo sem `# docs:` derruba o CI em vez de entrar mudo.

**3. `docs/ci/README.md`** — 16 workflows, gerado.

**4. Step no job `Lint & TypeCheck`** do `ci.yml`, logo após o `actionlint`:
`node scripts/ci/render-workflow-docs.mjs --check`.

## Verificação da etapa — cumprida

`--check` verde no CI (step novo em `ci.yml`) e localmente:

```
OK: docs/ci/README.md bate com os 16 workflows.   (exit 0)
```

**Prova por mutação (2 casos, ambos detectados):**

| Mutação | Resultado |
|---|---|
| Mudar o `gatilho` de um workflow no YAML | `ERRO: docs/ci/README.md divergiu dos blocos # docs: dos workflows.` |
| Remover o bloco `# docs:` de um workflow | `ERRO: workflow sem bloco '# docs:' no topo: codeql.yml` |

O texto é escrito a partir do que cada workflow **faz** (gatilhos extraídos do YAML, conteúdo do cabeçalho
de cada arquivo), não de suposição — o `README` descreve o pipeline real, inclusive os que deliberadamente
**não** têm `pull_request` (`db-live-guard`, `e2e-logado`) e o motivo.

## Achados fora do escopo (NÃO corrigidos)

- **`ci.yml` é o mesmo arquivo que o PR #1610 (aberto) reescreve** (91+/21-, substitui `setup-bun`/`setup-deno`
  por shell). Meu step entra após o `actionlint`, longe dos setups que o #1610 toca — conflito possível, mas
  resolvível. Registrado aqui porque o plano manda pular o que depende do #1610; a E96 **não depende** dele,
  apenas compartilha o arquivo.
- **`branch-hygiene-audit.yml` e `settings-guard.yml`** descrevem no `# docs:` que a falha abre issue — o
  `settings-guard` só passou a fazer isso na E95 de hoje; antes falhava em silêncio.

## Arquivos

- `.github/workflows/*.yml` (16 arquivos, bloco `# docs:` no topo) + `ci.yml` (1 step novo)
- `scripts/ci/render-workflow-docs.mjs` (novo)
- `docs/ci/README.md` (novo, gerado)
- `docs/audits/e96-workflow-docs-2026-10-03.md` (este relatório)
- `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (checkbox E96)

## Verificação

| Gate | Resultado |
|---|---|
| `node scripts/ci/render-workflow-docs.mjs --check` | **OK, 16 workflows** |
| Mutação (gatilho alterado / bloco removido) | **2/2 detectadas** |
| `actionlint .github/workflows/*.yml` | limpo |
| `node scripts/ci/lint-ratchet.mjs` | nenhuma dívida nova |
| `node scripts/ci/typecheck-ratchet.mjs` | nenhum erro novo |

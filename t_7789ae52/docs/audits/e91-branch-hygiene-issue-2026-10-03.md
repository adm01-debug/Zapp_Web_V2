# E91 — o relatório de higiene de branches passa a ter histórico em issue

**Data:** 03/10/2026 · **Etapa:** E91 (Fase 7, `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, G-36)

## O que a etapa pedia

`branch-hygiene-audit.yml` publicava o relatório **só no Job Summary** — que morre com o run e não é
consultável depois. A etapa pediu duas coisas: (1) manter o resultado numa **issue** (atualizar a #378
**ou** abrir uma `[branch-hygiene]`); (2) listar também **PRs abertas há > 7 dias sem push** — o corte
anterior era 14 dias.

## Decisão: issue nova, não a #378

A etapa oferecia as duas opções. Escolhi abrir uma **`[branch-hygiene]`** porque o **upsert idempotente
por título já é o padrão da casa**: `actions-kpi.mjs` mantém `[kpi-actions]` exatamente assim (procura a
aberta, atualiza; se não houver, cria). Reusar esse mecanismo deixa os dois relatórios semanais com o
mesmo comportamento previsível. A **#378** (`[infra] Higiene de branches remotos + auto-delete
pós-merge`) fica **intacta** como registro de decisão — reescrever o corpo dela a cada semana apagaria
a conversa que a originou.

## Duas correções dentro do escopo

**O corte, e o campo que ele mede.** "Aberta há > 7 dias sem push" é ambíguo: o código antigo media
`createdAt`. O que interessa é PR **parada**, então passei a medir **`updatedAt`** (um push atualiza o
campo) e o título da seção diz o que ele mede — "PRs abertos ha mais de 7 dias sem push (updatedAt)".
Medido agora: dos 15 PRs abertos, o mais parado moveu em **01/10** — nenhum passa de 7 dias, então a
seção sai **vazia**, e vazia é o resultado verdadeiro (a citação "#1153, #1206 de 29/09" do texto do
plano era o retrato do dia em que ele foi escrito).

**`origin` como falso positivo.** Na primeira execução real o ref simbólico **`origin`** apareceu na
lista de "patch-equivalentes a `main`" — `git branch -r` o lista junto com os `origin/<branch>`. Não é
branch, é o próprio remote; passou a ser filtrado nos dois loops.

## Verificação — executada, não descrita

O workflow é `schedule`/`workflow_dispatch`, então não roda em PR. Em vez de confidence no YAML, o teste
**lê o arquivo real, extrai o `run:` de cada passo e executa com bash**, com os mesmos `env` que o runner
injeta (`RUNNER_TEMP`, `GITHUB_STEP_SUMMARY`, `REPO`) e `gh` de verdade:

| Verificação | Resultado |
|---|---|
| Issue criada na 1ª execução | **#1810** |
| 2ª execução | "issue atualizada: #1810" — **não duplicou** |
| Issues `[branch-hygiene]` abertas | **1** |
| `actionlint` (gate oficial da etapa) | **OK** |
| `lint-ratchet` / `typecheck-ratchet` | 587/587 e 0/0 — **novas=0** |
| `check-test-inventory` | OK |

**Bug que o teste pegou (e que teria ido para produção):** a primeira versão guardava o caminho do
relatório numa variável com `mktemp`. Cada `run:` é um **shell novo** — a variável não atravessa o
passo, e o passo 2 morreu com `RELATORIO: unbound variable`. Só o **arquivo** persiste, em
`$RUNNER_TEMP`. Corrigido, com `if [ ! -s "$RELATORIO" ]` para falhar alto em vez de abrir uma issue
vazia em silêncio.

**Prova por mutação** (`scripts/ci/branch-hygiene-workflow.unit.mjs`, 5 casos): desfazer cada invariante
derruba o teste correspondente — corte de volta a 14 dias, remoção do ramo de atualização, caminho por
`mktemp`, filtro do `origin` removido, e upsert que cria sem procurar. **5 de 5 detectadas.**

## Limites

O teste é **estrutural**: prende os invariantes no YAML (corte, campo, upsert, caminho, filtro), que é o
que pode regredir numa edição. Ele **não** prova que o `gh issue edit` funciona contra a API — isso só a
execução real prova, e ela foi feita aqui e vai se repetir toda segunda.

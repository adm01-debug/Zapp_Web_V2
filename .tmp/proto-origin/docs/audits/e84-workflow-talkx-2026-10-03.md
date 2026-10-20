# E84 — `e2e-talkx-pr.yml` → `e2e-talkx.yml`, `paths` que casem com o diff da PR

Plano: `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, Fase 6, E84.
Executado em 2026-10-03.

## O que a etapa pede

> renomear para `e2e-talkx.yml` e usar `paths` que casem com o diff da **PR** (gatilho `pull_request` já faz isso
> corretamente — o problema era o `push` de merge commit). Verificação: **PR de Contatos não dispara**.

## Medição do alvo (antes de editar)

A E27 **já estava feita** — o gatilho já era `pull_request`, então o problema do "push de merge commit" que a
etapa descreve não existia mais. O que restava era o nome e o alcance do `paths`.

Contagem de commits (últimos 60) por path declarado:

| Path | Commits | Veredito |
|---|---|---|
| `src/components/talkx/**` | 60 | correto — é o núcleo do Talk X |
| **`playwright.config.ts`** | **20** | **errado — config global, não é do Talk X** |
| `e2e/talkx.spec.ts` | 14 | correto |
| `.github/workflows/e2e-talkx-pr.yml` | 3 | auto-referência |

**O `playwright.config.ts` era o alvo.** Ele é configuração compartilhada de toda a suíte E2E e foi tocado em
**20 dos últimos 60 commits** — quase sempre por trabalho que não é do Talk X. Qualquer PR que ajustasse a config
global (inclusive uma PR de Contatos) disparava o Talk X E2E sem ter tocado uma linha do Talk X.

Os outros paths são legítimos: `talkx.spec.ts`, `talkx-visual.spec.ts`, `fixtures/talkx-demo*` e
`scripts/talkx/lado-a-lado.mjs` **são** do Talk X e mudam o resultado do teste.

## O que mudou

1. **Rename**: `.github/workflows/e2e-talkx-pr.yml` → `.github/workflows/e2e-talkx.yml`. O sufixo `-pr` descrevia o
   antigo gatilho `push`; com `pull_request` ele só confundia.
2. **Coerência do rename**: `name:` (`E2E Talk X (PR)` → `E2E Talk X`), job id (`e2e-talkx-pr` → `e2e-talkx`),
   `concurrency.group` (`e2e-talkx-pr-${{ github.ref }}` → `e2e-talkx-${{ github.ref }}`) e o nome no `e2e` step.
   O job id foi verificado: **nenhum** arquivo do repo o referencia (nem branch protection, nem script).
3. **`paths`**: `playwright.config.ts` **removido**; auto-referência atualizada para o nome novo.
4. **Referências atualizadas**: `CLAUDE.md` (lista canônica de workflows), `playwright.config.ts` (2 comentários),
   `e2e/talkx-visual.spec.ts` (1 comentário), `e2e/README.md`, e o teste da E28
   (`scripts/ci/check-pr-workflow-secrets.unit.mjs`) — este último mantendo a menção ao "gatilho **antigo**", que é
   o objeto do teste.

**Não** foram tocados: gatilho, `permissions`, `timeout-minutes`, passos. A etapa pede nome e `paths`.

Docs **históricos** (`docs/talkx/v4/**`, `docs/mapa/**`) mantêm o nome antigo de propósito: descrevem o estado da
época e reescrevê-los seria falsificar registro.

## Verificação (executada)

**1. Cobertura do rename** — `grep -rn 'e2e-talkx-pr'` fora dos docs históricos → **zero** ocorrências.

**2. Casamento dos `paths`** — simulação do mesmo glob do GitHub Actions (`minimatch`, `*` não cruza `/`, `**` cruza)
contra 6 diffs:

| Cenário | Dispara? | Esperado |
|---|---|---|
| PR de Contatos (só `src/components/contacts/**`) | **não** | não ✅ |
| PR que só ajusta `playwright.config.ts` | **não** | não ✅ |
| PR de contatos que também toca a config global | **não** | não ✅ |
| PR do Talk X (`src/components/talkx/**`) | sim | sim ✅ |
| PR do spec visual (`e2e/talkx-visual.spec.ts`) | sim | sim ✅ |
| PR que só mexe no próprio workflow | sim | sim ✅ |

**6/6 cenários OK.** A verificação literal da etapa ("PR de Contatos não dispara") está satisfeita pelo mecanismo.

**3. Gates** — `check-workflow-pins` OK (16 workflows), `check-pr-workflow-secrets` OK, `check-e2e-artifact-secrets`
OK, `check-test-inventory` OK, `lint-ratchet` OK (novas=0), e o teste unitário da E28 que eu editei: **36/36**.

## Limite desta verificação (honestidade)

A simulação prova o **mecanismo** (quais diffs casam com o `paths`), não o comportamento do GitHub em produção. A
confirmação no painel de Actions exige uma PR real que toque a config global — o que agora **não** deve disparar o
Talk X. Isso fica como dado a observar na próxima PR desse tipo, não como promessa.

Se o GitHub tratar um `paths` que não casa como "workflow não executado" (e não como "executado e pulado"), a PR fica
sem nenhum check do Talk X — que é o desejado, já que o Talk X não foi tocado, e o job E2E do `ci.yml` (required)
continua cobrindo a config global.

## Achados fora do escopo (não corrigidos)

- `docs/talkx/v4/**` e `docs/mapa/**` citam o nome antigo — histórico deliberado.
- Existem **três** planos `PLANO_GITHUB_ACTIONS_100_ETAPAS_*` (2026-09-26, 09-27, 10-01). Trabalhei no mais recente
  (10-01). A existência dos anteriores sem marcação de "substituído" é confusão de fonte que vale uma etapa própria.

# Plano V4 do Talk X — material de apoio

Documento principal: [`../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`](../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md).

| Pasta / arquivo | Conteúdo |
|---|---|
| [`etapas/`](etapas/) | As 200 etapas por extenso, um arquivo por fase (F00–F16). |
| [`inventario/`](inventario/README.md) | Os 1.135 elementos das 17 imagens contra o código e as 110 capacidades do motor. É a evidência do campo **Hoje** e a origem dos IDs do campo **Fecha**. |
| [`DECISOES.md`](DECISOES.md) | Decisões de arquitetura (A1–A18) e de negócio (N01–N45). |
| [`etapas.json`](etapas.json) | As etapas em formato de máquina: id, fase, título, camada, se tem migration ou edge, o que exige e o que fecha. Base do placar (X002). |

## Como executar uma etapa

1. Abra a etapa no arquivo da fase e confira **Exige antes**: todas na `main`, aplicadas e implantadas.
2. Liste as PRs abertas; se alguma toca os mesmos arquivos (ver "pontos de colisão" no documento principal), pare e avise.
3. Branch nova a partir da `main`: `<agente>/<tipo>-talkx-x<NNN>-<slug>-<AAMMDD-HHMM>`.
4. Escreva primeiro o teste do **Aceite** e veja-o falhar.
5. Implemente só o que está em **Fazer**. O que aparecer fora do escopo vai para "Achados fora do escopo" na PR.
6. Corpo da PR (verificado a partir da X005): `## Etapa`, `## Fecha`, `## Evidência`, `## Print` (etapa de tela), `## Banco`, `## Edge`. Título terminando em `(X<NNN>)`.
7. Depois do merge: aplicar a migration e registrar no ledger; pedir o deploy da edge; conferir; atualizar o placar.

## Definição de pronto no corpo da PR (X005)

Toda PR de etapa (título terminando em `(X<NNN>)`) é verificada pelo
`scripts/ci/check-talkx-pr-body.mjs` no job `lint-and-typecheck` do `ci.yml`
(`pull_request`, sem secrets). Se uma seção obrigatória faltar, a PR falha.

| Seção | Exigida | Conteúdo |
|---|---|---|
| `## Etapa` | sempre | `<id>` e o título **iguais aos do plano** (`etapas.json`). |
| `## Fecha` | sempre | os mesmos IDs do campo **Fecha** da etapa (ou a justificativa de cada um que ficou de fora); `—` quando a etapa não fecha elemento. |
| `## Evidência` | sempre | nome do teste que falhava antes e passa agora, ou a query com o resultado. |
| `## Print` | quando a etapa tem tela (01–17) | nome do artefato da régua (`regua-visual-talkx`). |
| `## Banco` | sempre | versão da migration + se foi aplicada e registrada no ledger, ou `sem DDL`. |
| `## Edge` | sempre | id do run de `deploy-functions.yml`, ou `sem edge`, ou `aguardando aprovação do deploy`. |

Um título sem `(X<NNN>)` faz o verificador **não se aplicar** (PRs que não são
de etapa passam sem essas seções).

## Identificadores

- `X001`…`X200` — etapas, na ordem de execução.
- `T<tela>-<seq>` (ex.: `T06-014`) — elemento de uma imagem, definido no inventário.
- `CAP-001`…`CAP-110` — capacidades do motor, definidas em [`inventario/H_motor_backend.md`](inventario/H_motor_backend.md).
- `dados:<atributo>` — coluna da projeção de dados comerciais (fase 4).
- `A1`…`A18` — decisões de arquitetura; `N01`…`N45` — decisões de negócio.
- `V01`…`V100` — etapas do plano V3, citadas só para rastreio.

# Arquitetura sem desperdício — CI/CD do ZAPP WEB V2

**Data:** 2026-10-15 · **Status:** em vigor (regras R1–R5 protegidas por contrato; R6 é disciplina de agente)
**Complementa:** `docs/ci/ARQUITETURA_ALVO_GITHUB_2026-10-14.md` (o destino) — este documento é a parte já
construída que trata do trabalho repetido e da fila.
**Contrato executável:** `scripts/ci/arquitetura-sem-desperdicio.unit.mjs` (roda no check obrigatório
`🔍 Lint & TypeCheck`). Uma regressão em qualquer regra abaixo deixa a CI vermelha.

## Princípio

**Cada prova roda uma vez e cada espera tem motivo.** Um job só roda se o resultado dele ainda não é conhecido; um
job só espera outro se consome o que o outro produz; uma PR só gasta CI quando é a vez dela.

## O que foi medido (14/10 00:00 → 15/10 16:00)

| Medida | Valor | Fonte |
|---|---|---|
| Runs do `ci.yml` | 100 em ~36 h, ~1.000 min de job; 24 verdes, 34 vermelhos, 32 cancelados | API de Actions |
| Pushes na `main` que refaziam uma árvore já aprovada na PR | **8 de 9** (árvore do squash = árvore do head da PR) | `tree_id` dos commits; conferido no #1945: `160379d5…` nos dois |
| Run da `main` após o merge do #1945 (38759168550) | **26 min**: shards 5–8 min → agregador esperou 3 min por runner → `test:coverage` rodou a suíte inteira de novo em série por **14 min** → Build (11 s) só começou no minuto 26 | jobs do run |
| `auto-update-pr-branch` | atualizava **todas** as PRs BEHIND a cada merge: N CIs completas, 1 entrava, N−1 voltavam a BEHIND | código do workflow |
| Heads distintos numa única branch de agente | 68 em ~36 h (cada push reinicia ~10 jobs; 32 runs cancelados) | API de Actions |
| `branch-hygiene-audit.yml` | YAML inválido desde o #1942: falhava em todo push e a auditoria semanal nunca rodou | PyYAML/zizmor + runs 38765371137, 38767163745 |

## Regras

### R1 — Fila serial: uma PR em voo por vez, ordem de chegada
- **Antes:** a cada merge, todas as PRs com auto-merge que ficavam BEHIND eram atualizadas ao mesmo tempo. Com
  `strict=true` só a primeira a ficar verde entra; as outras voltam a BEHIND e recomeçam. Trabalho O(N²), runners
  disputados (até 3 min de espera por job) e nenhuma PR andando mais rápido.
- **Agora:** `auto-update-pr-branch.yml` → `scripts/ci/fila-merge.mjs`. Com uma PR em voo (atualizada e com checks
  rodando, ou verde esperando o auto-merge), ninguém mais é atualizado. Sem PR em voo, só a próxima é atualizada: a
  que ligou o auto-merge primeiro (FIFO por `enabledAt`), então **ninguém volta para o fim da fila**. PR com check
  obrigatório vermelho sai da fila até o autor corrigir (atualizá-la seria pagar para falhar de novo).
  PR de fork atrasada também fica fora (o `GITHUB_TOKEN` não escreve no repositório de origem); fork já em dia com
  a `main` conta como em voo, como qualquer outra. Se o `update-branch` da
  primeira da fila for recusado de forma permanente (HTTP 403/422), o workflow tenta a próxima na mesma execução
  e para no primeiro aceito: a fila nunca trava atrás de uma PR que não pode ser atualizada. Falha ambígua (rede,
  5xx: o update é assíncrono e pode ter sido aceito) encerra a execução, para nunca haver duas PRs em voo; falha
  ao ler o head do candidato também encerra, para uma PR posterior nunca passar à frente da cabeça da fila. Um 422
  pode ser "nada a atualizar" (a PR foi atualizada por fora depois da leitura da fila): antes de avançar, a fila
  relê a PR e, se ela já está em dia com a `main`, trata-a como em voo e encerra. 403/422 de rate limit ou "endpoint
  spam" também encerra: é o GitHub pedindo para parar, não uma recusa daquela PR.
  Depois de uma recusa, o próximo candidato só é tentado se for **o primeiro da fila recalculada naquele momento**,
  tirando as já recusadas na execução (`fila-merge.mjs --confirmar N --recusadas "..."`): a lista do início pode
  estar velha, com outra PR em voo ou uma mais antiga que ficou elegível e deve passar à frente.
- **Gatilhos:** push na `main` (a vez abriu), fim de `CI/CD Pipeline` ou `DB Guard (offline)` (a PR em voo pode
  ter ficado vermelha e liberado a vez) e um agendamento a cada 30 min, para o caso de alguém ligar o auto-merge sem
  outro evento.
- **`mergeStateStatus: UNKNOWN`:** o GitHub calcula a mergeabilidade de forma assíncrona. A fila não trata UNKNOWN
  como "em voo" às cegas: compara `main...head` (`behind_by`) para saber se a PR está atrás.
- **Contrato:** a escolha sempre pela fila; o laço percorre a fila ordenada, pula o update recusado e para no
  primeiro aceito (no máximo uma PR atualizada por execução).

### R2 — Reuso de árvore: o push na `main` não refaz o que a PR provou
- Com `strict=true` + squash, a PR só entra atualizada, e o commit de squash tem a **mesma árvore** do head da PR.
- O job `reuso` (só em push; em PR é pulado e não ocupa runner) roda `scripts/ci/reuso-arvore.mjs`, que dispensa os
  jobs de `ci.yml` e `db-guard.yml` quando: o commit veio de uma PR mergeada, a árvore é igual à do head da PR e o
  **último** run do mesmo workflow no head terminou verde com **todos** os jobs bloqueantes em `success` (`skipped`
  por draft não conta).
- Qualquer dúvida ou erro de API cai em "roda tudo": a falha leva sempre a **mais** teste, nunca a menos.
- **O que continua rodando na `main` de propósito**, porque não há equivalente na PR: `db-live-guard` (banco vivo),
  `e2e-logado` (precisa de segredos), `deploy-functions`, `talkx-status-regen`.
- **Contrato:** todo job de `ci.yml` e `db-guard.yml`, exceto o próprio `reuso` e o `mutation-mapa` (só PR),
  depende de `reuso` e é condicionado a `needs.reuso.outputs.reusar != 'true'`.

### R3 — A suíte de unidade roda uma vez
- **Antes:** shards sem cobertura na PR e, na `main`, `test:coverage` rodando a suíte inteira de novo (14 min). O
  piso de cobertura só era conferido depois do merge, quando já não podia barrar nada.
- **Agora:** 3 shards rodam com `--coverage --reporter=blob` e `VITEST_SHARD_SEM_PISO=1` (metade da suíte nunca
  alcança o piso global). O agregador `🧪 Unit Tests` junta os blobs (`vitest --merge-reports --coverage`) e aplica o
  piso **uma vez**, na PR. O blob vai do shard ao agregador como artifact de 1 dia (transferência no mesmo run, não
  diagnóstico); o relatório de cobertura só é publicado quando o piso reprova.
- **Contrato:** o `vitest run` só aparece nos shards e no merge; `test:coverage` não volta ao `ci.yml`.

### R4 — Nada espera o que não consome
- **Antes:** `Build` tinha `needs: test`. O build não usa nada dos testes, leva 11 s, mas só começava depois dos
  shards e do agregador.
- **Agora:** `Build`, `E2E` e `Security` dependem só do `reuso` (que em PR é pulado) e começam junto com o resto.
- **Contrato:** `build.needs`, `e2e.needs` e `security.needs` são exatamente `[reuso]`.

### R5 — Run cancelado não pinta check obrigatório de vermelho
- **Antes:** os agregadores usavam `always()`. Quando um push novo cancelava o run anterior, `🧪 Unit Tests` e
  `Contrato DB offline` apareciam vermelhos e geravam notificação de falha que não era falha.
- **Agora:** `!cancelled()`. Shard vermelho continua reprovando o agregador; cancelamento não.
- **Contrato:** nenhum job de `ci.yml` ou `db-guard.yml` usa `always()` no `if:`.

### R6 — Agente empurra lote validado, não commit a commit (disciplina)
- 68 heads numa branch em 36 h significam 68 reinícios de ~10 jobs; os 32 cancelados são esse custo.
- Regra: validar localmente (testes, lint, `actionlint`) e fazer **um push por lote**. A seção 0 do `CLAUDE.md`
  já manda trabalhar no local; isto vale também para CI. Não dá para impor por contrato; a métrica abaixo mostra se
  está sendo seguida.

## O que ficou de fora, e por quê

| Ideia | Por que não |
|---|---|
| Pular jobs por "hash das entradas" (cache de resultado por arquivo) | Um conjunto de entradas incompleto pula teste que deveria rodar (os testes de `scripts/ci` leem docs, `CLAUDE.md`, planos). O reuso por **árvore inteira** (R2) é exato e cobre o caso que mais desperdiçava. |
| Filtro de paths nos checks obrigatórios | Check obrigatório que não roda fica "pendente" para sempre e trava o merge. O único filtro seguro já existe dentro dos jobs do `db-guard` (W55). |
| Juntar workflows para "ter menos arquivos" | Cada arquivo separa gatilho, permissões e segredos; juntar o `db-live-guard` (com `DESTINO_URL`) a um workflow que roda em PR seria pior. |
| Fila de merge nativa do GitHub | Inexistente em conta `User` (422 `Invalid rule 'merge_queue'`); a R1 é o substituto. |

## Como saber se está funcionando

| Indicador | Antes (medido) | Meta |
|---|---|---|
| Runs de `ci.yml` por PR mergeada | ~4–6 (agente) + 1 por merge alheio enquanto BEHIND + 1 na `main` | 1 por push do autor + 1 quando chega a vez |
| Push na `main` com CI completa | 8 de 9 | só quando a árvore difere (não deveria acontecer com `strict=true`) |
| Tempo do run de `ci.yml` na `main` | 26 min | ~1 min (job `reuso`) |
| `Build` pronto na PR | depois dos testes | ~1 min após o push |
| Runs cancelados | 32 de 100 | queda acompanhando a R6 |

O Job Summary do `auto-update-pr-branch` mostra a fila a cada execução (em voo, próxima, esperando, bloqueadas), e
o do job `reuso` diz por que dispensou ou rodou a CI.

## Limites conhecidos

- A vazão da fila é de uma PR por ciclo de CI (~8 min). Era o mesmo limite antes, já que só uma podia entrar por vez
  com `strict=true`; a diferença é que as outras não queimam CI esperando.
- Se a aprovação dos runs `action_required` do head atualizado falhar (`recusado pelo GITHUB_TOKEN`), a PR fica "em
  voo" sem checks e segura a fila até alguém aprovar na aba Actions. O log do passo avisa.
- A fila só enxerga PRs com auto-merge ligado. PR sem auto-merge não entra na fila e não é atualizada.
- PR de fork em voo que fica vermelha só libera a vez no próximo agendamento (até 30 min): o fim da CI de um fork
  não aciona a fila de propósito, para nenhum evento disparado por fork rodar com token de escrita. O repositório
  tem um colaborador e os agentes trabalham em branches do próprio repo, então o caso é raro e o atraso é limitado.

# Reauditoria dos descartes — 2026-11-17

Uma primeira adjudicação classificou 38 itens de resgate e mandou **descartar 21**.
Esta reauditoria pegou esses 21 de volta, um por um, com um verificador por item
instruído a **derrubar o descarte** em vez de confirmá-lo, e um segundo
verificador adversarial por cima dos que sobreviveram.

**Resultado: 17 dos 21 descartes estavam errados.**

O erro foi quase sempre o mesmo, e vale registrar porque vai se repetir: a
auditoria lia *um* arquivo, via que ele importava algo que não existe na `main`,
e o condenava — sem olhar se a peça que faltava estava **na mesma branch**. Em
todos os casos abaixo ela estava. Trabalho parcial de outro agente chega como
conjunto de 2 a 5 arquivos; julgar uma peça isolada condena o conjunto.

## O que foi resgatado, e onde está

| Item | Por que o descarte estava errado | Entregue em |
|---|---|---|
| `provar-lote.sh` + `assert-runtime-proof.mjs` + guard | "a dependência não existe na main" — estava na mesma branch, e o guard dela ninguém tinha olhado | **#3245 (mergeada)** |
| `CrmBadges.tsx` | "o único consumidor era ChatHeader.tsx, que não existe" — o componente compila contra a `main` sem alteração; faltava plugar | **#3247 (mergeada)** |
| `MobileSlidePanel` (PinchZoom) | "importa `haptics` de SwipeGestures" — `haptics` mora em `swipeUtils.ts`; o único export sem equivalente era o PinchZoom | #3246 |
| `ExternalContact360Panel` + `Contact360Helpers` + teste | "importa Contact360Helpers, que não existe" — estava na mesma branch, 317 linhas | #3248 |

Nos quatro, o resgate veio por **blob OID** (bytes idênticos ao original) e o que
escrevi foi só a ligação e o teste que prova a ligação.

### Dois defeitos achados no caminho, antes de entrar

- `fila-merge.mjs` (#3231): CI cancelada travava a fila **para sempre**.
  `CANCELLED` contava como "pendente", a PR já atualizada virava "em voo" e
  ninguém mais era atualizado. Dois revisores independentes confirmaram.
- `PinchZoom` (#3246): a escala multiplicativa não voltava ao 1x. Medido:
  dedos a 100 → 200 → 100 px devolviam `1 | 2 | 2`. Troquei por escala absoluta
  em relação ao início do gesto.

Nos dois casos o trabalho do outro agente entrou **corrigido**, não como estava.

## Descartes que se confirmaram (3)

- `scripts/db-audit/talkx-rfm.test.sh` — a migration `20261103201500_remove_pagamentos_e_special_agent.sql`
  **já está na main e aplicada**, e foi ela que removeu `contact_purchases`,
  `payment_links` e as duas funções RFM, por decisão de 03/11. Não é perda: é
  remoção deliberada. A segmentação RFM continua chegando pelo CRM externo
  (`useAdvancedContactSearch.ts:49`, selo em `CRMContactCard.tsx:73`, filtro em
  `CRMFiltersPanel.tsx:48`).
- `useInboxFilterTags.camada-servico.test.tsx` — testa hook removido por ordem
  escrita (`docs/plans/PLANO_REMOCAO_TAGS_2026-10-12.md:3,13`).
- `AIAutoTagsConfig.tsx` — três guardas da `main` proíbem a volta do painel na
  tela de Configurações.

## O que NÃO entrou, e o motivo exato

Todos os itens abaixo têm valor que a `main` não tem. Nenhum é descarte: são
resgates que dependem de uma decisão que não é minha, ou que deixariam a `main`
vermelha se entrassem sozinhos.

| Item | O que falta | Por que não entrou |
|---|---|---|
| `db-migrate-ga13-17.unit.mjs` (18 peças) | a refatoração do `db-migrate.yml`: 466 linhas contra as 1493 da main, e migrations em lote | reescreve o workflow que aplica DDL em **produção** |
| `ga20-ga25-contratos.unit.mjs` (9 peças) | sistema de detecção de drift de schema (`drift-explicado.mjs`, `gate1-pendente.mjs`, `catalog.base.json`) | exige editar `types-sync.yml` e `db-live-guard.yml` |
| `calcular-lote.sh` | substitui um bloco que a main tem inline em `db-migrate.yml:187-216` | mesma troca de workflow acima |
| `vercel-env-cleanup-workflow.unit.mjs` | o secret `VERCEL_WRITE_TOKEN` | **segredo novo** — só o dono cria |
| `auto-update-pr-branch.yml` (10 peças) | depende de `fila-merge.mjs`, que entra pela #3231 | workflow novo; e o motivo da remoção em 14/11 foi **custo de Actions** |
| `main-failure-notify.yml` | aviso de falha da main no celular | o arquivo viola `AGENTS.md:76` (`EVOLUTION_*` só nas edges) e tem hostname da VPS em repo público. O caminho correto existe e foi testado: dedup por workflow no `notifica-falha-main.yml` que já está na main |
| `check-ddl-deployments.mjs` / `ga25-ddl-check.mjs` | o escritor do ledger GA25 | a cadeia está meio construída na main: o leitor existe e **nenhum workflow o chama** |
| `copilot_feedback` / `copilot_retention` (migrations) | expurgo de retenção e feedback por insight | **DDL em produção**, e a de retenção apaga dados (`DELETE FROM copilot_insights` > 90 dias) |
| `useMultimodalAnalysis.ts` | análise de vídeo/áudio com contexto de venda | mudaria o contrato executável da edge que está em produção |
| `.claude/CLAUDE.md` | o congelamento de features declarado em 01/11 | é **regra, não código**. A `main` contradiz as proibições na prática (dossiês de 15 e 16/11 e 4 workflows novos mergeados). Se o congelamento vale, o lugar dele é dentro de `AGENTS.md`, para ficar sob o guard GA02 |

## Achados colaterais (não corrigidos)

- `scripts/db-audit/check-deployments-ledger.mjs` está na main, testado, e
  **nenhum workflow o chama**: guarda paga e não usada.
- `src/services/inbox.service.ts:23` (`fetchInboxFilterTags`) sobreviveu à
  remoção das tags e não tem consumidor. Há **dois mocks órfãos** em testes da
  main apontando para o módulo removido.
- `copilot_retention_aggregates` é alimentada por cron e não é lida por ninguém.
- 9 colunas `rfm_*` vazias em `talkx_contact_attributes`, sem função que escreva.
- `e2e/__screenshots__/contacts-table-dark-linux.png` está 5x fora da tolerância
  contra o render atual. Triangulado em 3 PRs independentes que não tocam `src/`,
  sempre com a mesma contagem (3698 px): vem da `main`, é determinístico.

## Condição para fechar uma branch

Nenhuma branch de origem pode ser fechada enquanto o resgate dela estiver apenas
em PR aberta. A regra aplicada aqui é: **a branch só fecha quando todo caminho
que só existe nela estiver na `main` com blob idêntico, ou tiver veredito de
obsolescência com a causa escrita neste documento.**

O inventário de 233 caminhos foi reconferido blob a blob contra a `main`:

- **229** genuinamente ausentes (nem pelo caminho, nem pelo conteúdo em outro lugar);
- **1** idêntico na main e listado como exclusivo por erro (`docs/audits/LAUDO-BRANCHES-2026-11-17.md`);
- **3** divergentes porque esta sessão entregou outra versão — conferido um por um:
  em `primitivos-texto-longo-a11y` a main tem **11 casos contra 8** da branch, e em
  `useTalkXServiceStatus` e `useMessageStatus` os títulos são os mesmos, com a main
  cobrindo o mesmo ponto por asserção mais forte (`toBe(0)` e
  `toEqual(['m1','m2','m3','m4'])` contra `toBeGreaterThanOrEqual`).

Ou seja: **nenhuma entrega desta sessão reduziu o trabalho do agente anterior.**

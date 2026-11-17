# Veredito das 7 remoções de linha — 17/11/2026

O gate corrigido (#3195) passou a detectar o segundo ponto cego de remoção: linha que existia
no ponto de bifurcação, a branch tirou, e a `main` ainda tem. São **7 pares**, listados em
`analise-prs/recuperacao-261116-remocoes-de-linha.tsv`.

## Resultado

| | |
|---|---|
| Obsoletas, e aplicar seria **regressão de segurança** | **3** |
| Obsoletas, e aplicar perderia **documentação de rollback** | **2** |
| Obsoleta — documento de estado que a `main` tem mais novo | **1** |
| **Melhoria real** — mas é config de CI, vai para o dono | **1** |
| A aplicar por conta própria | **0** |

**A lição deste bloco:** descobrir que "remover também é trabalho" NÃO quer dizer que toda
remoção encontrada deva ser aplicada. Metade destas remoções tiraria proteção ou documentação
que a `main` mantém de propósito. O ponto cego era **não ver** a remoção; o veredito de cada
uma continua sendo por conteúdo.

## 1–3. `scripts/db-audit/consolidar-veredito.mjs` — tiraria a guarda do banco vivo

Três branches (`fix/ci-workflows-vermelhos`, `claude_pink/nice-hypatia-iikl82`,
`claude/fix-codex-findings-161016-1906`) removem as mesmas 4 linhas. O que sai é o passo
`live-invariants`, com o próprio comentário dizendo o que ele guarda:

```
// Guarda geral de invariantes do banco vivo (RLS, security_invoker, matview exposta,
// search_path de SECURITY DEFINER, policy de escrita aberta, referencia pendurada).
{ id: 'live-invariants', nome: 'Verificar invariantes gerais do banco vivo', log: '/tmp/step-live-invariants.log' },
'live-invariants',
```

Aplicar essas remoções apagaria do consolidador a verificação de RLS, de `search_path` em
função `SECURITY DEFINER`, de matview exposta e de policy de escrita aberta. **Não aplicar.**
A `main` está certa em manter, e o fato de três branches diferentes carregarem a mesma remoção
é motivo para desconfiança, não para consenso.

## 4–5. As duas migrations — nenhuma DDL, só documentação

`claude/fix-db-live-migrations-261107-1623` remove 16 linhas de
`20261107120000_goal_notifications_own_insert_policy.sql` e 14 de
`20261107123000_finalize_goal_notification_and_reaction_backup_policies.sql`.

Medido linha a linha: **zero linhas de DDL**. O que sai é o cabeçalho, o bloco
`-- Rollback:` com os comandos de desfazer, a justificativa da decisão e linhas vazias. Por
exemplo, a primeira perde o rollback completo das duas policies de notificação e a explicação
de por que a exceção de INSERT é estreita (só `auth.uid()` próprio, `type=goal`, linha não
lida, meta ativa).

Aplicar **pioraria** o repositório: migration aplicada não se reescreve, e o que seria perdido
é justamente como desfazê-la. **Não aplicar.**

## 6. `ESTADO.md` — documento de estado, e a `main` tem a versão mais nova

`claude/fix-ci-tests-batch2-2610-1830` remove 105 linhas. O que sai é o mapa das edge
functions com base declarada em `dia/2026-10-20` e 84 edges. A `main` tem o arquivo com **162
linhas**, posterior. É documento que cada frente reescreve; nada de funcionalidade. Obsoleta.

## 7. `.github/actionlint.yaml` — a branch estava certa, e isto vai para o dono

`claude_pink/cool-dijkstra-xk9ek2` remove 2 linhas: a exceção que manda o actionlint ignorar
`could not parse as YAML` em `.github/workflows/branch-hygiene-audit.yml`.

Conferido: o `branch-hygiene-audit.yml` da `main` **parseia como YAML sem erro** hoje. Ou seja,
a exceção virou **silenciamento morto** — ela não esconde mais nenhum problema real, e enquanto
estiver lá vai esconder o próximo erro de sintaxe que aparecer naquele arquivo.

A remoção é melhoria. Mas `.github/actionlint.yaml` é **config de CI**, item de "chame o dono"
por regra: não entra sem decisão dele. Fica registrada aqui, com a medição pronta.

## O que foi verificado de verdade

- cada remoção foi lida por `diff` entre a versão do **ponto de bifurcação** e a da branch — não
  por contagem de linha
- as duas migrations foram conferidas quanto a DDL: nenhuma linha executaável removida
- o YAML do `branch-hygiene-audit.yml` da `main` foi **parseado** para provar que a exceção está
  morta
- **NÃO VERIFICADO:** se o passo `live-invariants` do consolidador está passando hoje. O
  veredito aqui é só que ele NÃO deve ser removido; se ele reprova em alguma execução, isso é
  outra investigação.
- nenhuma branch foi fechada, apagada ou alterada por esta PR.

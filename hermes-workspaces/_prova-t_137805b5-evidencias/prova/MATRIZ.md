# MATRIZ — prova de não-regressão do zapp-verify (cartão t_137805b5)

Base: `~/.local/bin/zapp-verify` sha256 `aa5301f7…5508` (13420 B) → `.tmp/prova/alvos/zapp-verify.atual` (idêntico, conferido).
Alvo: patch `t_699fa539/zapp-verify.patch` aplicado → `.tmp/prova/alvos/zapp-verify.novo` sha256 `82fa553d…f63d` (esperado, confere; `bash -n` ok).
Blocos extraídos mecanicamente: `bloco-atual.py` sha256 `f6828357…0d5f` (85 linhas), `bloco-novo.py` sha256 `aa90ec32…f6ae` (122 linhas).
Veredito por execução: rc=0 e 1ª palavra `ok` = EXPLICADA; rc≠0 = FALHOU. Logs crus em `.tmp/prova/logs/<caso>-{atual,novo}.log`.

## Casos sintéticos (nomes inventados; retrato `{}`; falhas.tsv vazio)

| caso | linha | ANTES | DEPOIS | muda? | classe |
|---|---|---|---|---|---|
| c1-rls-positivo | `rls\|t137805b5_pend` (pendente cria a tabela) | FALHOU | EXPLICADA | sim | rls |
| c2-rls-negativo | `rls\|t137805b5_ausente` (tabela NÃO criada) | FALHOU | FALHOU | não | — |
| c3-index-positivo | `indexes\|t137805b5_pend.t137805b5_pend_pkey` | FALHOU | EXPLICADA | sim | nome-gerado |
| c3-index-positivo | `constraints\|relation:t137805b5_pend.t137805b5_pend_pkey` | FALHOU | EXPLICADA | sim | nome-gerado |
| c4-index-negativo | `indexes\|foo_bar.foo_bar_pkey` (foo_bar não citada) | FALHOU | FALHOU | não | — |
| c5-column-negativo | `columns\|t137805b5_pend.col_nao_citada` | FALHOU | FALHOU | não | — |
| c6a-acl-policy-negativo | `policies\|t137805b5_pend.pol_errada` (pendente só cria `pol_certa`) | FALHOU | FALHOU | não | — |
| c6b-acl-papel-negativo (literal) | `relation_grants\|r:public.t137805b5_pend\|relatorio_role\|SELECT\|grantor=postgres` | EXPLICADA | EXPLICADA | não | igual-antes-e-depois (não é regressão) |
| c6b2-acl-papel-naocitado (variante do negativo pedido) | `relation_grants\|r:public.t137805b5_pend\|auditoria_role\|SELECT\|grantor=postgres` | FALHOU | FALHOU | não | — |
| c6c-acl-funcao-negativo | `routine_grants\|f:t137805b5_fn(p_id uuid)\|authenticated\|EXECUTE\|grantor=postgres` | FALHOU | FALHOU | não | — |
| c6d-acl-explicito-igual | `relation_grants\|r:public.t137805b5_pend\|authenticated\|SELECT\|grantor=postgres` | EXPLICADA | EXPLICADA | não | igual-antes-e-depois (não é regressão) |

**Nota c6b:** a fixture literal do cartão (pendente com `grant select ... to relatorio_role` e diff citando
`relatorio_role`) sai EXPLICADA nas DUAS versões — a regra antiga `cita(papel)` já explica qualquer papel citado
no texto da pendente (comportamento idêntico ao c6d). O cartão previa FALHOU nas duas, o que não se sustenta com o
texto literal: o papel está citado. Para cobrir o negativo pretendido (papel fora dos padrão não citado pela
pendente), a variante `c6b2` usa `auditoria_role`, que NÃO aparece na pendente: FALHOU nas duas versões —
o bloco novo não alarga para papel não-padrão.

## Dados reais (REF_COPIA / REF_ESTADO, stack v2-26100709037ed9)

| caso | linha(s) | ANTES | DEPOIS | muda? |
|---|---|---|---|---|
| c7-real (47 linhas reais; fixture inclui a pendente `20261005224959_inbound_message_effects_outbox.sql` restaurada de `.tmp/base_…` da REF_COPIA — sha `0724249a2aa90732` confere com `.hermes-tarefa`) | 47 | FALHOU | ok\|drift=0 (EXPLICADA) | sim |
| c8-real-falha (mesmo + 1 pendente em falhas.tsv) | 47 | FALHOU | FALHOU | não |
| blocos contra W=REF_COPIA/ST=REF_ESTADO direto | — | FALHOU (FileNotFoundError) | FALHOU (FileNotFoundError) | não — ver achado |

**Achado de estado (registrado, não corrigido):** a cópia de referência não contém mais o arquivo
`supabase/migrations/20261005224959_inbound_message_effects_outbox.sql` listado como `APLICADA_LOCAL` na
`.hermes-tarefa` (o conteúdo foi consolidado; base preservada em `.tmp/base_inbound_message_effects_outbox.sql`
da REF_COPIA, sha256 `0724249a2aa90732…` = sha registrado). Rodando os blocos direto na REF_COPIA, os DOIS quebram
com FileNotFoundError → rc=1 → FALHOU nas duas versões (veredito idêntico, sem alargamento). A prova antes/depois
do cartão usa a fixture c7-real, que é a REF_COPIA + esse arquivo restaurado.

## Conjunto completo (passo 1 do cartão) — logs em `logs/conjunto-completo-*.log`

- `ls REF_COPIA/supabase/migrations/*.sql | wc -l` = **794** ✓
- `falhas.tsv`: 21 linhas, sha256 `16a06b07…daae`; `diff` da 1ª coluna contra
  `~/.local/share/zapp-local/falhas-esperadas.txt` = **IDÊNTICO** (as 21 falhas reais continuam sendo as 21).
- Nenhuma das 21 falhas consta na lista de aceite `t_59eb0a93/261006143922bb.txt` (`comm -12` = **0**);
  `falhas-esperadas.txt` ∩ lista de aceite = **0**.
- `zapp-db-local check REF_COPIA v2-26100709037ed9` (somente check): `ESTRUTURA: 47 diferença(s)`, rc=1;
  sha256 de `falhas.tsv` **idêntico antes e depois** (`16a06b07…daae`) — nada foi escrito.

## Diferencial (passo 7) — saída crua em `diferencial/saida.txt`

- **44 estados** com `copia.txt` apontando para cópia existente com `.hermes-tarefa`; **18.873 linhas** comparadas.
- 18.793 vereditos iguais; **80 mudaram**, todos FALHOU → EXPLICADA.
- Por classe: **rls = 13, nome-gerado = 25, acl-padrao = 40**, fora das 3 classes = **2**.
- **Explicada ANTES e FALHOU DEPOIS: 0** (zero regressão em qualquer direção).
- As 2 fora das 3 classes: `policies|ai_usage_outbox."Service role can manage AI usage outbox"` nos stacks
  `v2-2610051517b70e` e `v2-261005201329a5`. A pendente `20261005183057_ia_timeout_001_event_id_outbox.sql` faz
  literalmente `create policy "Service role can manage AI usage outbox"` — o patch corrigiu a prova `cita()` para
  policies (tira aspas e baixa caixa: o `\b` antigo não casava nome entre aspas/maiúsculas). É a MESMA prova
  "objeto citado no texto da pendente" que já existia para policies — não é uma classe nova de aceite; o nome está
  citado literalmente. Registrado com todas as letras: não é uma das 3 classes nomeadas pelo cartão.

## Veredictos inalterados (resumo)

- Toda linha que NÃO é citada por pendente e NÃO é (tabela criada por pendente + nome gerado / acl de papel padrão
  / policy citada literalmente) continua FALHOU: c2, c4, c5, c6a, c6b2, c6c = FALHOU nas duas; c8 (regra estrita de
  pendente que falhou) = FALHOU nas duas.
- As 21 falhas reais de migration (`falhas.tsv`) seguem intactas e continuam reprovando o conjunto quando uma
  pendente consta nele (c8).

# Diagnóstico — guardas do Hermes e divergências conhecidas

Data: 29/09/2026 · Repo: `adm01-debug/Zapp_Web_V2` · Banco canônico: `tnnnlkbymytvtqngbbqh`

Este documento registra três itens levantados como "achados fora do escopo" nos PRs
#1187/#1198/#1202 e que **não** podem ser corrigidos pelo executor: dois são a guarda do
Hermes (`~/.local/bin/hermes-db-migrar`, `hermes-tarefa-*` — editar é proibido, o bloqueio
`HERMES-GUARD` é ativo) e um é a divergência entre o arquivo de uma migration já aplicada e o
SQL que está de fato no banco (regra 7: migration aplicada é imutável).

## 1. `hermes-db-migrar` — os dois falsos positivos **não se reproduzem** na versão atual

Foram criados dois arquivos de diagnóstico (nunca aplicados, apagados em seguida) e rodado
`hermes-db-migrar <arquivo> --dry-run`:

| caso | arquivo | resultado |
|---|---|---|
| `ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS ...` | `20260929900000_diagnostico_drop_constraint.sql` | `classe: contrato` (não destrutiva) ✓ |
| `CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql AS $function$ BEGIN RETURN 1; END; $function$` | `20260929900001_diagnostico_begin_plpgsql.sql` | `classe: contrato`, dry-run montou o SQL completo, sem acusar "transação explícita" ✓ |

Evidência adicional de que o `BEGIN` de corpo plpgsql passa pelo caminho real (não só pelo
classificador): a migration `20260929790000_contacts_hijack_guards_only_on_change.sql` reescreve
duas funções plpgsql com `BEGIN ... END` em dollar-quote e **foi aplicada hoje** pelo
`hermes-tarefa-mergear` (classe contrato, registrada no ledger). O `--help` atual também já
documenta `DROP CONSTRAINT` como contrato.

**Conclusão:** os dois falsos positivos relatados anteriormente estão resolvidos na guarda em
vigor. Não há ação pendente para o executor.

## 2. `search_contacts`: arquivo de 17 colunas × SQL vivo de 23 colunas

**Rastro (conferido no histórico em 29/09/2026, `git log --all --name-status`):** o próprio arquivo
`20260929370000` **nunca foi renomeado** — foi **adicionado já com o nome final** no commit `41f66910`
(PR #1172, status `A`). Quem foi renomeada dentro daquele PR foi a migration **vizinha**
`20260929390000_contacts_conversation_status_and_grants.sql` → `20260929560000_...` (commit `b1d38824`,
`+0 -0`), para liberar a versão. A versão desta entrada foi mencionada por engano como se ela mesma
tivesse sido renomeada; o texto da entrada de evidência foi corrigido no PR #1214. Isso se soma à causa do
conteúdo divergente: o SQL corrigido (23 colunas) foi aplicado direto no banco depois de o gateway
recusar `42P13` na primeira tentativa, e o arquivo ficou com o replay anterior — porque migration
aplicada é imutável (regra 7). A entrada de evidência registra as duas coisas.

- O arquivo `supabase/migrations/20260929370000_*.sql` (F1) declara `search_contacts` com 17
  colunas; o SQL efetivamente aplicado (guardado no ledger) tem 23 — as seis colunas de endereço
  (`address, address_number, neighborhood, city, state, postal_code`).
- O par arquivo ↔ ledger está reconciliado por hash em `scripts/db-audit/migration-evidence.json`
  (`safer-replay`), que é o único mecanismo legal para esse caso: **editar a migration aplicada é
  proibido** (regra 7) e o `db-live-guard`/`check-migration-drift.mjs` reprova arquivo cujo
  conteúdo divirja do ledger.
- A definição **corrente** de `search_contacts` no repo já é a de 23 colunas: as migrations
  `20260929780000`, `20260929810000` e `20260929820000` reemitem a função a partir da definição
  viva. Ou seja, quem lê a migration mais recente vê o mesmo que o banco; a divergência está
  confinada ao arquivo histórico do F1.
- O contrato de banco (`scripts/db-audit/contacts-soft-delete-and-status.test.sh`) reemite a
  definição viva antes do próximo `CREATE OR REPLACE` justamente para não medir um estado que não
  existe em produção.

**Conclusão:** sem ação para o executor. Fechar de vez exigiria reemitir o arquivo histórico com o
conteúdo do ledger — o que depende de decisão do Joaquim sobre a evidência (`safer-replay`), não de
uma migration nova.

## 3. Beco de ferramenta: commit novo depois do merge do PR da tarefa

Reprodução (aconteceu nesta série): o PR #1198 foi mergeado; depois disso nasceu na mesma
tarefa/workspace um commit com migration nova (o conserto de performance). Aí:

| ferramenta | resposta |
|---|---|
| `hermes-tarefa-mergear --dry-run` | `ERRO: PR #1198 já está mergeado e o seu HEAD local (...) não está entre os commits do PR: há trabalho local que NÃO entrou no merge. Não descarte nada: reporte e abra uma nova tarefa para ele.` |
| `hermes-tarefa-iniciar <projeto> <slug>` | `HERMES-GUARD: este chat já tem a tarefa aberta em .../contatos-debitos-pos-1187-...` |
| `hermes-tarefa-limpar` | `ERRO: migration pendente pós-merge ainda não aplicada: supabase/migrations/20260929810000_....sql` |

Ou seja: para abrir a tarefa nova exigida pelo `mergear`, é preciso limpar; para limpar, a
pendência precisa estar aplicada; e o `mergear` (único que aplica) recusa porque o PR já foi
mergeado. Sem saída pelo fluxo normal.

**Como destravei (modo sancionado, sem editar guarda):** `hermes-db-migrar <arquivo> --pos-merge`
— o modo que o próprio `hermes-tarefa-mergear` usa para aplicar pendências. Depois: `hermes-tarefa-limpar`
e `hermes-tarefa-iniciar` para a tarefa nova, levando o **mesmo nome/versão** de arquivo (a versão já
está no ledger; `hermes-db-migrar <arquivo> --ja-no-ledger` responde `sim` e o `hermes-tarefa-fechar`
aceita o diff, sem reaplicar e sem duplicar entrada).

**Correção proposta** (2 linhas em `~/.local/bin/hermes-tarefa-limpar`, trecho atual):

```bash
if grep -q '^PENDENTE_POS_MERGE=' "$WS/.hermes-tarefa"; then
  for f in $(sed -n 's/^PENDENTE_POS_MERGE=//p' "$WS/.hermes-tarefa" | sort -u); do
    grep -qx "APLICADA_DB=${f##*/}" "$WS/.hermes-tarefa" || { echo "ERRO: migration pendente ..."; exit 1; }
  done
fi
```

Passaria a considerar aplicada a migration cuja **versão já está no ledger** (`hermes-db-migrar
"$f" --ja-no-ledger` sai 0), que é exatamente o critério que o `mergear` usa para dizer
"já no ledger" e não reaplicar:

```bash
    grep -qx "APLICADA_DB=${f##*/}" "$WS/.hermes-tarefa" \
      || hermes-db-migrar "$f" --ja-no-ledger \
      || { echo "ERRO: migration pendente pós-merge ainda não aplicada: $f. ..."; exit 1; }
```

Efeito: o caso "PR já mergeado + commit novo" deixa de travar `limpar`/`iniciar`, sem afrouxar o
caso legítimo (migration não aplicada continua bloqueando). Não apliquei — a guarda é do Joaquim.

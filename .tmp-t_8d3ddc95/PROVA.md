# t_8d3ddc95 — ajuste da atribuição do zapp-verify para drift pré-existente

Especialista: Edgar (area-edge-api). Cartao: t_8d3ddc95. Data: 2026-10-07.
Alvo: `/home/joaquim_ataides/.local/bin/zapp-verify`.

## Sensibilidade (este diff entra na fila do revisor forte)

- **O que toca:** o portao local de verificacao (`zapp-verify`), bloco `banco_local` — o explicador
  embutido (heredoc `python3 - <<'PY'`) e o `if/elif/else` que decide **AVISO x FALHOU**. Nada de
  `rateLimit`/`service_role`/`requireRole`/`verifyHmac`/`DELETE`.
- **O que afrouxa (consciente, pedido pelo cartao):** diferenca de estrutura que (a) ja existe no
  retrato canonico da copia **e** (b) nao e citada por nenhuma migration pendente passa de **FALHOU**
  para **AVISO** — o passo deixa de condenar o cartao por drift pre-existente.
- **O que NAO afrouxa (fail-closed preservado):** diferenca citada por pendente continua explicada;
  diferenca sem prova pelo retrato nem pelas migrations aplicadas continua **sem** -> FALHOU; objeto
  novo do cartao continua **sem** -> FALHOU; registro da producao ilegivel continua `LEDGER_OK=0` ->
  regra estrita (o explicador nem roda).
- **Caso negado (exit code):** com drift **novo** (`indexes|sonda_cartao.sonda_cartao_pkey`) o
  explicador ajustado devolve `sem=1` -> shell `RC=1` -> **FALHOU / exit 1**. Medido abaixo.
- **Producao:** nenhuma leitura/escrita de producao; nada de banco; so arquivos do workspace.
- **Quem chama e muda junto:** a instalacao do arquivo e do Joaquim (guarda do Hermes reserva
  `~/.local/bin/**`). Ver "Fronteira de instalacao".

## O que mudou (confinado a `zapp-verify`)

`diff -u` instalado -> artefato: **2 hunks** (`@@ -65,23 +65,24 @@`, `@@ -101,18 +102,66 @@`); as
**linhas 1-64 sao identicas** (`cmp`). Mudanca so no bloco `banco_local`:

1. `explicada()` (diferenca citada pela pendente) e os caminhos fail-closed **intactos**.
2. Nova `drift_canonico(l)` — nao debita ao cartao a diferenca que:
   - **(a)** existe no retrato canonico da copia (`$W/supabase/schema-manifest.json`), **ou**
   - **(b)** vem de migration **ja aplicada** na base canonica (nome no texto das migrations
     nao-pendentes),
   - **sempre que nenhuma migration pendente cite o objeto** (`cita(n)` -> continua do cartao).
3. O laco final separa `pre` (drift nao debitado) de `sem` (debito); o `MOTIVO` sai como `ok|drift=N`
   e o shell so vira **AVISO** quando `MOTIVO` comeca com `ok`; `sem` nao vazio -> `RC=1` -> **FALHOU**.

## Artefato

| arquivo | sha256 |
|---|---|
| `ENTREGA/zapp-verify.novo` (179 linhas, `bash -n` OK) | `c95e371a054ea1d671893978bd8648c6971639cc978a39218ac502f881e3456e` |
| `ENTREGA/zapp-verify.original` (= instalado hoje, `cmp` byte a byte) | `70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26` |
| `ENTREGA/zapp-verify.diff` | — |

## Prova (comandos + ANTES/DEPOIS + exit codes; medidos nesta rodada)

`python3 evidencia/repro.py` (so arquivos do workspace; sem banco, sem producao):

```
== 0. alvos ==
HOJE (instalado) sha256 = 70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26
NOVO (artefato)  sha256 = c95e371a054ea1d671893978bd8648c6971639cc978a39218ac502f881e3456e
artefato tem drift_canonico()? True / instalado tem? False

== 2. execucao crua (rc = veredito banco_local) ==
HOJE rc=1  stdout: diferenca nao explicada por migration pendente: functions|f:record_incoming_call_event(...); routine_grants|...
NOVO rc=0  stdout: ok|drift=2

== 3. classificacao das 9 (linha a linha) ==
-- HOJE -- total=9 explicadas=7 SEM=2
-- NOVO -- total=9 explicadas=7 drift_canonico=2 SEM=0
DEBITADAS (SEM) HOJE=2  NOVO=0  de 9      <-- criterio do cartao

== 4. controle negativo ==
-- NOVO -- indexes|sonda_cartao.sonda_cartao_pkey -> SEM   (drift novo continua debitado)
           columns|r:public.sonda_cartao.col_citada -> explicada
           functions|f:consume_gmail_oauth_state(...) -> drift (esta no retrato)
           routine_grants|f:funcao_antiga()|authenticated|... -> drift (migration ja aplicada)
```

Ramos do shell: `bash evidencia/testa-ramos.sh`
```
RM=0 MOTIVO=ok         -> AVISO (todas citadas)
RM=0 MOTIVO=ok|drift=2 -> AVISO (drift pre-existente NAO debitado, drift=2)
RM=1 MOTIVO=erro       -> FALHOU (nota vermelha)
```

Confinamento: `grep '^@@' diff` -> 2 hunks; `cmp <(head -64 original) <(head -64 novo)` -> IDENTICA.

## Fronteira de instalacao (o alvo segue o de hoje)

Guarda do Hermes nesta rodada (ao vivo): qualquer escrita em `~/.local/bin/**` e recusada —
`"mexer nas guardas/ferramentas do Hermes (~/.local/bin, ...) e proibido — inclusive criar arquivo
novo nessas pastas. Mudanca nas guardas e do Joaquim."`
Alvo intacto: `70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26`.

**Instalar (Joaquim):**
```
install -m 0755 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo /home/joaquim_ataides/.local/bin/zapp-verify
```
Rollback: `install -m 0755 .../ENTREGA/zapp-verify.original /home/joaquim_ataides/.local/bin/zapp-verify`.

## Limite honesto (nao resolvido pelo ajuste)

Cumpre o criterio do cartao (9 residuais: 2/9 -> 0/9 debitadas; drift novo continua debitado), mas
**nao muda o veredito do cartao real**: com o retrato velho sobram 8 linhas sem prova (`*_pkey`/
`*_fkey` e grants globais) e, em rodada de agente, `zapp-db-ler` e bloqueado (rc=77/R1) ->
`LEDGER_OK=0` -> o explicador nem roda. O destravamento real e portar o retrato canonico
(`t_fc85d10a`), nao a atribuicao.

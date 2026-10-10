# EVIDENCIA — t_670ea2ee

VERIFICACAO INDEPENDENTE (positiva): as 9 diferencas residuais deixam de ser debitadas ao cartao
apos o ajuste do `zapp-verify`.
Papel: complexo (verificacao). Data: 2026-10-07. Ambiente: WSL, HOME/$W em sandbox, nenhum banco,
nenhuma producao, nada escrito em `~/.local/bin`.

VEREDITO: **CONFIRMA** — com o artefato ajustado, 0/9 das residuais sao debitadas ao cartao
(antes: 2/9) e o passo `banco_local` fecha **VERDE (exit 0)** no cenario das 9, contra
**VERMELHO (exit 1)** hoje. Nao ha mascaramento indiscriminado: 2 linhas de borda e as 8 linhas
sem prova do conjunto real continuam debitadas.

---

## 0. Fontes sob teste (sha256; nada foi editado)

| alvo | sha256 | linhas |
|---|---|---|
| HOJE `/home/joaquim_ataides/.local/bin/zapp-verify` (instalado) | `70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26` | 130 |
| NOVO `.../ENTREGA/zapp-verify.novo` (artefato do t_8d3ddc95) | `c95e371a054ea1d671893978bd8648c6971639cc978a39218ac502f881e3456e` | 179 |
| ROLLBACK `.../ENTREGA/zapp-verify.original` | `70c0b223...` (= instalado, byte a byte) | 130 |

O alvo instalado segue **INTACTO** (o artefato NAO foi instalado). Cabeca (linhas 1-64) do NOVO
identica ao instalado (conferido). `drift_canonico()` existe no NOVO e nao existe no instalado.

## 1. O que a guarda ajustada consulta (lido no artefato, nao no relato do pai)

- **(a) retrato canonico**: `$W/supabase/schema-manifest.json` — a diferenca cujo objeto JA consta
  no retrato da copia deixa de ser debito do cartao (`chave in RETRATO[tipo]`).
- **(b) versoes ja aplicadas**: o texto das migrations da copia que **nao** estao nas pendentes.
  As pendentes sao derivadas do **ledger da producao** (linha 43, `zapp-db-ler` ->
  `supabase_migrations.schema_migrations`); a prova (b) e a ocorrencia do nome do objeto como
  palavra inteira nesse texto. Ou seja: **o ledger e consultado, mas indiretamente** (para separar
  pendentes de aplicadas); a prova (b) NAO bate no registro da producao objeto a objeto.
- **Corte de escopo**: se qualquer nome da linha e citado por uma pendente (`cita(n)`), a diferenca
  continua sendo do cartao (nao vira drift). Preserva `explicada()` e os caminhos fail-closed
  (`SEM -> raise SystemExit(1)`; `LEDGER_OK=0 -> regra estrita`).

## 2. Reproducao em ambiente limpo

Ambiente construido do ZERO a partir das entradas cruas da tarefa 0 (nao reusa a arvore dos pais):
retrato = `entradas/retrato-velho-copia-294.json` (`d242c0e6...`, o que a copia 294 tem),
migrations = a propria pasta da copia (794 `.sql`), `check-diferencas` = o check REAL de 18:55
(`cb31c19f...`, 128 linhas), ledger = fixture com 793 versoes. Somando o ledger, a pendente sai
**derivada** (nao passada a mao): `20261006204953_multiplix_cascata_bloco_terminal.sql` (unica).

Comandos: `python3 .tmp/t_670ea2ee/verifica.py` (explicador extraido VERBATIM dos dois scripts) e
`python3 .tmp/t_670ea2ee/e2e.py` (scripts REAIS ponta a ponta, colaboradores stubados).

### 2.1 Execucao crua do explicador + veredito do bloco `banco_local`

```
cenario                        quem  rc  stdout/veredito                                    exit
9-as-residuais                 HOJE   1  "diferenca nao explicada...  2 linhas"  -> FALHOU   1
9-as-residuais                 NOVO   0  "ok|drift=2"                            -> AVISO    0
A-128 (retrato velho)          HOJE   1  84 nao explicadas                       -> FALHOU   1
A-128 (retrato velho)          NOVO   1  8 nao explicadas                        -> FALHOU   1
B-2 (retrato fresco)           HOJE   0  "ok"                                    -> AVISO    0
B-2 (retrato fresco)           NOVO   0  "ok|drift=0"                            -> AVISO    0
```

### 2.2 Linha a linha das 9 residuais (o que cada versao DEBITA)

```
HOJE  TOTAL=9  EXPLICADAS=7  DEBITADAS=2
NOVO  TOTAL=9  EXPLICADAS=7  DRIFT=2  DEBITADAS=0      <-- criterio do cartao
```
As 2 que eram debitadas (`functions|f:record_incoming_call_event(...)` e o
`routine_grants|...|postgres|EXECUTE|grantor=postgres` do mesmo objeto) passam a `drift`.
As outras 7 ja nao eram debitadas hoje — `explicada()` acha o PAPEL (`authenticated`/
`service_role`/`PUBLIC`) no texto da pendente antes de olhar o objeto (falso-positivo
pre-existente, nao criado por este ajuste; ja registrado no t_5d55882d).

## 3. Execucao PONTA A PONTA do portao REAL (exit code do proprio script)

`bash <script> <copia> <nome> --rapido`, com `zapp-db-local`/`zapp-db-ler`/`zapp-db-guard`/`node`/`bun`
stubados e `HOME`/`$W` em sandbox. O exit code e o `resultado.txt` vem do PROPRIO portao.

| # | cenario | quem | exit | veredito |
|---|---|---|---|---|
| 1 | 9 residuais | HOJE | **1** | VERMELHO: "FALHOU banco_local ... diferenca nao explicada ..." + "VERIFY: VERMELHO em banco_local" |
| 2 | 9 residuais | NOVO | **0** | "AVISO banco_local ... **2 diferenca(s) NAO debitada(s) ao cartao** (ja no retrato canonico e nao citadas por nenhuma pendente: ...)" + "VERIFY: VERDE" |
| 3 | A-128 velho | HOJE | 1 | VERMELHO |
| 4 | A-128 velho | NOVO | 1 | VERMELHO (8 linhas ainda sem prova: `*_pkey`/`*_fkey`) |
| 5 | B-2 fresco | HOJE | 0 | AVISO (toda diferenca citada) |
| 6 | B-2 fresco | NOVO | 0 | AVISO (`drift=0`) |
| 7 | 9 residuais, LEDGER BLOQUEADO (rc=77/R1) | NOVO | 1 | VERMELHO: "nao consegui ler o registro da producao: vale a regra estrita" |
| 8 | B-2 fresco, LEDGER BLOQUEADO | NOVO | 1 | VERMELHO (mesmo com so 2 diferencas legitimas) |
| 9 | bordas E1-E6 | HOJE | 1 | VERMELHO (5 debitadas) |
| 10 | bordas E1-E6 | NOVO | 1 | VERMELHO (2 debitadas: E4 e E6) |

`cenario 1` -> `cenario 2` e o "vermelho antes, verde depois" do proprio portao: exit 1 -> exit 0.

## 4. Caminhos de borda (fixture sintetico isolando cada prova)

| borda | linha | HOJE | NOVO |
|---|---|---|---|
| E1 so no retrato canonico | `indexes\|r:public.tab_snap.ind_snap` | DEBITADA | **DRIFT** (prova a) |
| E2 so nas ja-aplicadas | `indexes\|r:public.tab_led.ind_ledger` | DEBITADA | **DRIFT** (prova b) |
| E3 nos DOIS | `indexes\|r:public.tab_both.ind_both` | DEBITADA | **DRIFT** (prova a) |
| E4 em NENHUM (controle negativo) | `indexes\|r:public.tab_none.ind_none` | DEBITADA | **DEBITADA** |
| E5 objeto NOVO do cartao | `indexes\|r:public.tab_cartao.ind_cartao` | EXPLICADA | EXPLICADA |
| E6 tabela do cartao, filho novo | `indexes\|r:public.sonda_cartao.sonda_cartao_pkey` | DEBITADA | **DEBITADA** |

E1-E3 respondem aos 3 caminhos pedidos no cartao (so retrato / so ledger / nos dois) e todos passam
de debitada a drift. E4 e E6 provam que **nao ha mascaramento indiscriminado**: o que nao tem prova
nem e do cartao (E4) e o filho novo de objeto do cartao (E6) continuam vermelhos.

## 5. O que o ajuste NAO resolve (limite honesto, reconferido por mim)

1. O veredito do **cartao real** nao muda: no conjunto A-128 o NOVO ainda fecha FALHOU (8 linhas sem
   prova — nomes automaticos `*_pkey`/`*_fkey` e grants globais).
2. Em rodada de agente o `zapp-db-ler` e bloqueado (rc=77/R1) -> `LEDGER_OK=0` -> o bloco do
   explicador **nem roda** (linha 66 exige `LEDGER_OK=1`): o ajuste e **INERTE** nesse caminho
   (medido: cenarios 7 e 8). O destravamento de hoje e portar o retrato canonico (`t_fc85d10a`).
3. Prova (b) aceita qualquer linha cujo nome de objeto apareca em QUALQUER migration nao-pendente.
   No A-128 isso absorveu 67 linhas por (b) e 9 por (a) — e um criterio largo por NOME, nao pelo
   registro da producao objeto a objeto. E o desenho pedido pelo cartao, mas convem saber o tamanho.

## 6. Como reproduzir

```
cd /mnt/c/Users/Joaquim\ Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/workspaces/t_c5a96aba/.tmp/t_670ea2ee
python3 verifica.py      # fases 0-5: fontes, ambiente limpo, execucao crua, linha a linha, bordas
python3 e2e.py           # fases 6-7: os 10 cenarios ponta a ponta no portao REAL
```
Provas cruas em `saida/`: `VERIFICACAO.txt`, `E2E.txt`, `linha-a-linha-{HOJE,NOVO}.out`,
`bordas.out`, `atribuicao-drift-A.txt`, `e2e-01..10-*.out`, `e2e-*-banco_local.log`.
Nada de producao, nada em `~/.local/bin`, nada de projeto: HOME e $W em sandbox dentro do meu
workspace.

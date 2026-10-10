Especialista: worker (ci) (area-verificacao-ci)

# t_debaf8a8 — Verificação (negativo): drift genuinamente novo continua sendo detectado

Cartão: t_debaf8a8 (pai: t_8d3ddc95). Data: 2026-10-07. Verificação INDEPENDENTE (não escrevi
nem instalei nada; nenhum arquivo de projeto foi alterado).

## Veredito

**CONFIRMADO.** O ajuste entregue por t_8d3ddc95 NÃO silencia drift genuinamente novo. Com os
dados REAIS do conjunto vivo de hoje (cartão que criou a tabela `inbound_message_effects`), o
artefato devolve **exatamente o mesmo veredito de hoje: FALHOU no passo `banco_local`, exit code 1**,
com a mesma lista de diferenças debitadas (13 de 47). O ensaio discrimina: o mesmo artefato dá
`AVISO`/exit 0 quando a diferença é pré-existente (já no retrato canônico) e `FALHOU`/exit 1 quando
ela é do cartão — inclusive no caso misto.

## O que está sob prova (independente, conferido por sha256)

| arquivo | sha256 |
|---|---|
| instalado hoje `/home/joaquim_ataides/.local/bin/zapp-verify` | `70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26` |
| artefato `.../t_8d3ddc95/ENTREGA/zapp-verify.novo` | `c95e371a054ea1d671893978bd8648c6971639cc978a39218ac502f881e3456e` |
| cópia do conjunto vivo (`copia.txt` do conjunto) | `.../Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9` |
| retrato canônico dessa cópia | `46d02ce0b8406f3107c88d4c0f31e7d86c7240768c9beb9f9abe9b55a55b9bf4` |
| `check-diferencas.txt` do conjunto (09:07) | `668d2c065580ad0e5e66302da04d11f5896ee87e59652e855a478f147472822f` |

Confinamento (passo 5): `diff -u` instalado → artefato = **2 hunks** (`@@ -65,23 +65,24 @@`,
`@@ -101,18 +102,66 @@`), **linhas 1–64 idênticas** (`cmp`), 130 → 179 linhas, `bash -n` OK nos dois.
A mudança inteira vive no bloco `banco_local`.

## Como o caso negativo é REAL (não é fixture inventada)

O conjunto `v2-26100709037ed9` está de pé hoje 09:04–09:07 e rodou o check real, que gravou
`check.rc=1` com **47 linhas de diferença "só local"**: a tabela `inbound_message_effects` (rls,
9 colunas, 3 índices, 4 defaults, 3 assinaturas de função, 1 constraint e 16 grants) existe no banco
local e NÃO no retrato canônico — é o drift **novo** que a migration do cartão produziu.
A única migration pendente da cópia (versão fora do registro de versões aplicadas) é
`20261007095739_indeterminate_optout_outbox.sql`.

Passo 1 — as 47 linhas foram **reproduzidas pelo comparador real** (o `python3` embutido no
`zapp-db-local check`, extraído do arquivo, sha256 `77546fc4461befe263f183a436189b4b3fceac884f7a889154e936d608a101ff`)
a partir dos manifestos crus (`manifest-local.json` x `schema-manifest.json`), com **exit code 1** e
conjunto **idêntico** ao gravado ao vivo (`reproduzidas=47 vivo=47 iguais=True`).

    $ python3 trab/passo1-comparador.py            # exit code do script = 0; comparador rc=1
    comparador real extraido: 21 linhas  sha256=77546fc4...
    comparador rc=1
    [rls] só produção=0 só local=1 diferentes=0      <-- saida real do check de hoje
    reproduzidas=47  ao vivo=47  iguais=True
    ledger=793 versoes | migrations .sql na copia=794 | PENDENTES=1
      pendente: 20261007095739_indeterminate_optout_outbox.sql

## Passo 2 — o EXPLICADOR REAL (é ele que decide débito x AVISO)

Extraí o heredoc `python3 - <<'PY'` de cada script e rodei com `W` = a cópia real, `ST` = as 47
linhas reais, `NOVAS` = a pendente real. Saída (rc do explicador = veredito do passo):

    $ python3 trab/passo2-explicador.py
    HOJE (instalado) sha256 = 70c0b223...
    NOVO (artefato)  sha256 = c95e371a...
    HOJE: explicador extraido com 41 linhas (drift_canonico=False)
    NOVO: explicador extraido com 85 linhas (drift_canonico=True)
    == execucao crua (rc = veredito do passo banco_local) ==
    HOJE rc=1  stdout: diferença não explicada por migration pendente: rls|inbound_message_effects; indexes|inbound_message_effects.idx_inbound_message_effects_pending; indexes|inbound_message_effects.inbound_message_effects_pkey (+10)
    NOVO rc=1  stdout: diferença não explicada por migration pendente: rls|inbound_message_effects; indexes|inbound_message_effects.idx_inbound_message_effects_pending; indexes|inbound_message_effects.inbound_message_effects_pkey (+10)
    == classificacao das 47 linhas reais ==
    -- HOJE -- total=47 explicadas=34 drift_canonico=0 SEM=13
    -- NOVO -- total=47 explicadas=34 drift_canonico=0 SEM=13
    DEBITADAS AO CARTAO (SEM): HOJE=13  NOVO=13  de 47

Ou seja: nas 47 linhas reais, o ajuste drena **zero** para "drift canônico" — as 13 que eram
debitadas continuam debitadas, e as 34 "explicadas" (citadas pela pendente) não mudaram de lado.

## Passo 3 — o SCRIPT INTEIRO, com o código do artefato, no caso real

Rodei `bash zapp-verify.novo <cópia> <conjunto> --rapido` com as dependências externas
(zapp-db-guard, node, zapp-db-local, zapp-db-ler) substituídas por dublês que **repetem a saída real
capturada às 09:07** (`check-live.txt`, `falhas-live.tsv`, o registro de 793 versões da tarefa 0).
Tudo dentro do meu workspace, com `HOME` de ensaio: nada de banco, produção ou rede.

    $ bash trab/passo3-shell.sh
    ================ HOJE : /home/joaquim_ataides/.local/bin/zapp-verify
    OK      db_guard / tipos / lint / migrations / travas
    FALHOU  banco_local   diferença não explicada por migration pendente: rls|inbound_message_effects; indexes|... (+10)
    VERIFY: VERMELHO em banco_local
    exit code = 1
    ================ NOVO : .../t_8d3ddc95/ENTREGA/zapp-verify.novo
    OK      db_guard / tipos / lint / migrations / travas
    FALHOU  banco_local   diferença não explicada por migration pendente: rls|inbound_message_effects; indexes|... (+10)
    VERIFY: VERMELHO em banco_local
    exit code = 1

**Falha como antes: exit code 1, mensagem idêntica.**

## Passo 3b — controles (o ensaio NÃO é tautológico: ele sabe dar verde)

| cenário | HOJE | NOVO |
|---|---|---|
| **S-B** 1 diferença que JÁ está no retrato (`functions\|f:accept_department_invite(p_code text)`) | FALHOU rc=**1** | **AVISO rc=0** (`drift=1`, "1 diferença(s) NÃO debitada(s) ao cartão") |
| **S-C** registro de versões ilegível (`LEDGER_OK=0`) | FALHOU rc=**1** | FALHOU rc=**1** (regra estrita preservada) |
| **S-D** MISTO: 1 linha canônica + 1 linha nova do cartão | FALHOU rc=1 | FALHOU rc=**1**, citando só a linha nova |

S-D é a borda que importa: com drift do cartão presente, `drift>0` **não** vira AVISO — o script
imprime `diferença não explicada ... indexes|sonda_cartao.sonda_cartao_pkey` e sai 1.

## Passo 4 — sondas adversárias no explicador do artefato

| sonda | HOJE | NOVO | esperado | situação |
|---|---|---|---|---|
| N1 objeto novo do cartão (índice auto-nomeado `sonda_cartao_pkey`, tabela citada pela pendente) | SEM | SEM | SEM | OK |
| N2 objeto novo, nome fora do texto da pendente **e** fora das migrations aplicadas | SEM | SEM | SEM | OK |
| N3 linha de diferença sem separador `\|` | SEM | SEM | SEM | OK |
| N4 retrato canônico ausente/ilegível | SEM | SEM | SEM | OK |
| P1 (controle) diferença que já está no retrato | SEM | drift | drift | OK |
| **R1 (risco)** nome fora do texto da pendente **e** presente numa migration antiga | SEM | **drift** | drift | **RISCO medido** |

`trab/passo4-sondas.py`: `sondas normais=5 conforme=5 divergentes=0`.

## Risco medido (limite honesto desta verificação)

A única forma de o ajuste silenciar algo que NÃO é pré-existente é a sonda **R1**: a linha cujo
**nenhum** nome aparece no texto da migration pendente (DDL por SQL dinâmico / função) **e** cujo
nome **já aparece** em alguma migration antiga. Aí `drift_canonico()` devolve verdadeiro e a
diferença deixa de ser debitada (HOJE debitava). As duas condições juntas são estreitas — o caso
real de hoje (47 linhas, 13 debitadas) não cai nessa combinação — mas o caminho existe no artefato.
Registro para o revisor decidir se é aceitável ou vira cartão próprio (eu não afrouxo nem aperto
guarda fora do escopo do meu cartão).

## Limitações declaradas

- Não rodei o `zapp-verify` **instalado** de ponta a ponta contra o conjunto vivo: isso escreveria no
  `estado` do conjunto de outro cartão e rodaria `bun install` na cópia de outro agente. Abri mão
  disso; em troca, o comparador foi re-executado do zero sobre os manifestos crus e deu as mesmas 47
  linhas, e o script do artefato foi exercitado inteiro com dublês que repetem a saída real.
- O artefato **não está instalado** (alvo segue `70c0b223…`); a verificação é do artefato, não do que
  roda hoje na máquina. Instalar é do Joaquim (guarda do Hermes reserva `~/.local/bin`).
- Nada de produção: nenhuma leitura/escrita de banco de produção, nenhum segredo, nenhum
  identificador de projeto real em arquivo de ensaio.

## Comandos (todos dentro de `~/hermes-workspaces/Zapp_Web_V2/.tmp-t_debaf8a8`, exit codes nos .rc)

    python3 trab/passo1-comparador.py       # comparador real: linhas 47 iguais, rc=1 no check
    python3 trab/passo2-explicador.py       # explicadores reais: HOJE rc=1 / NOVO rc=1
    bash    trab/passo3-shell.sh            # script inteiro caso real: HOJE rc=1 / NOVO rc=1
    bash    trab/passo3b-controles.sh       # S-B NOVO rc=0 | S-C rc=1 | S-D rc=1
    python3 trab/passo4-sondas.py           # N1..N4, P1, R1
    bash    trab/passo5-confinamento.sh     # 2 hunks, linhas 1-64 idênticas

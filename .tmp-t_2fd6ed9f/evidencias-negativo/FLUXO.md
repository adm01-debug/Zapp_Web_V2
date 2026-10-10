# t_2fd6ed9f — caso negativo: drift NOVO continua falhando (como reproduzir)

Pasta: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_2fd6ed9f/evidencias-negativo`
(o `.tmp/evidencias-negativo/` do cartao; o workspace `scratch` do dispatcher e um caminho Windows que
nao existe no WSL, entao o espelho fica aqui, igual ao que as tarefas-irmas fizeram)

## O que o fixture afirma (e o que ele NAO usa)

A "copia" `fixture/copia` tem retrato canonico sintetico, uma migration JA APLICADA (base) e uma
migration PENDENTE do cartao. A migration pendente cria:
  - `public.cartao_novo` (literal) e a coluna `payload`;
  - por SQL dinamico (`execute format('... %I ...', 'cartao_' || 'dinamico', 'coluna_' || 'gerada')`)
    uma tabela/coluna cujos NOMES nao aparecem literalmente no texto de nenhuma migration.
Logo ha dois tipos de drift NOVO, nenhum deles no retrato e nenhum em versao ja aplicada:
  (i)  objeto citado pela pendente pelo nome da TABELA (`indexes|cartao_novo.cartao_novo_pkey`,
       `rls|cartao_novo`, grant) -> o ajuste continua debitando ao cartao;
  (ii) objeto cujo nome a pendente NAO cita (montado em runtime) -> nao ha prova de drift antigo
       -> continua debitado.
`saida/PROVA-FIXTURE.txt` prova, por contagem de ocorrencias, que esses nomes nao existem no retrato
nem nas migrations aplicadas (0 em ambos) e so a pendente cita `cartao_novo`.

O comparador de estrutura e o CODIGO REAL, extraido verbatim do heredoc do `zapp-db-local`
(`fixture/comparador-real.py`, sha256 77546fc4...), rodado sobre dois manifestos sinteticos.
O `zapp-db-guard`/`node`/`bun`/`zapp-db-ler`/`zapp-db-local check` sao dublês em `stubs/` (o `check`
chama o comparador real). Nenhum contato com docker, banco, rede ou producao.

## Cenarios

| cenario | diferenca de estrutura | esperado |
|---|---|---|
| `neg` | so o drift NOVO do cartao (6 linhas) | FALHAR nos dois scripts |
| `ctrl` | so drift PRE-EXISTENTE (ja no retrato: 1 "diferentes" + 1 "so producao") | HOJE falha / NOVO avisa |
| `misto` | drift novo + pre-existente (8 linhas) | FALHAR citando SO as linhas do cartao |
| `neg-sem-pendente` | drift novo e ledger sem nenhuma pendente | caminho estrito intacto: FALHAR nos dois |

## Como reproduzir (tudo dentro desta pasta)

    bash confere-fixture.sh          # prova que o fixture e' o que diz ser  -> saida/PROVA-FIXTURE.txt
    bash rodar.sh                    # 4 cenarios x 2 scripts (HOJE/NOVO)   -> saida/RESUMO.txt
    python3 conta-classes.py         # classificacao linha a linha         -> saida/CLASSIFICACAO.txt

`saida/` guarda, por cenario e por script: stdout/stderr (`motor-*.out/.err`), rc (`motor-*.rc`),
o `check-diferencas.txt` usado (`diferencas-*.txt`) e o log do passo (`banco_local-*.log`).
`home/<cenario>-<HOJE|NOVO>/` e o HOME de ensaio (estado do zapp-verify) de cada rodada.

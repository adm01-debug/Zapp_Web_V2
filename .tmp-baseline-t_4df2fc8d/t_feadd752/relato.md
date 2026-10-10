Especialista: Edgar (area-edge-api)

# t_feadd752 — ajuste da atribuicao do `zapp-verify` (drift canonico)

## Sensibilidade
O diff mexe no PORTÃO de saida (`~/.local/bin/zapp-verify`, ferramenta do Hermes). Nada foi instalado —
a guarda reserva a escrita nessa pasta ao Joaquim ("inclusive criar arquivo novo"; testado ao vivo:
`touch` recusado). Nenhuma protecao afrouxada: `explicada()` e os caminhos fail-closed ficam intactos;
o novo motivo (drift canonico) so absolve a linha quando o objeto **nao e citado por nenhuma migration
pendente** — diferenca nova do cartao continua debitada (prova `negativo.out`). Nenhum acesso a producao
(registro da producao via fixture, como na tarefa 0/R1). Alvo permanece byte a byte o de antes
(sha256 `70c0b223…`).

## O que fiz
Ajuste confinado ao bloco `banco_local`: o explicador embutido passa a nao debitar ao cartao a diferenca
que **ja existe no retrato canonico da copia** (`supabase/schema-manifest.json`) **ou** cujo objeto vem
de **migration ja aplicada** (nome presente, como palavra, no texto das migrations nao-pendentes) —
sempre que nenhuma pendente cite o objeto. Script ajustado: `zapp-verify.novo`, sha256 `c95e371a…`,
179 linhas, `bash -n` OK; cabeca (1–64) identica; `diff -u` = 105 linhas.

## Prova (medida agora, no mesmo ambiente de ensaio da tarefa 0)
1. As 9 residuais: HOJE **2/9 debitadas** → AJUSTE **0/9** (`nove-confere.out`).
2. Passo `banco_local` real, ao vivo, registro por fixture:
   - A (retrato velho da linha do dia): HOJE `FALHOU` (84 nao explicadas) / AJUSTE `FALHOU` (8).
   - B (retrato fresco `99ff88bf2`): HOJE `AVISO` ok / AJUSTE `AVISO` ok (`drift=0`).
3. Controle negativo: `indexes|sonda_cartao.sonda_cartao_pkey` (objeto da migration nova do cartao)
   continua `SEM` — deteccao de drift novo preservada.

## Achado (nao resolvido por este ajuste)
O ajuste cumpre os criterios do cartao, mas **nao muda o veredito do cartao real**: com o retrato velho
sobra diferenca sem prova (8 linhas de nomes automaticos `*_pkey`/`*_fkey` e grants globais) e, em rodada
de agente, `zapp-db-ler` e bloqueado (rc=77/R1) → `LEDGER_OK=0` → o explicador nem roda. O destravamento
do caso de hoje e **portar o retrato canonico** (cartao `t_fc85d10a`), nao a atribuicao.

## Limites / por que bloqueio
- **Nao instalei**: escrita em `~/.local/bin` e capability fora da guarda de agente (2a vez no cartao pai).
  Instalacao: `install -m 0755 zapp-verify.novo /home/joaquim_ataides/.local/bin/zapp-verify`.
- Nao rodei `hermes-tarefa-fechar` nem o portao inteiro (tipos/lint/testes/build): este cartao nao tem
  repo/branch (ferramenta de fabrica em workspace `scratch`); o objeto e so o passo `banco_local`.
- Entrega pronta em `.tmp-baseline-t_4df2fc8d/t_feadd752/entrega/` e provas em `.../evidencia/`.

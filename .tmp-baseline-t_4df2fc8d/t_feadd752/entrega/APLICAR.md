# ENTREGA — `zapp-verify`: atribuicao de drift canonico (cartao t_feadd752)

Cartao: **t_feadd752** = tarefa 1 da decomposicao de `t_c5a96aba` ("zapp-verify nao deve debitar
drift ja canonico ao cartao"), perfil `edgar`, 07/10/2026.

Alvo guardado ao Joaquim: `/home/joaquim_ataides/.local/bin/zapp-verify`
Estado do alvo agora: **INTACTO** — sha256 `70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26`.

## O que instalar

| arquivo | sha256 | nota |
|---|---|---|
| `zapp-verify.novo` | `c95e371a054ea1d671893978bd8648c6971639cc978a39218ac502f881e3456e` | `bash -n` OK; 179 linhas |
| `zapp-verify.original` | `70c0b223d5a63a17bbe8cc2f1a3e2d9ec320034be64056c95b9f9e1ba3789a26` | o que esta instalado hoje (byte a byte) |
| `zapp-verify.diff` | — | `diff -u original novo` (105 linhas) |

```bash
# instalar (Joaquim / rodada fora das guardas de agente):
install -m 0755 zapp-verify.novo /home/joaquim_ataides/.local/bin/zapp-verify
# rollback:
install -m 0755 zapp-verify.original /home/joaquim_ataides/.local/bin/zapp-verify
```

## O que muda (confinado ao arquivo)

So o bloco `banco_local`. O explicador embutido (heredoc `MOTIVO`) ganha um terceiro motivo alem de
"citada por migration pendente": **drift canonico**. Uma diferenca NAO e debitada ao cartao quando
(a) a chave ja existe no retrato canonico da copia (`supabase/schema-manifest.json`), **ou**
(b) o objeto vem de migration JA APLICADA na base canonica (os nomes da linha aparecem, como palavra,
no texto das migrations que nao sao pendentes) — e, em qualquer dos dois casos, **nenhuma migration
pendente cita o objeto**. O que a pendente cita continua provado pelo `explicada()` (intocado); o que
so existe na copia (objeto novo do cartao) continua vermelho. Linhas 1-64 do script: identicas.

## Prova (tudo medido agora, nao deduzido)

1. **As 9 residuais deixam de ser debitadas** — sobre o MESMO `check-diferencas` real (retrato velho, 128 linhas):
   HOJE → 2 das 9 debitadas (`SEM`); AJUSTE → **0 das 9** (`drift`)= 9->0.
   (`evidencia/nove-confere.out`)
2. **Cenario A (retrato velho da branch do dia)**: passo `banco_local` real, ao vivo, registro legivel por
   fixture → HOJE `FALHOU` (84 nao explicadas) / AJUSTE `FALHOU` (8 nao explicadas). **Nao muda o veredito.**
3. **Cenario B (retrato canonico fresco 99ff88bf2)**: HOJE `AVISO` ok / AJUSTE `AVISO` ok (`drift=0`).
4. **Controle negativo (deteccao preservada)**: fixture com a migration do cartao citando a tabela
   `sonda_cartao` → a linha de indice automatico `sonda_cartao.sonda_cartao_pkey` continua **`SEM`**
   (debitada); a coluna citada sai `explicada`; a funcao ja canonica sai `drift`. (`evidencia/negativo.out`)
5. `bash -n` no script novo: OK. Cabeca (linhas 1-34) identica ao original.

## Achado que o cartao precisa registrar (nao e resolvido por este ajuste)

O ajuste cumpre os criterios do cartao, mas **nao e o que reprova o cartao real**: com o retrato da
linha do dia (velho) sobra diferenca que nenhuma pendente cita e que nao tem prova de base — as 8 linhas
de nomes automaticos (`*_pkey`/`_fkey`) e grants globais — e, em rodada de agente, o `zapp-db-ler` e
bloqueado (rc=77/R1) -> `LEDGER_OK=0` -> o explicador nem roda. O destravamento do caso de hoje e
**portar o retrato canonico** (cartao `t_fc85d10a`), nao a atribuicao.

Reproducao completa e saidas cruas: `../evidencia/` (`prova-offline.sh`, `prova-e2e.sh`, `*.out`).

# Contratos historicos do `db-migrate.yml` (E62)

Gerado por `scripts/db-audit/extrair-contratos-runtime.mjs` a partir de `origin/main`.
Cada contrato e o corpo de um braco do `case "$TARGET_VERSION"` do passo
`Provar estado runtime antes do push`, extraido **sem alteracao de texto**.

## Por que isto existe

O passo e a rede de protecao que roda **antes** de aplicar uma migration em producao:
extrai o fingerprint do estado runtime do alvo e o compara ao `CONFIRM_RUNTIME_SHA256`
(composicao da E64). Reduzir o workflow a ~150 linhas so e seguro se a **mesma consulta**
continuar rodando, agora vinda de um arquivo. Por isso a equivalencia aqui e textual:
o arquivo e o braco de origem tem o mesmo `sha256`.

## Como reexecutar um contrato sob demanda

```bash
node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "$(cat scripts/db-audit/contracts/<versao>.sql)"
```

Em producao, o executor generico do workflow faz exatamente isso para a versao alvo.

## Contratos

| versao | arquivo | linhas uteis | linhas de origem | sha256 (texto extraido) |
| --- | --- | --- | --- | --- |
| `20260830170000` | `scripts/db-audit/contracts/20260830170000.sql` | 20 | 244–264 | `0adcbf9285fc4908...` |
| `20260831120000` | `scripts/db-audit/contracts/20260831120000.sql` | 47 | 266–313 | `ff0d991fe7095387...` |
| `20260831150000` | `scripts/db-audit/contracts/20260831150000.sql` | 26 | 315–341 | `271463d5594495d9...` |
| `20260908180000` | `scripts/db-audit/contracts/20260908180000.sql` | 43 | 343–386 | `446be95237a11725...` |
| `20260908220000` | `scripts/db-audit/contracts/20260908220000.sql` | 34 | 388–422 | `e61d2449d3331457...` |
| `20260909120000` | `scripts/db-audit/contracts/20260909120000.sql` | 51 | 424–475 | `ac5c4113aacde1de...` |
| `20260909180000` | `scripts/db-audit/contracts/20260909180000.sql` | 31 | 477–508 | `b2ab1a7202b365ca...` |
| `20260909200000` | `scripts/db-audit/contracts/20260909200000.sql` | 2 | 510–512 | `bf9709eda3b8c1e0...` |
| `20260909210000` | `scripts/db-audit/contracts/20260909210000.sql` | 6 | 514–520 | `cd4724857df6407f...` |
| `20260909230000` | `scripts/db-audit/contracts/20260909230000.sql` | 2 | 522–524 | `fb230326e8b7f686...` |
| `20260910100000` | `scripts/db-audit/contracts/20260910100000.sql` | 6 | 526–532 | `6dd1987ac487f4de...` |
| `20260922220000` | `scripts/db-audit/contracts/20260922220000.sql` | 7 | 534–548 | `9251f8da09165d20...` |

Total: **12** contratos, 275 linhas uteis extraidas do workflow.

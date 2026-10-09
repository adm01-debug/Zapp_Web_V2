# RETROSPECTIVA — plano Multiplix × executado · 2026-10-08

Compara o **PLANO DE FINALIZAÇÃO — MULTIPLIX (Zapp Web V2) · 100 etapas**, de 29/09/2026, com o
que foi realmente executado e apurado até **08/10/2026**. Documento irmão do handoff
`docs/handoffs/HANDOFF_MULTIPLIX_2026-10-08.md` (item F100, Bloco J).

## 1. Fontes e método

| Fonte | Papel |
|---|---|
| `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md` | o plano comparado (100 itens `F001`–`F100`) |
| `docs/reconciliation/tasks/P039.json` | ledger de reconciliação do plano — **fonte oficial das contagens** |
| `.github/workflows/ci.yml` | onde os contratos do produto rodam |
| árvore do repositório (`src/`, `supabase/functions/`) | prova de existência de código (flag, permissão) |

Método: leitura do plano e contagem dos checkboxes; contagem por status no ledger (via `jq`); e a
soma dos dois conjuntos tem de fechar em **100**. Nenhuma contagem desta retro foi digitada à mão:
o bloco da §2 é espelho literal do ledger, e o contrato
`tests/contracts/multiplix-handoff-f100.contract.test.ts` reprova se ela divergir dele.

## 2. Contagens oficiais (espelho do ledger)

<!-- multiplix-f100-contagens -->
```json
{
  "IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE": 34,
  "ACTIVE_REGRESSION": 5,
  "PARTIAL": 30,
  "NEEDS_REVALIDATION": 1,
  "DONE_VERIFIED": 3,
  "VALIDATED_FAIL": 5,
  "BLOCKED_EXTERNAL": 5,
  "NOT_IMPLEMENTED": 15,
  "OBSERVATION_WINDOW": 1,
  "HUMAN_ACCEPTANCE": 1
}
```

| Status | Itens | O que significa |
|---|---:|---|
| `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | 34 | código e prova existem; falta execução na cadeia final |
| `PARTIAL` | 30 | entregue em parte; critério do item não fechado |
| `NOT_IMPLEMENTED` | 15 | nada no repositório |
| `ACTIVE_REGRESSION` | 5 | já esteve bom e voltou a divergir |
| `VALIDATED_FAIL` | 5 | a prova voltou negativa |
| `BLOCKED_EXTERNAL` | 5 | depende de decisão do dono ou de terceiro |
| `DONE_VERIFIED` | 3 | fechado com prova na cadeia final |
| `NEEDS_REVALIDATION` | 1 | precisa refazer a verificação |
| `OBSERVATION_WINDOW` | 1 | depende de janela de observação real |
| `HUMAN_ACCEPTANCE` | 1 | aceite humano (o próprio F100) |
| **Total** | **100** | |

Itens por status, para rastreio:

- `DONE_VERIFIED`: `F19 F28 F29`
- `ACTIVE_REGRESSION`: `F08 F10 F13 F17 F44`
- `VALIDATED_FAIL`: `F37 F42 F48 F55 F56`
- `NOT_IMPLEMENTED`: `F65 F68 F69 F72 F74 F76 F77 F78 F79 F82 F83 F85 F90 F92 F94`
- `BLOCKED_EXTERNAL`: `F63 F66 F95 F96 F97`
- `NEEDS_REVALIDATION`: `F18`
- `OBSERVATION_WINDOW`: `F98`
- `HUMAN_ACCEPTANCE`: `F100`
- `PARTIAL`: `F11 F25 F27 F41 F43 F45 F46 F50 F51 F54 F57 F59 F60 F62 F64 F67 F70 F71 F73 F75 F80
  F81 F84 F86 F87 F88 F89 F91 F93 F99`
- `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE`: `F01 F02 F03 F04 F05 F06 F07 F09 F12 F14 F15 F16 F20
  F21 F22 F23 F24 F26 F30 F31 F32 F33 F34 F35 F36 F38 F39 F40 F47 F49 F52 F53 F58 F61`

## 3. Plano contra executado, bloco a bloco

Os blocos e faixas vêm do próprio plano; as contagens, do ledger.

| Bloco | Faixa | Itens | Fechado (`DONE_VERIFIED`) | Aguardando runtime | Parcial | Falha/regressão | Não implementado | Externo / outros |
|---|---|---:|---:|---:|---:|---:|---:|---|
| A — saneamento do que está no ar | F01–F20 | 20 | 1 | 13 | 1 | 4 regressão | 0 | 1 revalidação |
| B — ponte Singu auditável | F21–F29 | 9 | 2 | 5 | 2 | 0 | 0 | 0 |
| C — modelo de dados v2 | F30–F35 | 6 | 0 | 6 | 0 | 0 | 0 | 0 |
| D — `_shared/messaging` | F36–F43 | 8 | 0 | 4 | 2 | 2 falhas | 0 | 0 |
| E — API de domínio `multiplix-dispatch` | F44–F54 | 11 | 0 | 4 | 5 | 1 regressão + 1 falha | 0 | 0 |
| F — worker por item | F55–F59 | 5 | 0 | 1 | 2 | 2 falhas | 0 | 0 |
| G — canal e eventos | F60–F63 | 4 | 0 | 1 | 2 | 0 | 0 | 1 externo |
| H — voz | F64–F69 | 6 | 0 | 0 | 2 | 0 | 3 | 1 externo |
| I — front | F70–F87 | 18 | 0 | 0 | 9 | 0 | 9 | 0 |
| J — testes, observabilidade e roll-out | F88–F100 | 13 | 0 | 0 | 5 | 0 | 3 | 5 (3 externos, 1 observação, 1 aceite humano) |

Leitura honesta: **o bloco A é o mais forte** (saneamento do que já estava no ar) e mesmo ele carrega
4 regressões + 1 revalidação. **Os blocos I e J são o ponto fraco**: 12 dos 31 itens de tela, teste
e roll-out seguem sem nada no repositório.

## 4. Checkboxes do plano contra o ledger

| Leitura | Resultado |
|---|---|
| Plano: `- [x]` | 61 marcados |
| Plano: `- [ ]` | 39 abertos (`F18`, `F60`, `F63`, `F65`–`F100`) |
| Ledger: `DONE_VERIFIED` | 3 (F19, F28, F29) |

Os dois números são de natureza diferente e não se contradizem: o plano marca `[x]` com a evidência
que o próprio executor escreveu (boa parte dela é relato de auditoria histórica), enquanto o ledger
só promove a fechado o que foi reexecutado na cadeia final. O critério do plano para encerrar
("100/100 marcados com evidência") **não foi atingido** em 08/10.

## 5. O que a leva de 08/10 cobriu

Os cartões `TL-003` a `TL-032` de `docs/plans/TERCEIRA_LEVA_CARTOES_2026-10-08.tsv` apontam para os
seguintes itens deste plano (mapeamento lido do próprio arquivo da leva):

- **Voz e mídia:** F65, F68, F69, F63, F66.
- **Tela e sincronização:** F72, F74, F76, F77, F78, F79.
- **API de domínio:** F44, F46, F50, F51, F54, F43.
- **Worker por item e público:** F55, F56, F27, F25.
- **Exportação, ponte e repetição:** F83, F85, F82.
- **Teste e roll-out:** F90, F94, F95, F96, F98, **F100 (este documento e o handoff)**.

A leva **abriu** esses itens; ela não os fecha — cada cartão vai marcar o seu item com evidência
própria quando integrar. Por isso esta retro mede o estado de **08/10** e não projeta o resultado da
leva.

## 6. Conclusão

1. O plano **não** está 100/100 com evidência: 39 checkboxes abertos e apenas 3 itens
   `DONE_VERIFIED` no ledger.
2. O que realmente falta não é só teste: há **5 defeitos validados com falha** e **5 regressões
   ativas** dentro do que já era considerado pronto (blocos A, D, E e F). Isso precede qualquer
   trabalho de tela.
3. Os blocos I e J concentram 12 dos 31 itens de tela, teste e roll-out que nunca começaram.
4. O encerramento documental exigido pelo item F100 — handoff, esta retrospectiva e a decisão final
   sobre a flag — existe a partir de 08/10 e fica preso por contrato
   (`tests/contracts/multiplix-handoff-f100.contract.test.ts`), que reprova se as contagens
   divergirem do ledger ou se a decisão da flag deixar de bater com o código.
5. O aceite humano do item F100 (`HUMAN_ACCEPTANCE` no ledger) continua sendo do dono: estes
   documentos registram o estado e as dívidas, não substituem a decisão de aceitar o plano como
   encerrado.

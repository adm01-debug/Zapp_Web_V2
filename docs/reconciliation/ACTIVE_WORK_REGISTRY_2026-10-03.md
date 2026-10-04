# Trabalho ativo, PRs e issues

Snapshot auditado: 12 PRs abertas e 14 issues abertas. São inventários de estado e decisão técnica, sem envio de comentários, fechamento, merge ou limpeza.

**Atualização posterior ao baseline:** o [adendo final](reports/git/FINAL_REMOTE_DELTA.md) examinou o avanço para `4e73c7767858f00c577c29efd8cc86f5bea117a9` (PR #1870, 03/10 às 22:50:32 UTC). Ele reconhece a integração e o deploy de Talk X X028, conserva o aceite real pendente e registra três riscos residuais, além da persistência do placar defasado. As contagens deste corpo continuam no baseline original.

| PR | Conteúdo | Adjudicação |
| --- | --- | --- |
| [1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869) | Documentação da reconciliação | Atualizar o pacote e manter draft; sem merge. |
| [1863](https://github.com/adm01-debug/Zapp_Web_V2/pull/1863) | Sincronização de artefatos derivados | Revisar ACL/diffs, frescor e gates; não resolve sozinha as duas migrations extras. |
| [1713](https://github.com/adm01-debug/Zapp_Web_V2/pull/1713) | Regeneração automática de status | Preservar trabalho ativo; placar não é aceite funcional. |
| [1699](https://github.com/adm01-debug/Zapp_Web_V2/pull/1699) | Mudança antiga sobreposta pela #1715 | Não importar em bloco; a lacuna herdada de axe sem main exige tratamento próprio. |
| [1654](https://github.com/adm01-debug/Zapp_Web_V2/pull/1654) | UI da sidebar em três seções | Trabalho aberto; dados #1642 e E2E #1655 integrados não significam UI entregue. |
| [1636](https://github.com/adm01-debug/Zapp_Web_V2/pull/1636) | Drops de edge e allowlist Sicoob | Rever dependência Singu #80 e regressão de inventário antes de merge. |
| [1621](https://github.com/adm01-debug/Zapp_Web_V2/pull/1621) | Plano da sidebar | Referência de intenção; não equivale à implementação #1654. |
| [1610](https://github.com/adm01-debug/Zapp_Web_V2/pull/1610) | Instalador de políticas | Decisão de desenho e autoridade pendente. |
| [1584](https://github.com/adm01-debug/Zapp_Web_V2/pull/1584) | Alteração substituída pela #1587 | Preservar relação de sucessão; nenhum fechamento automático. |
| [1439](https://github.com/adm01-debug/Zapp_Web_V2/pull/1439) | Debounce de automação | Pode perder push sem reagendar; updatedAt não significa último push. |
| [1430](https://github.com/adm01-debug/Zapp_Web_V2/pull/1430) | E2E antigo com FIXME | Não restaurar sobre estabilizações posteriores; último E2E cancelado. |
| [1206](https://github.com/adm01-debug/Zapp_Web_V2/pull/1206) | Atestação por timestamp antiga | Regressaria o no-op por digest da #1376; não adotar literalmente. |

As 12 PRs exibiam combined status success, mas #1863/#1699/#1636/#1584/#1439/#1206 possuíam check-runs em falha. A #1430 tinha E2E cancelado. Os estados detalhados, heads e jobs estão em [open-prs.json](evidence/open-prs.json); o snapshot do PR#1869 nesse arquivo é anterior a esta consolidação e está datado como tal.

## Issues

- #1862: drift vivo observado no job coletado; 779 versões locais contra781 no ledger.
- #1854: falha de observação por403/null; não prova configuração errada.
- #1810: auditoria de branches exige filtrar erros, squash e pushes posteriores antes de qualquer poda.
- #1454: falha histórica de types-sync superada por execução posterior; a PR derivada ainda possui seus próprios gates.
- #1265/#1266/#1267: correções em código nas PRs#1309/#1313/#1314; falta reatestar os aceites vivos correspondentes, e as issues continuam abertas no snapshot.
- #382/#380/#378/#377/#376/#375/#374: planos históricos, operação externa, limpeza antiga, automação de auditoria, coverage, refatoração e lint foram reclassificados segundo evidência atual, sem presumir conclusão por idade.

Fonte: [open-issues.json](evidence/open-issues.json) e [relatório GitHub](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

## Trabalho exclusivo fora de main

As [58 branches](evidence/branches.json) conservam head, comparação e disposição. Os [197 commits exclusivos](evidence/exclusive-commits.json) estão individualizados. `claude/confident-babbage-ivgmmn` permanece em [quarentena](evidence/branch_quarantine.json):37 exclusivos,87 arquivos e21 commits posteriores ao head fechado na#1151. Nenhum conjunto está autorizado para cherry-pick ou merge integral.

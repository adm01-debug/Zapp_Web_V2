# Reconciliation Wave — Talk X — 2026-10-03

## Autoridade atual
Planos anteriores foram explicitamente marcados como substituídos por #1451 (X001). O plano operacional vigente é V4/200, com placar gerado por commits via XNNN (#1456 X002).

## Evidência de execução V4 encontrada
Há PRs fechados explicitamente marcados para:
X001 #1451; X002 #1456; X003 #1457; X004 #1460; X005 #1461; X006 #1474; X009 #1515; X010 #1522; X011 #1524; X012 #1535; X013 #1540; X014 #1545; X015 #1548; X016 #1561; X017 #1568; X018 #1632; X019 #1674; X020 #1710; X021 #1792; X022 #1831; X023 #1850; X024 #1860; X025 #1866; X026 #1867; X027 #1868; X029 #1660; X042 #1684; X044 #1740; X045 #1800; X047 #1837; X057 #1706; X072 #1677.

Isto é consistente com o STATUS observado anteriormente em 35/200, mas o STATUS pode estar atrasado: #1713 permanece aberto para regenerá-lo e X027 foi entregue recentemente.

## Conclusões
- V1/V3 e planos de recuperação são HISTORICAL/SUPERSEDED, não filas executáveis.
- V4 é a autoridade operacional, porém o placar deve ser regenerado/rechecado antes de routing.
- PR #1584 permanece aberto e afeta known-violations/types-sync; não duplicar esse trabalho.
- Etapas sem marcador XNNN não são automaticamente NOT_IMPLEMENTED: precisam ser cruzadas com código/PRs sem marcador.
- X027, que estava ativo durante a auditoria, agora aparece fechado; baseline mudou durante a reconciliação.

## Próximo passo
Extrair X001–X200 do plano V4, anexar marcador de commit/PR, validar no HEAD e classificar cinco dimensões de conclusão.

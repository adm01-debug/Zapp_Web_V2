# Plano da 2ª leva de melhorias — um cartão por item seguro do inventário (08/10/2026)

> 253 cartões `SL-001..SL-253`, na ordem P0 → P3. Fonte: `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv` (itens PARCIAL, NÃO IMPLEMENTADA e NÃO VERIFICÁVEL). Lista completa: `docs/plans/SEGUNDA_LEVA_CARTOES_2026-10-08.tsv`.

## Decisões assumidas (recomendações do Claude; o Joaquim pediu proatividade)
- **Talk X e Multiplix:** congelados (leva 3). **Banco/migrations/RLS:** fora desta leva (trilha de banco, em ondas quando a fila de migrations baixar). **Contatos:** coberto pelo plano próprio.
- **"Em breve":** implementar "Encaminhar arquivo"; **esconder** Videochamada e módulos em desenvolvimento. **Push notifications:** fora (desligadas por segurança). Segredos, rotação de chaves, SonarCloud e LGPD/DPO: decisão do dono, fora.
- Cada cartão: conferir no código ATUAL se a lacuna existe; se sim, correção mínima com teste; se já está resolvida, provar e fechar sem commit. Itens não verificáveis viram "verificar e corrigir se preciso".

## Resumo
| Perfil | Cartões |
|---|---|
| worker | 100 |
| iris | 56 |
| hugo | 42 |
| edgar | 21 |
| vera | 19 |
| workertestes | 15 |

Prioridade: - 2, P0 2, P1 17, P2 92, P3 140

## Regras de todo cartão
Nenhuma informação sai do sistema; só cores/tokens existentes; efeitos sutis com motion-safe; sem selo de canal/origem; sem dependência nova; sem DDL/migration (trilha de banco à parte); Edge Function só no repositório (produção só com o Joaquim).

# Plano da 3ª leva de melhorias — um cartão por item seguro do inventário (08/10/2026)

> 180 cartões `TL-001..TL-180`, na ordem P0 → P3. Fonte: `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv` (itens PARCIAL, NÃO IMPLEMENTADA e NÃO VERIFICÁVEL). Lista completa: `docs/plans/TERCEIRA_LEVA_CARTOES_2026-10-08.tsv`.

## Decisões assumidas (recomendações do Claude; o Joaquim pediu proatividade)
- **Talk X e Multiplix:** DESCONGELADOS nesta leva (pedido do Joaquim em 08/10 para ter trabalho a noite toda). **Banco/migrations/RLS:** fora desta leva (trilha de banco, em ondas quando a fila de migrations baixar). **Contatos:** coberto pelo plano próprio.
- **"Em breve":** implementar "Encaminhar arquivo"; **esconder** Videochamada e módulos em desenvolvimento. **Push notifications:** fora (desligadas por segurança). Segredos, rotação de chaves, SonarCloud e LGPD/DPO: decisão do dono, fora.
- Cada cartão: conferir no código ATUAL se a lacuna existe; se sim, correção mínima com teste; se já está resolvida, provar e fechar sem commit. Itens não verificáveis viram "verificar e corrigir se preciso".

## Resumo
| Perfil | Cartões |
|---|---|
| iris | 104 |
| worker | 41 |
| edgar | 18 |
| workertestes | 10 |
| hugo | 4 |
| vera | 3 |

Prioridade: - 178, P1 1, P2 1

## Regras de todo cartão
Nenhuma informação sai do sistema; só cores/tokens existentes; efeitos sutis com motion-safe; sem selo de canal/origem; sem dependência nova; sem DDL/migration (trilha de banco à parte); Edge Function só no repositório (produção só com o Joaquim).

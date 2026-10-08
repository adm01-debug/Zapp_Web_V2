# PLANO — RESTAURAR AS OPÇÕES DE 6 E 8 COLUNAS DO GRID DE ARQUIVOS (reverte a D01 do plano de 07/10)

> **Data:** 2026-10-08 · **Escopo:** front-end · **Sem DDL, Edge Function, migration nem dependência nova.**
> **Pedido do dono (08/10):** "desfaça essa mudança, deixe igual estava antes, com todas as opções de visualização, desde que a tela permita".

## O que foi feito
- Desfeito o commit `d572c447d` ("remover opções de 6 e 8 colunas do grid"), que implementava a D01 de `PLANO_REMOVER_COLUNAS_6_8_ARQUIVOS_4_ETAPAS_2026-10-07.md`.
- `FILES_COLUMNS` volta a `[3, 4, 5, 6, 8]`. O seletor volta a mostrar as 5 opções e **desabilita** a que não cabe na largura atual, com a dica "Não cabe na largura atual (máximo N)".
- Preferência salva com 6 ou 8 colunas volta a ser respeitada quando cabe (e cai no padrão 4 se a tela for estreita).

## Prova
- Os 6 arquivos de teste afetados passam (42 testes) e o `typecheck-ratchet` fica em baseline 0, sem erro novo.
- O item C04 do plano anterior (verificar 3 opções) fica **sem efeito**.

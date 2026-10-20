

==================== VOLUME 3.000 ====================

### distribuicao efetiva (saida literal do seed)
```
   3000 |   3000 |          131 |        4.37 |          461 |        2055 |      1789 |    1793 |     240 |        360 |          309 |       620 |                 25 |      295 |      573
```
visibilidade (agent): total_count = 861
visibilidade (admin): total_count = 2869

### BASELINE v0 -- 3 PIORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| sem_filtro | company | desc | 0 | 24.1 | 27.7 | 28.7 | 6 |
| sem_filtro | company | asc | 500 | 22.5 | 26.0 | 26.1 | 6 |
| sem_filtro | created_at | asc | 500 | 23.1 | 25.5 | 26.1 | 6 |

### BASELINE v0 -- 3 MELHORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| combinado | created_at | desc | 0 | 0.7 | 0.8 | 0.9 | 6 |
| combinado | company | asc | 0 | 0.8 | 0.8 | 0.8 | 6 |
| combinado | created_at | asc | 500 | 0.7 | 0.8 | 0.8 | 6 |

### ORDENACAO name/asc, offset 0 -- todas as fases

| fase | variant | caller | p50 ms | p95 ms | n |
|---|---|---|---|---|---|
| f1_v0_admin | v0 | admin | 16.9 | 17.9 | 6 |
| f1_v0_base | v0 | agent | 22.8 | 23.9 | 6 |
| f1_v1_inline | v1 | agent | 10.0 | 11.0 | 6 |
| f1_v2_branch | v2 | agent | 22.6 | 27.8 | 6 |
| f2_v0_idx1 | v0 | agent | 18.6 | 20.2 | 12 |
| f3_v0_idx2 | v0 | agent | 17.3 | 18.4 | 12 |
| f3_v2_idx2 | v2 | agent | 18.3 | 19.6 | 6 |
| f4_v0_idx3 | v0 | agent | 18.9 | 19.5 | 6 |
| f4_v2_idx3 | v2 | agent | 17.6 | 18.0 | 6 |
| f4_v3_idx3 | v3 | agent | 20.8 | 22.1 | 6 |

### ANTES/DEPOIS -- f1_v0_base (vigente, indices do canonico) x f4_v3_idx3 (vv3 + idx2 + idx3)

| cenario | sort | dir | off | p50 antes | p95 antes | p50 depois | p95 depois | ganho ms | ganho % |
|---|---|---|---|---|---|---|---|---|---|
| sem_filtro | company | desc | 0 | 24.1 | 27.7 | 33.3 | 35.0 | -9.2 | -38% |
| sem_filtro | created_at | asc | 500 | 23.1 | 25.5 | 28.7 | 29.6 | -5.6 | -24% |
| sem_filtro | name | asc | 0 | 22.8 | 23.9 | 20.8 | 22.1 | 2.0 | 9% |
| sem_filtro | company | asc | 500 | 22.5 | 26.0 | 29.4 | 29.8 | -6.9 | -31% |
| sem_filtro | created_at | desc | 0 | 21.6 | 23.9 | 33.3 | 34.9 | -11.7 | -54% |
| sem_filtro | name | desc | 0 | 21.1 | 21.7 | 33.8 | 35.4 | -12.7 | -60% |
| sem_filtro | company | desc | 500 | 21.0 | 21.4 | 33.3 | 34.2 | -12.4 | -59% |
| sem_filtro | company | asc | 0 | 20.8 | 22.4 | 19.5 | 20.2 | 1.3 | 6% |
| sem_filtro | name | asc | 500 | 20.8 | 21.7 | 28.1 | 28.9 | -7.2 | -35% |
| sem_filtro | created_at | desc | 500 | 20.4 | 22.2 | 38.5 | 41.6 | -18.1 | -88% |
| sem_filtro | name | desc | 500 | 19.9 | 20.6 | 34.8 | 35.4 | -14.9 | -75% |
| sem_filtro | created_at | asc | 0 | 19.8 | 22.2 | 18.7 | 19.4 | 1.0 | 5% |
| termo_nome_3ch | company | desc | 0 | 9.6 | 10.9 | 13.3 | 13.8 | -3.7 | -38% |
| termo_nome_5ch | name | desc | 500 | 9.5 | 10.7 | 13.4 | 13.7 | -3.9 | -41% |
| termo_nome_2ch | company | asc | 500 | 9.4 | 10.2 | 15.8 | 15.9 | -6.4 | -68% |
| termo_nome_5ch | name | desc | 0 | 9.3 | 9.9 | 12.9 | 14.0 | -3.6 | -39% |
| termo_nome_2ch | company | asc | 0 | 9.2 | 9.6 | 10.4 | 12.0 | -1.2 | -13% |
| termo_nome_2ch | name | asc | 500 | 9.2 | 9.4 | 14.7 | 15.0 | -5.5 | -60% |
| termo_nome_2ch | created_at | desc | 0 | 9.0 | 9.6 | 14.6 | 16.0 | -5.6 | -62% |
| termo_nome_2ch | created_at | asc | 500 | 8.9 | 10.2 | 15.5 | 16.2 | -6.6 | -74% |
| termo_nome_2ch | name | desc | 0 | 8.8 | 8.9 | 14.6 | 16.3 | -5.8 | -66% |
| termo_nome_3ch | name | asc | 500 | 8.8 | 9.7 | 13.5 | 14.4 | -4.7 | -54% |
| termo_nome_3ch | name | desc | 500 | 8.8 | 10.4 | 13.9 | 14.6 | -5.1 | -58% |
| termo_nome_2ch | name | asc | 0 | 8.7 | 9.4 | 10.1 | 10.4 | -1.3 | -15% |
| termo_nome_3ch | name | desc | 0 | 8.7 | 10.1 | 13.4 | 14.1 | -4.7 | -54% |
| termo_nome_2ch | company | desc | 0 | 8.6 | 8.7 | 15.2 | 16.4 | -6.5 | -76% |
| termo_nome_2ch | company | desc | 500 | 8.6 | 9.2 | 15.6 | 16.4 | -7.0 | -82% |
| termo_nome_2ch | created_at | asc | 0 | 8.6 | 10.1 | 11.3 | 13.4 | -2.7 | -32% |
| termo_nome_2ch | created_at | desc | 500 | 8.6 | 9.0 | 14.7 | 14.8 | -6.0 | -70% |
| termo_nome_2ch | name | desc | 500 | 8.6 | 9.4 | 15.1 | 15.6 | -6.5 | -75% |
| termo_nome_3ch | company | desc | 500 | 8.6 | 9.0 | 14.1 | 15.3 | -5.5 | -64% |
| termo_nome_3ch | created_at | asc | 0 | 8.4 | 8.7 | 10.8 | 11.1 | -2.4 | -29% |
| termo_empresa | name | asc | 500 | 8.3 | 9.1 | 6.2 | 6.9 | 2.1 | 25% |
| termo_nome_5ch | name | asc | 0 | 8.3 | 9.8 | 10.7 | 10.9 | -2.4 | -29% |
| termo_empresa | created_at | desc | 0 | 8.2 | 9.1 | 6.6 | 7.1 | 1.5 | 19% |
| termo_nome_3ch | company | asc | 0 | 8.2 | 9.0 | 10.0 | 10.5 | -1.8 | -22% |
| termo_nome_3ch | company | asc | 500 | 8.2 | 9.1 | 13.3 | 13.6 | -5.1 | -62% |
| termo_nome_5ch | company | desc | 0 | 8.2 | 9.3 | 13.0 | 13.4 | -4.8 | -58% |
| termo_nome_5ch | created_at | asc | 0 | 8.1 | 8.8 | 10.6 | 11.1 | -2.5 | -30% |
| termo_nome_3ch | created_at | asc | 500 | 8.0 | 8.5 | 14.3 | 15.3 | -6.3 | -79% |
| termo_nome_3ch | created_at | desc | 500 | 7.9 | 8.3 | 13.5 | 13.8 | -5.6 | -71% |
| termo_nome_5ch | name | asc | 500 | 7.9 | 9.8 | 13.0 | 13.7 | -5.1 | -64% |
| termo_empresa | created_at | desc | 500 | 7.8 | 8.4 | 6.5 | 6.9 | 1.3 | 17% |
| termo_nome_3ch | created_at | desc | 0 | 7.8 | 8.1 | 14.1 | 15.0 | -6.2 | -80% |
| termo_empresa | company | asc | 0 | 7.7 | 8.3 | 10.1 | 10.8 | -2.4 | -31% |
| termo_empresa | name | desc | 0 | 7.7 | 8.8 | 6.6 | 6.9 | 1.2 | 15% |
| termo_empresa | company | desc | 0 | 7.6 | 8.0 | 6.9 | 7.2 | 0.8 | 10% |
| termo_nome_3ch | name | asc | 0 | 7.6 | 9.7 | 11.0 | 12.2 | -3.4 | -45% |
| termo_nome_5ch | company | desc | 500 | 7.6 | 8.4 | 12.9 | 13.5 | -5.3 | -69% |
| termo_nome_5ch | created_at | desc | 0 | 7.6 | 8.0 | 13.4 | 13.8 | -5.7 | -75% |
| termo_empresa | created_at | asc | 500 | 7.5 | 8.0 | 6.6 | 7.0 | 0.9 | 12% |
| termo_empresa | company | desc | 500 | 7.4 | 7.7 | 7.0 | 7.5 | 0.4 | 6% |
| termo_empresa | name | asc | 0 | 7.4 | 9.1 | 7.5 | 7.7 | -0.0 | -1% |
| termo_nome_5ch | created_at | asc | 500 | 7.4 | 7.9 | 13.1 | 13.4 | -5.7 | -76% |
| termo_nome_5ch | created_at | desc | 500 | 7.4 | 7.9 | 12.9 | 13.7 | -5.5 | -73% |
| termo_empresa | company | asc | 500 | 7.3 | 8.3 | 7.0 | 7.4 | 0.4 | 5% |
| termo_empresa | name | desc | 500 | 7.1 | 7.4 | 6.2 | 6.7 | 0.9 | 12% |
| termo_empresa | created_at | asc | 0 | 7.0 | 7.1 | 7.5 | 7.8 | -0.5 | -7% |
| termo_nome_5ch | company | asc | 500 | 7.0 | 7.6 | 13.1 | 13.7 | -6.1 | -88% |
| termo_nome_5ch | company | asc | 0 | 6.9 | 7.2 | 11.0 | 11.4 | -4.1 | -59% |
| intervalo_data | created_at | asc | 0 | 6.1 | 6.5 | 5.7 | 6.3 | 0.4 | 6% |
| intervalo_data | created_at | desc | 500 | 5.7 | 6.6 | 8.4 | 10.1 | -2.7 | -47% |
| termo_telefone | name | asc | 500 | 5.7 | 8.0 | 1.7 | 2.0 | 4.0 | 70% |
| intervalo_data | company | asc | 0 | 5.6 | 5.8 | 8.4 | 9.4 | -2.7 | -48% |
| intervalo_data | created_at | asc | 500 | 5.6 | 6.0 | 8.2 | 8.4 | -2.6 | -45% |
| intervalo_data | name | asc | 500 | 5.6 | 5.7 | 8.7 | 9.2 | -3.1 | -55% |
| intervalo_data | name | desc | 0 | 5.6 | 5.9 | 8.6 | 9.2 | -3.0 | -54% |
| intervalo_data | name | desc | 500 | 5.6 | 6.2 | 8.6 | 8.8 | -3.1 | -55% |
| filtro_tipo | name | desc | 500 | 5.5 | 6.7 | 7.9 | 9.3 | -2.5 | -45% |
| intervalo_data | created_at | desc | 0 | 5.5 | 5.6 | 8.4 | 8.9 | -2.9 | -53% |
| termo_telefone | created_at | desc | 0 | 5.5 | 7.1 | 1.6 | 1.7 | 3.9 | 71% |
| termo_telefone | name | asc | 0 | 5.5 | 5.8 | 1.8 | 2.0 | 3.7 | 68% |
| intervalo_data | company | desc | 0 | 5.4 | 6.0 | 8.1 | 8.4 | -2.7 | -51% |
| intervalo_data | company | desc | 500 | 5.4 | 5.8 | 8.4 | 8.9 | -3.0 | -55% |
| intervalo_data | company | asc | 500 | 5.3 | 5.9 | 8.7 | 9.1 | -3.5 | -65% |
| termo_telefone | company | asc | 500 | 5.3 | 6.2 | 1.7 | 1.9 | 3.6 | 68% |
| termo_telefone | name | desc | 500 | 5.3 | 5.5 | 1.9 | 2.1 | 3.4 | 64% |
| filtro_tipo | name | desc | 0 | 5.2 | 7.0 | 7.8 | 8.8 | -2.6 | -49% |
| termo_telefone | created_at | asc | 500 | 5.2 | 6.6 | 1.7 | 1.8 | 3.6 | 68% |
| termo_telefone | name | desc | 0 | 5.2 | 5.8 | 1.7 | 2.0 | 3.5 | 67% |
| termo_telefone | company | asc | 0 | 5.1 | 5.4 | 1.7 | 1.8 | 3.5 | 68% |
| termo_telefone | created_at | asc | 0 | 5.1 | 5.5 | 1.8 | 2.0 | 3.4 | 65% |
| filtro_tipo | created_at | desc | 0 | 5.0 | 5.2 | 7.9 | 8.1 | -2.9 | -58% |
| filtro_tipo | name | asc | 0 | 5.0 | 5.5 | 8.0 | 11.7 | -3.0 | -60% |
| termo_telefone | company | desc | 0 | 5.0 | 5.1 | 1.7 | 1.9 | 3.3 | 67% |
| termo_telefone | created_at | desc | 500 | 5.0 | 5.9 | 1.7 | 1.9 | 3.3 | 66% |
| intervalo_data | name | asc | 0 | 4.8 | 5.4 | 6.1 | 6.4 | -1.3 | -27% |
| termo_telefone | company | desc | 500 | 4.8 | 5.2 | 1.6 | 1.9 | 3.1 | 65% |
| filtro_tipo | company | asc | 0 | 4.7 | 5.1 | 8.3 | 9.7 | -3.6 | -78% |
| filtro_tipo | created_at | asc | 500 | 4.7 | 4.8 | 8.1 | 9.2 | -3.4 | -71% |
| filtro_tipo | name | asc | 500 | 4.7 | 5.2 | 8.6 | 8.9 | -3.9 | -83% |
| filtro_tipo | created_at | asc | 0 | 4.6 | 5.1 | 8.1 | 9.6 | -3.6 | -78% |
| filtro_tipo | company | desc | 0 | 4.4 | 4.5 | 9.3 | 11.6 | -4.9 | -112% |
| filtro_tipo | company | asc | 500 | 4.3 | 5.0 | 10.5 | 15.0 | -6.2 | -144% |
| filtro_tipo | created_at | desc | 500 | 4.3 | 4.5 | 7.5 | 8.4 | -3.2 | -75% |
| filtro_tipo | company | desc | 500 | 4.2 | 5.0 | 8.0 | 8.5 | -3.8 | -92% |
| empresa_igual | company | asc | 500 | 3.4 | 3.7 | 4.9 | 6.1 | -1.6 | -47% |
| empresa_igual | company | desc | 0 | 3.1 | 3.9 | 5.0 | 5.4 | -1.9 | -61% |
| empresa_igual | company | desc | 500 | 3.1 | 3.8 | 4.5 | 5.7 | -1.4 | -45% |
| empresa_igual | name | asc | 0 | 3.1 | 3.6 | 4.2 | 4.4 | -1.1 | -36% |
| empresa_igual | name | desc | 500 | 3.0 | 3.1 | 4.0 | 4.4 | -1.0 | -34% |
| empresa_igual | created_at | desc | 500 | 2.9 | 3.0 | 4.3 | 5.6 | -1.4 | -49% |
| empresa_igual | company | asc | 0 | 2.8 | 3.1 | 4.4 | 4.9 | -1.6 | -56% |
| empresa_igual | created_at | asc | 0 | 2.8 | 3.0 | 3.8 | 4.6 | -0.9 | -33% |
| empresa_igual | created_at | asc | 500 | 2.8 | 3.0 | 4.0 | 4.4 | -1.1 | -39% |
| empresa_igual | created_at | desc | 0 | 2.8 | 3.3 | 4.5 | 4.8 | -1.7 | -60% |
| empresa_igual | name | desc | 0 | 2.8 | 3.1 | 4.1 | 4.1 | -1.3 | -47% |
| filtro_tag | created_at | desc | 0 | 2.8 | 3.1 | 4.3 | 4.8 | -1.5 | -52% |
| filtro_tag | company | asc | 0 | 2.7 | 2.9 | 4.7 | 5.6 | -2.0 | -77% |
| filtro_tag | created_at | desc | 500 | 2.7 | 3.6 | 4.2 | 5.8 | -1.5 | -56% |
| filtro_tag | name | asc | 0 | 2.7 | 3.1 | 4.4 | 4.7 | -1.6 | -60% |
| empresa_igual | name | asc | 500 | 2.6 | 2.9 | 4.0 | 4.5 | -1.4 | -54% |
| filtro_tag | created_at | asc | 0 | 2.6 | 2.9 | 4.1 | 4.7 | -1.5 | -59% |
| filtro_tag | created_at | asc | 500 | 2.6 | 3.0 | 4.2 | 4.6 | -1.6 | -61% |
| filtro_tag | name | asc | 500 | 2.6 | 3.2 | 4.5 | 4.9 | -1.9 | -72% |
| filtro_tag | company | desc | 0 | 2.5 | 2.9 | 4.5 | 4.8 | -2.0 | -78% |
| filtro_tag | company | desc | 500 | 2.5 | 2.7 | 4.8 | 5.1 | -2.2 | -87% |
| filtro_tag | name | desc | 0 | 2.5 | 2.7 | 4.3 | 4.7 | -1.8 | -71% |
| filtro_tag | name | desc | 500 | 2.5 | 2.8 | 4.3 | 5.0 | -1.9 | -75% |
| filtro_tag | company | asc | 500 | 2.4 | 3.4 | 4.4 | 4.7 | -2.0 | -84% |
| cargo_igual | name | desc | 0 | 2.3 | 2.8 | 3.0 | 3.5 | -0.7 | -31% |
| cargo_igual | name | desc | 500 | 2.3 | 2.5 | 2.7 | 3.3 | -0.4 | -17% |
| cargo_igual | created_at | asc | 0 | 2.2 | 4.2 | 2.8 | 4.3 | -0.5 | -24% |
| cargo_igual | name | asc | 0 | 2.1 | 3.1 | 3.0 | 4.6 | -0.9 | -43% |
| cargo_igual | created_at | asc | 500 | 2.0 | 2.2 | 2.6 | 2.8 | -0.6 | -30% |
| cargo_igual | created_at | desc | 0 | 2.0 | 2.1 | 2.6 | 3.0 | -0.6 | -33% |
| cargo_igual | company | asc | 0 | 1.9 | 1.9 | 2.6 | 3.2 | -0.7 | -38% |
| cargo_igual | company | asc | 500 | 1.9 | 2.1 | 2.4 | 2.7 | -0.5 | -29% |
| cargo_igual | company | desc | 0 | 1.9 | 2.1 | 2.2 | 2.3 | -0.3 | -13% |
| cargo_igual | company | desc | 500 | 1.9 | 2.0 | 2.2 | 2.4 | -0.3 | -17% |
| cargo_igual | name | asc | 500 | 1.9 | 2.4 | 2.5 | 3.6 | -0.6 | -29% |
| cargo_igual | created_at | desc | 500 | 1.8 | 1.9 | 2.5 | 3.2 | -0.7 | -39% |
| combinado | created_at | asc | 0 | 0.9 | 1.2 | 1.1 | 1.2 | -0.2 | -21% |
| combinado | name | asc | 0 | 0.9 | 1.1 | 1.0 | 1.2 | -0.1 | -14% |
| combinado | name | asc | 500 | 0.9 | 1.1 | 1.1 | 1.2 | -0.2 | -24% |
| combinado | name | desc | 500 | 0.9 | 1.1 | 1.1 | 1.4 | -0.2 | -29% |
| combinado | company | asc | 0 | 0.8 | 0.8 | 1.1 | 1.2 | -0.3 | -35% |
| combinado | company | desc | 0 | 0.8 | 1.0 | 1.0 | 1.2 | -0.2 | -24% |
| combinado | company | desc | 500 | 0.8 | 0.9 | 1.0 | 1.1 | -0.2 | -31% |
| combinado | name | desc | 0 | 0.8 | 0.9 | 1.1 | 1.4 | -0.3 | -34% |
| combinado | company | asc | 500 | 0.7 | 1.0 | 1.0 | 1.2 | -0.3 | -45% |
| combinado | created_at | asc | 500 | 0.7 | 0.8 | 1.0 | 1.2 | -0.2 | -31% |
| combinado | created_at | desc | 0 | 0.7 | 0.8 | 1.2 | 1.5 | -0.4 | -58% |
| combinado | created_at | desc | 500 | 0.7 | 0.9 | 1.1 | 1.5 | -0.4 | -54% |

### termo livre: baseline x idx1 (trgm 2 colunas) x idx2 (trgm 7 colunas)

| cenario | off | fase | p50 ms | p95 ms |
|---|---|---|---|---|
| termo_nome_5ch | 0 | baseline | 8.3 | 9.8 |
| termo_nome_5ch | 500 | baseline | 7.9 | 9.8 |
| termo_nome_5ch | 0 | idx1 | 6.6 | 7.3 |
| termo_nome_5ch | 500 | idx1 | 6.6 | 7.3 |
| termo_nome_5ch | 0 | idx2 | 6.8 | 7.7 |
| termo_nome_5ch | 500 | idx2 | 7.0 | 7.7 |
| termo_empresa | 0 | baseline | 7.4 | 9.1 |
| termo_empresa | 500 | baseline | 8.3 | 9.1 |
| termo_empresa | 0 | idx1 | 7.1 | 8.0 |
| termo_empresa | 500 | idx1 | 7.8 | 9.3 |
| termo_empresa | 0 | idx2 | 3.5 | 4.3 |
| termo_empresa | 500 | idx2 | 3.2 | 3.6 |
| termo_nome_2ch | 0 | baseline | 8.7 | 9.4 |
| termo_nome_2ch | 500 | baseline | 9.2 | 9.4 |
| termo_nome_2ch | 0 | idx1 | 8.4 | 9.4 |
| termo_nome_2ch | 500 | idx1 | 7.9 | 8.5 |
| termo_nome_2ch | 0 | idx2 | 7.1 | 7.6 |
| termo_nome_2ch | 500 | idx2 | 7.0 | 7.8 |
| termo_nome_3ch | 0 | baseline | 7.6 | 9.7 |
| termo_nome_3ch | 500 | baseline | 8.8 | 9.7 |
| termo_nome_3ch | 0 | idx1 | 7.3 | 7.8 |
| termo_nome_3ch | 500 | idx1 | 7.1 | 7.4 |
| termo_nome_3ch | 0 | idx2 | 6.8 | 7.2 |
| termo_nome_3ch | 500 | idx2 | 6.6 | 6.8 |

### indices de `contacts` (tamanho, uso)

| indice | kB | MB | scans |
|---|---|---|---|
| idx_contacts_email_trgm | 1184 kB | 1.16 MB | 650 |
| idx_w4_contacts_phone_trgm | 184 kB | 0.18 MB | 650 |
| idx_w4_contacts_name_trgm | 160 kB | 0.16 MB | 650 |
| contacts_pkey | 112 kB | 0.11 MB | 0 |
| contacts_phone_key | 112 kB | 0.11 MB | 0 |
| idx_contacts_tags_gin | 112 kB | 0.11 MB | 0 |
| idx_w4_contacts_company_trgm | 96 kB | 0.09 MB | 842 |
| idx_contacts_created_at | 88 kB | 0.09 MB | 1560 |
| idx_contacts_name_asc | 88 kB | 0.09 MB | 15 |
| idx_w4_contacts_surname_trgm | 88 kB | 0.09 MB | 650 |
| idx_contacts_updated_at | 88 kB | 0.09 MB | 9 |
| idx_w4_live_created_desc | 80 kB | 0.08 MB | 633 |
| idx_w4_live_created | 80 kB | 0.08 MB | 0 |
| idx_w4_live_name_desc | 80 kB | 0.08 MB | 70 |
| idx_w4_live_name | 80 kB | 0.08 MB | 0 |
| idx_w4_live_updated_desc | 80 kB | 0.08 MB | 0 |
| idx_w4_contacts_job_title_trgm | 64 kB | 0.06 MB | 938 |
| idx_contacts_assigned_queue | 56 kB | 0.05 MB | 0 |
| idx_contacts_conv_status_active | 48 kB | 0.05 MB | 0 |
| idx_w4_contacts_nickname_trgm | 48 kB | 0.05 MB | 650 |
| idx_contacts_contact_type | 48 kB | 0.05 MB | 2043 |
| idx_contacts_assigned_to | 48 kB | 0.05 MB | 0 |
| idx_w4_live_type | 40 kB | 0.04 MB | 202 |
| idx_contacts_queue_id | 40 kB | 0.04 MB | 0 |
| idx_contacts_channel_connection_id | 40 kB | 0.04 MB | 0 |
| idx_contacts_whatsapp_connection_id | 40 kB | 0.04 MB | 0 |
| idx_contacts_assigned_to_gamif | 40 kB | 0.04 MB | 0 |
| idx_w4_live_company | 40 kB | 0.04 MB | 0 |
| idx_w4_live_company_desc | 40 kB | 0.04 MB | 248 |
| idx_contacts_deleted_at | 16 kB | 0.02 MB | 0 |
| idx_contacts_is_lid_legacy | 16 kB | 0.02 MB | 0 |

### trigger de auditoria (p50 por modo x lote x arm)

| modo | k | arm | p50 ms | n |
|---|---|---|---|---|
| change | 1 | lote_OFF | 0.1 | 8 |
| change | 1 | lote_ON | 0.3 | 8 |
| change | 1000 | lote_OFF | 98.9 | 8 |
| change | 1000 | lote_ON | 115.6 | 8 |
| change | 3000 | lote_OFF | 336.7 | 8 |
| change | 3000 | lote_ON | 420.2 | 8 |
| insert | 1 | insert_only | 0.2 | 8 |
| insert | 1000 | insert_only | 15.7 | 8 |
| insert | 3000 | insert_only | 65.3 | 8 |
| same | 1 | lote_OFF | 0.1 | 8 |
| same | 1 | lote_ON | 0.1 | 8 |
| same | 1000 | lote_OFF | 112.6 | 8 |
| same | 1000 | lote_ON | 112.9 | 8 |
| same | 3000 | lote_OFF | 361.9 | 8 |
| same | 3000 | lote_ON | 341.5 | 8 |

overhead do invólucro de medicao (PERFORM count(*)): p50 0.256 ms


==================== VOLUME 10.000 ====================

### distribuicao efetiva (saida literal do seed)
```
  10000 |  10000 |          479 |        4.79 |         1503 |        6957 |      6010 |    6001 |     791 |       1200 |          993 |      1944 |                 25 |      976 |     1991
```
visibilidade (agent): total_count = 2886
visibilidade (admin): total_count = 9521

### BASELINE v0 -- 3 PIORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| sem_filtro | company | asc | 0 | 66.2 | 70.7 | 71.1 | 6 |
| sem_filtro | company | asc | 500 | 64.7 | 68.2 | 68.2 | 6 |
| sem_filtro | name | desc | 500 | 60.7 | 67.6 | 67.9 | 6 |

### BASELINE v0 -- 3 MELHORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| combinado | name | desc | 500 | 0.9 | 1.1 | 1.1 | 6 |
| combinado | created_at | desc | 500 | 0.9 | 1.1 | 1.1 | 6 |
| combinado | created_at | asc | 500 | 0.9 | 1.0 | 1.0 | 6 |

### ORDENACAO name/asc, offset 0 -- todas as fases

| fase | variant | caller | p50 ms | p95 ms | n |
|---|---|---|---|---|---|
| f1_v0_admin | v0 | admin | 52.7 | 3 378.4 | 6 |
| f1_v0_base | v0 | agent | 55.4 | 57.2 | 6 |
| f1_v1_inline | v1 | agent | 26.1 | 27.0 | 6 |
| f1_v2_branch | v2 | agent | 60.9 | 64.9 | 6 |
| f2_v0_idx1 | v0 | agent | 62.4 | 69.5 | 12 |
| f3_v0_idx2 | v0 | agent | 58.4 | 68.6 | 12 |
| f3_v2_idx2 | v2 | agent | 53.3 | 56.5 | 6 |
| f4_v0_idx3 | v0 | agent | 60.0 | 63.6 | 6 |
| f4_v2_idx3 | v2 | agent | 53.7 | 57.5 | 6 |
| f4_v3_idx3 | v3 | agent | 84.2 | 94.3 | 6 |

### ANTES/DEPOIS -- f1_v0_base (vigente, indices do canonico) x f4_v3_idx3 (vv3 + idx2 + idx3)

| cenario | sort | dir | off | p50 antes | p95 antes | p50 depois | p95 depois | ganho ms | ganho % |
|---|---|---|---|---|---|---|---|---|---|
| sem_filtro | company | asc | 0 | 66.2 | 70.7 | 63.2 | 68.5 | 3.1 | 5% |
| sem_filtro | company | asc | 500 | 64.7 | 68.2 | 69.5 | 70.7 | -4.8 | -7% |
| sem_filtro | created_at | asc | 0 | 63.8 | 66.6 | 61.7 | 64.6 | 2.1 | 3% |
| sem_filtro | name | desc | 500 | 60.7 | 67.6 | 119.6 | 130.6 | -58.8 | -97% |
| sem_filtro | name | asc | 500 | 60.2 | 62.1 | 82.9 | 95.0 | -22.6 | -38% |
| sem_filtro | name | desc | 0 | 58.8 | 61.4 | 119.2 | 126.8 | -60.4 | -103% |
| sem_filtro | company | desc | 0 | 58.6 | 65.4 | 128.3 | 131.6 | -69.7 | -119% |
| sem_filtro | company | desc | 500 | 58.3 | 65.0 | 110.7 | 125.4 | -52.4 | -90% |
| sem_filtro | created_at | desc | 0 | 57.4 | 58.4 | 132.6 | 147.0 | -75.2 | -131% |
| sem_filtro | created_at | desc | 500 | 57.0 | 60.8 | 122.4 | 134.1 | -65.4 | -115% |
| sem_filtro | created_at | asc | 500 | 56.5 | 60.8 | 82.7 | 85.3 | -26.2 | -46% |
| sem_filtro | name | asc | 0 | 55.4 | 57.2 | 84.2 | 94.3 | -28.8 | -52% |
| termo_nome_2ch | company | desc | 500 | 28.9 | 32.1 | 53.2 | 61.6 | -24.3 | -84% |
| termo_nome_5ch | company | desc | 500 | 27.3 | 29.2 | 19.4 | 20.7 | 7.9 | 29% |
| termo_nome_2ch | name | asc | 500 | 26.8 | 27.8 | 53.7 | 58.7 | -26.9 | -100% |
| termo_nome_5ch | name | asc | 0 | 26.8 | 29.5 | 13.1 | 18.2 | 13.8 | 51% |
| termo_nome_5ch | created_at | desc | 500 | 26.7 | 27.8 | 15.3 | 16.5 | 11.4 | 43% |
| termo_nome_2ch | created_at | asc | 0 | 26.3 | 28.5 | 28.9 | 38.8 | -2.7 | -10% |
| termo_nome_2ch | company | asc | 500 | 25.9 | 27.0 | 56.4 | 57.9 | -30.5 | -118% |
| termo_nome_2ch | name | asc | 0 | 25.5 | 26.3 | 28.9 | 33.0 | -3.4 | -13% |
| termo_nome_2ch | company | desc | 0 | 25.1 | 26.2 | 56.5 | 58.9 | -31.3 | -125% |
| termo_nome_2ch | name | desc | 500 | 25.0 | 25.8 | 51.4 | 53.9 | -26.4 | -106% |
| termo_nome_5ch | created_at | desc | 0 | 24.9 | 25.5 | 15.7 | 18.2 | 9.1 | 37% |
| termo_nome_2ch | company | asc | 0 | 24.8 | 26.2 | 29.7 | 30.2 | -4.9 | -20% |
| termo_nome_2ch | created_at | desc | 500 | 24.8 | 26.6 | 49.7 | 53.2 | -24.9 | -100% |
| termo_nome_2ch | created_at | asc | 500 | 24.4 | 26.5 | 54.5 | 58.9 | -30.2 | -124% |
| termo_empresa | company | desc | 500 | 24.3 | 28.4 | 19.9 | 20.7 | 4.4 | 18% |
| termo_nome_2ch | name | desc | 0 | 24.3 | 26.1 | 52.5 | 54.6 | -28.3 | -116% |
| termo_nome_5ch | name | asc | 500 | 24.3 | 26.5 | 18.0 | 19.2 | 6.4 | 26% |
| termo_nome_2ch | created_at | desc | 0 | 24.0 | 24.4 | 54.7 | 55.2 | -30.7 | -128% |
| termo_nome_5ch | company | desc | 0 | 23.2 | 24.1 | 15.8 | 16.8 | 7.4 | 32% |
| termo_nome_3ch | created_at | desc | 0 | 22.8 | 23.3 | 18.7 | 20.2 | 4.1 | 18% |
| termo_nome_5ch | company | asc | 0 | 22.8 | 25.0 | 12.4 | 12.8 | 10.4 | 46% |
| termo_nome_5ch | created_at | asc | 0 | 22.7 | 24.4 | 11.9 | 12.5 | 10.8 | 47% |
| termo_nome_5ch | created_at | asc | 500 | 22.7 | 23.7 | 15.7 | 17.9 | 7.0 | 31% |
| termo_nome_3ch | name | asc | 0 | 22.6 | 26.5 | 14.1 | 15.1 | 8.5 | 38% |
| termo_nome_5ch | name | desc | 0 | 22.4 | 23.4 | 16.6 | 17.0 | 5.8 | 26% |
| termo_nome_3ch | company | asc | 0 | 22.3 | 23.1 | 13.7 | 15.6 | 8.6 | 39% |
| termo_nome_3ch | created_at | desc | 500 | 22.2 | 24.3 | 21.3 | 23.1 | 0.9 | 4% |
| termo_nome_5ch | name | desc | 500 | 21.8 | 22.3 | 14.8 | 15.4 | 7.1 | 32% |
| termo_empresa | name | desc | 0 | 21.7 | 22.2 | 16.0 | 17.0 | 5.7 | 26% |
| termo_nome_3ch | name | asc | 500 | 21.7 | 23.6 | 22.9 | 25.9 | -1.3 | -6% |
| termo_nome_3ch | name | desc | 0 | 21.7 | 22.8 | 22.9 | 25.9 | -1.2 | -5% |
| termo_nome_3ch | company | desc | 500 | 21.5 | 22.5 | 20.7 | 22.4 | 0.8 | 4% |
| termo_nome_3ch | company | asc | 500 | 21.4 | 23.7 | 21.1 | 22.1 | 0.4 | 2% |
| termo_nome_3ch | company | desc | 0 | 21.3 | 22.7 | 22.6 | 27.0 | -1.4 | -6% |
| termo_nome_3ch | created_at | asc | 0 | 21.3 | 21.8 | 17.4 | 18.7 | 3.9 | 18% |
| termo_nome_3ch | name | desc | 500 | 21.3 | 21.8 | 21.9 | 26.8 | -0.7 | -3% |
| termo_empresa | name | asc | 500 | 21.1 | 21.9 | 16.0 | 16.4 | 5.1 | 24% |
| termo_empresa | name | desc | 500 | 21.0 | 21.8 | 18.3 | 19.7 | 2.7 | 13% |
| termo_empresa | name | asc | 0 | 20.9 | 23.6 | 13.0 | 13.5 | 7.8 | 38% |
| termo_empresa | company | desc | 0 | 20.8 | 21.5 | 17.7 | 19.5 | 3.1 | 15% |
| termo_nome_5ch | company | asc | 500 | 20.7 | 21.9 | 17.0 | 19.7 | 3.6 | 18% |
| termo_nome_3ch | created_at | asc | 500 | 20.4 | 20.7 | 21.0 | 24.0 | -0.6 | -3% |
| termo_empresa | company | asc | 0 | 20.3 | 21.1 | 31.2 | 33.2 | -10.8 | -53% |
| termo_empresa | created_at | asc | 0 | 20.3 | 20.9 | 14.6 | 16.5 | 5.7 | 28% |
| termo_empresa | created_at | asc | 500 | 20.1 | 21.0 | 18.3 | 20.5 | 1.8 | 9% |
| termo_empresa | company | asc | 500 | 19.9 | 20.8 | 17.0 | 18.1 | 2.9 | 15% |
| termo_empresa | created_at | desc | 0 | 19.7 | 20.0 | 17.3 | 17.7 | 2.3 | 12% |
| termo_empresa | created_at | desc | 500 | 19.6 | 20.3 | 17.0 | 17.6 | 2.6 | 13% |
| termo_telefone | company | asc | 500 | 17.8 | 18.6 | 0.9 | 1.0 | 16.9 | 95% |
| termo_telefone | created_at | asc | 0 | 16.6 | 17.1 | 0.9 | 1.1 | 15.6 | 94% |
| termo_telefone | company | asc | 0 | 15.7 | 18.4 | 0.9 | 1.2 | 14.8 | 94% |
| termo_telefone | created_at | asc | 500 | 15.4 | 17.6 | 0.9 | 1.0 | 14.6 | 94% |
| termo_telefone | company | desc | 0 | 15.1 | 16.1 | 0.9 | 1.0 | 14.2 | 94% |
| termo_telefone | created_at | desc | 500 | 14.9 | 16.6 | 0.9 | 1.1 | 14.0 | 94% |
| termo_telefone | name | desc | 500 | 14.9 | 17.7 | 0.9 | 1.4 | 14.0 | 94% |
| termo_telefone | created_at | desc | 0 | 14.5 | 15.1 | 0.7 | 1.0 | 13.8 | 95% |
| termo_telefone | name | desc | 0 | 14.2 | 14.9 | 0.7 | 0.8 | 13.5 | 95% |
| intervalo_data | company | desc | 500 | 14.0 | 14.3 | 24.8 | 27.9 | -10.8 | -78% |
| termo_telefone | company | desc | 500 | 13.9 | 14.6 | 0.8 | 1.2 | 13.1 | 94% |
| intervalo_data | company | asc | 500 | 13.8 | 14.8 | 31.4 | 35.0 | -17.6 | -128% |
| intervalo_data | created_at | asc | 500 | 13.8 | 14.6 | 25.1 | 25.6 | -11.4 | -83% |
| intervalo_data | name | asc | 500 | 13.8 | 14.6 | 28.1 | 28.5 | -14.3 | -104% |
| intervalo_data | name | desc | 500 | 13.8 | 14.8 | 25.9 | 27.5 | -12.1 | -88% |
| filtro_tipo | name | asc | 0 | 13.7 | 14.2 | 16.3 | 16.9 | -2.7 | -19% |
| termo_telefone | name | asc | 500 | 13.7 | 14.7 | 0.9 | 1.0 | 12.8 | 94% |
| filtro_tipo | name | desc | 0 | 13.6 | 14.2 | 23.0 | 23.9 | -9.4 | -69% |
| intervalo_data | company | asc | 0 | 13.6 | 14.5 | 14.4 | 15.8 | -0.8 | -6% |
| intervalo_data | name | asc | 0 | 13.5 | 14.2 | 15.1 | 19.2 | -1.7 | -12% |
| termo_telefone | name | asc | 0 | 13.5 | 14.5 | 0.7 | 0.8 | 12.8 | 95% |
| intervalo_data | company | desc | 0 | 13.4 | 14.9 | 30.9 | 33.2 | -17.5 | -130% |
| intervalo_data | name | desc | 0 | 13.3 | 13.8 | 28.7 | 30.5 | -15.4 | -116% |
| intervalo_data | created_at | desc | 0 | 13.2 | 14.4 | 24.0 | 26.7 | -10.8 | -82% |
| filtro_tipo | name | desc | 500 | 12.9 | 13.5 | 23.7 | 24.4 | -10.8 | -84% |
| intervalo_data | created_at | asc | 0 | 12.8 | 13.3 | 13.9 | 14.4 | -1.2 | -9% |
| filtro_tipo | created_at | asc | 500 | 12.7 | 13.2 | 27.3 | 28.1 | -14.6 | -116% |
| filtro_tipo | name | asc | 500 | 12.7 | 13.9 | 28.5 | 34.1 | -15.8 | -125% |
| intervalo_data | created_at | desc | 500 | 12.7 | 14.2 | 25.9 | 28.5 | -13.2 | -105% |
| filtro_tipo | company | asc | 500 | 12.6 | 13.0 | 25.9 | 26.9 | -13.3 | -105% |
| filtro_tipo | created_at | asc | 0 | 12.6 | 14.9 | 15.3 | 16.1 | -2.8 | -22% |
| filtro_tipo | company | asc | 0 | 12.4 | 12.9 | 18.1 | 20.0 | -5.7 | -46% |
| filtro_tipo | company | desc | 500 | 12.3 | 12.6 | 23.7 | 27.2 | -11.4 | -93% |
| filtro_tipo | created_at | desc | 500 | 12.3 | 12.9 | 28.1 | 30.8 | -15.8 | -129% |
| filtro_tipo | created_at | desc | 0 | 12.1 | 14.1 | 24.5 | 25.0 | -12.4 | -103% |
| filtro_tipo | company | desc | 0 | 11.8 | 12.5 | 26.7 | 29.7 | -14.9 | -127% |
| empresa_igual | company | desc | 500 | 8.4 | 9.0 | 12.1 | 13.0 | -3.7 | -44% |
| empresa_igual | created_at | asc | 0 | 8.4 | 8.6 | 12.7 | 13.6 | -4.3 | -51% |
| empresa_igual | name | desc | 0 | 8.4 | 9.2 | 13.1 | 13.2 | -4.8 | -57% |
| empresa_igual | company | asc | 500 | 8.3 | 8.6 | 12.0 | 14.3 | -3.8 | -46% |
| empresa_igual | name | asc | 500 | 8.2 | 8.4 | 13.2 | 14.3 | -5.0 | -61% |
| empresa_igual | created_at | asc | 500 | 8.1 | 8.3 | 12.6 | 13.5 | -4.5 | -56% |
| empresa_igual | company | asc | 0 | 8.0 | 8.4 | 13.2 | 14.3 | -5.2 | -65% |
| empresa_igual | name | asc | 0 | 8.0 | 8.4 | 13.3 | 14.1 | -5.4 | -67% |
| empresa_igual | company | desc | 0 | 7.9 | 8.9 | 15.2 | 18.1 | -7.3 | -93% |
| empresa_igual | name | desc | 500 | 7.9 | 8.4 | 13.6 | 14.1 | -5.8 | -73% |
| filtro_tag | company | asc | 0 | 7.8 | 8.4 | 9.0 | 9.2 | -1.2 | -16% |
| filtro_tag | company | asc | 500 | 7.8 | 8.8 | 14.3 | 14.8 | -6.5 | -84% |
| filtro_tag | company | desc | 0 | 7.8 | 8.2 | 14.2 | 15.3 | -6.4 | -82% |
| filtro_tag | created_at | asc | 0 | 7.7 | 8.4 | 9.8 | 10.6 | -2.1 | -27% |
| empresa_igual | created_at | desc | 500 | 7.6 | 8.2 | 14.5 | 15.7 | -6.8 | -89% |
| filtro_tag | name | desc | 500 | 7.6 | 8.2 | 13.9 | 14.4 | -6.4 | -84% |
| empresa_igual | created_at | desc | 0 | 7.5 | 7.7 | 14.8 | 16.2 | -7.4 | -98% |
| filtro_tag | created_at | desc | 0 | 7.5 | 8.1 | 13.6 | 14.5 | -6.1 | -82% |
| filtro_tag | created_at | desc | 500 | 7.4 | 7.6 | 13.0 | 14.7 | -5.6 | -76% |
| filtro_tag | name | asc | 0 | 7.4 | 7.8 | 7.5 | 8.1 | -0.1 | -1% |
| filtro_tag | name | desc | 0 | 7.4 | 8.0 | 14.8 | 16.0 | -7.5 | -101% |
| filtro_tag | name | asc | 500 | 7.3 | 8.2 | 13.1 | 13.9 | -5.7 | -78% |
| filtro_tag | company | desc | 500 | 7.2 | 7.5 | 13.6 | 14.9 | -6.4 | -89% |
| filtro_tag | created_at | asc | 500 | 7.1 | 7.6 | 15.3 | 16.5 | -8.2 | -114% |
| cargo_igual | company | desc | 0 | 5.6 | 7.5 | 7.1 | 8.6 | -1.6 | -28% |
| cargo_igual | created_at | desc | 0 | 5.4 | 7.1 | 6.3 | 7.8 | -0.8 | -16% |
| cargo_igual | name | desc | 0 | 5.4 | 6.2 | 5.8 | 7.0 | -0.5 | -8% |
| cargo_igual | created_at | asc | 0 | 5.2 | 5.8 | 6.7 | 7.8 | -1.5 | -29% |
| cargo_igual | created_at | asc | 500 | 5.2 | 6.4 | 6.2 | 7.5 | -1.0 | -19% |
| cargo_igual | name | asc | 0 | 5.2 | 5.8 | 5.7 | 7.3 | -0.5 | -9% |
| cargo_igual | company | asc | 500 | 5.1 | 5.9 | 7.8 | 9.8 | -2.7 | -52% |
| cargo_igual | created_at | desc | 500 | 5.1 | 5.4 | 6.3 | 7.9 | -1.2 | -23% |
| cargo_igual | company | desc | 500 | 5.0 | 6.0 | 7.1 | 8.0 | -2.0 | -40% |
| cargo_igual | name | desc | 500 | 5.0 | 7.4 | 5.7 | 7.4 | -0.8 | -15% |
| cargo_igual | company | asc | 0 | 4.9 | 5.5 | 6.1 | 6.8 | -1.2 | -23% |
| cargo_igual | name | asc | 500 | 4.8 | 5.7 | 6.1 | 7.4 | -1.3 | -27% |
| combinado | created_at | asc | 0 | 1.2 | 1.6 | 1.9 | 2.2 | -0.7 | -61% |
| combinado | company | asc | 500 | 1.1 | 1.3 | 2.0 | 2.2 | -0.9 | -84% |
| combinado | created_at | desc | 0 | 1.1 | 1.2 | 2.1 | 2.3 | -1.0 | -94% |
| combinado | company | desc | 0 | 1.0 | 1.2 | 2.0 | 2.1 | -1.0 | -98% |
| combinado | name | asc | 0 | 1.0 | 1.3 | 1.5 | 2.4 | -0.5 | -57% |
| combinado | name | asc | 500 | 1.0 | 1.1 | 1.6 | 1.9 | -0.6 | -65% |
| combinado | name | desc | 0 | 1.0 | 1.3 | 1.6 | 1.7 | -0.6 | -55% |
| combinado | company | asc | 0 | 0.9 | 1.2 | 1.8 | 3.5 | -0.8 | -90% |
| combinado | company | desc | 500 | 0.9 | 1.2 | 2.2 | 3.7 | -1.3 | -138% |
| combinado | created_at | asc | 500 | 0.9 | 1.0 | 2.0 | 2.4 | -1.1 | -127% |
| combinado | created_at | desc | 500 | 0.9 | 1.1 | 1.7 | 2.1 | -0.8 | -86% |
| combinado | name | desc | 500 | 0.9 | 1.1 | 2.2 | 3.3 | -1.3 | -145% |

### termo livre: baseline x idx1 (trgm 2 colunas) x idx2 (trgm 7 colunas)

| cenario | off | fase | p50 ms | p95 ms |
|---|---|---|---|---|
| termo_nome_5ch | 0 | baseline | 26.8 | 29.5 |
| termo_nome_5ch | 500 | baseline | 24.3 | 26.5 |
| termo_nome_5ch | 0 | idx1 | 21.3 | 28.3 |
| termo_nome_5ch | 500 | idx1 | 22.5 | 24.7 |
| termo_nome_5ch | 0 | idx2 | 9.4 | 10.7 |
| termo_nome_5ch | 500 | idx2 | 9.2 | 10.2 |
| termo_empresa | 0 | baseline | 20.9 | 23.6 |
| termo_empresa | 500 | baseline | 21.1 | 21.9 |
| termo_empresa | 0 | idx1 | 22.1 | 23.4 |
| termo_empresa | 500 | idx1 | 23.3 | 24.5 |
| termo_empresa | 0 | idx2 | 8.2 | 9.7 |
| termo_empresa | 500 | idx2 | 8.3 | 9.5 |
| termo_nome_2ch | 0 | baseline | 25.5 | 26.3 |
| termo_nome_2ch | 500 | baseline | 26.8 | 27.8 |
| termo_nome_2ch | 0 | idx1 | 26.3 | 26.8 |
| termo_nome_2ch | 500 | idx1 | 26.4 | 28.9 |
| termo_nome_2ch | 0 | idx2 | 23.2 | 24.6 |
| termo_nome_2ch | 500 | idx2 | 23.2 | 25.8 |
| termo_nome_3ch | 0 | baseline | 22.6 | 26.5 |
| termo_nome_3ch | 500 | baseline | 21.7 | 23.6 |
| termo_nome_3ch | 0 | idx1 | 22.0 | 24.9 |
| termo_nome_3ch | 500 | idx1 | 26.2 | 28.1 |
| termo_nome_3ch | 0 | idx2 | 11.3 | 11.8 |
| termo_nome_3ch | 500 | idx2 | 10.6 | 11.1 |

### indices de `contacts` (tamanho, uso)

| indice | kB | MB | scans |
|---|---|---|---|
| idx_contacts_email_trgm | 10824 kB | 10.57 MB | 264 |
| idx_w4_contacts_name_trgm | 10200 kB | 9.96 MB | 264 |
| idx_w4_contacts_company_trgm | 7872 kB | 7.69 MB | 264 |
| idx_w4_contacts_surname_trgm | 7264 kB | 7.09 MB | 264 |
| idx_w4_contacts_phone_trgm | 6936 kB | 6.77 MB | 264 |
| idx_w4_contacts_job_title_trgm | 6592 kB | 6.44 MB | 264 |
| idx_w4_contacts_nickname_trgm | 4728 kB | 4.62 MB | 264 |
| idx_contacts_tags_gin | 4392 kB | 4.29 MB | 0 |
| idx_w4_live_created_desc | 1568 kB | 1.53 MB | 608 |
| idx_w4_live_created | 1528 kB | 1.49 MB | 0 |
| idx_w4_live_updated_desc | 1472 kB | 1.44 MB | 0 |
| contacts_pkey | 1376 kB | 1.34 MB | 123 |
| contacts_phone_key | 1376 kB | 1.34 MB | 0 |
| idx_contacts_updated_at | 1264 kB | 1.23 MB | 0 |
| idx_contacts_created_at | 1224 kB | 1.20 MB | 288 |
| idx_w4_live_type | 1160 kB | 1.13 MB | 1032 |
| idx_contacts_contact_type | 1152 kB | 1.12 MB | 672 |
| idx_contacts_name_asc | 1144 kB | 1.12 MB | 0 |
| idx_contacts_assigned_queue | 1112 kB | 1.09 MB | 0 |
| idx_w4_live_name | 1096 kB | 1.07 MB | 0 |
| idx_w4_live_name_desc | 1088 kB | 1.06 MB | 56 |
| idx_contacts_assigned_to | 1032 kB | 1.01 MB | 0 |
| idx_w4_live_company | 1016 kB | 0.99 MB | 0 |
| idx_w4_live_company_desc | 1008 kB | 0.98 MB | 56 |
| idx_contacts_channel_connection_id | 1000 kB | 0.98 MB | 0 |
| idx_contacts_whatsapp_connection_id | 1000 kB | 0.98 MB | 0 |
| idx_contacts_conv_status_active | 984 kB | 0.96 MB | 0 |
| idx_contacts_queue_id | 960 kB | 0.94 MB | 0 |
| idx_contacts_assigned_to_gamif | 936 kB | 0.91 MB | 0 |
| idx_contacts_deleted_at | 88 kB | 0.09 MB | 0 |
| idx_contacts_is_lid_legacy | 40 kB | 0.04 MB | 0 |

### trigger de auditoria (p50 por modo x lote x arm)

| modo | k | arm | p50 ms | n |
|---|---|---|---|---|
| change | 1 | lote_OFF | 0.1 | 8 |
| change | 1 | lote_ON | 0.2 | 8 |
| change | 1000 | lote_OFF | 81.1 | 8 |
| change | 1000 | lote_ON | 102.5 | 8 |
| change | 3000 | lote_OFF | 301.5 | 8 |
| change | 3000 | lote_ON | 356.1 | 8 |
| insert | 1 | insert_only | 0.1 | 8 |
| insert | 1000 | insert_only | 13.6 | 8 |
| insert | 3000 | insert_only | 61.7 | 8 |
| same | 1 | lote_OFF | 0.1 | 8 |
| same | 1 | lote_ON | 0.1 | 8 |
| same | 1000 | lote_OFF | 92.1 | 8 |
| same | 1000 | lote_ON | 88.3 | 8 |
| same | 3000 | lote_OFF | 358.8 | 8 |
| same | 3000 | lote_ON | 344.1 | 8 |

overhead do invólucro de medicao (PERFORM count(*)): p50 0.242 ms


==================== VOLUME 30.000 ====================

### distribuicao efetiva (saida literal do seed)
```
  30000 |  30000 |         1502 |        5.01 |         4483 |       20959 |     18110 |   18159 |    2387 |       3588 |         2925 |      5934 |                 25 |     2947 |     5934
```
visibilidade (agent): total_count = 8708

### BASELINE v0 -- 3 PIORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| sem_filtro | name | asc | 0 | 226.1 | 250.2 | 255.5 | 6 |
| sem_filtro | company | desc | 0 | 224.8 | 240.6 | 243.2 | 6 |
| sem_filtro | company | desc | 500 | 215.5 | 235.0 | 237.1 | 6 |

### BASELINE v0 -- 3 MELHORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| combinado | name | asc | 0 | 2.2 | 2.4 | 2.5 | 6 |
| combinado | company | desc | 0 | 1.8 | 2.2 | 2.3 | 6 |
| combinado | company | asc | 500 | 1.9 | 1.9 | 1.9 | 6 |

### ORDENACAO name/asc, offset 0 -- todas as fases

| fase | variant | caller | p50 ms | p95 ms | n |
|---|---|---|---|---|---|
| f1_v0_base | v0 | agent | 226.1 | 250.2 | 6 |
| f1_v1_inline | v1 | agent | 77.6 | 82.4 | 6 |
| f1_v2_branch | v2 | agent | 176.6 | 183.8 | 6 |
| f2_v0_idx1 | v0 | agent | 201.4 | 218.0 | 6 |
| f3_v0_idx2 | v0 | agent | 184.4 | 189.1 | 6 |
| f4_v0_idx3 | v0 | agent | 166.9 | 178.2 | 6 |
| f4_v2_idx3 | v2 | agent | 353.1 | 385.0 | 6 |
| f4_v3_idx3 | v3 | agent | 174.0 | 197.9 | 6 |

### ANTES/DEPOIS -- f1_v0_base (vigente, indices do canonico) x f4_v3_idx3 (vv3 + idx2 + idx3)

| cenario | sort | dir | off | p50 antes | p95 antes | p50 depois | p95 depois | ganho ms | ganho % |
|---|---|---|---|---|---|---|---|---|---|
| sem_filtro | name | asc | 0 | 226.1 | 250.2 | 174.0 | 197.9 | 52.1 | 23% |
| sem_filtro | company | desc | 0 | 224.8 | 240.6 | 342.6 | 352.3 | -117.8 | -52% |
| sem_filtro | company | desc | 500 | 215.5 | 235.0 | 335.7 | 354.3 | -120.3 | -56% |
| sem_filtro | company | asc | 500 | 207.5 | 216.4 | 175.7 | 188.1 | 31.8 | 15% |
| sem_filtro | name | asc | 500 | 205.6 | 218.4 | 184.1 | 189.5 | 21.5 | 10% |
| sem_filtro | name | desc | 0 | 200.8 | 206.0 | 348.6 | 356.1 | -147.8 | -74% |
| sem_filtro | created_at | asc | 0 | 199.0 | 213.3 | 175.8 | 192.8 | 23.2 | 12% |
| sem_filtro | name | desc | 500 | 195.7 | 205.3 | 339.4 | 350.1 | -143.7 | -73% |
| sem_filtro | created_at | desc | 500 | 191.1 | 206.1 | 331.6 | 337.1 | -140.5 | -74% |
| sem_filtro | created_at | asc | 500 | 190.6 | 208.5 | 173.0 | 184.0 | 17.5 | 9% |
| sem_filtro | created_at | desc | 0 | 190.5 | 214.1 | 326.6 | 330.7 | -136.0 | -71% |
| sem_filtro | company | asc | 0 | 189.1 | 212.7 | 178.3 | 188.4 | 10.7 | 6% |
| termo_nome_5ch | company | desc | 500 | 76.2 | 82.1 | 49.3 | 52.9 | 26.9 | 35% |
| termo_nome_5ch | name | asc | 500 | 68.3 | 73.5 | 64.7 | 66.2 | 3.6 | 5% |
| termo_nome_5ch | name | desc | 0 | 65.7 | 69.7 | 48.8 | 51.6 | 16.9 | 26% |
| termo_nome_5ch | created_at | desc | 0 | 65.4 | 75.1 | 46.7 | 48.3 | 18.7 | 29% |
| termo_nome_5ch | created_at | asc | 500 | 65.3 | 73.9 | 61.9 | 62.7 | 3.4 | 5% |
| termo_nome_5ch | name | asc | 0 | 63.4 | 68.2 | 31.5 | 32.2 | 31.9 | 50% |
| termo_nome_5ch | company | desc | 0 | 62.9 | 73.5 | 46.3 | 46.8 | 16.6 | 26% |
| termo_nome_5ch | created_at | asc | 0 | 60.9 | 61.7 | 28.9 | 29.4 | 32.0 | 53% |
| termo_nome_5ch | name | desc | 500 | 60.7 | 64.4 | 50.1 | 53.5 | 10.5 | 17% |
| termo_nome_5ch | company | asc | 500 | 60.4 | 63.9 | 48.0 | 50.6 | 12.3 | 20% |
| termo_nome_5ch | company | asc | 0 | 60.1 | 61.0 | 31.2 | 32.4 | 28.8 | 48% |
| termo_nome_5ch | created_at | desc | 500 | 57.9 | 59.0 | 47.6 | 49.8 | 10.4 | 18% |
| combinado | created_at | desc | 500 | 2.8 | 4.8 | 2.9 | 3.9 | -0.1 | -5% |
| combinado | created_at | asc | 0 | 2.7 | 2.9 | 3.3 | 3.5 | -0.6 | -21% |
| combinado | created_at | desc | 0 | 2.4 | 4.2 | 2.9 | 3.4 | -0.5 | -23% |
| combinado | name | desc | 500 | 2.4 | 3.0 | 3.1 | 3.4 | -0.8 | -33% |
| combinado | created_at | asc | 500 | 2.3 | 2.8 | 3.0 | 3.5 | -0.8 | -33% |
| combinado | company | asc | 0 | 2.2 | 3.0 | 2.8 | 3.2 | -0.6 | -26% |
| combinado | name | asc | 0 | 2.2 | 2.4 | 3.2 | 3.6 | -1.0 | -47% |
| combinado | name | desc | 0 | 2.2 | 3.2 | 3.1 | 3.6 | -0.9 | -39% |
| combinado | company | desc | 500 | 2.1 | 4.0 | 2.8 | 4.0 | -0.7 | -32% |
| combinado | name | asc | 500 | 2.0 | 3.4 | 3.0 | 3.5 | -1.0 | -50% |
| combinado | company | asc | 500 | 1.9 | 1.9 | 3.1 | 4.6 | -1.2 | -63% |
| combinado | company | desc | 0 | 1.8 | 2.2 | 2.8 | 3.4 | -0.9 | -52% |

### termo livre: baseline x idx1 (trgm 2 colunas) x idx2 (trgm 7 colunas)

| cenario | off | fase | p50 ms | p95 ms |
|---|---|---|---|---|
| termo_nome_5ch | 0 | baseline | 63.4 | 68.2 |
| termo_nome_5ch | 500 | baseline | 68.3 | 73.5 |
| termo_nome_5ch | 0 | idx1 | 73.4 | 78.2 |
| termo_nome_5ch | 500 | idx1 | 76.2 | 83.7 |
| termo_nome_5ch | 0 | idx2 | 27.0 | 30.2 |
| termo_nome_5ch | 500 | idx2 | 28.4 | 29.0 |

### indices de `contacts` (tamanho, uso)

| indice | kB | MB | scans |
|---|---|---|---|
| idx_contacts_email_trgm | 5264 kB | 5.14 MB | 654 |
| idx_w4_contacts_name_trgm | 1176 kB | 1.15 MB | 654 |
| idx_contacts_tags_gin | 1056 kB | 1.03 MB | 0 |
| contacts_pkey | 936 kB | 0.91 MB | 0 |
| contacts_phone_key | 936 kB | 0.91 MB | 0 |
| idx_contacts_created_at | 920 kB | 0.90 MB | 498 |
| idx_w4_contacts_phone_trgm | 880 kB | 0.86 MB | 654 |
| idx_contacts_updated_at | 800 kB | 0.78 MB | 12 |
| idx_w4_contacts_company_trgm | 688 kB | 0.67 MB | 654 |
| idx_w4_live_created | 640 kB | 0.62 MB | 0 |
| idx_w4_live_created_desc | 640 kB | 0.62 MB | 312 |
| idx_w4_live_updated_desc | 616 kB | 0.60 MB | 0 |
| idx_w4_contacts_surname_trgm | 600 kB | 0.59 MB | 654 |
| idx_w4_contacts_job_title_trgm | 408 kB | 0.40 MB | 654 |
| idx_contacts_name_asc | 296 kB | 0.29 MB | 12 |
| idx_contacts_assigned_to | 280 kB | 0.27 MB | 0 |
| idx_contacts_assigned_queue | 280 kB | 0.27 MB | 0 |
| idx_w4_live_name_desc | 264 kB | 0.26 MB | 0 |
| idx_contacts_assigned_to_gamif | 256 kB | 0.25 MB | 0 |
| idx_w4_live_name | 256 kB | 0.25 MB | 24 |
| idx_contacts_queue_id | 248 kB | 0.24 MB | 0 |
| idx_w4_contacts_nickname_trgm | 248 kB | 0.24 MB | 654 |
| idx_contacts_contact_type | 216 kB | 0.21 MB | 831 |
| idx_w4_live_company | 216 kB | 0.21 MB | 0 |
| idx_w4_live_company_desc | 216 kB | 0.21 MB | 18 |
| idx_w4_live_type | 216 kB | 0.21 MB | 288 |
| idx_contacts_channel_connection_id | 208 kB | 0.20 MB | 0 |
| idx_contacts_whatsapp_connection_id | 208 kB | 0.20 MB | 0 |
| idx_contacts_conv_status_active | 184 kB | 0.18 MB | 0 |
| idx_contacts_deleted_at | 56 kB | 0.05 MB | 0 |
| idx_contacts_is_lid_legacy | 16 kB | 0.02 MB | 0 |

### trigger de auditoria (p50 por modo x lote x arm)

| modo | k | arm | p50 ms | n |
|---|---|---|---|---|
| change | 1 | lote_OFF | 0.1 | 8 |
| change | 1 | lote_ON | 0.2 | 8 |
| change | 1000 | lote_OFF | 111.6 | 8 |
| change | 1000 | lote_ON | 122.2 | 8 |
| change | 3000 | lote_OFF | 320.7 | 8 |
| change | 3000 | lote_ON | 375.3 | 8 |
| insert | 1 | insert_only | 0.1 | 8 |
| insert | 1000 | insert_only | 15.9 | 8 |
| insert | 3000 | insert_only | 66.3 | 8 |
| same | 1 | lote_OFF | 0.1 | 8 |
| same | 1 | lote_ON | 0.1 | 8 |
| same | 1000 | lote_OFF | 105.0 | 8 |
| same | 1000 | lote_ON | 91.8 | 8 |
| same | 3000 | lote_OFF | 359.0 | 8 |
| same | 3000 | lote_ON | 360.2 | 8 |

overhead do invólucro de medicao (PERFORM count(*)): p50 0.211 ms


==================== VOLUME 100.000 ====================

### distribuicao efetiva (saida literal do seed)
```
 100000 | 100000 |         5017 |        5.02 |        14943 |       70136 |     60240 |   60159 |    7988 |      11958 |         9971 |     19857 |                 25 |     9788 |    19814
```
visibilidade (agent): total_count = 28943

### BASELINE v0 -- 3 PIORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| sem_filtro | company | asc | 0 | 1 263.2 | 1 333.7 | 1 347.0 | 6 |
| sem_filtro | created_at | desc | 500 | 1 229.9 | 1 301.6 | 1 313.2 | 6 |
| sem_filtro | created_at | desc | 0 | 1 187.2 | 1 200.8 | 1 202.7 | 6 |

### BASELINE v0 -- 3 MELHORES (por p95)

| cenario | sort | dir | offset | p50 ms | p95 ms | max ms | n |
|---|---|---|---|---|---|---|---|
| combinado | company | desc | 500 | 6.2 | 7.1 | 7.2 | 6 |
| combinado | created_at | asc | 0 | 6.1 | 6.9 | 7.0 | 6 |
| combinado | name | desc | 0 | 6.0 | 6.6 | 6.6 | 6 |

### ORDENACAO name/asc, offset 0 -- todas as fases

| fase | variant | caller | p50 ms | p95 ms | n |
|---|---|---|---|---|---|
| f1_v0_base | v0 | agent | 616.3 | 658.6 | 6 |
| f1_v1_inline | v1 | agent | 278.9 | 294.3 | 6 |
| f1_v2_branch | v2 | agent | 551.0 | 574.6 | 6 |
| f2_v0_idx1 | v0 | agent | 547.0 | 577.2 | 6 |
| f3_v0_idx2 | v0 | agent | 606.9 | 627.3 | 6 |
| f4_v0_idx3 | v0 | agent | 572.5 | 599.6 | 6 |
| f4_v2_idx3 | v2 | agent | 543.7 | 591.8 | 6 |
| f4_v3_idx3 | v3 | agent | 504.9 | 569.9 | 6 |

### ANTES/DEPOIS -- f1_v0_base (vigente, indices do canonico) x f4_v3_idx3 (vv3 + idx2 + idx3)

| cenario | sort | dir | off | p50 antes | p95 antes | p50 depois | p95 depois | ganho ms | ganho % |
|---|---|---|---|---|---|---|---|---|---|
| sem_filtro | company | asc | 0 | 1 263.2 | 1 333.7 | 574.8 | 581.2 | 688.3 | 54% |
| sem_filtro | created_at | desc | 500 | 1 229.9 | 1 301.6 | 1 050.7 | 1 080.0 | 179.2 | 15% |
| sem_filtro | created_at | desc | 0 | 1 187.2 | 1 200.8 | 1 016.2 | 1 105.4 | 170.9 | 14% |
| sem_filtro | created_at | asc | 500 | 1 030.6 | 1 145.6 | 496.3 | 508.3 | 534.3 | 52% |
| sem_filtro | company | asc | 500 | 658.2 | 805.9 | 564.0 | 588.7 | 94.2 | 14% |
| sem_filtro | company | desc | 500 | 631.9 | 675.4 | 1 076.8 | 1 144.3 | -444.8 | -70% |
| sem_filtro | name | asc | 500 | 620.0 | 642.8 | 531.3 | 534.0 | 88.8 | 14% |
| sem_filtro | name | asc | 0 | 616.3 | 658.6 | 504.9 | 569.9 | 111.4 | 18% |
| sem_filtro | company | desc | 0 | 605.6 | 639.4 | 1 045.1 | 1 178.7 | -439.5 | -73% |
| sem_filtro | name | desc | 500 | 605.6 | 629.7 | 1 010.4 | 1 056.4 | -404.8 | -67% |
| sem_filtro | created_at | asc | 0 | 587.7 | 606.5 | 482.6 | 530.4 | 105.2 | 18% |
| sem_filtro | name | desc | 0 | 579.4 | 616.7 | 996.1 | 1 065.5 | -416.6 | -72% |
| termo_nome_5ch | created_at | desc | 0 | 244.7 | 263.1 | 153.7 | 180.1 | 91.0 | 37% |
| termo_nome_5ch | created_at | asc | 0 | 214.1 | 223.1 | 81.3 | 86.7 | 132.8 | 62% |
| termo_nome_5ch | created_at | asc | 500 | 213.2 | 222.1 | 116.1 | 125.4 | 97.0 | 46% |
| termo_nome_5ch | created_at | desc | 500 | 212.2 | 245.5 | 156.8 | 189.4 | 55.4 | 26% |
| termo_nome_5ch | name | asc | 500 | 209.9 | 224.3 | 133.2 | 147.2 | 76.7 | 37% |
| termo_nome_5ch | company | asc | 500 | 207.6 | 215.7 | 133.8 | 154.4 | 73.9 | 36% |
| termo_nome_5ch | company | desc | 0 | 205.9 | 221.8 | 145.2 | 154.0 | 60.7 | 29% |
| termo_nome_5ch | name | desc | 500 | 205.3 | 218.2 | 149.1 | 157.9 | 56.2 | 27% |
| termo_nome_5ch | company | desc | 500 | 198.7 | 216.9 | 145.3 | 157.3 | 53.5 | 27% |
| termo_nome_5ch | name | asc | 0 | 196.9 | 199.7 | 92.3 | 99.5 | 104.6 | 53% |
| termo_nome_5ch | company | asc | 0 | 196.7 | 213.3 | 101.1 | 117.9 | 95.6 | 49% |
| termo_nome_5ch | name | desc | 0 | 195.7 | 205.1 | 149.1 | 153.6 | 46.5 | 24% |
| combinado | created_at | desc | 500 | 8.8 | 9.3 | 9.0 | 10.1 | -0.2 | -2% |
| combinado | company | asc | 0 | 8.1 | 9.9 | 8.2 | 8.8 | -0.1 | -2% |
| combinado | company | asc | 500 | 7.8 | 8.2 | 8.4 | 9.0 | -0.7 | -9% |
| combinado | company | desc | 0 | 7.1 | 8.7 | 9.1 | 9.9 | -2.0 | -29% |
| combinado | name | asc | 500 | 6.9 | 7.6 | 9.5 | 9.6 | -2.5 | -36% |
| combinado | created_at | desc | 0 | 6.8 | 8.3 | 8.4 | 9.0 | -1.6 | -24% |
| combinado | name | asc | 0 | 6.8 | 7.8 | 8.9 | 10.7 | -2.1 | -31% |
| combinado | name | desc | 500 | 6.4 | 7.1 | 8.7 | 9.0 | -2.3 | -36% |
| combinado | created_at | asc | 500 | 6.3 | 8.7 | 8.7 | 9.1 | -2.4 | -38% |
| combinado | company | desc | 500 | 6.2 | 7.1 | 9.9 | 10.8 | -3.7 | -60% |
| combinado | created_at | asc | 0 | 6.1 | 6.9 | 9.0 | 9.5 | -2.9 | -48% |
| combinado | name | desc | 0 | 6.0 | 6.6 | 9.6 | 10.1 | -3.6 | -59% |

### termo livre: baseline x idx1 (trgm 2 colunas) x idx2 (trgm 7 colunas)

| cenario | off | fase | p50 ms | p95 ms |
|---|---|---|---|---|
| termo_nome_5ch | 0 | baseline | 196.9 | 199.7 |
| termo_nome_5ch | 500 | baseline | 209.9 | 224.3 |
| termo_nome_5ch | 0 | idx1 | 253.8 | 279.7 |
| termo_nome_5ch | 500 | idx1 | 233.8 | 259.3 |
| termo_nome_5ch | 0 | idx2 | 81.3 | 85.8 |
| termo_nome_5ch | 500 | idx2 | 88.4 | 96.2 |

### indices de `contacts` (tamanho, uso)

| indice | kB | MB | scans |
|---|---|---|---|
| idx_contacts_email_trgm | 9432 kB | 9.21 MB | 3901 |
| idx_w4_contacts_name_trgm | 4152 kB | 4.05 MB | 648 |
| idx_contacts_tags_gin | 3448 kB | 3.37 MB | 0 |
| contacts_pkey | 3104 kB | 3.03 MB | 0 |
| contacts_phone_key | 3104 kB | 3.03 MB | 0 |
| idx_w4_contacts_phone_trgm | 2528 kB | 2.47 MB | 648 |
| idx_contacts_created_at | 2496 kB | 2.44 MB | 786 |
| idx_w4_contacts_company_trgm | 2440 kB | 2.38 MB | 648 |
| idx_contacts_updated_at | 2400 kB | 2.34 MB | 12 |
| idx_w4_contacts_surname_trgm | 2352 kB | 2.30 MB | 648 |
| idx_w4_live_created | 2096 kB | 2.05 MB | 0 |
| idx_w4_live_created_desc | 2096 kB | 2.05 MB | 312 |
| idx_w4_live_updated_desc | 2000 kB | 1.95 MB | 0 |
| idx_contacts_name_asc | 1096 kB | 1.07 MB | 12 |
| idx_w4_contacts_job_title_trgm | 1080 kB | 1.05 MB | 648 |
| idx_contacts_assigned_queue | 720 kB | 0.70 MB | 0 |
| idx_w4_contacts_nickname_trgm | 712 kB | 0.70 MB | 648 |
| idx_w4_live_name | 696 kB | 0.68 MB | 0 |
| idx_w4_live_name_desc | 696 kB | 0.68 MB | 24 |
| idx_contacts_assigned_to | 680 kB | 0.66 MB | 0 |
| idx_w4_live_company | 680 kB | 0.66 MB | 0 |
| idx_w4_live_company_desc | 680 kB | 0.66 MB | 24 |
| idx_contacts_queue_id | 672 kB | 0.66 MB | 0 |
| idx_w4_live_type | 664 kB | 0.65 MB | 288 |
| idx_contacts_contact_type | 656 kB | 0.64 MB | 2228 |
| idx_contacts_channel_connection_id | 648 kB | 0.63 MB | 0 |
| idx_contacts_whatsapp_connection_id | 648 kB | 0.63 MB | 1 |
| idx_contacts_assigned_to_gamif | 616 kB | 0.60 MB | 0 |
| idx_contacts_conv_status_active | 552 kB | 0.54 MB | 0 |
| idx_contacts_deleted_at | 168 kB | 0.16 MB | 0 |
| idx_contacts_is_lid_legacy | 32 kB | 0.03 MB | 0 |

### trigger de auditoria (p50 por modo x lote x arm)

| modo | k | arm | p50 ms | n |
|---|---|---|---|---|
| change | 1 | lote_OFF | 0.2 | 6 |
| change | 1 | lote_ON | 0.2 | 6 |
| change | 1000 | lote_OFF | 119.3 | 12 |
| change | 1000 | lote_ON | 136.6 | 12 |
| insert | 1 | insert_only | 0.1 | 6 |
| insert | 1000 | insert_only | 17.6 | 12 |
| same | 1 | lote_OFF | 0.1 | 6 |
| same | 1 | lote_ON | 0.1 | 6 |
| same | 1000 | lote_OFF | 108.6 | 12 |
| same | 1000 | lote_ON | 117.4 | 12 |

overhead do invólucro de medicao (PERFORM count(*)): p50 0.247 ms

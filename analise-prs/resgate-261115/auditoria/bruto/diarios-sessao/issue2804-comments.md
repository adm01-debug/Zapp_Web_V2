

===== 2026-11-08T18:24:45Z adm01-debug =====
## Triagem — tabela

`reverse X a/b` = reverse-apply na main por arquivo (a de b arquivos já presentes). Em linhas agrupadas a prova é da PR mais recente.

| #PR(s) | caixa | prova curta |
|---|---|---|
| #150 #211 #336 #423 #431 #726 #813 #1087 #1090 #2041 #2043 #2049 #2075 #2086 #2232 #2388 #2389 #2488 #2518 | ✅ JA_NA_MAIN | diff vazio vs merge-base (conteúdo já na main) |
| #2060 #2077 #2079 #2109 #2183 #2200 #2242 #2254 #2313 #2314 #2574 #2576 #2782 #2797 | ✅ JA_NA_MAIN | reverse-apply total |
| #77 #387 #388 #451 #976 #1049 #1126 #1430 #1588 #1592 #1610 #1922 #1925 #1926 #1928 #1933 #1934 #1935 #1937 #1938 #1939 #1940 #1941 #2033 #2036 #2037 #2051 #2056 #2058 #2062 #2063 #2064 #2065 #2067 #2068 #2069 #2076 #2078 #2087 #2093 #2103 #2110 #2123 #2144 #2147 #2148 #2152 #2157 #2159 #2160 #2161 #2162 #2163 #2164 #2165 #2166 #2167 #2168 #2169 #2170 #2171 #2172 #2173 #2174 #2175 #2176 #2177 #2178 #2179 #2181 #2207 #2225 #2228 #2253 #2256 #2257 #2258 #2259 #2260 #2262 #2279 #2295 #2298 #2299 #2315 #2322 #2375 #2380 #2428 #2434 #2435 #2436 #2438 #2446 #2475 #2489 #2492 #2497 #2499 #2503 #2504 #2508 #2510 #2516 #2520 #2521 #2524 #2526 #2527 #2536 #2538 #2546 #2556 #2563 #2564 #2578 #2594 #2705 | 🗑️ OBSOLETA | só CI/testes/lint, sem banco |
| #107 #189 #200 #715 #1000 #1127 #1301 #1584 #2107 #2206 #2255 #2284 #2372 #2413 #2415 #2418 #2421 #2429 #2462 #2465 #2479 #2493 #2495 #2501 #2507 #2523 #2532 #2557 #2577 | 🗑️ OBSOLETA | só docs/relatório |
| — | 🧾 DRIFT | nenhuma (0 migrations em prod fora da main) |
| #14 #15 #16 #17 #18 #19 #20 #21 #22 #23 #25 #27 #28 #29 #78 #79 #80 #81 #82 #83 #85 #86 #87 #88 | FILA | dependabot (package.json/lock); reverse NAO |
| #45 | FILA | reverse NAO 0/1 |
| #91 #389 #390 #391 #392 #393 #394 #395 #396 #397 #398 #994 #1918 #2102 | FILA | dependabot agrupado; reverse NAO 0/2 |
| #115 | FILA | reverse NAO 0/2 |
| #117 #312 #951 #2772 | FILA | reverse PARCIAL 2/3 |
| #119 #734 #1076 #1206 | FILA | E08 já em mergeada #1774,#1832 (grupo misto) |
| #122 #749 | 🔁 DUPLICATA_PROVAVEL | E22 já em mergeada #1832,#1856 |
| #123 | FILA | reverse NAO 0/4 |
| #149 | FILA | reverse NAO 0/2 |
| #180 | FILA | reverse NAO 0/10 |
| #206 | FILA | reverse PARCIAL 5/9 |
| #208 | FILA | reverse PARCIAL 3/5 |
| #213 | FILA | reverse NAO 0/7 |
| #218 | FILA | reverse PARCIAL 4/13 |
| #239 | FILA | reverse PARCIAL 2/5 |
| #250 | FILA | reverse NAO 0/6 |
| #295 #592 #939 #2238 #2466 #2496 #2528 | FILA | reverse NAO 0/13 |
| #384 | FILA | reverse NAO 0/72 |
| #465 #555 #655 | FILA | reverse NAO 0/1 |
| #552 #559 | FILA | reverse NAO 0/1 |
| #557 | FILA | reverse NAO 0/1 |
| #578 | FILA | reverse NAO 0/1 |
| #598 | FILA | reverse PARCIAL 2/3 |
| #606 | FILA | reverse NAO 0/1 |
| #622 #656 #684 | FILA | reverse NAO 0/2 |
| #644 | FILA | reverse NAO 0/3 |
| #653 | FILA | reverse NAO 0/2 |
| #703 #1690 #2760 | FILA | reverse PARCIAL 3/4 |
| #718 | FILA | reverse NAO 0/1 |
| #720 | FILA | reverse NAO 0/1 |
| #723 | FILA | reverse NAO 0/2 |
| #732 | FILA | reverse NAO 0/1 |
| #741 | FILA | reverse NAO 0/4 |
| #742 #745 | FILA | reverse NAO 0/1 |
| #744 #1463 #1624 #2108 #2138 #2502 | FILA | E100 já em mergeada #2118,#2297 (grupo misto) |
| #746 | FILA | reverse NAO 0/8 |
| #875 | FILA | reverse PARCIAL 4/20 |
| #898 | FILA | reverse NAO 0/1 |
| #911 | FILA | reverse NAO 0/2 |
| #938 | FILA | reverse NAO 0/1 |
| #942 | FILA | reverse NAO 0/2 |
| #947 | FILA | reverse NAO 0/1 |
| #981 | FILA | reverse NAO 0/1 |
| #1017 | FILA | reverse PARCIAL 1/4 |
| #1021 | FILA | reverse NAO 0/1 |
| #1022 | FILA | reverse NAO 0/1 |
| #1041 #1054 | FILA | reverse PARCIAL 1/2 |
| #1045 | FILA | reverse PARCIAL 2/11 |
| #1064 | FILA | reverse NAO 0/6 |
| #1073 | FILA | reverse PARCIAL 3/5 |
| #1077 | FILA | reverse PARCIAL 2/6 |
| #1080 | FILA | reverse NAO 0/5 |
| #1083 | 🔁 DUPLICATA_PROVAVEL | E40 já em mergeada #1744,#1769 |
| #1086 #1099 | FILA | reverse PARCIAL 1/2 |
| #1094 | FILA | reverse PARCIAL 4/7 |
| #1142 #1149 #1153 | FILA | reverse NAO 0/2 |
| #1150 | FILA | reverse NAO 0/8 |
| #1151 | 🔁 DUPLICATA_PROVAVEL | E01 já em mergeada #1832,#2118 |
| #1333 | FILA | reverse NAO 0/4 |
| #1351 | FILA | reverse PARCIAL 1/5 |
| #1699 | FILA | reverse NAO 0/1 |
| #1730 | FILA | reverse PARCIAL 19/48 |
| #1899 | FILA | reverse NAO 0/4 |
| #1929 | FILA | reverse NAO 0/2 |
| #1930 | 🔁 DUPLICATA_PROVAVEL | W21 já em mergeada #1947 |
| #1979 | FILA | reverse PARCIAL 4/19 |
| #1980 | FILA | reverse PARCIAL 3/4 |
| #1983 | FILA | reverse PARCIAL 2453/3115 (PR gigante) |
| #1985 | FILA | reverse NAO 0/2 |
| #1987 | FILA | reverse PARCIAL 6/114 |
| #1991 | FILA | reverse NAO 0/14 |
| #1997 | FILA | reverse NAO 0/9 |
| #1998 | FILA | reverse NAO 0/4 |
| #1999 | FILA | reverse PARCIAL 1/2 |
| #2000 | FILA | reverse NAO 0/16 |
| #2002 | FILA | reverse NAO 0/6 |
| #2003 | FILA | reverse NAO 0/9 |
| #2006 | FILA | reverse PARCIAL 10/18 |
| #2007 | FILA | reverse NAO 0/11 |
| #2009 | FILA | reverse NAO 0/8 |
| #2010 | FILA | reverse NAO 0/8 |
| #2011 | FILA | reverse NAO 0/8 |
| #2012 | FILA | reverse NAO 0/8 |
| #2013 | FILA | reverse NAO 0/14 |
| #2015 | FILA | reverse NAO 0/8 |
| #2022 | FILA | reverse NAO 0/9 |
| #2023 | FILA | reverse NAO 0/2 |
| #2024 | FILA | reverse NAO 0/14 |
| #2025 | FILA | reverse NAO 0/16 |
| #2026 | FILA | reverse NAO 0/12 |
| #2029 | FILA | reverse NAO 0/12 |
| #2030 | FILA | reverse NAO 0/12 |
| #2032 | FILA | reverse NAO 0/12 |
| #2035 | FILA | reverse PARCIAL 3/319 |
| #2040 #2554 #2559 #2566 #2586 | FILA | reverse PARCIAL 5/11 |
| #2059 | FILA | reverse NAO 0/1 |
| #2066 | FILA | reverse NAO 0/2 |
| #2070 #2440 | FILA | reverse PARCIAL 2/4 |
| #2072 #2252 #2439 | FILA | reverse NAO 0/2 |
| #2073 | FILA | reverse NAO 0/2 |
| #2074 | FILA | reverse NAO 0/1 |
| #2080 | FILA | reverse NAO 0/2 |
| #2081 | FILA | reverse NAO 0/1 |
| #2082 | FILA | reverse NAO 0/1 |
| #2083 #2437 | FILA | reverse NAO 0/1 |
| #2084 | FILA | reverse NAO 0/1 |
| #2085 | FILA | reverse NAO 0/2 |
| #2088 | FILA | reverse NAO 0/1 |
| #2090 | FILA | reverse NAO 0/4 |
| #2091 #2113 | 🔁 DUPLICATA_PROVAVEL | Z011 já em mergeada #2054 |
| #2094 | 🔁 DUPLICATA_PROVAVEL | Z036 já em mergeada #2054 |
| #2095 #2771 | 🔁 DUPLICATA_PROVAVEL | Z018 já em mergeada #2054,#2794 |
| #2097 | FILA | reverse NAO 0/2 |
| #2098 | FILA | reverse PARCIAL 3/11 |
| #2104 #2111 #2208 #2230 | FILA | reverse PARCIAL 1/3 |
| #2105 #2511 | FILA | reverse PARCIAL 6/351 |
| #2124 | 🔁 DUPLICATA_PROVAVEL | S3-024 já em mergeada #2427 |
| #2125 | FILA | reverse NAO 0/8 |
| #2126 | FILA | reverse NAO 0/224 |
| #2128 | FILA | reverse NAO 0/17 |
| #2129 | FILA | reverse NAO 0/21 |
| #2131 | 🔁 DUPLICATA_PROVAVEL | E83 já em mergeada #2141,#2422 |
| #2135 | FILA | reverse PARCIAL 5/7 |
| #2137 | FILA | reverse NAO 0/1 |
| #2139 #2443 | FILA | reverse PARCIAL 25/45 |
| #2142 | FILA | reverse NAO 0/21 |
| #2143 | FILA | reverse NAO 0/12 |
| #2145 | FILA | reverse NAO 0/26 |
| #2146 | 🔁 DUPLICATA_PROVAVEL | E90 já em mergeada #2127,#2140 |
| #2151 #2445 | FILA | reverse PARCIAL 6/325 |
| #2155 #2444 | FILA | reverse PARCIAL 10/46 |
| #2185 | FILA | reverse PARCIAL 3/19 |
| #2186 #2561 | FILA | reverse PARCIAL 5/7 |
| #2187 | FILA | reverse PARCIAL 2/68 |
| #2189 | FILA | reverse PARCIAL 5/12 |
| #2190 | FILA | reverse PARCIAL 6/94 |
| #2193 #2417 | FILA | reverse NAO 0/1 |
| #2195 | FILA | reverse PARCIAL 4/25 |
| #2196 #2548 | 🔁 DUPLICATA_PROVAVEL | X047 já em mergeada #1883,#1885 |
| #2197 | FILA | reverse NAO 0/12 |
| #2198 | FILA | reverse NAO 0/30 |
| #2199 | FILA | reverse NAO 0/23 |
| #2211 | FILA | reverse PARCIAL 1/23 |
| #2213 | FILA | reverse NAO 0/24 |
| #2214 | FILA | reverse NAO 0/2 |
| #2215 #2216 #2217 | FILA | reverse NAO 0/7 |
| #2218 | FILA | reverse PARCIAL 4/34 |
| #2219 | FILA | reverse PARCIAL 19/117 |
| #2221 | FILA | reverse PARCIAL 9/45 |
| #2226 | FILA | reverse NAO 0/1 |
| #2233 | FILA | reverse PARCIAL 1/8 |
| #2244 #2441 | FILA | reverse NAO 0/5 |
| #2245 | FILA | reverse NAO 0/2 |
| #2246 | FILA | reverse PARCIAL 2/23 |
| #2249 | FILA | reverse NAO 0/5 |
| #2250 #2274 | FILA | reverse PARCIAL 1/5 |
| #2251 | FILA | reverse NAO 0/3 |
| #2261 | FILA | reverse PARCIAL 2/7 |
| #2263 #2266 #2267 #2268 | FILA | reverse PARCIAL 148/173 |
| #2264 | FILA | reverse PARCIAL 137/164 |
| #2265 | 🔁 DUPLICATA_PROVAVEL | CRITICAL-1 já em mergeada #2241,#2452 |
| #2269 | FILA | reverse PARCIAL 141/173 |
| #2273 #2540 | FILA | reverse PARCIAL 1/9 |
| #2277 | FILA | reverse NAO 0/8 |
| #2316 | FILA | reverse PARCIAL 11/13 |
| #2354 #2356 | FILA | reverse NAO 0/1 |
| #2381 | FILA | reverse NAO 0/29 |
| #2396 #2490 | FILA | reverse NAO 0/12 |
| #2401 #2403 #2405 #2406 #2408 #2409 #2410 #2412 #2580 | FILA | reverse NAO 0/1 |
| #2414 #2506 | FILA | reverse NAO 0/22 |
| #2419 | FILA | reverse NAO 0/28 |
| #2426 | FILA | reverse PARCIAL 3/5 |
| #2431 #2552 | FILA | reverse NAO 0/118 |
| #2433 #2467 #2534 | FILA | reverse NAO 0/2 |
| #2442 | FILA | reverse PARCIAL 4/59 |
| #2457 #2469 #2470 #2471 #2472 #2476 | 🔁 DUPLICATA_PROVAVEL | C121 já em mergeada #2280,#2474 |
| #2460 | FILA | reverse PARCIAL 1/22 |
| #2461 | FILA | reverse NAO 0/1 |
| #2463 | FILA | reverse NAO 0/5 |
| #2464 | FILA | reverse PARCIAL 1/2 |
| #2468 #2484 | 🔁 DUPLICATA_PROVAVEL | C130 já em mergeada #2239 |
| #2473 | FILA | reverse NAO 0/7 |
| #2478 | 🔁 DUPLICATA_PROVAVEL | C007 já em mergeada #2223 |
| #2480 | 🔁 DUPLICATA_PROVAVEL | C297 já em mergeada #2237 |
| #2481 | 🔁 DUPLICATA_PROVAVEL | CRITICAL-2 já em mergeada #2241 |
| #2483 | FILA | reverse NAO 0/1 |
| #2485 | FILA | reverse NAO 0/2 |
| #2486 | FILA | reverse NAO 0/34 |
| #2487 | FILA | reverse NAO 0/1 |
| #2491 #2533 | FILA | reverse NAO 0/2 |
| #2498 | FILA | reverse NAO 0/7 |
| #2500 | FILA | reverse NAO 0/2 |
| #2505 | FILA | reverse NAO 0/1 |
| #2512 | FILA | reverse PARCIAL 2/138 |
| #2513 | FILA | reverse PARCIAL 2/15 |
| #2514 | FILA | reverse NAO 0/1 |
| #2515 | FILA | reverse NAO 0/1 |
| #2517 | 🔁 DUPLICATA_PROVAVEL | X070 já em mergeada #1684,#1706 |
| #2519 | FILA | reverse PARCIAL 2/25 |
| #2525 | FILA | reverse PARCIAL 2/4 |
| #2529 | FILA | reverse NAO 0/1 |
| #2530 | FILA | reverse NAO 0/1 |
| #2531 | FILA | reverse NAO 0/1 |
| #2535 | 🔁 DUPLICATA_PROVAVEL | C011 já em mergeada #2240 |
| #2537 | FILA | reverse NAO 0/61 |
| #2539 | FILA | reverse NAO 0/4 |
| #2541 | FILA | reverse NAO 0/2 |
| #2542 | FILA | reverse NAO 0/4 |
| #2544 | 🔁 DUPLICATA_PROVAVEL | X081 já em mergeada #1726 |
| #2550 | FILA | reverse NAO 0/22 |
| #2553 | FILA | reverse NAO 0/2 |
| #2555 | FILA | reverse NAO 0/2 |
| #2558 | FILA | reverse NAO 0/3 |
| #2571 | FILA | reverse PARCIAL 1/2 |
| #2581 | 🔁 DUPLICATA_PROVAVEL | GR-001 já em mergeada #2569,#2575 |
| #2589 | FILA | reverse NAO 0/2 |
| #2601 | FILA | reverse NAO 0/1 |
| #2603 | FILA | reverse NAO 0/1 |
| #2614 | FILA | reverse PARCIAL 1/162 |
| #2661 | FILA | reverse PARCIAL 1/11 |
| #2663 | FILA | reverse PARCIAL 2/13 |
| #2702 | FILA | reverse PARCIAL 1/2 |
| #2767 #2780 | FILA | reverse NAO 0/5 |
| #2770 | FILA | reverse NAO 0/18 |
| #2788 | 🔁 DUPLICATA_PROVAVEL | X054 já em mergeada #2793 |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:25:49Z adm01-debug =====
LOTE 1 — banco/segurança

40 itens, 63 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2767 #2780 | seg |  | fix(db): reconcilia cinco migrations aplicadas |  |
| 2 | #2770 | seg |  | fix: codex findings — lint, CI e migration-evidence (3 correções) | edge |
| 3 | #2702 | seg |  | chore: snapshot.py footer configurável via env + __pycache__/ no .gitignore |  |
| 4 | #2663 | seg |  | feat(ia): regras de negócio para agentes — scripts/regras_negocio + workflow a c |  |
| 5 | #2661 | seg |  | feat(ia): contexto vivo para agentes — gerador + workflow a cada 10 min (branch  |  |
| 6 | #2614 | seg |  | chore(analise): relatório exaustivo de PRs + prs.json/csv (294 PRs) |  |
| 7 | #2603 | seg |  | fix(db): adicionar arquivo migration 20261102012200 ausente da main (drift) |  |
| 8 | #2571 | seg |  | fix(contacts): race condition enderecoVigenteRef via useLayoutEffect |  |
| 9 | #2186 #2561 | seg | S3-01 S8-01 | fix(rls): convites de departamento só admin cria e apaga (S3-01) | 3 migration fora de prod |
| 10 | #2550 | seg | X168 | feat: X168 — exportação CSV de relatório TalkX com gate can_download |  |
| 11 | #2491 #2533 | seg |  | chore: arquivo de reconciliação migration 20261030145126 (copilot_fases13_15_tab |  |
| 12 | #2531 | seg | X058 X149 | feat(talkx): RPC de fila por segmento da campanha (X058) | 1 migration fora de prod |
| 13 | #2530 | seg | X086 | feat(talkx): RPCs de métricas da biblioteca de templates (X086) | 1 migration fora de prod |
| 14 | #2529 | seg | X074 | feat(talkx): RPCs analíticas de campanha — heatmap, top segmentos, ranking (X074 | 1 migration fora de prod |
| 15 | #295 #592 #939 #2238 #2466 #2496 #2528 | seg | C098 C110 E03 E11 | test(message-delivery): cobre PD-79 no edge + mark que lança vira 503 [C110] [DE | 3 migration fora de prod; edge |
| 16 | #2525 | seg |  | chore(migrations+docs): reconciliar 2 entradas órfãs do ledger + RELATORIO_CI /  |  |
| 17 | #2519 | seg |  | fix: corrige 6 falhas de CI + documenta bloqueios pré-existentes (§1–§8) |  |
| 18 | #2514 | seg | CRITICAL-3 | fix: CRITICAL-3 — talkx-scheduler 9,3% de falha por timeout de arranque | 1 migration fora de prod |
| 19 | #2512 | seg |  | Claude/busy cannon 40szm9 |  |
| 20 | #2105 #2511 | seg | GR-030 | Claude pink/nice hypatia iikl82 |  |
| 21 | #2414 #2506 | seg |  | docs(audit): auditoria Supabase tnnnlkbymytvtqngbbqh — 47 achados, zero escrita  |  |
| 22 | #744 #1463 #1624 #2108 #2138 #2502 | seg | E100 E42 E49 E50 | docs: atualiza perímetro do GitHub e checkboxes do plano GA01-GA100 | edge |
| 23 | #2500 | seg |  | fix: CV-052 — commit atômico session+insights via RPC commit_copilot_tick | 1 migration fora de prod; edge |
| 24 | #2498 | seg |  | fix(admin): corrige RPC get_search_insights → search_insights + consolidação aud |  |
| 25 | #2396 #2490 | seg |  | docs(ci): GF-001..056 — PENDENCIAS.md e BACKLOG_TAREFAS.md atualizados | edge |
| 26 | #2487 | seg |  | feat: migration 20261030200000 — motor Copiloto RADAR (AGUARDANDO APROVAÇÃO) | 1 migration fora de prod |
| 27 | #2485 | seg |  | fix: RLS copilot — INSERT learning_moments e UPDATE scores só para supervisor/ad | 1 migration fora de prod |
| 28 | #2461 | seg |  | feat(db): 7 tabelas copiloto fases 13-15 (CV-121–CV-150) |  |
| 29 | #2151 #2445 | seg | GR-005 | fix(ci): ci-workflows-vermelhos — mega-branch 325 arquivos (S1) | edge |
| 30 | #2155 #2444 | seg |  | fix(ci): ci-verde — 46 arquivos (S1, conflito) | edge |
| 31 | #2139 #2443 | seg | GR-004 | fix(ci): fix-failed-workflows — 45 arquivos (S2, conflito) |  |
| 32 | #2442 | seg |  | feat(codex): publish-followup — 59 arquivos (S2, conflito alto) | 1 migration fora de prod; edge |
| 33 | #2419 | seg |  | feat(copilot): motor do RADAR no ai-jobs-worker, nascendo desligado (CV-021–045) | 1 migration fora de prod; edge |
| 34 | #2381 | seg |  | feat(copilot): motor do RADAR no ai-jobs-worker, nascendo desligado (CV-021–045) | 1 migration fora de prod; edge |
| 35 | #2277 | seg |  | chore(db): GOAL backend — classifica 17 tabelas RLS + decide backups + prepara D |  |
| 36 | #2269 | seg |  | fix: Talk X segmentos sem estimativa enganosa (real_* em breve, atualizar tolera |  |
| 37 | #2263 #2266 #2267 #2268 | seg |  | fix: supervisor volta a gerenciar templates do WhatsApp e Base de Conhecimento n |  |
| 38 | #2261 | seg |  | fix: corrigir falhas de CI em 4 suítes de teste e retry de rede no fila-merge |  |
| 39 | #2246 | seg |  | fix: retry automático em fila-merge.mjs para HTTP 504 transitório |  |
| 40 | #2245 | seg |  | fix(talkx): corrige 4.007 falhas/30d do cron talkx-scheduler-1min | 1 migration fora de prod |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:25:51Z adm01-debug =====
LOTE 2 — banco/segurança

40 itens, 42 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2219 | seg |  | fix: corrige falhas de testes unitários pré-existentes em main |  |
| 2 | #2214 | seg |  | feat: DDL 7 tabelas copiloto RADAR fases 13-15 (CV-121–CV-150) | 1 migration fora de prod |
| 3 | #2199 | seg |  | fix: corrige 3 falhas de CI — unit tests virtualizer + DB Guard PG17 roles |  |
| 4 | #2190 | seg |  | fix: corrige 9 falhas de CI que mantinham a main vermelha | 1 migration fora de prod |
| 5 | #2187 | seg |  | fix(tests): corrige falhas de testes no baseline main — mocks, lógica e código m |  |
| 6 | #2145 | seg |  | fix(ci): Resto GA86 GA99 GA100 (sonar, contracts, adocao) |  |
| 7 | #2143 | seg |  | fix(ci): Resto GA20-GA25 (Gate 3, DESTINO split, auto-merge grants) |  |
| 8 | #2142 | seg |  | fix(ci): Resto GA13-GA17 (db-migrate 2 jobs, apply_all_missing, portao destrutiv |  |
| 9 | #2137 | seg |  | fix(db): recria canonicamente as policies de receipt do team chat (replay) | 1 migration fora de prod |
| 10 | #2126 | seg | GR-031 | fix(ci): Fases 4+5+6 do plano GA49-GA74 |  |
| 11 | #2085 | seg |  | fix: WhatsAppTemplatesManager sem gate de escrita admin-only (RLS) — 2 arquivos  |  |
| 12 | #2080 | seg |  | fix: useTeamChatNotifications — canal recriado no volume + aviso sem Service Wor |  |
| 13 | #2066 | seg |  | fix: useAudioMemes sobe chave solta no bucket com policy por pasta (PK-16/PK-17) |  |
| 14 | #2000 | seg |  | feat: RADAR Fase 4 — Inteligência B·R·I·N·D·E (CV-031–040) | 1 migration fora de prod; edge |
| 15 | #1998 | seg |  | feat: CV-021–030 Motor copilot-live — worker incremental com roteamento dois and | 1 migration fora de prod; edge |
| 16 | #1997 | seg |  | feat: CV-010–020 — Fase 2 RADAR copilot (migrations + feature flag) | 6 migration fora de prod |
| 17 | #1991 | seg | GR-022 | fix: corrige nomes de workflows no notificador e cancelamento de scroll programá | edge |
| 18 | #1987 | seg |  | fix: reconciliar regressões e preparar publicação do lote 880 | edge |
| 19 | #1983 | seg |  | fix: correções pós-lote 880 cartões (F1–F6) | 1 migration fora de prod; edge |
| 20 | #1979 | seg | GR-021 | docs: plano de correções dos workflows em FAILURE — 200 etapas (2026-10-16) |  |
| 21 | #1730 | seg |  | refactor(sonar): Number.parseInt/parseFloat/NaN no lugar dos globais (S7773) | edge |
| 22 | #1333 | seg |  | fix(talkx): torna a migration 20260916230000 replay-safe (V06) |  |
| 23 | #1150 | seg |  | fix(db): adiciona 8 arquivos de migration ausentes do disco (guard O_MIGRATIONS) |  |
| 24 | #1080 | seg |  | fix(db): reconcilia arquivos de migration 580000/590000/620000 com ledger |  |
| 25 | #1077 | seg |  | fix: adiciona 5 stubs de migration e entradas no migration-evidence.json para co |  |
| 26 | #1073 | seg |  | fix(db): reconcilia drift db-live-guard versões 580000/590000/620000 |  |
| 27 | #1041 #1054 | seg |  | fix: reconcilia migrations 520000 e 570000 ausentes no Git | 2 migration fora de prod |
| 28 | #1045 | seg |  | fix(db): reconcilia paridade arquivo-ledger 510000-570000 + cap XP + UNIQUE conv | 1 migration fora de prod |
| 29 | #1022 | seg |  | fix(db): uniformiza guards gamificacao + UNIQUE closures + limpeza E2E + avg_res |  |
| 30 | #1021 | seg |  | fix(db): REVOKE EXECUTE PUBLIC + search_path + guards em 9 RPCs — Fase 1 do plan |  |
| 31 | #1017 | seg |  | fix: reconcilia paridade arquivo↔ledger migrations 20260927400000–430000 |  |
| 32 | #947 | seg |  | fix(migrations): reconcilia drift em 20260926800000 (calls_telefonia_v2) |  |
| 33 | #942 | seg |  | fix(db): audit exaustiva — FSM, lockout reset, RLS bypass, FK indexes |  |
| 34 | #938 | seg |  | fix(db): restringe policy UPDATE de contacts para role authenticated (reversiona | 1 migration fora de prod |
| 35 | #875 | seg |  | infra(telefonia): contrato de dados — colunas aditivas, RPCs e prova de RLS | 1 migration fora de prod |
| 36 | #742 #745 | seg |  | reconcile: migration para dashboard_contact_counts RPC (20260925162737) |  |
| 37 | #720 | seg |  | fix(db): revoga EXECUTE de anon/authenticated em 2 funções só-cron | 1 migration fora de prod |
| 38 | #718 | seg |  | fix(db): paridade de fila na policy de UPDATE de messages | 1 migration fora de prod |
| 39 | #653 | seg |  | fix(edge): exige auth interna real em sicoob-bridge-reply | edge |
| 40 | #218 | seg |  | fix(security): race condition, grants excessivos e hardening da edge function de | edge |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:26:35Z adm01-debug =====
LOTE 3 — banco/segurança

34 itens, 43 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #213 | seg |  | security: hardening pós-auditoria — SECURITY DEFINER, grants anon, edge function | edge |
| 2 | #206 | seg |  | fix(migrations): restaura paridade — 10 arquivos .sql orphans |  |
| 3 | #123 | seg |  | fix(db): resolve DB Live Guard steps 7+11 — 3 evidence exceptions + sync manifes |  |
| 4 | #115 | seg |  | fix(db): add missing migration file 20260901100001 and sync manifest (#114) |  |
| 5 | #2486 | feat |  | feat: motor e telas do RADAR Copiloto (CV-021–060), nasce desligado | 1 migration fora de prod; edge |
| 6 | #746 | feat |  | feat(contatos): endereço e CEP no cadastro de contato |  |
| 7 | #2589 | fix |  | fix(db): alinhar 20261102012200 com ledger — gen_random_bytes sem prefixo extens |  |
| 8 | #2539 | fix |  | fix: reconcilia migrations 20261026 — arquivo 240300, replay-known-failures, TC- |  |
| 9 | #2505 | fix |  | fix: HIGH-3 — 57 índices de FK sem cobertura (auditoria Supabase) |  |
| 10 | #2483 | fix |  | fix: adiciona brinde_state em copilot_sessions (CV-026) | 1 migration fora de prod |
| 11 | #2226 | fix |  | fix(db-guard): corrige assertion B.0c no TC-009 — backfill não deve disparar tri |  |
| 12 | #1999 | fix |  | fix(migrations): resolver timestamp duplicado 20261011010000 (P1-001) |  |
| 13 | #1086 #1099 | fix |  | fix(db-guard): migration 540000 — agent_stats não conversations + SHA em migrati |  |
| 14 | #1094 | fix |  | fix(db): reconcilia drift db-live-guard — catalog + manifest + ledger prosa |  |
| 15 | #981 | fix |  | fix: renomeia migration 290000→300000 (colisão de version no ledger) |  |
| 16 | #578 | fix |  | fix(db): resolve job_id de avatars-refresh por nome em vez de hardcode |  |
| 17 | #552 #559 | fix |  | fix(db-audit): backfill do arquivo da migration do cron de health-check |  |
| 18 | #239 | fix |  | fix(edge-deploy): orphan allowlist para check-account-lock e record-failed-login |  |
| 19 | #208 | fix |  | fix: Evolution GO adapter + frontend fixes from exhaustive validation campaign | edge |
| 20 | #911 | outro |  | chore(db): reconcilia db-live-guard — arquivo faltante da 230000 |  |
| 21 | #898 | outro |  | chore(db): remove migration duplicada de search_contacts |  |
| 22 | #732 | outro |  | chore: índice parcial para query do cron de lembretes |  |
| 23 | #2095 #2771 | dup | Z017 Z018 Z019 Z020 | fix(security): Z018+Z020 — external-db-proxy code-leak em 502 + análise PR batch | edge |
| 24 | #2544 | dup | X081 X082 | feat(talkx): P046 reconciliação + X081 bulk actions + X082 dica do dia |  |
| 25 | #2517 | dup | X070 | feat(talkx): catálogo de motivos de supressão com RLS e FK (X070) | 1 migration fora de prod |
| 26 | #2481 | dup | CRITICAL-2 | fix(rls): WITH CHECK explícito em 8 policies UPDATE críticas — fecha CRITICAL-2 |  |
| 27 | #2457 #2469 #2470 #2471 #2472 #2476 | dup | C121 | feat: cron do Multiplix retoma dispatch pausado por instância pausada (C121) — A | 4 migration fora de prod; edge |
| 28 | #2265 | dup | CRITICAL-1 | fix: revoga grants de escrita do anon em public (CRITICAL-1) |  |
| 29 | #2131 | dup | E83 | feat(E83): entrar no canal de departamento por código de convite |  |
| 30 | #2124 | dup | S3-024 | fix(ci): Fase 0 do plano GA02-GA12 | 1 migration fora de prod |
| 31 | #2094 | dup | Z036 Z037 Z038 Z047 | fix(db): FASE 2 — REVOKE anon write grants todas as tabelas (Z054-Z055) |  |
| 32 | #1151 | dup | E01 | [NÃO MERGEAR — auditada 29/09] Team Chat: 44 migrations inaplicáveis + auditoria |  |
| 33 | #1083 | dup | E40 | fix(db-guard): migration ausente + grants-baseline regenerado |  |
| 34 | #122 #749 | dup | E22 E23 E31 E32 | feat(dashboard): E31/E32 — filtros de fila/agente propagados para KPI row e Volu |  |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:26:36Z adm01-debug =====
LOTE 4 — edge functions

11 itens, 27 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2460 | feat |  | feat: 7 edge functions copiloto RADAR fases 8-10 (CV-071–CV-100) | edge |
| 2 | #2215 #2216 #2217 | feat |  | feat: edge functions AI copiloto fases 8-15 (CV-071–CV-150) | edge |
| 3 | #2002 | feat |  | feat: RADAR CV-041–050 — Sugestões ao vivo com caminhos, tone chips e split | edge |
| 4 | #1899 | feat |  | feat(cors): aceita o domínio oficial zappweb.app.br nas Edge Functions | edge |
| 5 | #723 | feat |  | feat(alerta): queda do WhatsApp avisa os admins por e-mail | edge |
| 6 | #2040 #2554 #2559 #2566 #2586 | fix | GR-027 GR-029 W71 | fix(ci): timeout e non-fatal no preflight PromoGifts do deploy-functions | edge |
| 7 | #2401 #2403 #2405 #2406 #2408 #2409 #2410 #2412 #2580 | fix | GR-009 W99 | fix: deno.json nodeModulesDir none — corrige deploy-functions no main | edge |
| 8 | #1064 | fix |  | fix(edges): fechar CodeQL js/stack-trace-exposure (alert #13) | edge |
| 9 | #622 #656 #684 | fix |  | fix(promogifts-catalog): 503 em list_products quando offset > total do filtro | edge |
| 10 | #557 | fix |  | fix: gera QR do WhatsApp a partir do payload cru (pareamento estava impossível) | edge |
| 11 | #2581 | dup | GR-001 | fix(edge): CORS preflight em ai-usage-outbox-drain e copilot-live (smoke 83/85→8 | edge |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:26:37Z adm01-debug =====
LOTE 5 — Talk X

22 itens, 29 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2104 #2111 #2208 #2230 | seg |  | chore: remove hook morto useTalkXSuppression |  |
| 2 | #2558 | feat | X053 | feat(talkx): trilha de navegação clicável no monitor (X053) |  |
| 3 | #2555 | feat | X051 | feat: unificar ciclo de vida de campanha em useTalkXLifecycle nas 5 telas (X051) |  |
| 4 | #2553 | feat | X050 | feat: migrar Dialog→TalkXDialogShell em Supressão e TemplateEditor (X050) |  |
| 5 | #1351 | feat |  | feat(talk-me): refina carrossel e fila de espera |  |
| 6 | #2537 | fix |  | fix(admin): N-063/N-064 a11y + MediaMigrationTool indeterminate + supervisor tab |  |
| 7 | #2072 #2252 #2439 | fix |  | fix(test): lote F1a talkxsegments — corrige testes TalkX |  |
| 8 | #2264 | fix |  | fix: remove só o hook morto useTalkXSuppression (módulo segue vivo para a tela) |  |
| 9 | #2249 | fix |  | fix: 3 falhas de testes unitários (HighContrastToggle, mock de canal Talk X, nom |  |
| 10 | #2221 | fix | S3-009 S3-016 S3-028 | fix: corrige falhas pré-existentes nos Unit Tests de src/ |  |
| 11 | #2218 | fix |  | fix: corrigir CI — RE_RECON, Playwright 1.63.0, useAuth, fila-merge, manifest |  |
| 12 | #2211 | fix |  | fix(ci+tests): corrige auto-update-pr-branch e falhas nos testes unitários |  |
| 13 | #2195 | fix |  | fix: crash cachedConversations undefined e this-binding perdido no rpc de metas  |  |
| 14 | #2129 | fix | GR-025 | fix(ci): Fases 7+8 do plano GA75-GA95 |  |
| 15 | #2097 | fix |  | fix: corrige falhas pré-existentes nos Unit Tests (useKnowledgeBase + useTalkXSe |  |
| 16 | #2035 | fix |  | fix: mock global @/lib/logger no Vitest — desbloqueia CI de todos os PRs do Copi |  |
| 17 | #2185 | outro | GR-026 | docs(pendencias): §8 RESOLVIDO + §9 inventário de workflows da main |  |
| 18 | #2788 | dup | X054 | feat: ⌘K palette owner único — useQuery com enabled, botão Buscar e listener dup |  |
| 19 | #2196 #2548 | dup | X047 X048 | feat: X048 — estados WA/CRM/sem-permissão com botões ligados (X048) |  |
| 20 | #2535 | dup | C011 X111 X112 X115 | fix(talkx): restaura X111/X112/X116 perdidos no squash do #2240 em TalkXSegments |  |
| 21 | #2480 | dup | C297 | feat: C297 — visual de texto longo em Badge, Card, Label, Tabs |  |
| 22 | #2091 #2113 | dup | Z011 Z032 | fix(evolution-api): remover set-presence, find-chats e find-status-messages (GO_ | edge |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:26:38Z adm01-debug =====
LOTE 6 — conexão WhatsApp/Evolution

3 itens, 3 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2024 | feat |  | feat(copilot): Phase 10 — sinais, temperatura, timing, follow-up (CV-091–098) |  |
| 2 | #2098 | fix |  | fix: corrigir falhas de CI — testes, a11y, bundle e motion (261019) |  |
| 3 | #2059 | fix |  | fix(test): ConnectionCard — handleDisconnectDialogOpenChange indefinido — 6 arqu |  |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:27:22Z adm01-debug =====
LOTE 7 — contatos/chat/inbox

31 itens, 39 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2433 #2467 #2534 | seg |  | fix: bulkArchive mostra toast.info quando RLS bloqueia SELECT |  |
| 2 | #2030 | feat |  | feat: RADAR copiloto CV-131–140 — Aprendizado contínuo e avaliação (Fase 14) |  |
| 3 | #2029 | feat |  | feat: RADAR Phase 13 — Supervisor, coaching e treinamento (CV-121–130) |  |
| 4 | #2006 | feat |  | feat: CV-061–070 RADAR fase 7 — ghost text, ditado por voz, templates inteligent |  |
| 5 | #2003 | feat |  | feat: CV-051–060 — Fase 6 RADAR painel flutuante (popup, drag, DND, atalhos, a11 |  |
| 6 | #741 | feat |  | feat(contatos): "Mapa de Contatos" passa a ter mapa de verdade |  |
| 7 | #250 | feat |  | feat(contacts): redesign pixel-perfect do módulo Contatos |  |
| 8 | #180 | feat |  | feat(nav): migra URL canônica de #hash para ?view=X query param |  |
| 9 | #2541 | fix |  | fix(e2e): corrige axe color-contrast webkit/firefox no email-workspace |  |
| 10 | #2273 #2540 | fix |  | fix(tests): corrigir falhas unitárias em 5 suítes (aria-labels, unmount, medirLa |  |
| 11 | #2513 | fix |  | fix: contraste WCAG AA no modo alto contraste escuro (email-navy) |  |
| 12 | #2464 | fix |  | fix: resolve lint regressions and existing typecheck errors |  |
| 13 | #2244 #2441 | fix |  | fix(types): tipos RPC ausentes — S3 types-rpc-ausentes-261025 |  |
| 14 | #2193 #2417 | fix |  | fix(tests): mocks clientHeight/clientWidth e spy HTMLElement para @tanstack/virt |  |
| 15 | #2354 #2356 | fix | W57 | fix: compatibilidade de is_pinned com tipos gerados sem a coluna no banco |  |
| 16 | #2316 | fix |  | fix(contatos): restaura topo compacto e amplia toque do botão de criar |  |
| 17 | #2251 | fix |  | fix: filtros do inbox (?type= no roteador) e testes de arquivar em lote |  |
| 18 | #2233 | fix |  | fix: corrige 3 falhas de Vitest (SL-070, HZ5-09, a11y TTS) |  |
| 19 | #2198 | fix |  | fix(tests): corrige testes unitários falhando na main |  |
| 20 | #2189 | fix |  | fix: corrige 5 falhas de CI que bloqueiam a main |  |
| 21 | #2135 | fix |  | fix(contatos): restaura topo sem cabeçalho e devolve o toque ao FAB |  |
| 22 | #2128 | fix | GR-019 | fix(ci): Fases 2+3 do plano GA27-GA47 |  |
| 23 | #2090 | fix |  | fix: fila de envio offline não era por usuário — trocar de atendente na mesma má |  |
| 24 | #2023 | fix |  | fix(build): remove export duplicado isOverdue e exporta nextBestActionKey |  |
| 25 | #1985 | fix |  | fix: estabilizar rolagem e fixtures da CI canônica |  |
| 26 | #1980 | fix |  | fix: restaura bun.lock coerente com package.json (destrava CI da main) |  |
| 27 | #1142 #1149 #1153 | fix |  | fix(tasks): usar auth.uid() como fallback direto em created_by/assigned_to |  |
| 28 | #149 | fix |  | fix(inbox): galeria de mídia abria como modal ao abrir detalhes do contato |  |
| 29 | #2197 | outro |  | ci: lote GA49–GA64 — fila-merge, actions-kpi, types-sync, codeql e branch-hygien |  |
| 30 | #384 | outro |  | redesign(inbox): unifica painel central, direito, abas, arquivos/histórico e tar |  |
| 31 | #2146 | dup | E90 | feat(team-chat): TeamChatView seleciona conversa via ?cid= (receptor E90) |  |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:27:23Z adm01-debug =====
LOTE 8 — admin/config/convites

3 itens, 4 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2463 | fix |  | fix: MediaMigrationTool acessa dados via service (no-restricted-imports) |  |
| 2 | #2070 #2440 | fix | S3-021 | fix(test): lote F1a useAdminData createUser/avatar — corrige testes admin |  |
| 3 | #2082 | fix |  | fix: falha de leitura em useUserSettings ficava invisível (C-1) — 1 arquivo (lot |  |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:27:24Z adm01-debug =====
LOTE 9 — front geral/outros

39 itens, 53 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #2431 #2552 | seg | S3-027 | fix(test): setup.ts clientHeight/offsetHeight para virtualizer + docker-shim gua |  |
| 2 | #2088 | seg |  | fix: área segura mobile (safe-area-*) e rolagem sem barra (scrollbar-none) sem r |  |
| 3 | #2026 | seg |  | feat: CV-111–120 Guardrails, segurança e LGPD — Fase 12 do RADAR |  |
| 4 | #2473 | feat |  | feat: conectar 7 hooks do Copiloto às edge functions AI (fases 8–14) |  |
| 5 | #2213 | feat |  | feat: RADAR Copilot Fases 8–15 — CV-071 a CV-150 (objection, deadline, temperatu |  |
| 6 | #2032 | feat |  | feat: RADAR Copiloto — Fase 15: Custos, Piloto e Rollout (CV-141–150) |  |
| 7 | #2025 | feat |  | feat: RADAR Fase 11 — Multimodal CV-101–110 (áudio, imagem, documento) |  |
| 8 | #2022 | feat |  | feat: RADAR copilot Phase 9 — Catalog, Budget, Timeline (CV-081–090) |  |
| 9 | #2015 | feat |  | feat: CV-141–150 RADAR fase 15 — orquestrador master, painel unificado, persistê |  |
| 10 | #2013 | feat |  | feat: CV-071–080 — Fase 8 RADAR objeções, battlecard, guardrail de desconto e ri |  |
| 11 | #2012 | feat |  | feat: CV-131–140 RADAR fase 14 — analytics, conversão e A/B testing |  |
| 12 | #2011 | feat |  | feat: CV-121–130 RADAR fase 13 — Supervisor, Coaching e Modo Treinamento |  |
| 13 | #2010 | feat |  | feat: CV-101–110 RADAR fase 11 — análise multimodal (áudio, imagem, documento) |  |
| 14 | #2009 | feat |  | feat: CV-111–120 RADAR fase 12 — guardrails de privacidade, tom e LGPD |  |
| 15 | #2007 | feat |  | feat: CV-091–100 — Fase 10 RADAR termômetro do lead, speed-to-lead e follow-up i |  |
| 16 | #2601 | fix |  | fix(auth): aumentar AUTH_LOGIN_TIMEOUT_MS de 12s para 25s — destrava E2E logado  |  |
| 17 | #2542 | fix |  | fix: N-008 DB Guard — N008_POSTGRES_IMAGE ausente causava falha de pull (fix/ci- |  |
| 18 | #2515 | fix |  | fix: pre-aquecer cache Deno antes do baseline N-017 |  |
| 19 | #2083 #2437 | fix |  | fix(test): lote F1a batch6 — corrige testes unitários CI |  |
| 20 | #2426 | fix |  | fix(ci): corrigir timeout do branch-hygiene-audit e baseline do Realtime |  |
| 21 | #2250 #2274 | fix |  | fix: corrige workflows com falha — types.ts +9 RPCs, retry HTTP 502 |  |
| 22 | #2125 | fix |  | fix(ci): Fase 1 do plano GA18 GA19 + GA26 prepare |  |
| 23 | #2084 | fix |  | fix: Leaderboard não distinguia RPC caída de ranking vazio — 1 arquivo (lote F1a |  |
| 24 | #2081 | fix |  | fix: contagem de whatsapp_connections lançava e derrubava toda a coleta de diagn |  |
| 25 | #2074 | fix |  | fix: overlay de useScreenProtection sem role=alert/aria-live — 1 arquivo (lote F |  |
| 26 | #2073 | fix |  | fix: useKnowledgeBase não expunha erro de leitura (t_1944d290) — 2 arquivos (lot |  |
| 27 | #1929 | fix | W59 | fix(secrets-scope): W59 — fail-closed quando listagem de secrets falha |  |
| 28 | #1699 | fix |  | fix(a11y): auditoria de dev espera o app montar antes de medir |  |
| 29 | #119 #734 #1076 #1206 | fix | E08 E09 W1 W2 | fix: E09 — attestation não trava quando version não bumpa na Management API | edge |
| 30 | #465 #555 #655 | fix |  | fix(db-audit): sincroniza schema-manifest.json com trg_prevent_contact_assignee_ |  |
| 31 | #606 | fix |  | fix(layout): telas voltam a desenhar a própria trilha de navegação (barra global |  |
| 32 | #45 | fix |  | fix(db-guard): wait for postgres before acl harness |  |
| 33 | #117 #312 #951 #2772 | outro |  | chore(db): sincronizar artefatos derivados do banco |  |
| 34 | #703 #1690 #2760 | outro |  | chore(db): sincronizar artefatos derivados do banco |  |
| 35 | #644 | outro |  | chore(db): sincronizar artefatos derivados do banco |  |
| 36 | #598 | outro |  | chore(layout): remove o header que ficou vazio e devolve 56px ao conteúdo |  |
| 37 | #2468 #2484 | dup | C130 | feat(metas): seletor Hoje/Semana/Mês na aba Metas (C130, resgate) |  |
| 38 | #2478 | dup | C007 | feat(tarefas): cores de prioridade D12 — Média âmbar, Alta/Urgente vermelho (C00 |  |
| 39 | #1930 | dup | W21 W22 W23 W26 | feat(db-audit): W21 — check-migration-drift --classificar: 4 classes de drift |  |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:27:25Z adm01-debug =====
LOTE 10 — dependências (dependabot)

2 itens, 38 PRs. Ordem: segurança/RLS/grants → feat → fix → outros → duplicata provável.

| # | PR(s) | prio | códigos | título (PR mais recente) | obs |
|---|---|---|---|---|---|
| 1 | #91 #389 #390 #391 #392 #393 #394 #395 #396 #397 #398 #994 #1918 #2102 | outro |  | ⬆️ deps: Bump the deps-semanal group with 11 updates |  |
| 2 | #14 #15 #16 #17 #18 #19 #20 #21 #22 #23 #25 #27 #28 #29 #78 #79 #80 #81 #82 #83 #85 #86 #87 #88 | outro |  | ⬆️ deps: Bump date-fns from 3.6.0 to 4.4.0 |  |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:52:06Z adm01-debug =====
RESULTADO LOTE 4-6-8 (parcial)

Base: main `478f4bc4` (corpo da issue). Produção `tnnnlkbymytvtqngbbqh` só leitura (1092 migrations, confere com a foto). Obs.: a main foi reescrita (50 commits) e não compartilha histórico com as PRs; diffs lidos de `baseRefOid..headRefOid` de cada PR.

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2460 (L4-1) | ⚠️ DECISAO_DONO | 7 edges `ai-deadline-calculator`, `ai-lead-temperature`, `ai-loss-risk`, `ai-multimodal-analysis`, `ai-objection-handler`, `ai-price-anchor`, `ai-product-recommendation` ausentes de `supabase/functions/` na main; na main os hooks são heurística local (`src/hooks/copilot/useLeadThermometer.ts:19`, sem `invokeEdge`); na PR cada edge chama LLM (`enforceAiGuards`, flag `copilot_live`). Mergeada #2361 fez fases 8–15 sem essas edges | Liga IA de verdade no termômetro/objeções/preço/risco de perda — custo de tokens por mensagem |
| #2215 #2216 #2217 (L4-2) | 🗑️ OBSOLETA | Mesmas 7 edges, versões anteriores e divergentes entre si (ver `docs/_arquivo/docs/consolidacao/_plano/GITHUB-limpeza.md:30`); #2460 é a versão mais completa (inclui wiring dos hooks) | Nenhum (decisão fica no #2460) |
| #2002 (L4-3) | ⚠️ DECISAO_DONO | Main: `supabase/functions/copilot-live/index.ts:2-7` é stub ("resposta estática… sem dependência de LLM"); PR traz motor real de 644 linhas com 2 modelos + `LiveSuggestions.tsx`/`useLiveSuggestions.ts` (ausentes na main). Depende do gatilho `enqueue_copilot_tick_on_contact_message`, que **não existe** em produção (pg_trigger só tem `trg_copilot_sessions_updated_at`) | Sugestões ao vivo no chat; exige migration + custo LLM |
| #1899 (L4-4) | ✅ JA_NA_MAIN | `supabase/functions/_shared/cors-origins.ts:15-16` (`https://zappweb.app.br` e `www`) | — |
| #723 (L4-5) | ✅ JA_NA_MAIN | `supabase/functions/connection-health-check/index.ts:62-64,368-372` — aviso por e-mail (Resend) com escalonamento de hora em hora, mais completo que a PR | — |
| #2040 #2554 #2559 #2566 #2586 (L4-6) | ✅ JA_NA_MAIN | `.github/workflows/deploy-functions.yml:382-396` — preflight PromoGifts com `--max-time 30` e erro de transporte não-fatal (GR-001) | — |
| #2401 #2403 #2405 #2406 #2408 #2409 #2410 #2412 #2580 (L4-7) | 🗑️ OBSOLETA | PRs queriam `nodeModulesDir: "none"`; main usa `"auto"` (`supabase/functions/deno.json`) e o deploy das edges passa (run 42375139178 de 07/11 = success; a falha de 08/11 é só no health-check pós-deploy, HTTP 414) | Nenhum |
| #1064 (L4-8) | ✅ JA_NA_MAIN | `internalErrorResponse` importado em `ai-churn-analysis/index.ts:2`, `ai-classify-tickets/index.ts:2`, `create-user/index.ts:3`, `migrate-media-storage/index.ts:6` | — |
| #622 #656 #684 (L4-9) | ✅ JA_NA_MAIN | `supabase/functions/promogifts-catalog/index.ts:463` trata `PGRST103` (offset > total) + `pagination.test.ts` | — |
| #557 (L4-10) | ✅ JA_NA_MAIN | `supabase/functions/evolution-api/index.ts:578-591` re-renderiza o QR a partir do payload cru (`npm:qrcode@1.5.3`) | — |
| #2581 (L4-11) | 🔁 DUPLICATA | Mesmo título mergeado em #2583; main: `copilot-live/index.ts:31` (OPTIONS) e `ai-usage-outbox-drain/index.ts:111` (`handleCors`) | — |
| #2024 (L6-1) | ✅ JA_NA_MAIN | Equivalentes com outros nomes: `useLeadThermometer`, `usePurchaseSignals`, `useSpeedToLead`, `useFollowUpTiming`, `useSilenceDetector` + `src/components/copilot/RadarPhase10Panel.tsx:41-43` (via #2361) | Painéis Fase 8/9/10/8-15 existem mas não são renderizados em nenhuma tela (só `RadarPhase7Panel` em `ChatInputArea.tsx`) — fora do escopo desta PR |
| #2098 (L6-2) | 🗑️ OBSOLETA | Partes de movimento reduzido já na main (`ConnectionsView.tsx:33,140`, `ScheduleCalendarView.tsx:156`); o resto (`CRMAutoSync.tsx` 181→87 linhas, `useTeamChatPanel.ts`) reverteria versões mais novas da main | Aplicar regrediria o CRM auto-sync |
| #2059 (L6-3) | ✅ JA_NA_MAIN | `src/components/connections/ConnectionCard.tsx:77,250` (`handleDisconnectDialogOpenChange` definido e usado) | — |
| #2463 (L8-1) | 🔴 PERDIDA | `src/services/mediaMigration.service.ts` não existe; `src/components/admin/MediaMigrationTool.tsx:7` ainda importa `supabase` direto (regra `no-restricted-imports` é só `warn`, `eslint.config.js`) | Nenhum para o usuário; só organização de código |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:52:17Z adm01-debug =====
RESULTADO LOTE 4-6-8

17 itens (34 PRs). Linhas que faltavam depois da parcial:

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2070 #2440 (L8-2) | ✅ JA_NA_MAIN | `src/components/admin/useAdminData.ts:141` ("já cadastrado"), `:150` (papel inválido), `:238-242` (avatar assinado com `createSignedUrl`) | — |
| #2082 (L8-3) | ✅ JA_NA_MAIN | `src/hooks/system/useUserSettings.ts:88,123-124,326` (`isError` + toast de falha de leitura) | — |

**Contagem:** ✅ JA_NA_MAIN 10 · 🗑️ OBSOLETA 3 · 🔁 DUPLICATA 1 · ⚠️ DECISAO_DONO 2 · 🔴 PERDIDA 1 · 🧾 DRIFT 0 · ❓ NAO_VERIFICADO 0

**Para o dono, por impacto**
1. ⚠️ **#2002 — sugestões ao vivo do copiloto.** Hoje o "cérebro" do copiloto no servidor é um esqueleto que devolve sempre a mesma resposta. Essa PR traz o motor de verdade (IA lendo a conversa e sugerindo a próxima resposta ao vendedor). Para ligar: precisa de uma mudança no banco de produção (um gatilho que não existe hoje) e gera custo de IA a cada mensagem do cliente. Decisão sua: ligar ou não.
2. ⚠️ **#2460 — 7 funções de IA do copiloto** (termômetro do lead, objeções, âncora de preço, risco de perda, prazo, recomendação de produto, análise de imagem). Hoje essas telas usam regras simples no navegador, sem IA. A PR troca por IA real (mais precisa, mas com custo por uso). As versões antigas #2215/#2216/#2217 ficam descartadas.
3. 🔴 **#2463 — ferramenta de migração de mídia (admin).** Só reorganiza o código para seguir o padrão do projeto; o usuário não percebe diferença. Prioridade baixa.

Achado lateral (fora do escopo, não corrigido): os painéis do copiloto das fases 8, 9, 10 e 8-15 existem no código mas não aparecem em nenhuma tela — só o da fase 7 está ligado ao chat (`src/components/inbox/chat/ChatInputArea.tsx`).

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:52:31Z adm01-debug =====
## RESULTADO LOTE 3 (parcial) — itens 1–22, 26, 28

| # | PR(s) | Caixa | Evidência |
|---|---|---|---|
| 1 | #213 | 🧾 DRIFT | `gmail-oauth/index.ts:264` ainda retorna `access_token` no path `refresh-token`; PR queria remover |
| 2 | #206 | 🧾 DRIFT | `20260903200000` ainda contém só bloco DO vazio (no-op); REVOKE real não foi aplicado |
| 3 | #123 | 🧾 DRIFT | `scripts/db-audit/migration-evidence.json` não tem exceções para `20260901100001` e `20260901200001`; apenas `100003` presente |
| 4 | #115 | ✅ JA_NA_MAIN | `supabase/migrations/20260901100001` (40 linhas) em main |
| 5 | #2486 | 🔴 PERDIDA | `20261031160000_copilot_radar_delta_columns.sql` ausente do main; tabelas `copilot_radar*` não existem em produção |
| 6 | #746 | ✅ JA_NA_MAIN | `20260925200000` em main; campo `endereco` em `useContactsCRUD.ts` |
| 7 | #2589 | 🧾 DRIFT | `20261102012200:84` ainda tem `extensions.gen_random_bytes(16)` em vez de `gen_random_bytes(16)` |
| 8 | #2539 | ✅ JA_NA_MAIN | `20261026240300` em main e aplicado em produção |
| 9 | #2505 | ✅ JA_NA_MAIN | `20261031170000` em main e aplicado em produção |
| 10 | #2483 | 🔴 PERDIDA | `20261031140000_copilot_sessions_brinde_state.sql` ausente; coluna `brinde_state` não existe em `copilot_sessions` em produção |
| 11 | #2226 | ✅ JA_NA_MAIN | `20261009193246` em main |
| 12 | #1999 | ✅ JA_NA_MAIN | `20261011010003` em main |
| 13 | #1086 #1099 | ✅ JA_NA_MAIN | `20260927540000` com UPDATE `agent_stats:171` em main |
| 14 | #1094 | ✅ JA_NA_MAIN | `20260927590000` + `20260927620000` em main |
| 15 | #981 | 🧾 DRIFT | `20260927290000` ainda com nome antigo; rename para `300000` não foi aplicado |
| 16 | #578 | ✅ JA_NA_MAIN | `20260902000200` com `job_id`/`avatars-refresh` em main |
| 17 | #552 #559 | ✅ JA_NA_MAIN | `20260924100800` (25 linhas) em main |
| 18 | #239 | ✅ JA_NA_MAIN | `20260906000002`/`000003` em main |
| 19 | #208 | ✅ JA_NA_MAIN | `evolution-go-adapter.ts` com `instanceName`; `migr 210334` em main |
| 20 | #911 | ✅ JA_NA_MAIN | `20260926230000` em main |
| 21 | #898 | 🗑️ OBSOLETA | Deleção de `20260926152000_search_contacts_returns_latlng.sql` não aplicada; arquivo ainda em main |
| 22 | #732 | ✅ JA_NA_MAIN | `20260925153100` em main |
| 26 | #2481 | ✅ JA_NA_MAIN | 8 políticas WITH CHECK ativas em produção; `20261101213000` aplicada |
| 28 | #2265 | ✅ JA_NA_MAIN | anon só tem INSERT em `password_reset_requests`; `20261026220300` aplicada |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:52:42Z adm01-debug =====
RESULTADO LOTE 9 (parcial) — itens 1–15

Base: main `478f4bc4` (corpo da issue). Diffs medidos com `merge-base(main, pr)` após `--unshallow`. Obs.: a Etapa A rodou em clone raso, então os "reverse NAO 0/118" de PRs que receberam merge da main eram falso-positivo: a #2431 tem 2 arquivos próprios, não 118.

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2431 #2552 | 🗑️ OBSOLETA | só teste (`src/test/setup.ts` mock clientHeight), shim de CI e dossiês `analise-prs/`; main já tem mock do virtualizer em `src/test/setup.ts:131-139`; X de fechar já tem `<span className="sr-only">Fechar</span>` em `ui/dialog.tsx`/`ui/sheet.tsx` | nenhum |
| #2088 | ✅ JA_NA_MAIN | `.safe-area-top/.safe-area-bottom/.scrollbar-none` em `src/styles/utilities.css:74-80` + contrato `src/styles/__tests__/mobileAreaSeguraRolagem.test.ts` | nenhum |
| #2026 | 🔁 DUPLICATA #2361 | Fase 12 do RADAR entrou por #2361 (`8748ebf2`): `useGuardrails`, `useLgpdFilter`, `useDataMasking`, `usePIIDetector`, `useBiasChecker`, `useVendorAuthorization` em `src/hooks/copilot/`; versão da PR (`usePromptInjectionGuard`, `useEmergencyStop`…) é implementação alternativa, 0 referências na main | nenhum |
| #2473 | ⚠️ DECISAO_DONO | liga 6 hooks a edges de IA (`ai-objection-handler`, `ai-deadline-calculator`, `ai-lead-temperature`, `ai-loss-risk`, `ai-price-anchor`, `ai-multimodal-analysis`) que **não existem** em `supabase/functions/` da main; hooks da main são só heurística local (0 `invokeEdge` em `useObjectionHandler.ts` etc.) | custo de IA por mensagem + depende das edges do LOTE 4 |
| #2213 | 🔁 DUPLICATA #2361 | mesmos hooks/painel (`RadarPhase8to15Panel.tsx`, `useObjectionHandler`, `useLeadThermometer`, `useDeadlineCalculator`) já na main via #2361 e dedupe #2379; tabelas `copilot_*` existem em prod (10) | nenhum |
| #2032 | 🔁 DUPLICATA #2361 | Fase 15 entrou só como `useCostDashboard.ts`; rollout/piloto/feature-flag da PR têm 0 referências na main (versão descartada) | nenhum |
| #2025 | 🔁 DUPLICATA #2361 | Fase 11: `useAudioTone`, `useBrandColors`, `useLogoAnalysis`, `useMediaPrivacy`, `usePdfExtraction` na main | nenhum |
| #2022 | 🔁 DUPLICATA #2361 | Fase 9: `useDeadlineCalculator`, `useQuoteDraft`, `useUpsellSuggestion`, `QuoteDraftCard.tsx` na main | nenhum |
| #2015 | 🔁 DUPLICATA #2361 | painel unificado = `RadarPhase8to15Panel.tsx` (main); `RadarMasterPanel`/`useRadarOrchestrator` 0 refs | nenhum |
| #2013 | 🔁 DUPLICATA #2361 | Fase 8: `useBattleCard`, `useDiscountGuardrail`, `useLossRiskDetector`, `useMinQuantityAlert`, `ObjectionCard.tsx` na main | nenhum |
| #2012 | 🔁 DUPLICATA #2361 | Fase 14: `useCopilotLearning`, `usePromptVersioning`, `useAiJudge` na main; `useABTest` 0 refs | nenhum |
| #2011 | 🔁 DUPLICATA #2361 | Fase 13: `useSupervisorDashboard`, `useCoachingTip`, `useWhisperChannel` na main | nenhum |
| #2010 | 🔁 DUPLICATA #2361 | Fase 11 (2ª versão): `useImageAnalysis`/`useAudioTranscription` na main | nenhum |
| #2009 | 🔁 DUPLICATA #2361 | Fase 12 (2ª versão): `useLgpdFilter`/`useGuardrails` na main | nenhum |
| #2007 | 🔁 DUPLICATA #2361 | Fase 10: `useLeadThermometer`, `useSpeedToLead`, `useFollowUpTiming`, `useSilenceDetector`, `useFirstResponseScript` na main | nenhum |

Achado lateral (não é PR do lote): `RadarPhase8to15Panel` só é exportado em `src/components/copilot/index.ts:42`; nenhum arquivo fora de `copilot/` o importa. O chat monta só `RadarPhase7Panel` (`src/components/inbox/chat/ChatInputArea.tsx:7,200`). As fases 8–15 estão na main mas não aparecem para o vendedor.

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:52:57Z adm01-debug =====
RESULTADO LOTE 9 (parcial) — itens 16–30

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2601 | ✅ JA_NA_MAIN | superado: main tem `AUTH_LOGIN_TIMEOUT_MS = 30_000` em `src/lib/serverLogin.ts:93` (a PR pedia 25s) | nenhum |
| #2542 | 🗑️ OBSOLETA | só `.github/workflows/db-guard.yml`, `scripts/db-audit/*.test.sh`, `PENDENCIAS.md`/`RELATORIO_CI.md` | nenhum |
| #2515 | 🗑️ OBSOLETA | só `scripts/db-audit/multiplix-send-mutation.py` (baseline de CI) | nenhum |
| #2083 #2437 | ✅ JA_NA_MAIN | `NPSDashboard.tsx:46` lê `error/isTruncated/refetch`; `:63` ramo de erro, `:143` aviso de teto | nenhum |
| #2426 | ✅ JA_NA_MAIN | a PR removia o canal realtime de `useAuditLogDashboard.ts`; main já não tem `channel`/`postgres_changes` nesse hook; prod: `audit_logs` fora de `supabase_realtime` (0 linhas em `pg_publication_tables`); resto é workflow/baseline de CI | nenhum |
| #2250 #2274 | ✅ JA_NA_MAIN | os 8 RPCs adicionados (`admin_list_cron_jobs`, `admin_toggle_cron_job`, `app_bootstrap`, `enqueue_group_outbound_message`, `inbox_unread_total`, `search_email_threads`, `warroom_agent_today`, `warroom_queue_stats`) estão em `src/integrations/supabase/types.ts` da main; resto é `scripts/ci` + relatórios | nenhum |
| #2125 | 🗑️ OBSOLETA | só workflows + `scripts/db-audit`/`scripts/ci` (GA18/GA19) | nenhum |
| #2084 | ✅ JA_NA_MAIN | `src/components/leaderboard/Leaderboard.tsx:26` lê `error`; `:52-53` ramo `data-leaderboard-state="error"` | nenhum |
| #2081 | ✅ JA_NA_MAIN | `useDiagnosticsData.ts:291` captura `connectionsCountError` e `:317` classifica a saúde; 0 `throw connectionsCountError` | nenhum |
| #2074 | ✅ JA_NA_MAIN | `src/hooks/ui/useScreenProtection.ts:119-120` `role="alert"` + `aria-live="assertive"` | nenhum |
| #2073 | ✅ JA_NA_MAIN | `useKnowledgeBase.ts:61,73` estado `error`; `KnowledgeBaseView.tsx:33,120,143` ramo `kb-error` | nenhum |
| #1929 | ✅ JA_NA_MAIN | W59 fail-closed em `scripts/edge-deploy/secrets-scope.mjs:69` e `:144-147` (`process.exit(1)`) | nenhum |
| #1699 | ✅ JA_NA_MAIN | `src/main.tsx:80` `if (!document.querySelector('main')) return;` antes de reportar o axe | nenhum |
| #119 #734 #1076 #1206 | ✅ JA_NA_MAIN | E08: upsert `onConflict: 'whatsapp_connection_id,external_id,sender', ignoreDuplicates` em `_shared/evolution-webhook-messages.ts:988`; vault: migration `20260925190000_whatsapp_connections_instance_token_vault` na main **e** em prod (coluna `instance_token_secret_id`, RPCs `get_instance_token`/`set_instance_token`); attestation: `maxAttempts = 144` em `stable-inventory.mjs:55`, e a regra `version null` foi endurecida depois (R2-INF-017, `:112-128`). A #119 tinha erro de sintaxe (`Date.now.)`) | nenhum |
| #465 #555 #655 | 🗑️ OBSOLETA | só `supabase/schema-manifest.json` (artefato derivado, regenerado pelo `types-sync`) | nenhum |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:53:08Z adm01-debug =====
RESULTADO LOTE 7 (parcial) — itens 1–15

Base: main `478f4bc4`; produção conferida só leitura (1092 migrations, última `20261107170000`, igual ao corpo da issue). Nenhuma PR deste lote traz migration.

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2433 | 🔁 DUPLICATA #2459 | `src/hooks/inbox/useInboxBulkActions.ts:223` (`validFromArchived` open/pending, resto cai em `open`) | desfazer arquivamento não falha mais |
| #2467 | 🔴 PERDIDA | main devolve `open` para quem era waiting/resolved/closed (`useInboxBulkActions.ts:223-228`); FSM de produção `enforce_conversation_status_transition` permite open→waiting/resolved/closed, então o desfazer em 2 passos da PR é viável | estende a regra: hoje "desfazer" reabre conversa que estava resolvida/aguardando |
| #2534 | 🔴 PERDIDA (baixo) | main lança erro quando RLS bloqueia a leitura ou não sobra alvo (`useInboxBulkActions.ts:187,201` → toast.error `:243`) | operador vê "Erro ao arquivar" vermelho em vez de aviso neutro |
| #2030 | 🔁 DUPLICATA #2361 | RADAR Fases 8–15 (CV-071–150) entrou por #2361 (`src/components/copilot/RadarPhase8to15Panel.tsx:2`) | — |
| #2029 | 🔁 DUPLICATA #2361 | idem (`useCopilotSupervisor.ts`, `useWhisperChannel.ts` criados em #2361) | — |
| #2006 | 🔁 DUPLICATA #2005 | Fase 7 (CV-061–070) em `RadarPhase7Panel.tsx` (#2005), ligada na Inbox por #2288 (`ChatInputArea.tsx:200`) | — |
| #2003 | 🔴 PERDIDA | pop-up RADAR Fase 6 (CV-051–060) não existe: sem `RadarPanel`/`useRadarPanel` em `src/`; plano em `docs/plans/PLANO_COPILOTO_VENDAS_AO_VIVO_150_ETAPAS_2026-10-16.md:406`. Parte `nextBestActionKey` já está na main (`useNextBestAction.ts:34`) | coincide com o plano: vendedor não tem o painel flutuante do RADAR (modos, atalhos, "não perturbe") |
| #741 | 🔁 DUPLICATA #754 | `ContactRegionMap.tsx` criado por #754 e usado em `ContactMapView.tsx:124` | — |
| #250 | 🗑️ OBSOLETA | diff restante = ajustes visuais de sparkline/imports sobre base de 2026-09-06; módulo Contatos redesenhado depois (#1364, e14ddeab5) | — |
| #180 | ✅ JA_NA_MAIN | `src/hooks/system/useNavigationHistory.ts:138-168` (`?view=` canônico, `#hash` migrado) | — |
| #2541 | 🔴 PERDIDA (mínimo) | separador `•` segue `text-border` em `src/components/email/EmailChatInbox.tsx:315` | contraste baixo de um separador decorativo no topo do e-mail |
| #2273 #2540 | ✅ JA_NA_MAIN | extensão/contentType reais do áudio em `src/services/chat.service.ts:60-72`; resto é teste/CI | — |
| #2513 | ✅ JA_NA_MAIN | `src/styles/accessibility.css:41` (`--muted-foreground ... !important` no `.dark.high-contrast`) | — |
| #2464 | ✅ JA_NA_MAIN | `src/components/queues/QueueAlertsDisplay.tsx:93` (aria-label único) | — |
| #2244 #2441 | ✅ JA_NA_MAIN | 8 RPCs presentes em `types.ts` (admin_list_cron_jobs…warroom_queue_stats); fila offline por usuário em `outbound-message.service.ts:379-412` e limpeza no logout `useAuth.tsx:28` | — |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:53:08Z adm01-debug =====
RESULTADO LOTE 9 (parcial) — itens 31–39

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #606 | 🔴 PERDIDA | a barra global de trilha foi removida (0 `BreadcrumbBar` em `src/`), mas `AppShell.tsx:70` ainda põe `hidePageBreadcrumbs: !isMobile && !isZen` e `PageHeader.tsx:79-81` esconde a trilha da tela. O teste `PageHeader.trilha.test.tsx:20` fixa esse comportamento ("desktop não desenha a trilha"). **Contradiz** a regra vigente | no computador, nenhuma tela mostra o caminho de navegação ("Início › Seção › Tela") |
| #45 | 🗑️ OBSOLETA | só `scripts/db-audit/check-mcp-exec-acl.test.sh` (CI) | nenhum |
| #117 #312 #951 #2772 | 🗑️ OBSOLETA | artefatos derivados (`types.ts`, `schema-catalog.json`, `schema-manifest.json`); todo objeto que adicionam em `types.ts` já está na main | nenhum |
| #703 #1690 #2760 | 🗑️ OBSOLETA | idem + `grants-baseline.json`; `dashboard_kpi` existe na main (`types.ts:12879`) e em prod (2 overloads) | nenhum |
| #644 | 🗑️ OBSOLETA | idem (`agent_presence` no manifest/catalog/baseline) | nenhum |
| #598 | ✅ JA_NA_MAIN | `AppHeader.tsx` e `HeaderSectionAnchor.tsx` não existem na main e `AppShell.tsx` não os importa | nenhum |
| #2468 #2484 | 🔁 DUPLICATA #2239 | #2239 mergeada em 2026-10-30; `PERIOD_OPTIONS` Hoje/Semana/Mês em `src/hooks/analytics/useGoalsDashboard.ts:21-24` | nenhum |
| #2478 | 🔴 PERDIDA | C007 da triagem não bate: a #2223 mergeada redesenhou o modal, não as cores. Na main, Média continua azul (`medium: 'bg-primary/15 …'` em `tasks/shared/PriorityChip.tsx:6` e `PriorityPill.tsx:14`) e Alta continua âmbar. A PR quer Média âmbar, Alta vermelho contorno e Urgente vermelho cheio. **Contradiz** a escala vigente | na tela de tarefas, prioridade Média parece "selecionada" (azul) e Alta não parece urgente |
| #1930 | 🗑️ OBSOLETA | só `scripts/db-audit/check-migration-drift.mjs` + teste (`--classificar`, W21). A #1947 tratou o W21 de outro jeito; ferramenta de CI | nenhum |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:53:19Z adm01-debug =====
RESULTADO LOTE 9

39 itens (53 PRs): ✅ JA_NA_MAIN 13 · 🔁 DUPLICATA 13 · 🗑️ OBSOLETA 10 · 🔴 PERDIDA 2 · ⚠️ DECISAO_DONO 1 · 🧾 DRIFT 0 · ❓ NAO_VERIFICADO 0. Detalhe nas 3 parciais acima.

**Por impacto:**

1. ⚠️ **#2473 — Copiloto RADAR com IA de verdade.** Hoje as dicas do copiloto (objeção, prazo, temperatura do lead, risco de perda, preço) usam só regras simples no navegador. A PR as ligaria a 6 serviços de IA que ainda não existem no sistema. Para trazer isso de volta é preciso decidir se vale o **custo de IA por mensagem** e reaproveitar as edges de IA do LOTE 4.
   - Ligado a isso (achado, não é PR): o painel das fases 8–15 do copiloto está no código mas **não aparece no chat**. Só o painel da fase 7 está montado (`ChatInputArea.tsx:200`). Sem isso, nem a versão sem IA chega ao vendedor.
2. 🔴 **#606 — Caminho de navegação some no computador.** A barra de cima que mostrava "onde estou" foi removida, mas as telas continuam escondendo o próprio caminho, achando que a barra ainda existe. No desktop o usuário não vê em que seção está. A correção é de 1 linha (`AppShell.tsx:70`), mas um teste atual fixa o comportamento de hoje, então confirme que a trilha deve voltar.
3. 🔴 **#2478 — Cores de prioridade das tarefas.** Hoje a prioridade Média aparece azul, a mesma cor de "selecionado", e a Alta aparece amarela. A PR muda a escala para cinza, âmbar, vermelho e vermelho forte. É uma escolha visual que contradiz a escala atual: decida qual vale.

Sem 🧾 DRIFT. A migration de token por instância no cofre (#734) já está na main e em produção.

Nota de método: a Etapa A mediu em clone raso. Os "reverse NAO 0/N" de PRs que receberam merge da main (ex.: #2431 com "118 arquivos", na verdade 2) eram falso-positivo. Vale reconferir os outros lotes com `--unshallow`.

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:53:21Z adm01-debug =====
RESULTADO LOTE 7 (parcial) — itens 16–31

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2193 #2417 | 🗑️ OBSOLETA | só mock de `clientHeight` em `src/test/setup.ts` (teste) | — |
| #2354 #2356 | 🗑️ OBSOLETA | gambiarra de tipo para `is_pinned`; `types.ts` já tem a coluna e `contact.service.ts:175` grava `is_pinned` tipado | — |
| #2316 | ✅ JA_NA_MAIN | `src/components/contacts/ContactsView.tsx:128` (`h1 sr-only`) e `:199` (folga para o FAB) | — |
| #2251 | ✅ JA_NA_MAIN | `src/hooks/inbox/useInboxFilters.ts:97,165` (`?type=` via `useSearchParams`) | — |
| #2233 | ✅ JA_NA_MAIN | HZ5-09 em `useTeamChatNotifications.ts:161` (tópico único); SL-070 em `useAuth.tsx:28`; a PR ainda trazia texto corrompido (mojibake) | — |
| #2198 | ✅ JA_NA_MAIN | aba "Tarefas agendadas" em `src/components/admin/AdminView.tsx:47,188`; as 4 abas "em desenvolvimento" da PR eram placeholder para teste | — |
| #2189 | ✅ JA_NA_MAIN | aviso desktop do War Room em `src/hooks/business/useWarRoomAlerts.ts:151`; resto CI/teste | — |
| #2135 | ✅ JA_NA_MAIN | mesmo conteúdo de #2316 (`ContactsView.tsx:128,199`) | — |
| #2128 | 🗑️ OBSOLETA | só workflows/scripts de CI/lint, sem banco | — |
| #2090 | ✅ JA_NA_MAIN | fila offline por usuário: `outbound-message.service.ts:379-412` (`readAuthenticatedUserId`) | — |
| #2023 | ✅ JA_NA_MAIN | `useNextBestAction.ts:34` exporta `nextBestActionKey`; `workItemAggregates.ts:52` com `isOverdue` único | — |
| #1985 | ✅ JA_NA_MAIN | `src/components/inbox/chat/ChatMessagesArea.tsx:122,128` (`cancelScroll`) | — |
| #1980 | ✅ JA_NA_MAIN | 3 arquivos de código revertem limpo sobre a main; `bun.lock` superado | — |
| #1142 #1149 #1153 | ✅ JA_NA_MAIN | `useConversationTasks` não existe mais; insert em `src/hooks/tasks/useMyWorkItems.ts:332-333` grava `created_by`/`assigned_to` explícitos | — |
| #149 | 🗑️ OBSOLETA | `MediaGallery.tsx` removido como órfão por #639 | — |
| #2197 | 🗑️ OBSOLETA | só CI/workflows/scripts | — |
| #384 | 🔁 DUPLICATA #301 | redesign "fidelidade carvão" entrou por #301; integridade do envio de arquivo refeita na main (`useFileUploadLogic.ts:214-250`, R2-INB-006) | — |
| #2146 | 🔴 PERDIDA (baixo) | `TeamChatView.tsx` não lê `?cid=`; e o emissor também falta: `useTeamChatNotifications.ts:243` navega para `team-chat` sem id | estende: clicar na notificação do Team Chat abre a tela, mas não a conversa |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:53:31Z adm01-debug =====
RESULTADO LOTE 7 — contatos/chat/inbox

31 itens, 39 PRs: ✅ JA_NA_MAIN 20 · 🔁 DUPLICATA 6 · 🗑️ OBSOLETA 8 · 🔴 PERDIDA 5 · ⚠️ DECISAO_DONO 0 · 🧾 DRIFT 0 · ❓ NAO_VERIFICADO 0. Nenhuma PR do lote mexe em banco.

**O que ficou para trás, por impacto:**

1. 🔴 **#2003 — pop-up do RADAR (Fase 6 do copiloto de vendas).** O painel flutuante do copiloto, com modos de exibição, atalhos e "não perturbe", nunca chegou à main. As fases 7 a 15 entraram, então hoje o vendedor vê as sugestões só embutidas na caixa de digitação. Prova: não existe `RadarPanel` em `src/`; plano em `docs/plans/PLANO_COPILOTO_VENDAS_AO_VIVO_150_ETAPAS_2026-10-16.md:406`.
2. 🔴 **#2467 — "Desfazer" arquivamento em massa volta a conversa para "aberta".** Uma conversa que estava resolvida ou aguardando e foi arquivada por engano volta como aberta, não ao estado anterior. A PR restaurava o estado original, e o banco de produção permite essa volta. Prova: `useInboxBulkActions.ts:223-228`.
3. 🔴 **#2146 — notificação do Team Chat não abre a conversa.** O clique leva à tela do Team Chat, mas o atendente precisa procurar a conversa. Para resolver, falta a parte que manda o id da conversa (`useTeamChatNotifications.ts:243`) e a que lê esse id (`TeamChatView.tsx`).
4. 🔴 **#2534 — mensagem errada ao arquivar sem permissão.** Quando o usuário não pode ler as conversas selecionadas, aparece "Erro ao arquivar contatos" em vermelho, em vez de um aviso neutro. Prova: `useInboxBulkActions.ts:187,201,243`.
5. 🔴 **#2541 — contraste do separador no topo do e-mail.** É só visual, num ponto decorativo. Prova: `EmailChatInbox.tsx:315`.

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:56:39Z adm01-debug =====
RESULTADO LOTE 2 (parcial) — itens 1–15

Base: main `478f4bc`, produção `tnnnlkbymytvtqngbbqh` (só leitura). Diff de cada PR = `base.sha...head` da própria PR (o merge-base com a main atual é antigo por causa da reescrita de histórico em #2747).

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2219 | 🗑️ OBSOLETA | correção de testes de baseline de 24/10; 44 de 49 arquivos de produto já divergem da main (main evoluiu); `useTalkXSuppression.ts` main 293 linhas ≠ PR 274 | nenhum |
| #2214 | 🔁 DUPLICATA #2420 | SQL idêntico (normalizado) em `supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql`; versão no ledger de prod | nenhum |
| #2199 | 🗑️ OBSOLETA | só testes/infra de teste; 0/8 arquivos de produto aplicáveis; sobra extraída para #2431 (CI) | nenhum |
| #2190 | ⚠️ DECISAO_DONO | migration `20261023100000_..._add_segment` ausente na main e no ledger; faz `DROP FUNCTION talkx_campaign_recipients_page` + recria com `p_segment_id`; #2430 (que a preservava) fechada sem merge; front `TalkXRecipientsTable.tsx:71` chama sem segmento | lista de destinatários do Talk X não filtra por segmento |
| #2187 | 🗑️ OBSOLETA | fixes de teste de 22/10; 0/15 arquivos de produto aplicáveis (todos substituídos na main) | nenhum |
| #2145 | 🗑️ OBSOLETA | só CI/workflows/scripts de CI (0 arquivos de produto) | nenhum |
| #2143 | 🗑️ OBSOLETA | só CI/workflows/scripts de CI | nenhum |
| #2142 | 🗑️ OBSOLETA | só CI/workflows/scripts de CI | nenhum |
| #2137 | ✅ JA_NA_MAIN | `pg_policies` de `team_message_receipts` em prod = SQL da PR (INSERT/SELECT canônicos); main cria em `20260927270016_team_chat_e26_fix_receipt_insert_policy.sql` e `20260928430000_team_chat_fix_policies_to_authenticated.sql` | nenhum |
| #2126 | 🗑️ OBSOLETA | só CI/workflows/scripts de CI (224 arquivos, 0 de produto) | nenhum |
| #2085 | ✅ JA_NA_MAIN | `WhatsAppTemplatesManager.tsx:37` `canWrite = isSupervisor` (= admin ou supervisor, `useUserRole.ts:116`), igual à RLS de prod (`is_admin_or_supervisor`). A PR restringia só a admin, o que contradiria a RLS | nenhum |
| #2080 | ✅ JA_NA_MAIN | `useTeamChatNotifications.ts:161` canal com `uniqueRealtimeTopic`; `:240` `showBrowserNotification`; `:254` deps só `profile` | nenhum |
| #2066 | ✅ JA_NA_MAIN | `useAudioMemes.ts:210` `${user.id}/meme_...` | nenhum |
| #2000 | ⚠️ DECISAO_DONO | colunas Fase 4 já em prod (#2424); UI B·R·I·N·D·E (`BrindeMeter`, `StakeholdersCard`, `useCopilotSession` etc., 11 arquivos) ausente na main; depende do motor de #1998 | painel de inteligência B·R·I·N·D·E não existe para o vendedor |
| #1998 | ⚠️ DECISAO_DONO | `copilot-live/index.ts:1-8` na main é **stub** ("retorna resposta estática"); motor real (2 andares haiku/forte) ausente; substituto #2381 fechado sem merge; RPC `merge_brinde_state` existe em prod mas ninguém chama | copiloto RADAR não analisa a conversa; liga custo de IA |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:04Z adm01-debug =====
RESULTADO LOTE 2 (parcial) — itens 16–30

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #1997 | ⚠️ DECISAO_DONO | `copilot_sessions/insights/feedback` existem em prod (versões novas); **ausentes** em prod e main: trigger `enqueue_copilot_tick_on_contact_message`, tabela `copilot_presence` + RPCs, `copilot_retention_aggregates` + `run_copilot_retention` (catálogo: 0 objetos) | sem disparo automático do copiloto a cada mensagem e sem expurgo de 90 dias |
| #1991 | 🔴 PERDIDA | `ChatMessagesArea.tsx:128` ainda cancela o scroll sempre que sai do fim; `:312` `scrollToIndex` do "ir para mensagem" sem a guarda `isProgrammaticScrollRef` da PR. Comentário de fechamento dizia "delta vazio" — falso para este arquivo | coincide com a regra vigente; ao clicar numa mensagem citada/resultado de busca o chat pode parar no meio do caminho |
| #1987 | 🗑️ OBSOLETA | sincronização de ledger (codex); 4 migrations da PR em prod e na main; 29 arquivos de produto divergem, nenhum ausente | nenhum |
| #1983 | 🗑️ OBSOLETA | lote 880: 2343/2990 arquivos já na main; 7 ausentes são de features removidas de propósito (`20261103201500_remove_pagamentos_e_special_agent.sql` dropa `contact_purchases`; tabela inexistente em prod); `talk_me_list_pending_messages` em prod como `20261011010003` | nenhum |
| #1979 | 🗑️ OBSOLETA | plano em docs + baselines de CI; 0/4 arquivos de produto aplicáveis (main evoluiu) | nenhum |
| #1730 | 🔁 DUPLICATA #1805 | mesma correção Sonar S7773 reaplicada e mergeada em 03/10; 17/38 arquivos idênticos, resto evoluiu | nenhum |
| #1333 | 🗑️ OBSOLETA | main mantém `CREATE POLICY IF NOT EXISTS` em `20260916230000_talkx_e93_settings.sql:14`, mas trata via `scripts/db-audit/replay-known-failures.json:19` + `talkx-settings-replay-idempotent.test.sh` (regra: não editar migration aplicada) | nenhum |
| #1150 | 🗑️ OBSOLETA | trocava 7 migrations por stubs; as 7 versões estão no ledger de prod e com conteúdo completo na main | nenhum |
| #1080 | 🗑️ OBSOLETA | 580000/590000/620000 no ledger e na main | nenhum |
| #1077 | 🗑️ OBSOLETA | 5 versões no ledger e na main (2 idênticas) | nenhum |
| #1073 | 🗑️ OBSOLETA | 580000/590000/620000 no ledger e na main (2 idênticas) | nenhum |
| #1041 #1054 | ✅ JA_NA_MAIN | `add_department_rls_policies` idêntico (520000); `talkx_e27_realtime_campaign_events` com SQL idêntico em `20260927500001` (main + ledger) | nenhum |
| #1045 | 🗑️ OBSOLETA | reconciliação 510000–590000: todas as versões no ledger e na main; e27 em 500001 | nenhum |
| #1022 | 🔁 DUPLICATA #1078 | todos os objetos da PR estão em `20260927540000_security_gamification_guards_e2e_cleanup_avg_null.sql` (main + ledger) | nenhum |
| #1021 | 🔁 DUPLICATA #1078 | todos os objetos da PR estão em `20260927530000_security_revoke_anon_9rpcs_wa_tag_search_path.sql` (main + ledger) | nenhum |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:05Z adm01-debug =====
RESULTADO LOTE 2 (parcial) — itens 31–40

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #1017 | 🗑️ OBSOLETA | 390000/400000/421000 no ledger e na main | nenhum |
| #947 | 🗑️ OBSOLETA | `20260926430000_multiplix_delivery_receipts` no ledger e na main (versão da main vale) | nenhum |
| #942 | ✅ JA_NA_MAIN | `20260927000001_audit_fix_fsm_rls_indexes.sql` na main é superconjunto da PR (mesmas funções/índices + REVOKE/GRANT talkx) e está no ledger | nenhum |
| #938 | 🔁 DUPLICATA #906 | SQL idêntico em `20260927200000_restrict_contacts_update_policy_role.sql`; prod: policy UPDATE de `contacts` em `{authenticated}` | nenhum |
| #875 | 🔁 DUPLICATA #885 | migration idêntica em `20260926800000_calls_telefonia_v2.sql` (ledger); `src/lib/calls/*` presentes e ampliados na main | nenhum |
| #742 #745 | 🔁 DUPLICATA #740 | `20260925162737_dashboard_fase3_contact_counts_rpc.sql` na main + ledger; `dashboard_contact_counts` sem EXECUTE para anon | nenhum |
| #720 | 🔁 DUPLICATA #753 | SQL idêntico em `20260925203000_revoke_anon_execute_cron_only_functions.sql` (main + ledger) | nenhum |
| #718 | 🔁 DUPLICATA #762 | SQL idêntico em `20260925223000_messages_update_policy_queue_parity.sql` (main + ledger) | nenhum |
| #653 | 🗑️ OBSOLETA | fix entrou por #657, depois a edge `sicoob-bridge-reply` saiu da main; prod sem função/trigger `sicoob` (catálogo: 0). Edge publicada: NÃO VERIFICADO (MCP não lista functions) | nenhum |
| #218 | 🔁 DUPLICATA #222 | 5 migrations no ledger e na main (4 idênticas); `record_failed_login` sem EXECUTE para anon/authenticated em prod; login passa pela edge `auth-login` | nenhum |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:05Z adm01-debug =====
RESULTADO LOTE 2

40 itens (42 PRs): ✅ 6 · 🔁 10 · 🗑️ 19 · ⚠️ 4 · 🔴 1 · 🧾 0 · ❓ 0. Detalhe nos 3 comentários "RESULTADO LOTE 2 (parcial)" acima.

**O que ficou pelo caminho, por impacto**

1. ⚠️ **Copiloto de vendas RADAR não funciona de verdade (#1997, #1998, #2000).** A tela e o banco do copiloto existem, mas o "cérebro" que lê a conversa e gera sugestões é um esboço que devolve sempre a mesma frase ("pergunte sobre orçamento e quantidade"). O motor real, o disparo automático a cada mensagem do cliente, o painel B·R·I·N·D·E e a limpeza de 90 dias ficaram nessas PRs fechadas. Decisão do dono porque ligar isso gera custo de IA por mensagem e cria tabela/gatilho em produção.
2. ⚠️ **Talk X: filtro de destinatários por segmento (#2190).** A lista de quem recebeu uma campanha não filtra por segmento. A correção apaga e recria uma função do banco de produção, por isso fica com o dono.
3. 🔴 **Chat: "ir para a mensagem" pode parar no meio (#1991).** Ao clicar numa mensagem citada ou num resultado de busca, a rolagem automática pode ser cancelada antes de chegar. A correção é de 1 arquivo, só front, e não chegou à main.

Nada em 🧾 DRIFT: nenhuma migration do lote está em produção sem estar na main.

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:22Z adm01-debug =====
## RESULTADO LOTE 5

Base: main `478f4bc4`. Produção `tnnnlkbymytvtqngbbqh` só leitura. 22 itens, 29 PRs.

| # | PR(s) | caixa | prova curta | efeito |
|---|---|---|---|---|
| 1 | #2104 #2111 #2208 #2230 | ✅ JA_NA_MAIN | `src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` existe; `useTalkXSuppression()` só exporta `useTalkXSuppressionActivity` e `useTalkXSuppressionStats` | — |
| 2 | #2558 | ✅ JA_NA_MAIN | `src/components/talkx/kit/primitives.tsx:46` — `ModuleBreadcrumb` recebe `onItemClick` prop | — |
| 3 | #2555 | 🔴 PERDIDA | `src/components/talkx/TalkXCampaignRunning.tsx` não importa `useTalkXLifecycle`; estado `pauseOpen`/`cancelOpen` ainda local (linhas 617/619) | Ciclo de vida de campanha desunificado em 5 telas; pausar/cancelar sem controle central |
| 4 | #2553 | 🔴 PERDIDA | `src/components/talkx/TalkXSuppression.tsx:736,787,845,881` ainda usa `Dialog` antigo; `TalkXDialogShell` existe em `dialogs.tsx:47` mas não é usado em Supressão nem TemplateEditor | Dialog visual inconsistente no módulo Supressão |
| 5 | #1351 | ✅ JA_NA_MAIN | `src/features/talk-me/TalkMeView.tsx:4` — `framer-motion` importado; `TalkMeQueueCard` em linha 180 | — |
| 6 | #2537 | ✅ JA_NA_MAIN | `src/components/admin/MediaMigrationTool.tsx:268` — `data-state="indeterminate"` | — |
| 7 | #2072 #2252 #2439 | ✅ JA_NA_MAIN | `src/hooks/integrations/__tests__/useTalkXSegments.rpcDesacoplada.test.ts` existe na main | — |
| 8 | #2264 | ✅ JA_NA_MAIN | Mesmo que item 1 — hook morto removido, módulo segue | — |
| 9 | #2249 | ✅ JA_NA_MAIN | `src/components/theme/__tests__/HighContrastToggle.test.tsx:80-84` — zero-rect mock corrige collision; solução diferente mas equivalente | — |
| 10 | #2221 | ✅ JA_NA_MAIN | `src/hooks/dashboard/useDashboardKpi.ts:107` — `{ queueId = null, agentId = null }` via desestruturação; `p_queue`/`p_agent` sempre null quando omitidos | — |
| 11 | #2218 | ✅ JA_NA_MAIN | `scripts/ci/ci-docs-baseline.unit.mjs:33` — RE_RECON aceita `[\[(]` e `[\])]` (cobre `[~]` e `(~)`); `src/hooks/auth/useAuth.tsx:28` — `offlineSendQueue.clear()` no SIGNED_OUT | — |
| 12 | #2211 | ✅ JA_NA_MAIN | `auto-update-pr-branch.yml` recriado (`17976eb8b`); `9a8d9ecc2 fix(security): atualiza types.ts`; nenhum `@ts-expect-error` nos hooks de transferência | — |
| 13 | #2195 | ✅ JA_NA_MAIN | `src/hooks/system/useOfflineCache.ts:107` — `effectiveData` é sempre array (nunca undefined); `useAuth.tsx:28` — `offlineSendQueue.clear()` para this-binding | — |
| 14 | #2129 | ✅ JA_NA_MAIN | Commit `b94be0a2c fix: GA09/GA62/GA75/GA92/GA98/GA100` na main cobre as fases 7+8 do plano GA75-GA95 | — |
| 15 | #2097 | ✅ JA_NA_MAIN | `src/hooks/integrations/useKnowledgeBase.ts:237` — `error` exposto no return | — |
| 16 | #2035 | ✅ JA_NA_MAIN | `src/test/setup.ts` via `volumeControlMocks.ts:12` — `vi.mock('@/lib/logger', …)`; commit `260c5297c` confirma | — |
| 17 | #2185 | 🗑️ OBSOLETA | Estrutura com §8/§9 não existe mais em `PENDENCIAS.md` (atual tem seções numéricas de bloqueios CI); a marcação de itens como RESOLVIDO foi feita por outros meios | — |
| 18 | #2788 | ✅ JA_NA_MAIN | `src/hooks/integrations/useTalkXCommandItems.ts:33` — `const enabled = !!open`; linhas 46/61/76 passam `enabled` para cada `useQuery` | — |
| 19 | #2196 #2548 | 🔴 PERDIDA | `src/pages/ViewRouter.tsx:140` usa `RestrictedView` genérico; `TalkXNoPermissionState` existe em `kit/states.tsx` mas não está importado/wired no ViewRouter | Tela "sem permissão" do Talk X sem botões de ação e visual correto |
| 20 | #2535 | ✅ JA_NA_MAIN | `src/components/talkx/TalkXSegments.tsx:56,63` — comentários X112/X111; linha 574 `SegmentDetailRail`; linha 780 botão `Recontar público` | — |
| 21 | #2480 | 🔴 PERDIDA | `src/components/ui/badge.tsx:7` — base do `cva` **não** tem `max-w-full min-w-0 truncate`; badge com texto longo transborda | Badge/Label cortam texto longo em toda a UI |
| 22 | #2091 #2113 | ✅ JA_NA_MAIN | Commit `33f4cab31 fix: remove set-presence, find-chats, find-status-messages` é ancestor de main; ação não está em nenhum action set de `evolution-control-authz.ts` | — |

---

### 🔴 Itens PERDIDOS — ação necessária (por impacto)

| # | Código | O que falta | Arquivo central | Efeito no produto |
|---|---|---|---|---|
| 21 | C297 | `max-w-full min-w-0 truncate` no `badgeVariants` base | `src/components/ui/badge.tsx:7` | Badge/Label/Chips com texto longo transborda visualmente em toda a UI |
| 3 | X051 | Integrar `useTalkXLifecycle` em `TalkXCampaignRunning` (e demais 4 telas) | `src/components/talkx/TalkXCampaignRunning.tsx:617-619` | Pausar/cancelar campanha sem controle central; lógica duplicada nas 5 telas |
| 4 | X050 | Substituir `Dialog` → `TalkXDialogShell` em Supressão e TemplateEditor | `src/components/talkx/TalkXSuppression.tsx:736,787,845,881` | Visual inconsistente; Supressão usa componente legado |
| 19 | X048 | Importar e wiring `TalkXNoPermissionState` no ViewRouter | `src/pages/ViewRouter.tsx:140` + `src/components/talkx/kit/states.tsx` | Usuário sem permissão vê tela genérica sem contexto/ação |

### 🗑️ Obsoleta

| # | Motivo |
|---|---|
| 17 | Estrutura §8/§9 de PENDENCIAS foi substituída; itens foram marcados por outros meios |

---

**Resumo:** 17 ✅ JA_NA_MAIN · 4 🔴 PERDIDA · 1 🗑️ OBSOLETA · 0 ⚠️/🧾/❓

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:22Z adm01-debug =====
RESULTADO LOTE 1 (parcial) — itens 1–15

Base: main `478f4bc` e foto de produção do corpo da issue. Prod consultada só leitura (`pg_proc`, `pg_policies`, `cron.job`, `schema_migrations`).

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2767 #2780 | ✅ JA_NA_MAIN | os 5 arquivos `20261107120000…133000` estão na main em versão mais completa (diff da PR só remove comentários); `20261107133000` em prod | nenhum |
| #2770 | 🗑️ OBSOLETA | `sql-sha256` já tem 0 ocorrências em `scripts/db-audit/migration-evidence.json` da main; resto é lint/CI (`useOfflineCache`, `--shm-size`) | nenhum |
| #2702 | ✅ JA_NA_MAIN | `scripts/supabase_snapshot/snapshot.py:1631` lê `SUPABASE_SNAPSHOT_PUBLICACAO`; `.gitignore:134` `__pycache__/` | nenhum |
| #2663 | ✅ JA_NA_MAIN | `scripts/regras_negocio/*` na main, consolidado em `.github/workflows/contexto.yml` (🔁 #2664 mergeada) | nenhum |
| #2661 | ✅ JA_NA_MAIN | `scripts/ai-context/gerar.mjs` na main, mesmo workflow `contexto.yml` (🔁 #2664) | nenhum |
| #2614 | 🗑️ OBSOLETA | só relatório `analise-prs/` (0 arquivo de código) | nenhum |
| #2603 | ✅ JA_NA_MAIN | policies `dept_invites_*_admin` e `department_invitations_*` estão em `20261102012200_department_invites_restringe_escrita.sql` (main) e em `pg_policies` de prod | nenhum |
| #2571 | ✅ JA_NA_MAIN | `src/components/contacts/ContactForm.tsx:158` `useLayoutEffect` atualiza `enderecoVigenteRef` | nenhum |
| #2186 #2561 | ✅ JA_NA_MAIN (🔁 #2570) | convites: #2570 mergeada, mesma migration (diferença só `extensions.gen_random_bytes`); TTL login: main `20261102012400_login_attempts_retencao_90d` + cron prod `login-attempts-retention-90d`; busca: main `20261031130000_search_event_rpc` + `log_search_event` em prod | nenhum |
| #2550 | 🔴 PERDIDA | main sem `src/lib/talkxCsv.ts`; `src/components/talkx/report/` não tem exportação CSV (grep `csv` = 0); X168 consta PARCIAL em `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv:1037` | estende a regra vigente: quem tem `can_download` exportaria o relatório Talk X em CSV; hoje não exporta |
| #2491 #2533 | ✅ JA_NA_MAIN | `20261030145126_copilot_fases13_15_tabelas.sql` na main (versão mais completa) e no ledger de prod | nenhum |
| #2531 | 🔴 PERDIDA | `talkx_campaign_queue_by_segment` ausente da main e de `pg_proc` | estende: fila da campanha por segmento (X058); sem tela que use hoje |
| #2530 | 🔴 PERDIDA | `talkx_template_metrics` / `talkx_template_library_kpis` ausentes da main e de prod | estende: métricas da biblioteca de templates (X086); sem tela que use hoje |
| #2529 | 🔴 PERDIDA | `talkx_campaign_heatmap/_ranking/_top_segments` ausentes da main e de prod; relatório atual usa só `talkx_campaign_report` (`TalkXCampaignReport.tsx:82`) | estende: heatmap/ranking/top segmentos (X074); sem tela que use hoje |
| #2238 #2466 #2496 #2528 | ⚠️ DECISAO_DONO | `mark_outbound_post_started` / `resolve_unconfirmed_message` ausentes da main e de prod; título marcado [DECISAO HUMANA]; mexe em migration de prod + edge `message-delivery` (fluxo 4 "Enviar mensagem", QUEBRADO em `docs/PRONTO_PRODUCAO.md:16`) | estende: registrar quando o envio ao WhatsApp começou e devolver erro estável (retentável/ambíguo), evitando mensagem duplicada |
| #295 | 🔁 DUPLICATA | fechada como superada por #298 (mergeada 2026-09-09) | nenhum |
| #592 | 🔁 DUPLICATA | mesmo commit reaplicado em #618 (mergeada 2026-09-24) | nenhum |
| #939 | 🗑️ OBSOLETA | mover para `_superseded/` quebraria o guard de drift (`check-migration-drift.mjs` exclui a pasta) | nenhum |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:39Z adm01-debug =====
RESULTADO LOTE 1 (parcial) — itens 16–30

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2525 | ✅ JA_NA_MAIN | `20261031170000_high3-fk-indexes.sql` e `20261101213000_rls_update_with_check_explicit.sql` idênticos na main (diff vazio) | nenhum |
| #2519 | 🗑️ OBSOLETA | só correções de CI/testes; retry do `fila-merge` já na main (`scripts/ci/fila-merge.mjs:34` `execComRetry`) | nenhum |
| #2514 | 🗑️ OBSOLETA | causa (histórico de 69 MB do cron) resolvida por outro caminho: main `20261102022200_cron_historico_retencao_7d` + cron prod `cron-historico-retencao-7d`; falhas do `talkx-scheduler-1min` em prod caíram de 9,3% para 23/10.074 (0,23%) em 7 dias. Lock/`query_canceled` da PR não existem em prod (`pg_get_functiondef`) | nenhum hoje; restam 23 falhas/semana |
| #2512 | 🗑️ OBSOLETA | branch de conflito (138 arquivos); o único delta de produto que ainda aplica (rótulo "Fechar" no diálogo) já existe: `src/components/ui/dialog.tsx:82` `sr-only` "Fechar" | nenhum |
| #2105 #2511 | 🗑️ OBSOLETA | mega-branch GR-030 (351 arq.); #2105 fechada com delta zero; o que ainda aplica em #2511 é stub (ex.: `ConnectWhatsAppDialog` mock com `if (!open) return null`) | nenhum (aplicar regrediria) |
| #2414 #2506 | 🗑️ OBSOLETA | só `auditoria-supabase/` (inventários + propostas `.sql` não aplicáveis); auditoria superada | nenhum |
| #744 | 🔁 DUPLICATA | recriada em #752 (mergeada 2026-09-25); migration `20260925190001` na main | nenhum |
| #1463 | 🔁 DUPLICATA | refeita em #1511 (mergeada); `src/components/inbox/LocationPicker.tsx:154` registra `location_sent` | nenhum |
| #1624 | 🗑️ OBSOLETA | editava migration já aplicada (proibido); `20260916230000_talkx_e93_settings.sql` tratado em `scripts/db-audit/replay-known-failures.json:19` | nenhum |
| #2108 #2502 | 🗑️ OBSOLETA | auditoria de CI antiga; a versão `20261016250000` em prod/main é `revoke_anon_write_grants_all_tables` (colisão de versão); `e2e_fixture_message` só existe em `docs/_arquivo`; diff removeria 1.219 linhas de `evolution-api/index.ts` | nenhum (aplicar regrediria) |
| #2138 | 🗑️ OBSOLETA | só CI ("main já verde", GR-003) | nenhum |
| #2500 | ⚠️ DECISAO_DONO | `commit_copilot_tick` ausente da main e de prod; `_shared/copilot-tick.ts` não existe na main | estende: motor do Copiloto RADAR (custo de IA + escrita em produção) |
| #2498 | ✅ JA_NA_MAIN | `src/hooks/admin/useSearchInsights.ts:71` chama `search_insights(p_days)`; função existe em prod | nenhum (só comentário antigo em `SearchInsightsView.tsx:4`) |
| #2396 #2490 | 🗑️ OBSOLETA (🔁 #2458) | docs + `deno.json`; #2458 mergeada substituiu | nenhum |
| #2487 | ⚠️ DECISAO_DONO | `20261030200000_copilot_live_motor`: trigger `trg_copilot_tick_on_contact_message` em `messages` ausente da main e de prod | estende: cada mensagem do cliente dispararia análise do Copiloto (custo + trigger na tabela mais quente) |
| #2485 | ⚠️ DECISAO_DONO | prod hoje (via #2763): `copilot_learning_moments_insert` = `tagged_by = auth.uid()`, `copilot_conversation_scores_update` = `scored_by = auth.uid()`; PR queria só supervisor/admin | contradiz a vigente: hoje qualquer vendedor marca/pontua a própria conversa; a PR restringiria a supervisor/admin |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:57:55Z adm01-debug =====
RESULTADO LOTE 1 (parcial) — itens 31–40

| #PR(s) | caixa | prova curta | efeito |
|---|---|---|---|
| #2461 | ✅ JA_NA_MAIN | `20261030145126_copilot_fases13_15_tabelas.sql` na main (versão reconciliada) e no ledger de prod; policy `copilot_learning_moments_insert` em prod | nenhum |
| #2151 #2445 | 🗑️ OBSOLETA | mega-branch de CI (325 arq.); nas edges o diff **remove** 29 linhas de `_shared/evolution-control-authz.ts` e 90 de `evolution-api/index.ts` que existem na main | nenhum (aplicar regrediria segurança) |
| #2155 #2444 | 🗑️ OBSOLETA | CI + pareamento Evolution; main já traduz rotas v2→GO em `_shared/evolution-go-routes` (`translateV2ToGo` testado com `/instance/connect`) | nenhum |
| #2139 #2443 | 🗑️ OBSOLETA | só CI/workflows; nenhum trecho de produto aplica limpo na main (0 de 12 arquivos de `src/`) | nenhum |
| #2442 | ✅ JA_NA_MAIN | `supabase/functions/connection-health-check/index.ts:237` `prefMatchesKind`; RPC de busca em `20261031130000_search_event_rpc` (main + prod); `search_insights` no hook | nenhum |
| #2419 | ⚠️ DECISAO_DONO | motor RADAR (`_shared/copilot-tick.ts`, `ai-jobs-worker`) ausente da main; substituta #2486 também fechada sem merge | estende: Copiloto ao vivo no atendimento (custo de IA; nasce desligado) |
| #2381 | 🔁 DUPLICATA | mesma branch/título de #2419 (recriada) | ver #2419 |
| #2277 | ✅ JA_NA_MAIN | as 3 migrations (`20261026220300`, `230300`, `240300_drop_bkp_261023`) na main em versão mais completa; `20261026240300` no ledger de prod | nenhum |
| #2269 | 🔴 PERDIDA | `src/components/talkx/TalkXSegments.tsx:508,540` ainda mostra `estimated_count` direto; não há `seenInListRef` nem "—" para estimativa nula | coincide com a regra vigente (público estimado), corrige exibição: hoje o Talk X pode mostrar público estimado desatualizado e manter um segmento já excluído selecionado |
| #2263 | ✅ JA_NA_MAIN | `src/components/settings/SettingsView.tsx:225` passa `isSaving`/`onSave` | nenhum |
| #2266 | 🔴 PERDIDA | commits `c32f113a` (tolerância de relógio em `useAgentCelebrations`) e `3ba5cf45` (filtro de tipo segue voltar/avançar em `useInboxFilters`) aplicam limpo = ausentes; a11y da paleta já parcial na main (`command-palette.tsx:249,271`) | coincide: atendente pode ver "conquista" falsa ao abrir o app e o filtro de tipo do inbox não acompanha o botão voltar |
| #2267 | ✅ JA_NA_MAIN | commit `e84afb82` (fila offline sem dono/pós-logout) aplica ao contrário = já na main | nenhum |
| #2268 | ✅ JA_NA_MAIN | `src/components/catalog/WhatsAppTemplatesManager.tsx:37` `isSupervisor: canWrite`; `useKnowledgeBase.ts:73` trata erro | nenhum |
| #2261 | ✅ JA_NA_MAIN | `20261026210300_reconcile_team_reactions…` na main e em prod; retry em `fila-merge.mjs:34` | nenhum |
| #2246 | ✅ JA_NA_MAIN | retry HTTP transitório em `scripts/ci/fila-merge.mjs:34` (`execComRetry`, 4 tentativas) | nenhum |
| #2245 | 🔁 DUPLICATA (de #2514 → 🗑️) | mesma migration `20261026200300_fix-talkx-cron-startup-timeout` | ver #2514 |

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:58:10Z adm01-debug =====
RESULTADO LOTE 1

40 itens, 63 PRs analisadas (main `478f4bc`, produção só leitura). Detalhe por PR nos 3 comentários "RESULTADO LOTE 1 (parcial)" acima.

**Contagem por PR:** ✅ JA_NA_MAIN 21 · 🗑️ OBSOLETA 22 · 🔁 DUPLICATA 6 · 🔴 PERDIDA 6 · ⚠️ DECISAO_DONO 8 · 🧾 DRIFT 0 · ❓ NAO_VERIFICADO 0

### ⚠️ Precisam de decisão do dono (por impacto)
1. **Envio de mensagem sem duplicar — #2238 #2466 #2496 #2528.** Registraria o momento em que o envio ao WhatsApp começou e daria um código de erro claro ("pode tentar de novo" × "talvez já tenha ido"). Isso evita mandar a mesma mensagem duas vezes ao cliente. Mexe no banco de produção e no envio (fluxo 4, hoje marcado QUEBRADO). Nada disso está na main nem no banco.
2. **Quem pode avaliar conversas no Copiloto — #2485.** Hoje qualquer vendedor marca "momento de aprendizado" e dá nota na própria conversa. A PR deixaria isso só para supervisor e admin. É uma regra de negócio que contradiz a atual.
3. **Copiloto RADAR ao vivo — #2419 (#2381), #2487, #2500.** Ligaria a análise automática de cada mensagem do cliente durante o atendimento. Tem custo de IA e coloca um gatilho na tabela de mensagens. O motor nunca chegou à main, e a substituta #2486 também foi fechada. Está congelado desde #2545.

### 🔴 Perdidas (por impacto)
1. **#2266 — inbox e conquistas:** o filtro de tipo do inbox não acompanha o botão voltar/avançar. Além disso, o atendente pode ver uma "conquista" falsa ao abrir o app, por diferença de relógio. São 2 correções pequenas, só no front.
2. **#2269 — segmentos do Talk X:** o público estimado pode aparecer desatualizado, e um segmento já excluído continua selecionado na tela.
3. **#2550 — exportar relatório do Talk X em CSV (X168):** quem tem permissão de download continua sem conseguir exportar.
4. **#2529 #2530 #2531 — métricas extras do Talk X (X074, X086, X058):** heatmap, ranking, métricas de templates e fila por segmento. São só consultas no banco, sem tela que as use hoje. O Talk X está congelado.

### 🧾 Drift
Nenhum neste lote.

**Observação:** o cron `talkx-scheduler-1min` caiu de 9,3% para 0,23% de falhas (23 em 7 dias). Isso veio da retenção de 7 dias do histórico, não das PRs #2514/#2245.

---
_Generated by [Claude Code](https://claude.ai/code)_

===== 2026-11-08T18:59:13Z adm01-debug =====
## RESULTADO LOTE 3 (parcial) — itens 16–34

| # | PR(s) | Caixa | Evidência |
|---|---|---|---|
| 16 | #578 | ✅ JA_NA_MAIN | `20260902000200` presente em `supabase/migrations/` |
| 17 | #552 #559 | ✅ JA_NA_MAIN | `20260924100800` presente em `supabase/migrations/` |
| 18 | #239 | ✅ JA_NA_MAIN | `20260906000002` e `20260906000003` presentes em `supabase/migrations/` |
| 19 | #208 | ✅ JA_NA_MAIN | `evolution-go-adapter.ts` com `instanceName` confirmado em main |
| 20 | #911 | ✅ JA_NA_MAIN | `20260926230000` presente em `supabase/migrations/` |
| 21 | #898 | 🗑️ OBSOLETA | PR tentou deletar `20260926152000` que ainda está em main; deleção nunca foi aplicada |
| 22 | #732 | ✅ JA_NA_MAIN | `20260925153100` presente em `supabase/migrations/` |
| 23 | #2095 #2771 | ✅ JA_NA_MAIN | `internalErrorResponse` em `external-db-proxy/index.ts:203` e `cleanup-rate-limit-logs/index.ts:133` |
| 24 | #2544 | ✅ JA_NA_MAIN | `TalkXBulkBar` em `src/components/talkx/kit/table.tsx:76`; `TipCard` em `kit/rail.tsx:101` |
| 25 | #2517 | 🔴 PERDIDA | `20261101223000` ausente de `supabase/migrations/`; `talkx_suppression_reasons` inexistente em produção |
| 26 | #2481 | ✅ JA_NA_MAIN | 8 políticas `WITH CHECK` em UPDATE verificadas no arquivo `20261101213000_rls_update_with_check_explicit.sql` e ativas em produção |
| 27 | #2457–#2476 | 🔴 PERDIDA | `20261101223000` ausente de `supabase/migrations/`; `MonitoringInstancePauses`, `useInstancePauses`, `instance-pauses.service` e `mark_pause_investigated` ausentes de `src/` (grep vazio) |
| 28 | #2265 | ✅ JA_NA_MAIN | `20261026220300` aplicado em produção (`schema_migrations`) |
| 29 | #2131 | ✅ JA_NA_MAIN | `EnterDepartmentByCode.tsx` e `useRedeemDepartmentInvite.ts` presentes em main |
| 30 | #2124 | 🔁 DUPLICATA (#2427) | Corpo da PR declara explicitamente "superado por #2427" |
| 31 | #2094 | ✅ JA_NA_MAIN | `20261016250000_revoke_anon_write_grants_all_tables.sql` presente em `supabase/migrations/` |
| 32 | #1151 | 🗑️ OBSOLETA | Título literal `[NÃO MERGEAR]`; 44 migrações quebradas; superado por trabalho posterior de Team Chat |
| 33 | #1083 | ✅ JA_NA_MAIN | `20260927390000_revoke_trigger_funcs_public_execute.sql` presente em `supabase/migrations/` |
| 34 | #122 #749 | ✅ JA_NA_MAIN | #749: `useTodayHourlyVolume({ queueId, agentId })` em `VolumeChart.tsx` confirmado; #122: `20260901200001_e23_default_queue_rls_policies.sql` presente em main |

===== 2026-11-08T18:59:37Z adm01-debug =====
## RESULTADO LOTE 3 — Auditoria completa (34 itens)

### Resumo por caixa

| Caixa | Qtd | PRs |
|---|---|---|
| ✅ JA_NA_MAIN | 22 | #115, #746, #2539, #2505, #2226, #1999, #1086/1099, #1094, #578, #552/559, #239, #208, #911, #732, #2095/2771, #2544, #2481, #2265, #2131, #2094, #1083, #122/749 |
| 🔴 PERDIDA | 4 | #2486, #2483, #2517, #2457–#2476 |
| 🧾 DRIFT | 5 | #213, #206, #123, #2589, #981 |
| 🗑️ OBSOLETA | 2 | #898, #1151 |
| 🔁 DUPLICATA | 1 | #2124 (superado por #2427) |
| ⚠️ DECISAO_DONO | 0 | — |
| ❓ NAO_VERIFICADO | 0 | — |

---

### 🔴 PERDIDA — Trabalho feito que nunca chegou à produção (ação necessária)

**#2486 — Radar de monitoramento do copilot IA**
A funcionalidade de radar preditivo do copilot foi desenvolvida mas nunca foi para produção. As tabelas `copilot_radar_insights` e as colunas de controle (`copilot_radar_activated_at`, `copilot_radar_reviewed_at`) não existem no banco. Qualquer tela ou lógica que dependa desse radar está silenciosamente quebrada ou nunca foi ativada.

**#2483 — Estado de brindes nas sessões do copilot**
A coluna `brinde_state` na tabela `copilot_sessions` nunca chegou ao banco de produção. Se algum fluxo de copilot tenta ler ou gravar o estado de brinde, está falhando ou gravando em campo inexistente.

**#2517 — Motivos de supressão no TalkX**
A tabela `talkx_suppression_reasons` não existe em produção. O sistema de disparo em massa (TalkX) não consegue registrar por que mensagens foram bloqueadas/suprimidas — operador não tem visibilidade sobre supressões.

**#2457–#2476 — Painel de investigação de pausas de instância**
O painel `MonitoringInstancePauses`, o hook `useInstancePauses` e a função de banco `mark_pause_investigated` nunca chegaram ao código nem ao banco. Operadores não conseguem visualizar nem marcar pausas de instância como investigadas — funcionalidade completamente ausente.

---

### 🧾 DRIFT — Código em produção diverge do repositório (risco silencioso)

**#213 — Gmail OAuth: refresh de token com campo errado**
O arquivo `gmail-oauth/index.ts:264` usa `access_token` no fluxo de renovação do token em vez do par correto. Reconexões periódicas de contas Gmail podem falhar silenciosamente sem que o usuário perceba até a sessão expirar.

**#206 — Migração `20260903200000` com bloco sem efeito**
A migração ocupa um slot no ledger mas o bloco `DO` dentro dela não executou alteração real. O histórico de migrações indica uma mudança que nunca ocorreu.

**#123 — Ledger de evidências de RLS incompleto**
O arquivo `migration-evidence.json` não inclui as exceções de RLS `100001`/`200001`. O documento de evidências diverge do estado real do banco — auditorias futuras vão encontrar inconsistência.

**#2589 — Função de banco usa schema de extensões errado**
A migração `20261102012200` ainda referencia `extensions.gen_random_bytes` em vez de `gen_random_bytes`. Em ambientes Supabase onde o schema `extensions` não está no `search_path`, isso causa erro de execução.

**#981 — Migração com nome incorreto no ledger**
A migração `20260927290000` tem nome que não corresponde ao padrão aplicado; renomeação nunca foi feita. O ledger fica difícil de auditar e reconciliar.

---

### Contagem final Lote 3: 34 itens classificados | 4 🔴 PERDIDAS | 5 🧾 DRIFT | 2 🗑️ OBSOLETAS | 22 ✅ já em main
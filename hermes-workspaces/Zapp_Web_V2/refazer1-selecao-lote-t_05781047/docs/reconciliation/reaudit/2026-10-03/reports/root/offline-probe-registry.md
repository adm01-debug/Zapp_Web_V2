# Índice único das reproduções offline

Foram catalogados **217 casos canônicos únicos**: **209 casos diagnósticos (207 de código de autoria e 2 de vendor) e 8 controles comportamentais**. Casos diagnósticos podem confirmar, delimitar ou rejeitar uma hipótese; não equivalem a 209 defeitos reproduzidos. Nenhum probe foi reexecutado para montar este índice. Os testes de produto dos rosters foram apenas lidos; este levantamento não executou suítes. Cada caso aponta para resultado, runner e pins; o JSON inclui SHA256 dos artefatos e a conferência dos pins explícitos contra a fonte.

| Área | Diagnósticos autoria | Diagnósticos vendor | Controles comportamentais separados | Negativos de proveniência | Replay excluído | Histórico duplicado excluído | Controle textual |
|---|---:|---:|---:|---:|---:|---:|---:|
| auth | 11 | 0 | 0 | 1 | 0 | 8 | 0 |
| calls | 11 | 0 | 0 | 0 | 0 | 0 | 0 |
| communication | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| database | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| inbox | 62 | 0 | 2 | 10 | 0 | 0 | 0 |
| infra | 29 | 0 | 0 | 0 | 0 | 0 | 0 |
| modules | 21 | 2 | 1 | 0 | 0 | 0 | 0 |
| platform | 11 | 0 | 0 | 0 | 0 | 0 | 0 |
| providers | 41 | 0 | 3 | 0 | 0 | 0 | 0 |
| root | 11 | 0 | 2 | 0 | 6 | 0 | 0 |

COM-P10 pertence a Communication e está fisicamente em Platform. Auth results.initial contém os mesmos 8 casos da série atual e não adiciona provas. Os 6 replays do root pelo Infra também não ampliam a soma. Vendor P03 é um smoke com silêncio/seno, contado como controle; P01 contém 12 variações dentro do mesmo caso. Export contém 1 reprodução e 2 controles. Inbox preserva 64 casos canônicos: 62 diagnósticos e 2 controles positivos explícitos (microphone_guard_contract_positive e media_volume_contract_positive). Providers tem 41 diagnósticos e 3 controles comportamentais explícitos: P17 (mídia canônica), P24 (quota no modo normal), P38 (coletor CSP). O caso whisper permanece hipótese/alcance, sem novo finding implícito. O banco não executou probe comportamental ou PostgreSQL: o controle MD5 é textual.

Um caso não equivale a um achado. Fronteiras simuladas e recortes AST/closures não atestam runtime integrado, RLS/gateway efetivos, entrega, browser, dispositivos ou deployment. O registro preserva os limites individuais. Os controles internos de cada caso não foram desmembrados para inflar contagens.

Integridade: 120 artefatos com SHA256; 298 arquivos de fonte com pins explícitos conferidos; fonte limpa no HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`. Divergências de SHA gravado versus runner atual: 0.

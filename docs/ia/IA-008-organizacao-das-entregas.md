# IA-008 — Organização das entregas revisáveis

**Etapa do plano:** `IA-008` `[M]` *Organizar entregas revisáveis* — "Dividir trabalho em PRs por
problema, com revisor, dependências e rollback; preservar verificações existentes e separar migrations,
interface e integrações quando necessário."
**Aceite:** cada PR pode ser revisado e revertido sem depender de um lote de 200 mudanças.

## 1. Regra de entrega

- **1 bloco = 1 workspace = 1 branch = 1 PR** (`hermes/<slug>` a partir de `origin/main` atualizado).
  Uma exceção, prevista pelo próprio plano: contenções urgentes (Bloco 02) podem virar um lote mínimo
  próprio — nunca misturadas com evolução de produto.
- **Migrations separadas de interface e de integração** no mesmo bloco quando possível: PR de DDL
  (aditiva, aplicada na tarefa) não vai no mesmo commit de mudança de UI. DDL de contrato/destrutura é
  registrado como pendente e aplicado **depois do merge e do deploy**, pelo caminho do projeto
  (`hermes-db-migrar` / `hermes-tarefa-mergear`), respeitando `CLAUDE.md` §1 regra 6.
- **Revisor:** o PR vai pronto (nunca draft) com seções Plano/Banco/Testes/Achados fora do escopo
  preenchidas; merge é squash.
- **Rollback:** revert do squash merge. DDL aditiva é retro-compatível; DDL de contrato precisa de
  migration de reversão nomeada antes de aplicar. Nenhum PR depende de outro para ser revertido.
- **Preservar verificações existentes:** os 6 required checks continuam obrigatórios; novos gates
  entram verdes; ratchets apertam, nunca afrouxam.

## 2. Mapa bloco → PR

| PR | Bloco (etapas) | Prioridade do plano | Depende de | Classe de banco esperada | Exige autorização humana? |
|---|---|---|---|---|---|
| 01 | Bloco 01 — Escopo e evidências (IA-001..010) | P1 preparação | — | nenhuma | não |
| 02 | Bloco 02 — Autenticação e privacidade (IA-011..020) | **P0** | IA-001, IA-004, IA-010 | provável aditiva (grants/observação) | **não** — deploy de Edge Function é automático no merge na `main` |
| 03 | Bloco 03 — Contratos e integridade (IA-021..030) | P0/P1 | IA-002, IA-004, IA-011, IA-015 | aditiva + contrato (enum/colunas) | não p/ DDL aditiva; contrato aplica pós-merge |
| 04 | Bloco 04 — Camada de provedores (IA-031..040) | P1 | IA-011, IA-016, IA-017, IA-021, IA-025 | aditiva | não |
| 05 | Bloco 05 — Filas e consumo (IA-041..050) | P1 (limites P0) | IA-025, IA-031 | aditiva (reserva/ledger) | **sim** se exigir chamada paga em ensaio |
| 06 | Bloco 06 — Observabilidade e custos (IA-051..060) | P1 | IA-041, IA-044, IA-049 | aditiva | não |
| 07 | Bloco 07 — Contexto e resumo (IA-061..070) | P1 | IA-025, IA-026, IA-031, IA-048 | aditiva | não |
| 08 | Bloco 08 — Copilotos de escrita (IA-071..080) | P1/P2 | IA-025, IA-031, IA-048, IA-067 | aditiva | não |
| 09 | Bloco 09 — Conhecimento (IA-081..090) | P2 | IA-019, IA-025, IA-031, IA-065 | aditiva | não |
| 10 | Bloco 10 — Memória e compromissos (IA-091..100) | P2 | IA-029, IA-065, IA-067, IA-090 | aditiva | não |
| 11 | Bloco 11 — Classificação e chatbot L1 (IA-101..110) | P1/P2 | IA-015, IA-025, IA-028, IA-047, IA-081 | aditiva | **sim** — ativar bot exige aprovação por conexão |
| 12 | Bloco 12 — Churn e supervisor (IA-111..120) | P1/P2 | IA-021, IA-022, IA-025, IA-056 | aditiva | não |
| 13 | Bloco 13 — Voz e TTS (IA-121..130) | P1/P2 | IA-011, IA-014, IA-017, IA-041, IA-044 | aditiva | **sim** — chamadas pagas ao provedor de voz |
| 14 | Bloco 14 — Multimodal (IA-131..140) | P2/P3 | IA-014, IA-019, IA-047, IA-081, IA-121 | aditiva | **sim** — custo por documento/áudio |
| 15 | Bloco 15 — UX e acessibilidade (IA-141..150) | P1/P2 | IA-025, IA-048, IA-069, IA-080 | nenhuma | não |
| 16 | Bloco 16 — Copilotos operacionais (IA-151..160) | P2 | IA-080, IA-081, IA-087, IA-093, IA-098 | aditiva | **sim** — depende de fonte/integração autorizada |
| 17 | Bloco 17 — Campanhas e Multiplix (IA-161..170) | P2 | IA-044, IA-047, IA-080, IA-087 | aditiva | **sim** — dispara canal real |
| 18 | Bloco 18 — Agentes supervisionados (IA-171..180) | P2/P3 | IA-011, IA-015, IA-043, IA-047, IA-090, IA-107 | aditiva | **sim** — ação supervisionada com efeito externo |
| 19 | Bloco 19 — Testes e avaliações (IA-181..190) | **P0/P1** (bloqueia liberação) | todos os blocos | aditiva (fixtures/avaliação) | parcial — avaliação com 200 casos exige revisão humana |
| 20 | Bloco 20 — Homologação e entrega (IA-191..200) | P1 (só após autorização) | IA-190 | contrato possível | **sim** — ambiente real, piloto e produção |

Distribuição do plano por tipo de etapa: **45 C** (correção), **7 V** (verificação), **82 M**
(melhoria), **66 N** (capacidade nova) — os `N` são o grosso dos blocos 09, 10, 14, 16 e 18.

## 3. Ordem de execução adotada

1. **Bloco 01** (este PR) — evidências e regras, pré-requisito declarado do Bloco 02.
2. **Bloco 02** (P0) — contenção de exposição, em lote mínimo com testes.
3. **Bloco 03** — integridade de contrato (depende de IA-011/IA-015 do bloco anterior).
4. Blocos 04→06 (núcleo de execução), depois 07/08/11/12/13/15 (produto visível), depois
   09/10/14/16/17/18 (`N`, dependem de fonte e autorização), e por fim **19** e **20**.
5. Os `[V]` que dependem de terceiros (IA-018 grants do CRM externo, IA-105 caminho JWT/HMAC do
   gateway do chatbot) são resolvidos **com o responsável** e o parecer vira anexo do bloco.

## 4. Aceite da etapa

- [x] Trabalho dividido em PRs por problema, com revisão e rollback definidos.
- [x] Dependências entre blocos explicitadas (coluna "Depende de" = dependências do plano).
- [x] Migrations separadas de interface/integração; verificação existente preservada (6 required
      checks + ratchets).
- [x] Pontos que exigem autorização humana listados antes de serem alcançados.

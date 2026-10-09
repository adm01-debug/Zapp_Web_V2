# Bloco 18 do Plano IA 200 Etapas — estado REAL das etapas IA-171 a IA-180

> Fonte: [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md)
> §"Bloco 18 — Agentes especializados e ações supervisionadas (171–180)".
> Item do inventário: `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv` linha `Bloco 18 (171-180)`
> (`Outros/IA`, `NAO_IMPLEMENTADA`, P3, esforço G, evidência: "sem entrega das etapas 171-180").
> Cartão: `SL-218`.
>
> **Ponta medida:** branch `dia/2026-10-08`, commit `210c3e7c1`.
> **O que este documento é:** a revisão de evidência que o próprio bloco exige —
> *"Checkpoint do bloco: evidências dos dez critérios de aceite revisadas; itens não comprovados
> permanecem pendentes."* Cada etapa recebe um estado medido no código de hoje, com o caminho da
> prova ou a razão declarada de não existir.
> **O que este documento NÃO é:** implementação do bloco. O bloco propõe uma **camada nova**
> (catálogo de ferramentas, executor determinístico, aprovação vinculada ao efeito, caixa de
> propostas) que exige tabelas próprias, executor em Edge Function e tela de aprovação. Nada disso
> cabe nas regras deste cartão (`sem DDL / Edge Function / migration`, sem dependência nova) nem no
> tamanho de um cartão de nível `worker` — a construção da camada é trabalho de trilha separada
> (nível `complexo`). O contrário também não vale: nenhuma etapa entra aqui como entregue por
> intenção, projeto ou nome parecido.

## Vocabulário de estado

- **IMPLEMENTADA** — o critério de aceite da etapa está atendido no código de hoje, com prova.
- **PARCIAL** — existe uma parte real e verificável, mas o critério de aceite **não** está fechado.
- **NÃO IMPLEMENTADA** — não há caminho no repositório que atenda o critério.

## Índice por etapa

| Etapa | Estado |
|---|---|
| IA-171 — Catalogar ferramentas executáveis | NÃO IMPLEMENTADA |
| IA-172 — Separar planejamento de execução | PARCIAL |
| IA-173 — Vincular aprovação ao efeito exato | NÃO IMPLEMENTADA |
| IA-174 — Definir especialistas por departamento | NÃO IMPLEMENTADA |
| IA-175 — Verificar respostas antes de agir | PARCIAL |
| IA-176 — Sinalizar riscos operacionais proativamente | PARCIAL |
| IA-177 — Simular atendimentos para treinamento | IMPLEMENTADA |
| IA-178 — Avaliar múltiplos agentes por benefício | NÃO IMPLEMENTADA |
| IA-179 — Gerar briefing operacional periódico | PARCIAL |
| IA-180 — Centralizar propostas e decisões | NÃO IMPLEMENTADA |

## Estado por etapa

- **IA-171 — Catalogar ferramentas executáveis — NÃO IMPLEMENTADA.** O critério pede um
  **catálogo de ferramentas permitidas** com schema, escopo, risco, custo, timeout e efeito, e a
  exclusão de SQL arbitrário e shell. Não existe esse catálogo. O que existe é apenas a
  **propagação** de `tools`/`tool_choice` do cliente para o provedor, sem lista de permitidos,
  sem schema imposto e sem risco/custo declarados: `supabase/functions/ai-proxy/index.ts`.
  Quem enxerga o quê não é decidido hoje por catálogo (o critério "cada agente enxerga somente
  capacidades autorizadas para sua finalidade e usuário" não é verificável).

- **IA-172 — Separar planejamento de execução — PARCIAL.** O critério pede um executor
  **determinístico** que verifique permissão, argumentos, limites e pré-condições **independente do
  texto do prompt**. Essa disciplina existe hoje para a **chamada de modelo**, não para uma ação de
  negócio: limite por usuário/janela e orçamento em `supabase/functions/_shared/ai-guards.ts`
  (`enforceAiGuards`), capacidade exigida do provedor em
  `supabase/functions/_shared/ai-capabilities.ts` (`assertCapabilities`) e suspensão por falhas
  repetidas em `supabase/functions/_shared/ai-circuit.ts`. Não há executor de ações propostas, logo
  "uma instrução do modelo jamais funciona como autorização de negócio" não é hoje verificável — não
  porque a guarda falhe, mas porque a ação supervisionada não existe.

- **IA-173 — Vincular aprovação ao efeito exato — NÃO IMPLEMENTADA.** Nenhum registro de
  aprovação (aprovador, parâmetros, destinatário, versão, expiração) existe no repositório; a busca
  por `ai_approval`/`action_approval`/`aprovacao_pendente` não retorna ocorrência em `src/` nem em
  `supabase/`. O critério ("aprovação antiga não pode autorizar ação modificada") não tem sequer o
  objeto que ele regula.

- **IA-174 — Definir especialistas por departamento — NÃO IMPLEMENTADA.** O critério pede
  assistentes por departamento (Vendas, Compras, Logística, SAC, Financeiro, RH) com fontes e
  ferramentas próprias. Existe o **vocabulário** de departamento (canônico, em
  `supabase/functions/_shared/ai-response-contracts.ts`, `DEPARTMENT_VALUES`) e existem filas e
  transferência por departamento para **pessoas** (`src/components/queues/QueuesView.tsx`,
  `src/components/team-chat/DepartmentManagementDialog.tsx`), mas não há assistente com escopo de
  dados/ferramentas por área. Trocar de "especialista" não é possível porque não há especialista.

- **IA-175 — Verificar respostas antes de agir — PARCIAL.** A metade **determinística** existe:
  toda saída de modelo passa por contrato de saída com envelope e rejeição de tipo/faixa errada, sem
  default silencioso (`supabase/functions/_shared/ai-response-contracts.ts`, `parseModelOutput` +
  `buildAiEnvelope`, entregue no Bloco 03 / IA-025). A metade "antes de agir" não existe: não há
  executor operacional a bloquear, então "resultado reprovado permanece proposta e não chega ao
  executor" não é verificável hoje — de novo porque o executor não existe, não porque a validação
  falhe.

- **IA-176 — Sinalizar riscos operacionais proativamente — PARCIAL.** Existe a leitura
  **sob demanda**: `src/hooks/chat/useNextBestAction.ts` transforma promessas e pendências da
  conversa em ação sugerida na tela, e há painéis de monitoramento operacional
  (`src/components/monitoring/MonitoringSLAPanel.tsx` e companhia). Não existe o que o critério
  pede — sinalização **proativa** de promessa vencendo, ausência de confirmação e mudança de prazo,
  com deduplicação, justificativa e limite de frequência. Sugestão na tela não é alerta proativo.

- **IA-177 — Simular atendimentos para treinamento — IMPLEMENTADA.** O critério ("treinamento não
  expõe conversas privadas nem gera avaliação automática definitiva de pessoas") está atendido:
  `src/components/admin/TrainingMode.tsx` usa **cenários fixos e anonimizados** (script do cliente
  escrito à mão, sem ler conversa real), e a nota sai de **critérios observáveis no texto que o
  atendente escreveu** — não de sorteio nem da personalidade do colaborador; o feedback nomeia o
  critério que faltou. Prova de teste (determinismo: mesmo texto, mesma nota):
  `src/components/admin/__tests__/TrainingMode.avaliacao.test.tsx`. Persistência e escopo por
  usuário: tabela `training_sessions` em
  `supabase/migrations/20260409020732_7e37c849-85fd-4308-88c9-7faa9dc18693.sql` (RLS por dono,
  ajustada em migração posterior). **Esta é a única etapa do bloco com entrega real na ponta** — o
  inventário de 07/10 ("sem entrega das etapas 171-180") está errado para IA-177.

- **IA-178 — Avaliar múltiplos agentes por benefício — NÃO IMPLEMENTADA.** Não há avaliação
  comparando especialista único com colaboração controlada, nem teto de rodadas/custo por tarefa.
  O roteamento de provedor (`supabase/functions/_shared/ai-routing.ts`) escolhe **um** alvo; não
  existe orquestração de múltiplos agentes para medir ganho.

- **IA-179 — Gerar briefing operacional periódico — PARCIAL.** Existe conteúdo de briefing, mas
  **sob demanda**: `src/components/admin/SupervisorCopilot.tsx` responde perguntas do supervisor por
  consulta, e `src/components/inbox/chat/ChatHeader.tsx` mostra a inteligência da conversa. Falta o
  que o critério pede — geração **periódica** por equipe, com janela temporal, frequência e
  destinatários configuráveis e filtro por acesso do destinatário. Não há *job* de briefing.

- **IA-180 — Centralizar propostas e decisões — NÃO IMPLEMENTADA.** Não existe caixa de propostas
  com aprovar/editar/rejeitar/expirar e acompanhamento de resultado, nem registro de execução de
  efeito a que ela se ligue. Sem IA-173 e sem executor, não há o que centralizar.

## Consequência para o plano

O Bloco 18 permanece **pendente como camada**, com **uma** etapa já entregue sobre base existente
(IA-177) e quatro etapas em que parte do mecanismo já vive no produto sob outro nome (IA-172,
IA-175, IA-176, IA-179 — infraestrutura de IA, não supervisão de ações). Fechar o bloco é **construir**, não
corrigir: exige trilha própria (tabelas de catálogo/propostas/aprovação, executor determinístico em
Edge Function, tela de aprovação) e autorização do dono para o efeito externo supervisionado.

# Linha de base do módulo de Tarefas (etapas 004 e 009 do PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS)

Documento de apoio ao plano de design de Tarefas. Reúne: a semente local que reproduz as
imagens de referência (004) e o mapa dos 20 testes atuais contra as etapas do plano (009).
Atualizado em 11/10/2026 (worker (testes)).

Escopo formal deste refazer: a etapa 003 (capturas Playwright da linha de base visual) foi
retirada deste cartão e ficou para o cartão `t_9807f20f`; aqui não há capturas novas.

## 1. Semente local (etapa 004)

`scripts/tarefas/seed-local-imagens.ts` — cria, SÓ no banco local, as tarefas das imagens:

- 14 abertas (3 Caixa de entrada + 4 A fazer + 3 Fazendo + 4 Aguardando), 5 concluídas;
- 2 atrasadas e 4 com prazo para hoje (KPIs Atrasadas/Hoje);
- 4 Aguardando com motivo preenchido; 4 contatos (2 com foto, 2 sem foto, 2 do tipo cliente);
- datas carimbadas (`created_at`, `started_at`, `completed_at`, `status_changed_at`) para o
  tempo médio (created_at → completed_at, D13) das concluídas dos últimos 7 dias dar 1,4 dia.

Como rodar (banco local da tarefa):

```
zapp-db-local up . <nome-da-copia>
set -a; eval "$(zapp-db-local env . <nome-da-copia>)"; set +a
bun scripts/tarefas/seed-local-imagens.ts            # cria/atualiza (idempotente)
bun scripts/tarefas/seed-local-imagens.ts --remover  # remove o fixture
```

Garantias provadas:
- **Idempotente**: 3 execuções seguidas deixam 19 tarefas / 4 contatos (sem duplicar).
- **Removível**: `--remover` zera tarefas, contatos e o usuário do fixture (`5eed1a00-...`).
- **Recusa fora do banco local**: `exigirLocal` valida o host de `API_URL` e `DB_URL`
  (`127.0.0.1`/`localhost`); apontar para qualquer outro host aborta antes de escrever.
- **Usuário**: `e2e.tarefas@example.com` (sintético, local). `created_by` das tarefas é o
  perfil desse usuário; o gatilho `trg_task_set_assignee` força `assigned_to = created_by`.
- A remoção usa `set local session_replication_role = replica` porque as tabelas da publicação
  de realtime do banco local (ex.: `talkx_recipients`) recusam DELETE em cascata
  ("Column list used by the publication does not cover the replica identity").

## 2. Mapa dos testes atuais (etapa 009)

Os 20 arquivos de `src/components/tasks/__tests__/` e as etapas do plano que cada um atualiza:

| Arquivo | Superfície | Etapas / contrato |
|---|---|---|
| `QuickAdd.test.tsx` | QuickAdd (compartilhado) | 36–41 |
| `QuickAddCompacto.test.tsx` | QuickAdd compacto | 36, 41 |
| `TasksModule.test.tsx` | Módulo (filtros + QuickAdd da Agenda) | 45, 57, Fase F |
| `TasksModule.atalhosDeModo.test.tsx` | Módulo (atalhos 1/2/3 do modo) | E20 |
| `TasksModule.entrada.test.tsx` | Módulo (deep link `?task=`) | E19 |
| `TasksListMode.test.tsx` | Lista (seções, vazios, portas do card) | 86 |
| `TasksBoardMode.test.tsx` | Quadro (colunas, drag) | Quadro |
| `TasksBoardMode.a11y.test.tsx` | Quadro (região viva, teclado, dots) | E22 |
| `quadroLarguraFocoContraste.test.tsx` | Quadro (largura, foco, contraste) | E16 |
| `contratosVisiveis.test.tsx` | Quadro/abas (contratos visíveis T1, T3–T6) | T1, T3–T6 |
| `TasksAgendaMode.test.tsx` | Agenda (relógio fixo, faixa de 7 dias) | 88 (55/57) |
| `agendaGroups.test.tsx` | Agenda (grupos, prazo do dia) | 55–57 |
| `WorkItemCard.test.tsx` | Card (estados, ações, teclado, kebab) | Card |
| `cardAcoes.test.tsx` | Card → Sheet/kebab (DnD em Aguardando) | FASE C2 (28, 30, 31) |
| `WorkItemSheet.test.tsx` | Painel de edição | 23–27, R2-MOD-051, N-082 |
| `WorkItemSheet.fuso.test.tsx` | Painel (fuso do aparelho) | R2-MOD-050 |
| `taskComponents.test.tsx` | Componentes dos três modos | Componentes |
| `contagensReaisVsFiltradas.test.tsx` | Módulo (dado real × recorte do filtro) | F4 |
| `movimentoEContraste.test.tsx` | Movimento reduzido + contraste AA | 79, 80 |
| `zen.tarefas.test.tsx` | Módulo (modo zen) | 83 / CP-H |

Regra do plano: nenhum cartão deste plano começa nesses arquivos antes de o cartão em voo ser
integrado; cada cartão atualiza os seus testes e não deixa vermelho.

### Cartões em voo que tocam o módulo

- `t_a9419fa8` — filtros na URL (`useTasksFilters` / `workItemFilters`). Qualquer cartão do plano
  que mexa em filtro, modo ou lista/quadro deve esperar a integração deste cartão, senão colide.

## 3. Capturas visuais "antes" (etapa 003) — FORA DO ESCOPO DESTE CARTÃO

O escopo formal registrado no cartão removeu a etapa 003 daqui e restringiu este refazer às
etapas 004 e 009. As capturas claro/escuro em 360/768/1280 das cinco superfícies ficam no cartão
`t_9807f20f`. A semente da seção 1 já entrega os dados locais que a captura usará.

## 4. Lacunas conhecidas

- O mapa cobre os 20 arquivos; o plano tem 200 etapas — a coluna "Etapas" nomeia a etapa que o
  teste hoje protege, não a futura (a numeração muda quando o plano avança).
- A semente cria o próprio usuário sintético; para apontar a captura a um perfil de pré-visualização
  já existente, hoje é preciso editar o `created_by` (o script não tem `--perfil=`).

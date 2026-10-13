Especialista: worker (geral) (area-front-hooks)

## O que mudou e por quê

- `src/hooks/sla/useSLANotifications.ts`: o handler do Realtime agora valida o payload de
  `conversation_sla` com zod (`id` e `contact_id` UUID + campos do contrato tipados), ignora
  linha sem `contact_id` e roda cada evento dentro de try/catch — payload fora do contrato
  vira log e nenhum alerta, nunca exceção no canal. O canal usa `uniqueRealtimeTopic` (nome
  único por assinatura), os ajustes do painel vivem em ref (`settings`/`isQuietHours`) para
  que re-render não derrube e recrie o canal, e o dedupe deixou de ser um Set de sessão:
  passou a `claimNotificationEvent(..., 24h)`.
- `src/hooks/sla/useSLANotifications.ts`: os dois avisos (antes só o estouro, sem ação) —
  aviso de risco ao cruzar 70% do prazo de primeira resposta (toast `warning`, 6 s) e
  estouro (toast `error`, 10 s), ambos com a ação **Abrir conversa** (o mesmo
  `openContactChat` do chat) e com o som respeitando `slaBreachSound`, `soundEnabled` e o
  horário silencioso.
- `src/hooks/sla/useSLANotifications.ts`: o prazo da linha sai de `sla_configuration_id`
  (uma consulta por chave) e, sem configuração apontada, do padrão do sistema. NÃO
  re-resolvo aqui a hierarquia de regras (fonte única é `useApplicableSLA`, cartão SA1).
- `src/hooks/__tests__/useSLANotifications.contract.test.ts` (novo) e
  `src/hooks/__tests__/useSLANotifications.behavior.test.ts` (fixtures atualizadas para o
  contrato): campo faltando, id não-UUID e contato nulo ignorados sem alerta; dedupe com TTL
  de 24 h (chave e TTL conferidos na chamada do dedupe e caminho silencioso quando ele
  recusa); os dois toasts com ação e duração; o risco saindo no limiar com relógio fake; e o
  canal NÃO recriado no re-render lendo os ajustes vigentes.
- `src/hooks/__tests__/helpers/alertBehaviorTestKit.ts`: o registro único de mocks ganhou
  `toast.warning` e passou a registrar as chamadas do dedupe — sem bloco de mock novo.

## Prova

- vermelho antes (mutação: aceitar linha sem contato) → `npx vitest run
  src/hooks/__tests__/useSLANotifications.contract.test.ts` → `× linha sem contato não gera
  alerta (não há conversa para abrir)` / `Test Files 1 failed (1); Tests 1 failed | 10 passed (11)`
- verde depois (o mesmo comando, sem a mutação) → `Test Files 2 passed (2); Tests 14 passed (14)`
- kit compartilhado intacto → `Test Files 4 passed (4); Tests 19 passed (19)` nos 4 arquivos
  que importam o mesmo kit de alerta

## O que NÃO fiz e por quê

- `src/hooks/__tests__/helpers/alertBehaviorTestKit.ts` NÃO está na lista de arquivos do cartão
  e entrou por necessidade: ele é o registro ÚNICO de mocks dos alertas (o repositório proíbe
  repetir o bloco de `vi.mock` — era o que o SonarCloud contava como duplicação). O hook passou
  a usar `sonner.toast.warning` e a chamar o dedupe com TTL, então o kit precisava conhecer as
  duas coisas (2 linhas de mock + registro da chamada). Sem isso, o teste do aviso de risco só
  poderia existir criando um bloco de mock novo, exatamente o que o cartão pede para não fazer.
  A prova de que nada quebrou: os 4 outros arquivos que importam o mesmo kit seguem verdes.
- Os testes exercitam o código real do cartão (o hook montado, o parse do contrato, o handler
  e o agendamento no relógio fake), não um literal nem uma cópia à mão: o que é mock é só a
  borda (supabase/som/settings), como o resto da suíte de alertas.
- NÃO implementei o `notify_on_warning` da regra aplicável nem `escalation_notes` no toast:
  é o pedido do SA2 `t_ea1a2f43` (aviso de risco PB-42/SA2) e o cartão manda não duplicar. O
  gancho fica pronto — o aviso de risco sai daqui e o SA2 o filtra/gateia.
- NÃO mexi em `useApplicableSLA` (arquivo do SA1 `t_390778e2`): o limiar de risco usa o prazo
  da configuração apontada pela própria linha (padrão do sistema como reserva). Para uma
  linha cuja regra aponte prazo diferente da configuração, o limiar pode divergir; resolver a
  hierarquia em tempo real é o passo seguinte (SA1/PB-39).
- NÃO toquei Edge Function, migration, RLS nem produção; nenhum segredo e nenhum dado real
  nos testes (UUIDs sintéticos, banco local).

Assinatura: o cartão pede a primeira linha `Especialista: hugo`, mas o cartão me foi
reatribuído (hugo → worker) e o trabalho é de hooks; assino o perfil que executou, como no
precedente aprovado `t_5f2da596`.

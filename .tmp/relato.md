Especialista: workertestes

## O que mudou e por quê

Cartão `t_9b483886` — inventário de testes do módulo Conexões: o que já existe, o que falta, e o que falta vai como `it.todo` apontando o cartão. Escrevi só arquivos de teste (o diff não toca produção).

Arquivos novos:
- `src/components/connections/__tests__/ConnectionQueuesDialog.test.tsx` — sujeito real: o diálogo + o hook `useConnectionQueues` real; só `supabase`, `useQueues` e `sonner` dublados. Cobre: spinner enquanto lê, vazio explicado, lista com/sem selo "Vinculada", vincular (insert com `whatsapp_connection_id` da conexão) e desvincular (delete filtrando o par conexão+fila), e a falha de escrita que avisa e NÃO mente sobre o vínculo.
- `src/hooks/business/__tests__/useBusinessHours.test.tsx` — `useBusinessHours` real. Cobre: horário padrão quando o banco não tem linhas (domingo fechado), leitura do que existe, gravação dos 7 dias + mensagem de ausência com as chaves de conflito certas (`whatsapp_connection_id,day_of_week` nos dias; `whatsapp_connection_id` na mensagem), invalidação de cache, aviso de sucesso, e o erro de escrita que avisa e propaga.
- `src/components/connections/__tests__/BusinessHoursIndicator.test.tsx` — `BusinessHoursIndicator` real. Cobre o selo honesto: sem linha para hoje ⇒ "Aberto" com "Sem horário configurado"; `is_open=false` ⇒ "Fechado"; janela que inclui a hora atual ⇒ "Aberto"; janela que NÃO inclui ⇒ "Fechado"; `showLabel=false` esconde o texto; erro de leitura não renderiza nada (não inventa estado).
- `src/components/connections/__tests__/InstanceSettingsDialog.config-perfil.test.tsx` — abas **Config** e **Perfil** do diálogo real. Cobre: carga das configurações e do perfil; alternar um switch e salvar envia o estado completo com o `instanceName` e avisa "Configurações salvas!"; erro ao salvar avisa; salvar perfil chama nome+status; nome vazio não manda; Aplicar/Remover foto chamam o cliente certo e limpa o campo.
- `src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts` — `handleAddConnection` real. Cobre: nome vazio e telefone vazio não criam nada e avisam; sucesso chama `createConnection` com `instanceName` derivado do nome e `is_default` conforme a lista, fecha o diálogo e limpa o formulário; falha de criação mantém o diálogo aberto e não anuncia sucesso; "Criando..." (estado de envio) liga durante a chamada e desliga no fim.

Lacunas que viram `it.todo` apontando o cartão (sem teste que finge):
- `src/hooks/connections/__tests__/reconexao-automatica.todo.test.ts` — máquina de reconexão automática e exaustão de tentativas (RC1/RC2/RC3: `_workersql`/`_edgar`/`_iris`).
- `src/components/connections/__tests__/ConnectionsView.estatisticas.todo.test.tsx` — plural e subtexto dos cartões de estatística (PD-26).
- PL-03 (aba Etiquetas com erro honesto) e PL-06 (janela noturna no selo de horário) ficaram como `it.todo` dentro dos testes de Config/Perfil e do selo, respectivamente.
- Validação de FORMATO do telefone não existe na V2 (só vazio) ⇒ `it.todo` (UI-07), em vez de teste que passa por acaso.

Esboço de E2E: `e2e/conexoes.spec.ts` + `e2e/fixtures/conexoes.ts` (mesmo padrão local do repo: `?view=connections` + `dispensarOnboarding`). Cobre: tela monta, cartões de estatística e ação de nova conexão; lista de conexões OU vazio explicado, nunca os dois; abrir o diálogo de nova conexão e cancelar sem criar. O passo de abrir o QR de uma conexão desconectada está como `test.fixme` — depende do provedor Evolution, que o conjunto local não tem (R1: nada de produção).

Não dupliquei o circuit breaker/degradação do cliente Evolution: já está coberto por teste de Edge existente (`supabase/functions/_shared/__tests__/evolution-api-proxy-circuit-breaker.test.ts`, commit `c021a7bcf0`).

## Prova — vermelho antes, verde depois (por mutação)

Mutei a PRODUÇÃO em 5 pontos (um por arquivo de teste funcional), rodei os testes, e cada mutação foi pega pelo teste que a cobre; depois restaurei a produção (`git diff` de produção vazio).

Vermelho: `npx vitest run <os 5 arquivos>` → `Test Files 5 failed (5); Tests 6 failed | 25 passed | 3 todo (34)`
  × grava os 7 dias e a mensagem de ausência com a chave de conflito certa   (useBusinessHours: `onConflict` da ausência trocado)
  × salvar envia o estado completo da aba com o nome da instância             (InstanceSettingsDialog: texto do toast trocado)
  × nome vazio não cria nada e avisa o operador                              (useConnectionsManager: guarda de validação neutralizada)
  × telefone vazio não cria nada                                             (idem)
  × vincular uma fila grava o vínculo e anuncia sucesso                      (ConnectionQueuesDialog: texto do toast trocado)
  × fora da janela do dia (hora atual fora do intervalo) mostra "Fechado"    (BusinessHoursIndicator: `isWithinHours` forçado a `true`)

Verde depois (produção restaurada): `npx vitest run <os 5 arquivos>` → `Test Files 5 passed (5); Tests 31 passed | 3 todo (34)`
Verde com os dois arquivos de `it.todo`: `Test Files 5 passed | 2 skipped (7); Tests 31 passed | 11 todo (42)`

Typecheck: `npx tsc -b --force` → exit 0, sem saída.

## O que NÃO fiz e por quê

- Não toquei produção (o commit só adiciona arquivos de teste).
- Não reescrevi nem pulei nenhum dos 8 testes existentes do módulo (`BusinessHoursDialog.aria-labels`, `ConnectionAuditDialog`, `ConnectionCard.confirmacao`, `ConnectionCard.sem-integracoes`, `ConnectionsView.trava-multiconexao`, `InstanceSettingsDialog.privacidade`, `InstanceSettingsTabContent.aria-labels`, `NumberReputationMonitor`) nem os 2 de hooks — todos seguem passando.
- Não rodei o E2E (precisa de login real no conjunto local); o esboço foi validado com `npx playwright test e2e/conexoes.spec.ts --list` (coletado em `chromium-authenticated`).

Concluí.

Task t_4a722b90: fix(ui): textos de acessibilidade dos primitivos em português (Fechar, Mais, Anterior, Próximo, Alternar barra lateral)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_4a722b90
  max-retries: 2 (default)
  created:   2026-10-12 08:33 by claude
  started:   2026-10-12 16:23

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris` (o revisor confere), e o relato lista os arquivos tocados e os testes.
Origem: auditoria de paridade V3 → V2, Parte 7 (`docs/audits/AUDITORIA_PARIDADE_V3_UI_PARTE7_COMPONENTS_UI_2026-10-12.md`; enquanto não estiver integrada, leia `~/hermes-workspaces/.assets/paridade-ui/AUDITORIA_PARIDADE_V3_UI_PARTE7_COMPONENTS_UI_2026-10-12.md`). O código de referência da V3 está em `~/projetos/Zapp_Web_V3/src` (somente leitura: NÃO copie arquivos inteiros, porque V3 e V2 usam tokens e estruturas diferentes; porte o COMPORTAMENTO). Antes de mexer, confirme no código ATUAL (dia/2026-10-11) que a lacuna ainda existe; se já estiver resolvida, prove no relato e feche sem commit de código. Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema (sem exportar/baixar/imprimir). Só tokens do sistema (nenhuma cor literal); movimento só em transform/opacity com `useReducedMotion`.

PROBLEMA
A V3 traduz os textos para leitor de tela; a V2 mantém inglês: `src/components/ui/dialog.tsx` ("Close"), `sheet.tsx` ("Close"), `breadcrumb.tsx` ("More"), `pagination.tsx` ("Go to previous page", "Previous", "Go to next page", "Next", "More pages") e `sidebar/sidebar-primitives.tsx` ("Toggle Sidebar" no `aria-label`, `title` e texto oculto). O botão de fechar do `toast.tsx` perdeu o `aria-label` "Fechar". Referência V3: os mesmos arquivos em `~/projetos/Zapp_Web_V3/src/components/ui/`.

O QUE FAZER
1. Troque os textos: Fechar, Mais, "Ir para a página anterior", Anterior, "Ir para a próxima página", Próximo, "Mais páginas", "Alternar barra lateral"; restaure `aria-label="Fechar"` em `ToastClose`.
2. Antes de trocar, `grep` testes e e2e que busquem esses textos em inglês (ex.: `getByRole('button', { name: /close/i })`) e atualize-os para o novo texto; liste-os no relato.
3. Teste: cada primitivo expõe o nome acessível em português.

ARQUIVOS QUE PODE TOCAR
- src/components/ui/dialog.tsx, sheet.tsx, breadcrumb.tsx, pagination.tsx, toast.tsx
- src/components/ui/sidebar/sidebar-primitives.tsx
- testes e e2e que citem os textos antigos (somente a troca do texto)

CRITÉRIO DE PRONTO
1. Nenhum texto de acessibilidade em inglês restante nesses seis arquivos.
2. Testes que dependiam do inglês atualizados.
3. Testes unitários PRÓPRIOS deste cartão (vermelho antes, verde depois quando houver comportamento novo), listados no relato com o nome de cada caso.
4. zapp-verify . --rapido verde.


Events (11):
  [2026-10-12 08:33] created {'assignee': 'iris', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 16:22] reprioritized {'priority': 9}
  [2026-10-12 16:23] [run 11174] claimed {'lock': 'Joaquim:13636', 'expires': 1791833909, 'run_id': 11174}
  [2026-10-12 16:23] [run 11174] spawned {'pid': 3276, 'started_at': '|179183300906'}
  [2026-10-12 16:23] [run 11174] heartbeat
  [2026-10-12 16:24] [run 11174] heartbeat
  [2026-10-12 16:25] [run 11174] heartbeat
  [2026-10-12 16:26] [run 11174] heartbeat
  [2026-10-12 16:27] [run 11174] heartbeat
  [2026-10-12 16:28] [run 11174] heartbeat
  [2026-10-12 16:29] [run 11174] heartbeat

Runs (1):
  #11174 running      @iris  active  2026-10-12 16:23

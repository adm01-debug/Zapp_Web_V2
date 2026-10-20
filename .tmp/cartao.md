Task t_672cd537: fix(admin): tabelas do painel com estados vazios, special_agent listado e 'Nível de acesso' sem enganar
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_672cd537
  max-retries: 2 (default)
  created:   2026-10-12 10:37 by claude
  started:   2026-10-13 01:47
  parents:   t_0438f11e

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
`AdminUsersTable.tsx` não lista `special_agent` e a coluna 'Nível de acesso' é decorativa (`profiles.access_level` está DEPRECATED, nada o impõe) mas diz 'Acesso total ao sistema'; tabelas sem estado vazio; auditoria sem filtro de data.

O QUE FAZER
1. Mostre `special_agent`; remova ou rotule como informativo o 'Nível de acesso'; estados vazios/erro/carregando; filtro de data na auditoria (usa o hook do PD-16).
2. Testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/admin/AdminUsersTable.tsx
- src/components/admin/AdminAuditTable.tsx
- src/components/admin/AdminView.tsx
- testes

CRITÉRIO DE PRONTO
1. Nada decorativo que pareça controle.
2. Estados completos.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-12 22:04] worker: Do cartão pai t_0438f11e (useAdminData) — API pronta para o filtro de data/paginação da auditoria:

```ts
import { useAdminData, AUDIT_PAGE_SIZE, type AuditLogFilter } from './useAdminData';

const { auditLogs, auditTotal, loading, error, fetchData } = useAdminData('audit', {
  from: '2026-10-01',   // YYYY-MM-DD, inclusivo (vira gte ...T00:00:00.000Z)
  to: '2026-10-12',     // YYYY-MM-DD, inclusivo (vira lte ...T23:59:59.999Z)
  page: 1,              // 1-based, padrão 1
  pageSize: 50,         // padrão AUDIT_PAGE_SIZE
});
```

`auditTotal` traz o `count: 'exact'` para o controle de páginas. As dependências são primitivas, então objeto de filtro inline não gera loop de refetch. Erros de consulta agora saem em `error` + toast (nunca lista vazia silenciosa) — a tela pode usar `error` para o estado de erro. Senha mínima do `handleCreateUser` agora é 8 (`MIN_PASSWORD_LENGTH`), igual à Edge; o `PasswordStrengthMeter` (`src/components/auth/PasswordStrengthMeter.tsx`) continua sem uso no dialog, que é arquivo desta cartão (AdminView.tsx).

Events (30):
  [2026-10-13 01:51] [run 11967] heartbeat
  [2026-10-13 01:52] [run 11967] heartbeat
  [2026-10-13 01:53] [run 11967] heartbeat
  [2026-10-13 01:54] [run 11967] heartbeat
  [2026-10-13 01:55] [run 11967] heartbeat
  [2026-10-13 01:56] [run 11967] heartbeat
  [2026-10-13 01:57] [run 11967] heartbeat
  [2026-10-13 01:58] [run 11967] heartbeat
  [2026-10-13 01:59] [run 11967] heartbeat
  [2026-10-13 02:00] [run 11967] heartbeat
  [2026-10-13 02:01] [run 11967] heartbeat
  [2026-10-13 02:02] [run 11967] heartbeat
  [2026-10-13 02:03] [run 11967] heartbeat
  [2026-10-13 02:04] [run 11967] heartbeat
  [2026-10-13 02:05] [run 11967] heartbeat
  [2026-10-13 02:06] [run 11967] heartbeat
  [2026-10-13 02:07] [run 11967] heartbeat
  [2026-10-13 02:08] [run 11967] heartbeat
  [2026-10-13 02:09] [run 11967] heartbeat
  [2026-10-13 02:10] [run 11967] heartbeat

Runs (1):
  #11967 running      @iris  active  2026-10-13 01:47

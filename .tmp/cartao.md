Task t_34b7382a: feat(app): avisos globais de conexão degradada e de servidor fora do ar / restaurado
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_34b7382a
  max-retries: 2 (default)
  created:   2026-10-12 08:31 by claude
  started:   2026-10-12 20:27
  parents:   t_897120a4

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: iris`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3, segunda passada (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE7_SEGUNDA_PASSADA_2026-10-12.md) e pedido do Joaquim em 12/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

DEPENDÊNCIA: este cartão só começa depois dos cartões pai. Se ao abrir você não achar o que eles criam, o pai ainda não integrou: bloqueie dizendo qual.

PROBLEMA
FATOS: a V2 só detecta falta de internet do navegador (src/components/ui/offline-indicator.tsx ~l.11,36: navigator.onLine e HEAD /favicon.ico). Com o Supabase fora, a tela fica muda. Conexão 'degraded' só aparece em telas próprias. A V3 tinha DegradedConnectionsBanner e supabase-connectivity-banner (IndexContentConnected.tsx ~l.113-114).

O QUE FAZER
1. Faixa global 'Conexão X está instável' (health degradada nos últimos 10 min) com atalho para Conexões (staff).
2. Checagem leve de saúde do backend (consulta mínima existente a cada 30 s com recuo exponencial, pausada com a aba oculta): faixa 'Servidor indisponível, tentando reconectar…' e aviso 'Conexão restaurada'.
3. Testes.

ARQUIVOS QUE PODE TOCAR
- src/components/ui/ (faixas novas; relatar se reaproveita offline-indicator)
- src/hooks/ (checagem de backend; relatar)
- o layout principal da V2 (somente montar as faixas)
- testes correspondentes

CRITÉRIO DE PRONTO
1. Usuário sempre sabe quando o problema é a rede, o servidor ou o número.
2. zapp-verify . --rapido verde.


Events (47):
  [2026-10-12 20:44] [run 11328] heartbeat
  [2026-10-12 20:45] [run 11328] heartbeat
  [2026-10-12 20:46] [run 11328] heartbeat
  [2026-10-12 20:47] [run 11328] heartbeat
  [2026-10-12 20:48] [run 11328] heartbeat
  [2026-10-12 20:49] [run 11328] heartbeat
  [2026-10-12 20:50] [run 11328] heartbeat
  [2026-10-12 20:51] [run 11328] heartbeat
  [2026-10-12 20:52] [run 11328] heartbeat
  [2026-10-12 20:53] [run 11328] heartbeat
  [2026-10-12 20:54] [run 11328] heartbeat
  [2026-10-12 20:55] [run 11328] heartbeat
  [2026-10-12 20:56] [run 11328] heartbeat
  [2026-10-12 20:57] [run 11328] heartbeat
  [2026-10-12 20:58] [run 11328] heartbeat
  [2026-10-12 21:00] [run 11328] heartbeat
  [2026-10-12 21:01] [run 11328] heartbeat
  [2026-10-12 21:02] [run 11328] heartbeat
  [2026-10-12 21:03] [run 11328] heartbeat
  [2026-10-12 21:04] [run 11328] heartbeat

Runs (1):
  #11328 running      @iris  active  2026-10-12 20:27

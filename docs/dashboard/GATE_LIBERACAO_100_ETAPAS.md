# Gate de liberação — Plano Dashboard 100 etapas

> Criado em 04/10/2026 (cartão t_78d03f99, achado DASH-ACCEPTANCE-001, plano
> `docs/reconciliation/sources/Plano_Dashboard_100_Etapas_2026-09-30.md`,
> etapas DASH-083–086 e DASH-091–100).
>
> **Regra central: merge ≠ liberação.** PR mergeado, migration aplicada e CI
> verde são evidências de *execução*, não de *aceite*. A liberação das 100
> etapas só acontece por decisão humana explícita, registrada aqui, com a
> versão publicada e os riscos residuais assumidos por escrito.

## Como encerrar uma etapa

Uma etapa só pode ser marcada **ENCERRADA** quando as três colunas estiverem
preenchidas com evidência específica do critério de aceite (não vale "o PR
mergeou" nem comentário com resultado antigo):

1. **Prova executável** — teste/ensaio que falha quando o critério quebra
   (asserção, não observação manual não registrada).
2. **Ambiente e data** — onde e quando a prova foi produzida (banco
   descartável, staging, produção), junto da versão/commit.
3. **Riscos residuais** — o que a prova não cobre.

Testes pulados, TODOs e verificações bloqueadas **não contam como concluídos**
(aceite literal da etapa 099).

## Estado das etapas de teste e liberação

| Etapa | Critério de aceite | Evidência hoje | Estado | Riscos residuais |
|---|---|---|---|---|
| DASH-083 Cadeia de execução de relatórios | Diagnóstico do executor real (config → agendador → geração → transporte → retorno de entrega) antes de prometer automação | Autorização do `send-scheduled-report` corrigida (R2-API-022). Cadeia ponta a ponta até entrega não ensaiada | ABERTA | Aba Relatórios pode prometer envio que nenhum agendador executa |
| DASH-084 Execução idempotente do agendador | Duas instâncias do agendador não geram dois envios da mesma ocorrência | Não encontrada chave de idempotência nem ensaio de concorrência | ABERTA | Envio duplicado de relatório em corrida ou retry |
| DASH-085 Entrega e acesso controlados | Estados de geração/envio/falha registrados; conteúdo não sai do escopo autorizado | Entrega parcial: autorização revista; registro de estados e revalidação de permissão por destinatário sem prova | ABERTA | Falha de entrega pode aparecer como concluída |
| DASH-086 Conciliação relatório × Dashboard | Mesmos contratos analíticos (período, fuso, escopo, instante congelado) | Não ensaiado | ABERTA | Relatório pode divergir da tela para os mesmos parâmetros |
| DASH-091 Testes executáveis | Asserções com falha automática chamando as funções reais; comentário de resultado antigo não conta | `supabase/tests/dashboard_kpi_edge_cases.sql` reescrito com `RAISE EXCEPTION`; `scripts/db-audit/dashboard-rls-authorization.test.sh` aplica as migrations reais em PostgreSQL 17 descartável e falha em mutação da fórmula | PARCIAL | Cobre as 3 RPCs de agregação; demais funções do dashboard seguem com cobertura anterior |
| DASH-092 Permissões reais | Matriz de papéis validada sem service_role como única prova | Teste descartável com roles `anon`/`authenticated`/`service_role` reais (sem BYPASSRLS): EXECUTE negado a anon, leitura direta limitada por RLS, trava de `p_agent` em `dashboard_kpi`/`dashboard_hourly_volume`, escopo RLS em `dashboard_contact_counts` | PARCIAL | E33 estrita de `dashboard_contact_counts` segue pendente (DASH-SQL-REGRESSION-001); não há chamada via PostgREST/JWT assinado |
| DASH-093 Fixtures determinísticas de escala | Massa acima de 1.000 linhas, 500 NPS, 400 análises, UUIDs distintos, relógio controlado | Fixture de 1.200 contatos + eventos em horários fixos do dia civil America/Sao_Paulo no teste descartável | PARCIAL | Volumes de NPS/análises e mudança de papel em sessão não cobertos |
| DASH-094 Nove abas ponta a ponta | Fluxos reais: papéis, filtros, navegação, recarga de URL, erros | Não executado (exige app + credenciais E2E) | ABERTA | Componentes com vazio fixo podem persistir sem detecção |
| DASH-095 Concorrência e realtime | Eventos duplicados, desconexão/reconexão, meia-noite, respostas fora de ordem; contagens reconciliam | Não executado | ABERTA | Contadores realtime podem divergir da fonte sob falha |
| DASH-096 Migrations em ambiente isolado | Instalação limpa e atualização convergem para o mesmo esquema | Cadeia de migrations do dashboard aplicada em PostgreSQL descartável pelo teste novo; contratos de migration já cobertos pelo job "Contrato DB offline" | PARCIAL | Ensaio de instalação limpa do schema completo não foi feito neste recorte |
| DASH-097 Backfill e reconciliação | Lotes rastreáveis com checkpoints; integridade reconciliada antes/depois | Não executado (aguardando ambiente autorizado) | ABERTA | Sem ensaio, primeiro backfill real é a primeira prova |
| DASH-098 Carga controlada | Banco, payload, renderização e assinaturas sob concorrência representativa | Não executado | ABERTA | Limites da etapa 40 não medidos |
| DASH-099 Revisão independente | Revisões separadas de dados, segurança e frontend com evidências anexadas | Registro de auditorias em `docs/reconciliation/` existe; revisão de aceite por área não consolidada | ABERTA | Achados P1 abertos (ex.: DASH-SQL-REGRESSION-001) impedem encerramento |
| DASH-100 Liberação para autorização | Execução em produção só após autorização explícita; documentação reflete o entregue | **Este documento é o instrumento**: a liberação exige o registro da seção abaixo | ABERTA | Sem registro de autorização, o plano permanece não liberado por definição |

## Registro de autorização de liberação

Para liberar, copie este bloco preenchido para o topo desta seção (um registro
por liberação — não edite registros anteriores):

```text
Data/hora:            <quando>
Autorizador (humano): <quem assumiu a decisão>
Versão publicada:     <commit/tag/URL de produção verificada depois do deploy>
Etapas encerradas:    <lista com link da evidência de cada uma>
Etapas abertas:       <lista — cada uma vira risco assumido explicitamente>
Riscos residuais:     <texto livre>
```

**Estado atual: NÃO LIBERADO.** Nenhum registro de autorização existe; as
etapas ABERTA/PARCIAL acima são os riscos que um autorizador precisa assumir
ou resolver antes.

## Limites deste gate

- Este documento registra o estado da *evidência*, não substitui a execução
  dos ensaios pendentes (DASH-083 a 086, 094, 095, 097, 098).
- Provas produzidas antes de uma alteração de código/banco relevante deixam de
  valer para a versão nova — reexecute o que a mudança toca.

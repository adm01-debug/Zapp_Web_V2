# ADR-007 — Multiplix: ponte de acesso ao Singu e decisões de Fase 0

Decisões do Joaquim, Portão F0 do plano de 200 etapas do Multiplix (26/09/2026).

## E003 — Caminho de acesso ao banco Singu

**Decidido: Opção A** — edge function no ZAPP (`multiplix-audience`) com chave de serviço do
Singu (`SINGU_SERVICE_KEY`, secret nova, nunca exposta ao front). Fecha o GATE C já documentado
em `docs/crm-external-grants.md` (5 RPCs do Singu hoje liberadas para `anon`): a Fase 1 implementa
as RPCs novas (`multiplix_search_audience` etc.) já sob esse modelo, e o rollout (E195) revoga o
acesso `anon` das 5 antigas.

## E004 — Ritmo de envio (Evolution GO)

**Decidido: mesmo ritmo já usado por Campanhas** — `send_interval_min` = 5000ms,
`send_interval_max` = 15000ms (mesma conexão/instância WhatsApp, `talkx_campaigns` /
migration `20260409000457`). Nenhum parâmetro novo de risco introduzido na mesma conexão que já
atende Chat e Campanhas.

## E005 — Regra de "apto" sem dado de consentimento

**Decidido: todos aptos por padrão** (sem a trava de "cliente só com interação prévia" que foi
recomendada). Efeito real: os 3.099 contatos do ZAPP hoje têm `consent_status = unknown` em
100% — essa decisão inclui a base inteira de clientes como apta por padrão, sujeita apenas à
supressão explícita (`talkx_blacklist`, opt-out). Registrado aqui para que a auditoria de
histórico (Fase 14/15) saiba que esse alcance foi deliberado, não um bug.

## E006 — Telefone da empresa como destino

**Decidido: sim.** Quando não há contato-pessoa cadastrado, o destino cai para
`company_phones` (WhatsApp), rotulado explicitamente "telefone da empresa" na revisão (E014/E060),
sujeito às mesmas checagens de supressão/opt-out de um contato normal. Sem isso, o universo real
seria 145/754 fornecedores (19%) e 76/114 transportadoras (67%).

---

Portão F0 fechado. Fase 1 (Ponte Singu — DDL em produção no banco Singu, RPCs `multiplix_*`) é
tarefa própria: branch e PR novos, **PR aberta aguardando aprovação** (não é merge autônomo — DDL
em banco de produção de terceiro, regra 8 do fluxo Git).

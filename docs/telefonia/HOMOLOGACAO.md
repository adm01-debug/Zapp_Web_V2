# Homologação de áudio — Telefonia (`?view=voip`)

Artefato da etapa **T87** e do achado **TEL-RUNTIME-001** ("Persistência SIP e código de
gravação não encerram homologação real").

A persistência da chamada (`upsert_my_call`, T11) e o código de gravação
(`get-call-recording`/`sync-call-records`, T71–T74) **existem e têm teste**, mas o aceite do
módulo não é "código presente": é **uma chamada real da linha atravessando
início/atendimento/fim no mesmo UUID, com `provider_call_id`/`end_reason` preenchidos e áudio
correto**, e a consulta posterior mostrando **zero linhas novas presas**. Isso só se fecha com
um agente de verdade ao telefone, na linha provisionada — não é executável por agente na
máquina. Este arquivo é o roteiro com os 9 cenários e a tabela de recibos que essa execução
preenche.

## Pré-requisitos

1. Front publicado (PR-B) e a `get-sip-password` publicada; agente logado em `?view=voip` com o
   chip **VoIP verde** (registro SIP ativo).
2. Linha SIP e celular de teste disponíveis, mais uma linha WhatsApp (`wpp2`) habilitada para o
   cenário 8.
3. Para o áudio das gravações: `BITRIX_WEBHOOK_URL` configurado na Edge `sync-call-records`.
   Enquanto ele não existir, `recording_status` fica `none` em toda chamada — o cenário registra
   o resíduo, não um falso "sem gravação".
4. Quem acompanha a homologação roda a consulta abaixo **depois de cada cenário**, sem expor
   credenciais, e cola o recibo na tabela.

## Como registrar o recibo

Rodar após cada cenário, sempre com a linha real gravada:

```sql
select id, channel as canal, direction as direção, status, end_reason, talk_seconds,
       recording_status, provider_call_id, answered_at, ended_at
from calls
where agent_id = '<uuid-do-agente-de-teste>'
order by started_at desc
limit 5;
```

`agent_id` é **uuid** (não é o nome do perfil): o filtro precisa do id do agente de
teste, senão a consulta nem roda. O `provider_call_id` é o `Call-ID` do SIP —
é ele que prova que a linha do banco é *a chamada daquela ligação*, e o aceite do
T96 o exige em cada cenário.

O recibo de cada cenário é a **linha real** dessa consulta, resumida na tabela com as colunas:
`id`, `canal`, `direção`, `cenário`, `status`, `end_reason`, `talk_seconds`,
`provider_call_id`, `recording_status`.

## Cenários (9)

| # | Cenário | Ação do agente | Esperado em `calls` | Esperado na tela |
|---|---|---|---|---|
| 1 | VoIP saída atendida | liga para o celular de teste, atende, fala ~20 s, desliga pelo ZAPP | `outbound/ended`, `end_reason=hangup_local`, `talk_seconds≈20`, `provider_call_id` preenchido | timer conta; "Concluída 00:20" |
| 2 | VoIP saída não atendida | liga e deixa tocar até cair | `outbound/ended`, `end_reason=no_answer`, `talk_seconds=null` | "Não atendida" |
| 3 | VoIP saída cancelada | liga e cancela em ~3 s | `outbound/cancelled`, `end_reason=cancelled` | "Cancelada" |
| 4 | VoIP saída ocupado | liga para número ocupado | `outbound/busy`, `end_reason=busy` | "Ocupado" |
| 5 | VoIP entrada atendida | celular liga para a linha; agente atende no ZAPP | `inbound/ended`, `answered_by=<perfil>`, `talk_seconds>0` | alerta → Atender → timer |
| 6 | VoIP entrada recusada | agente clica Recusar | `inbound/declined`, `end_reason=declined` | alerta some |
| 7 | VoIP entrada perdida | ninguém atende por ~30 s | `inbound/missed`, `end_reason=timeout` | KPI "Perdidas" +1 |
| 8 | WhatsApp entrada | celular liga por WhatsApp para a linha `wpp2` | `whatsapp/inbound` via webhook, `provider_call_id` preenchido | alerta com badge WhatsApp conforme capacidade |
| 9 | Navegação + 2 abas | durante o cenário 1: abre `?view=inbox` e uma 2ª aba | nada novo no banco | barra ativa segue no inbox; 2ª aba avisa "em outra aba" |

Cada cenário preenche **uma linha real** na tabela de recibos abaixo (colunas citadas acima).

## Tabela de recibos (preencher na execução)

| # | id | canal | direção | cenário | status | end_reason | talk_seconds | provider_call_id | recording_status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | VoIP saída atendida | | | | | |
| 2 | | | | VoIP saída não atendida | | | | | |
| 3 | | | | VoIP saída cancelada | | | | | |
| 4 | | | | VoIP saída ocupado | | | | | |
| 5 | | | | VoIP entrada atendida | | | | | |
| 6 | | | | VoIP entrada recusada | | | | | |
| 7 | | | | VoIP entrada perdida | | | | | |
| 8 | | | | WhatsApp entrada | | | | | |
| 9 | | | | Navegação + 2 abas | | | | | |

## Critério de encerramento (TEL-RUNTIME-001)

O módulo só é "pronto" quando os três critérios do achado estiverem provados com **recibo real**:

1. **Uma chamada real atravessa início/atendimento/fim no mesmo UUID** — as três gravações
   (`ringing` → `answered` → `ended`) caem na **mesma** linha `calls.id`, com
   `provider_call_id` (Call-ID do SIP) e `end_reason` preenchidos.
2. **Chamadas reais têm campos obrigatórios e áudio correto** — a linha tem `direction`,
   `status`, `end_reason`, `talk_seconds` coerentes, e o áudio toca quando existe
   (`recording_status=available`).
3. **Consulta posterior à homologação mostra zero linhas novas presas**:

   ```sql
   select count(*) from calls
   where status = 'ringing' and started_at < now() - interval '1 hour';
   ```

   O resultado esperado é `0` (nenhuma linha nova presa em `ringing` depois dos ensaios).

## Bloqueios

_(vazio — preencher com o log correlacionado pelo `sessionId` a cada cenário fora do esperado;
sem recibo, o cenário não conta como concluído.)_

## Pendências / resíduos (honestos)

- **Execução com a operadora:** os 9 cenários exigem uma pessoa ao telefone e a linha
  provisionada; nenhum agente fecha isso sozinho na máquina.
- **Áudio/gravação:** depende de `BITRIX_WEBHOOK_URL` configurado na Edge `sync-call-records`;
  sem ele, `recording_status` fica `none`.
- **Provisionamento SIP:** houve 503 documentado no passado; conferir antes de começar que a
  `get-sip-password` publicada devolve os 5 campos e o chip fica verde.

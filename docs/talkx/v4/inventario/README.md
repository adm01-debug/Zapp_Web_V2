# Inventário — as 17 imagens contra o código (01/10/2026)

Base: `main` `3d09433`. Cada linha é um elemento de uma imagem de [`docs/talkx/references/`](../../references/), com o estado no código, a evidência (`arquivo:linha`), a fonte do dado e o que falta. É a evidência usada pelo [plano V4](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md).

| Arquivo | Telas | Elementos |
|---|---|---|
| [A_telas_01_17.md](A_telas_01_17.md) | 01 Visão geral · 17 Estados e modais | 120 |
| [B_telas_02_03.md](B_telas_02_03.md) | 02 Segmentos · 03 Construtor | 170 |
| [C_telas_04_05.md](C_telas_04_05.md) | 04 Templates · 05 Editor | 131 |
| [D_telas_06_07.md](D_telas_06_07.md) | 06 Supressão · 07 Analytics | 157 |
| [E_telas_08_09_10.md](E_telas_08_09_10.md) | 08 Nova campanha · 09 Revisão · 10 Agendada | 161 |
| [F_telas_11_12_13.md](F_telas_11_12_13.md) | 11 Monitor · 12 Em andamento · 13 Pausada | 216 |
| [G_telas_14_15_16.md](G_telas_14_15_16.md) | 14 Relatório · 15 Importação/CRM · 16 Ajuda | 180 |
| [H_motor_backend.md](H_motor_backend.md) | motor, banco, segurança, operação, testes | 110 capacidades |

## Legenda

- **ID** `T<tela>-<seq>`. **Tipo:** dado · ação · nav · visual · estado.
- **Hoje:** `OK` (existe e funciona com dado real) · `PARCIAL` · `AUSENTE` · `FALSO` (aparece, mas o número ou rótulo não tem fonte).
- **Fonte do dado:** tabela.coluna, RPC ou edge — ou `SEM FONTE`.
- **Falta:** o que construir, por camada (front / banco / edge).
- No inventário do motor, as capacidades são `CAP-001`…`CAP-110`.

## Fatos do banco usados no levantamento (conferidos ao vivo em 01/10/2026)

**Banco do ZAPP (`tnnnlkbymytvtqngbbqh`)**

- Tabelas `talkx_*`: campaigns, recipients, segments, templates, template_versions, template_variants, blacklist, campaign_events, settings, links, link_clicks, conversions. View `talkx_campaign_metrics` (com `security_invoker`). 32 funções `talkx`.
- Dados: **0 campanhas, 0 destinatários, 0 supressões, 0 eventos, 0 links, 0 conversões**; 5 templates; 1 segmento (fixture de teste); 7 chaves em `talkx_settings`.
- `talkx_campaigns.status`: draft, scheduled, sending, paused, completed, cancelled. `talkx_recipients.status`: pending, sending, sent, delivered, failed, skipped, outcome_unknown. Não existem `read_at` nem `segment_id` no destinatário.
- `contacts`: 3.106 linhas, 2.504 visíveis (não excluído, não legado, telefone válido). Preenchimento: etiquetas em 3; cidade e UF em 0; empresa em 1; `lead_score` > 0 em 0; origem em 0; `consent_status = 'unknown'` em todos; responsável (`assigned_to`) em 2.787.
- `crm_contact_links` (vínculo ZAPP ↔ CRM): 0 linhas. `contact_purchases`, `contact_custom_fields`, `sales_deals`: 0 linhas.
- Conexões WhatsApp: 1 conectada, 1 desconectada. Papéis: 4 admin, 1 supervisor, 3 agente.
- Storage: não existe bucket `talkx-media`.
- Cron `talkx-scheduler-1min` ativo: 1.425 execuções com sucesso e 16 falhas em 24 h, todas `job startup timeout` (o pg_cron não consegue iniciar o job; não é erro da edge).

**Banco do CRM (`pgxfvjmuubtbowutlide`, somente leitura)**

- `customers`: 48.623; com data de última compra ou ticket médio: **2**; com vendedor: 35.122.
- `company_rfm_scores`: 48.615, dos quais 48.614 "Hibernating"; calculado em 2026-04-12.
- `contacts`: 4.748; com gênero: 729; com empresa: 2.945. `contact_phones` marcados como WhatsApp: 2.109.
- `customer_purchases`: 0. `deals`: 3. Última sincronização com o Bitrix24 registrada em `sync_log`: 2026-03-09.

A estrutura comercial existe; o dado não está sendo alimentado. Por isso a fase 4 do plano vem antes das telas que filtram por compra, ticket, RFM e localização.

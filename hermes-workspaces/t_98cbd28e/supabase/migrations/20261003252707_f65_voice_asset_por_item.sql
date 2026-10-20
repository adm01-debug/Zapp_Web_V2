-- 20261003252707_f65_voice_asset_por_item
-- rollback: alter table public.multiplix_delivery_items drop column if exists voice_asset_id;
--
-- F65 (Bloco H — Voz) — docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- Uma coluna, nullable, com FK para o ativo de voz criado pelo F64.
--
-- Por que ela e necessaria: `multiplix_blocks.asset_id` guarda UM ativo por BLOCO, o que serve ao
-- modo `same_audio` (um roteiro para todos). No modo `personalized` existem N roteiros finais
-- distintos — e portanto N ativos — para o MESMO bloco, e nao ha onde pendurar o ativo de cada
-- destinatario. A ligacao e por ITEM, que e a granularidade em que o envio trabalha
-- (`multiplix_delivery_items` = destinatario x bloco, com lease proprio).
--
-- `on delete set null` porque apagar o ativo nao pode apagar a fila: o item volta a ficar "sem
-- audio" e o prepare o regenera. `create index` de propósito NAO entra aqui: ninguem filtra por
-- `voice_asset_id` — quem consulta o ativo vai pela PK, e quem procura itens sem audio filtra por
-- `block_id` + `voice_asset_id is null`, que nao se beneficia deste indice.
--
-- Nada existente muda: coluna nova nullable, sem default, sem reescrita de linha (o Postgres nao
-- materializa NULL em coluna nova). Classe ADITIVA.

alter table public.multiplix_delivery_items
  add column if not exists voice_asset_id uuid
    references public.multiplix_voice_assets(id) on delete set null;

comment on column public.multiplix_delivery_items.voice_asset_id is
  'F65: ativo de voz (multiplix_voice_assets) que o envio deste item usa. Preenchido pelo prepare; '
  'NULL em bloco de voz ainda nao renderizado (o item segura a fila, ver F69).';

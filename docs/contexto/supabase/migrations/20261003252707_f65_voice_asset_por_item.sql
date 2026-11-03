alter table public.multiplix_delivery_items
  add column if not exists voice_asset_id uuid
    references public.multiplix_voice_assets(id) on delete set null

comment on column public.multiplix_delivery_items.voice_asset_id is
  'F65: ativo de voz (multiplix_voice_assets) que o envio deste item usa. Preenchido pelo prepare; '
  'NULL em bloco de voz ainda nao renderizado (o item segura a fila, ver F69).'

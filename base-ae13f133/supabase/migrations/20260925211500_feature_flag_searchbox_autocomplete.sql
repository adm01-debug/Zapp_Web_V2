insert into public.feature_flags (key, enabled, description)
values ('mapa.searchbox-autocomplete', false, 'Autocomplete estilo playground (suggest/retrieve) no picker de localizacao')
on conflict (key) do nothing;

# Fixtures de rede da Mapbox (E68)

Respostas de rede da Mapbox Search Box usadas pelos testes que antes embutiam os shapes no
próprio arquivo de teste. Os shapes vêm do **Apêndice A** do
`docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md` (verificados 2026-09-25) e do teste ao vivo do
**E47** (mesma doc); nenhum campo do código é inventado — cada chave existe no corpo real.

| Arquivo | Endpoint | Origem do shape |
|---|---|---|
| `suggest-xbz.json` | `POST/GET /search/searchbox/v1/suggest?q=xbz` | Apêndice A — `suggestions[0]` (`XBZ Brindes`, poi, sem coordenada) |
| `suggest-avenida-paulista-1000.json` | `/search/searchbox/v1/suggest?q=avenida paulista 1000` | E47 (tabela de termos reais) — `Avenida Paulista 1000, São Paulo - São Paulo, 01310-100, Brasil` |
| `suggest-asdkjh.json` | `/search/searchbox/v1/suggest?q=asdkjh` | E47 — termo sem sentido devolve `suggestions: []` (200 vazio) |
| `retrieve-xbz-brindes.json` | `/search/searchbox/v1/retrieve/{mapbox_id}` | Apêndice A — `features[0].geometry.coordinates` `[lng, lat]` + `properties.name`/`full_address`; `context` (E41) é o shape do E67 |
| `forward-avenida-paulista-1000.json` | `/search/searchbox/v1/forward?q=...` | shape do E67 (fallback com coordenada); nome/endereço do E47 |
| `rate-limit-429.json` | qualquer endpoint | 429 sem corpo lido pelo código (`mapboxGeocode.ts` decide só pelo status) |

Nenhum arquivo carrega o token de acesso da Mapbox (regra da etapa: os testes mockam o `fetch`;
o token nunca fica em fixture — a checagem da etapa faz `grep` pelo nome do parâmetro de query e
tem de dar 0). A gravação ao vivo com o token de produção não foi possível neste ambiente (o
token vem de uma edge autenticada, mesma limitação declarada no E65) — por isso os shapes são
reconstruídos do Apêndice A/E47, não recapturados.

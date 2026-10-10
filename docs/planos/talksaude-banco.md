# Talk X — Saúde do segmento (banco) — N-116 / X102

Fase 9 · Tela 03/02 · trilha de banco. O risco de entrega, os sinais, a composição
e as sugestões de um segmento vão numa RPC nova, `talkx_segment_health(p_rules, p_segment_id)`,
que reaproveita o conjunto de `talkx_audience_query` e devolve só agregados
(nunca nome/telefone). Detalhe da regra no cabeçalho da migration e contrato
provado em `scripts/db-audit/talkx-segment-health.test.sh`.

Ficam de fora deste cartão: composição por gênero (contacts não tem coluna de
gênero), sugestão por `dados:status_cliente` (campo inexistente) e a reescrita
de `talkx_segment_tags` para ler o público.

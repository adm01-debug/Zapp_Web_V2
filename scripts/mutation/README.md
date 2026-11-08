# Mutação reproduzível — módulo do mapa (E69, Fase 7)

```bash
bun run mutation:mapa
node scripts/mutation/run-mapa.mjs --control   # + mutação de controle
```

Alvo: `src/components/inbox/location-picker/**` e os arquivos que ele consome
(`src/lib/mapbox*`). Aplica N mutações por `sed` em **cópia temporária**
(backup em `.tmp/mutation-backup/`), roda a suíte que cobre o módulo, restaura
o arquivo original byte a byte e imprime a tabela
`mutação → mudou o resultado dos testes?`.

Mutações do plano (`mapa-f2.md`): E21-M1 (desliga cascata /suggest→/forward),
E21-M3 (desliga fallback do /retrieve), E21-M4 (Enter sem destaque ignora o
termo), F3-abort, F3-empty, F3-retry.

`--control` acrescenta uma mutação que troca um valor que nenhum teste do
módulo observa (placeholder do combobox) — ela **deve sobreviver**: é a prova
de que o runner distingue mutante morto de mutante vivo, em vez de só
imprimir "ok".

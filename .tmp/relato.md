Especialista: Hugo (area-front-hooks)

# [refazer] feat(observabilidade): id de correlacao do navegador chega as Edge Functions — quebra ESPELHO DO CI no empilhamento

Ponto 1: parti do commit da entrega — `git cherry-pick -x 48ee8c3c7` aplicou limpo sobre dia/2026-10-13 (resultado 22993c31d5), sem recomeçar.
Ponto 2: reproduzi o item do espelho em vermelho e corrigi a causa, sem afrouxar asserção — a entrega migrou o chamador central de `message-delivery` de `supabase.functions.invoke('message-delivery', …)` para o wrapper `invokeEdge('message-delivery', …)` (src/lib/invokeEdge.ts); a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` só conhecia `invoke(` e a rota `/functions/v1/<edge>`, então o chamador de front da edge sumia do recálculo e o grupo publicado caía para D (só `supabase/config.toml`), o que é falso. Corrigi o detector `invoca` para reconhecer `invokeEdge(` junto de `invoke(` e realinhei a âncora do ESTADO.md (`:223`→`:224`, o import novo deslocou a linha) mais a definição do grupo A. Nenhuma asserção foi afrouxada: a igualdade grupo==recálculo, a checagem de âncoras reais e as demais seguem idênticas; mudou só a definição de "chamador de front", que voltou a cobrir a forma real da chamada. Grupo A de `message-delivery` mantido — é o grupo correto. Não toquei em arquivo da entrega (invokeEdge.ts / outbound-message.service.ts / _shared/validation.ts): a chamada está certa, o desalinhado era o detector e o documento.
Ponto 3: provei e fecho citando o sha do commit desta correção (o sha vai no bloco FATOS MEDIDOS PELO FECHAR) — item do espelho verde e `zapp-verify . --rapido` verde (ver Prova).

## O que mudou e por quê
- `scripts/ci/docs-estado-registry-convention.unit.mjs`: `invoca` reconhece `invokeEdge(` além de `invoke(` — a guarda volta a enxergar o chamador de front do wrapper central.
- `ESTADO.md`: âncora de `message-delivery` para `src/services/outbound-message.service.ts:224` e grupo A citando `invokeEdge`.

## Prova
- vermelho antes (só com o cherry-pick da entrega): `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok 4 - ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D` (`grupo de \`message-delivery\` divergiu dos chamadores reais: {"A":[],"B":[],"C":[],"D":["supabase/config.toml:49"]}` · `'A' !== 'D'`) e `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` (`âncora desatualizada: src/services/outbound-message.service.ts:223 não cita \`message-delivery\``).
- verde depois: mesmo comando → `# pass 11` / `# fail 0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (201s)`, com `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard`, `OK dependencias`.

## O que NÃO fiz e por quê
- Não rodei `bash ~/arquitetura-v2/integrador/ci_espelho.sh`: o HERMES-GUARD bloqueia executar ferramenta do integrador. Rodei o passo node do espelho verbatim (`node --test --test-reporter=tap` sobre `scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs`); as falhas que restam nessa suíte são pré-existentes e fora do escopo (a lista base `.ci-base-52b433da9….txt` já traz 4 itens — implicit-any-ratchet, 2 do Talk X, FLAG_CHANGES — e nenhum é o item deste cartão); o item do cartão, que era o único culpado da bissecção, ficou verde.

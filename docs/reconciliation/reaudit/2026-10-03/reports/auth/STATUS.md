# Checkpoint Auth, usuários e consumidores de configuração

Atualizado em 2026-10-04 após a revisão independente de Diversity. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96` intacta; a hora precisa da validação está em `validation-latest.json`. A reauditoria global permanece IN_PROGRESS; este relatório não é homologação.

Todos os lotes produtivos atribuídos a Auth até este checkpoint foram concluídos: autenticação/recuperação/usuários/permissões, Team Chat/departamentos, Contatos/CRM/Singu, administração/IA/gamificação, settings/notifications, páginas adjacentes, saldo de components/calls, lote auxiliar de dez arquivos e os dois CSS atribuídos. Exclusões já lidas pelas outras frentes foram respeitadas.

53 registros: 52 novos e 1 refinamento; 11 high/42 medium. Os 52 registros anteriores foram preservados. Cobertura própria catalogada: 623 arquivos, 474 semantic/60 targeted/89 structural. A marca semantic pertence às faixas realmente lidas; arquivos estruturais continuam explícitos e a união global pode incluir leitura alheia. Integridade verificada para os 623 arquivos e as 298 faixas de evidência dos achados.

Roster de testes Auth concluído integralmente: **88/88 arquivos, 14.464/14.464 linhas**, com adjudicação de assertions, fixtures/mocks, controles positivos e limites em `test-review.json/md`. Todos os 88 têm hashes verificados e intervalo 1..EOF. Leitura não significa aprovação da suíte. Cópias/tautologias foram encaminhadas ao root para GOV003, sem transformar ausência genérica de teste em novo achado Auth.

Apoio Database concluído: **52/52 testes**, slice files[52:104], **4169/4169 linhas**, hashes e intervalos 1..EOF validados em `database-peer-test-review.json/md` e `database-peer-test-review-validation.json`. O artefato do dono não foi alterado; a cobertura dessa contribuição pertence ao relatório Database.

Lote shell concluído: **12/12 scripts, 3546/3546 linhas**, incluindo SQL embutido, assertions, fixtures e cleanup. `shell-review.json/md` contêm adjudicações; `coverage.json` incorpora as faixas realmente lidas. Nenhum script foi executado.

Lote CSS concluído: **2/2 arquivos, 1027/1027 linhas** (`components.css` e `tokens.css`), com SHA256, blob e faixas 1..EOF em `style-review.json/md`. A revisão adicional de faixas de `diversity-overrides.css`, `base.css`, import e consumidores confirmou **R2-AUTH-053**: com Diversity aplicado, a regra decorativa que seleciona a substring `ring-2` remove também o ring de foco do Button Salvar e dos PresetCards; o fallback global usa uma sombra vencida pelo mesmo `!important`. Não se afirma perda da ativação por teclado, medição de contraste ou certificação WCAG. A leitura integral dos outros CSS permanece com o root.

Onze probes offline anteriormente executados permanecem preservados e não foram repetidos. CALL-P08–P11 do root foram revisados por semântica e integridade sem reexecução ou nova contagem. Neste fechamento não houve testes, navegador, renderização, serviço, SQL vivo, envio, leitura de segredo nem alteração de fonte.

Artefatos principais estáveis: `findings.json`, `coverage.json`, `report.md`, `second-pass.json`, `calls-cross-review.md/json`, `test-review.json/md`, `database-peer-test-review.json/md`, `shell-review.json/md`, `style-review.json/md` e `validation-latest.json`. `add_focus_review.py` mantém a extensão AUTH053 reproduzível; `validate_checkpoint.py` confere hashes, faixas e os quatro ledgers sem executar código de produto.

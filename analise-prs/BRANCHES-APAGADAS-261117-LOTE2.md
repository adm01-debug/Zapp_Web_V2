# Branches apagadas em 17/11/2026 - lote 2 (101 branches)

Registro de restauracao. Cada linha tem o SHA completo da ponta: `git fetch origin <sha>` e
`git branch <nome> <sha>` recriam a branch inteira, com historico, mesmo depois de apagada.

## A barra que cada uma teve de passar

Duas provas independentes, as duas obrigatorias:

1. **Medicao byte/linha contra a `main` de hoje** (`scratchpad/gate3.py`): cada caminho da branch
   classificado em `igual` (mesmo blob e mesmo modo), `movido` (mesmo blob em outro caminho da main)
   ou `contido` (toda linha da versao da branch presente na versao da main). Nenhuma das 101 tem
   caminho fora dessas tres classes, nem delecao pendente, nem blob ilegivel.
2. **Veredito nominal por caminho**: um parecer escrito, com citacao de `arquivo:linha` na `main`,
   dizendo por que aquele caminho nao carrega trabalho a recuperar. 438 caminhos cobertos.

Reprovadas pela prova 1: 0. Reprovadas pela prova 2: 0.

## As 101

| branch | ponta (SHA completo) | base comum | igual | movido | contido | pendentes adjudicados |
|---|---|---|---|---|---|---|
| `automation/types-sync` | `13841b36b6ef9d3ab0ae07386ab3f6969cf67051` | `3ac7e13be6ad` | 0 | 0 | 0 | 4 |
| `claude/archived-undo-constraint-fix` | `eb98aad2446880fc5c2e9968c25466fa3fb79977` | `004e74a8c596` | 0 | 0 | 0 | 2 |
| `claude/chore-cmd-auditoria-supabase-261101-1430` | `4b780aaf465aef27c92d3d38a1a02bdb98ca60b7` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/chore-mapa-resgate-pos-24-10-261101-1415` | `7f572d1f83b034c07c0cee8e2290e1e26c1f118a` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/chore-pacote3-merge-261113-2325` | `36c9f9336b60ab18772c80cba29c5d38c7960fe7` | `f32855df69f2` | 61 | 0 | 0 | 6 |
| `claude/chore-reconcile-ledger-drift-261101-2249` | `2388e1ac52b22578880c3a5d6d408a4436ac16f0` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023` | `d3bef1973c6e611a80844e4fc8ca634ac7df8343` | `bac62ba98454` | 0 | 0 | 1 | 5 |
| `claude/feat-bulk-archive-two-step-undo-261101-0800` | `873ba94802f68c0b51f51f9f96fcb805f8c94ce5` | `1252bb5a4112` | 0 | 0 | 0 | 3 |
| `claude/feat-completar-c121-ddl-261101-1345` | `edad6a6f53ca0217d0ca96698b2c5efd881010fa` | `50fc5f0e65b5` | 0 | 1 | 0 | 1 |
| `claude/feat-copiloto-ddl-261101-1330` | `7a8bea7d4b974bec52e1dd2eda37b67fe1b2fe37` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/feat-copiloto-edges-261115-1555` | `8ea3e73f7e9ac85cf8b9b8e2d08722f3795b44bb` | `06658777598f` | 2 | 0 | 0 | 4 |
| `claude/feat-cores-prioridade-d12-261101-1425` | `c46e71fa1c92af8723ebfebdc8be1e4dd98fea00` | `1252bb5a4112` | 0 | 0 | 0 | 4 |
| `claude/feat-e71-skip-draft-prs-281026-0250` | `68bf4153b133e0325698c325780a2ca05ef9b8d6` | `5b7954c7aa4a` | 0 | 1 | 0 | 4 |
| `claude/feat-incidentes-pausa-investigados-261024-1640` | `204ce07fb63be8b5d85da56f8bf2233ed251cf5d` | `1252bb5a4112` | 3 | 1 | 2 | 2 |
| `claude/feat-multiplix-cron-instancia-pausada-261101-1410` | `81dc9cfaa991cf4ff0b5a39d72ecfbda0ecc874f` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/feat-talkx-x047-matrix-estados-261101-2030` | `8f619c709d72f4638087ef8b9f42631537f2711e` | `1252bb5a4112` | 0 | 1 | 0 | 1 |
| `claude/feat-talkx-x053-breadcrumb-261102-1130` | `21be44c6214271a229d1cd91cf3bfcb6ed834217` | `1252bb5a4112` | 0 | 0 | 0 | 3 |
| `claude/feat-talkx-x058-campaign-queue-segment-261101-2300` | `74ac918785c18b7d1f0c33b98e631f151a39a563` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/feat-talkx-x074-analytics-rpcs-261101-2300` | `2f1dc1a119c48dc2419af51a29d1f6f8e57d77f5` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/feat-talkx-x086-template-metrics-rpcs-261101-2300` | `421226c4a18344319740ec1578901d033da33cbd` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/feat-teamchat-cid-261021-0758` | `c6d0f97801991e91a5f1fd5a6ee839a996ec3a59` | `3617a2acd517` | 0 | 0 | 0 | 2 |
| `claude/fix-bulk-archive-rls-message-261101-2250` | `171529dd6f8267028a654cf79bccb7bf95283e98` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/fix-ci-E69-E71-draft-filter-261101-1830` | `1b5eb7ca1d7ee3d7000c2d980de70f6fe99f83da` | `1252bb5a4112` | 0 | 0 | 0 | 3 |
| `claude/fix-ci-contratos-cache-261020-2320` | `d90d3f78f9d026828c1e888ea6ce91f6643a3c45` | `d7af7a671ca2` | 0 | 0 | 0 | 7 |
| `claude/fix-ci-talkx-report-test-261108-2152` | `5c97aa006ae60c012c1014d3353e85ade115e671` | `9183f0f6fa42` | 0 | 0 | 0 | 2 |
| `claude/fix-ci-tests-261019-1200` | `16a4c54f0aaabc4ad8bd77a919c9d04cdc38f891` | `ee2947491757` | 3 | 0 | 1 | 7 |
| `claude/fix-ci-tests-batch2-2610-1830` | `af0bb57e2e44bb15011064e9e5eed64d237c287a` | `2d97c44cfe7f` | 1 | 0 | 1 | 6 |
| `claude/fix-ci-workflows-hxupgs` | `aac5bfcebc13097376f15f80f5243ea714499afe` | `2f2cc18cecce` | 0 | 0 | 0 | 2 |
| `claude/fix-codeql-checkout-sha-261109-1920` | `7bf81f91ccbe9d6ffe5f151860e32f7e2ed3ea97` | `fe6c6b0bf83d` | 0 | 1 | 0 | 1 |
| `claude/fix-console-sip-gate-261112` | `25e6e43c3e07106e2398384fb841a2829beed000` | `51bd8cb8759a` | 3 | 1 | 0 | 3 |
| `claude/fix-conversas-go-perf-261113` | `bb3a00877300797e400bb5744891a8e7f3fecd88` | `a49ef4ad58d6` | 19 | 0 | 1 | 7 |
| `claude/fix-copilot-rls-supervisor-261101-1530` | `f7ceab5081f5ce1f8c09e21ad94d6ac73e89398a` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/fix-copilot-tick-atomicity-261101-1430` | `3f68240b9ab225078baf49ef37fc2873640171bf` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/fix-db-guard-b0c-261024-1527` | `4aab75adfeeb4b7383d2b05f514c82700e3258b6` | `1645c4aac5b3` | 0 | 0 | 0 | 1 |
| `claude/fix-db-live-guard-dup-261109-1800` | `ff8bafdfc99f683f8a7265b09d43533f0f6b8eab` | `014270223cc8` | 0 | 1 | 0 | 1 |
| `claude/fix-db-migrate-ga04-ga05-261016-0011` | `fe4f40c672abad3b0f43309ba21e679c6c0d83a7` | `05826d1e0122` | 0 | 0 | 0 | 3 |
| `claude/fix-deploy-frozen-oct31` | `6521a05f27a307559803f0ffa331483727362542` | `668d77329964` | 0 | 0 | 0 | 4 |
| `claude/fix-deploy-functions-types-node-011101` | `e5e03afa5d3dc0b24db4d614e4fdc1cfe4912593` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/fix-esm-sh-import-regression-261108-2319` | `60514ecae736ac6584a1ed058257fb3f200183b9` | `9183f0f6fa42` | 1 | 0 | 0 | 2 |
| `claude/fix-esm-sh-regression-261108-2340` | `890f8996af58433c69bba068063d2d4d01e1124b` | `401ea3d4d12c` | 0 | 0 | 0 | 3 |
| `claude/fix-evolution-connect-500-261113-1721` | `d8a2c92d8fa40fd0ea36de073a6653211faf90e8` | `cb6576b2a3a0` | 1 | 0 | 2 | 5 |
| `claude/fix-evolution-go-gaps-d6-261019-1548` | `5615e53d9bf6f97feeb0a79a432c4934c87e06d1` | `ee2947491757` | 0 | 0 | 0 | 3 |
| `claude/fix-external-db-bridge-column-injection-261108-2319` | `bc00f402732025318854388bb1a5235e12167ee0` | `7e128bc40305` | 1 | 1 | 0 | 2 |
| `claude/fix-external-db-bridge-validation-261108-2335` | `413e05cc7e649b1eb26b73050bce630d93e9ffa2` | `9183f0f6fa42` | 0 | 0 | 0 | 3 |
| `claude/fix-fila-merge-retry-json-261101-1605` | `e5abad156f2eefb31251cc701c1a2a31998e14c8` | `b94be0a2cfd5` | 0 | 1 | 0 | 3 |
| `claude/fix-gr011-311101` | `7589315b0d63904ec4b159659131c3208693ba3c` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/fix-gr016-playwright-workers-011101` | `901357404c7cad5fcc398fdf2e66512077e16956` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/fix-high3-fk-indexes-261101-1830` | `65012f35e97895cf8ada6ee0108ffba212fa771a` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/fix-lint-mediamigration-service-261101-1250` | `8fa57120c82c254d58ad1f4267fc3673f3d3bd74` | `1252bb5a4112` | 1 | 0 | 1 | 3 |
| `claude/fix-merge-contato-telefone-secundario-261114-0000` | `5ed381c55361455b74b2ec0958c87bfea2ce5707` | `6423dc237eda` | 0 | 1 | 0 | 1 |
| `claude/fix-migration-drift-20261102012200-261102-0900` | `c70065af74407e2f7e44361df606e4e83d3fb64f` | `c4280ef4c0f6` | 0 | 0 | 0 | 1 |
| `claude/fix-n017-harness-261101-2115` | `ea7833bcbcce98f7696170a5bcd9c60a1d0a40de` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/fix-pd79-resolve-somente-sending-261112-1005` | `ef837c4377fb44cd29bef4daed981d652eecccdf` | `a49ef4ad58d6` | 12 | 0 | 2 | 4 |
| `claude/fix-radar-shortcut-key-261108-2059` | `3b36017477123676805250c1b09ac8363b6a38ed` | `e6e467b96f12` | 0 | 0 | 0 | 2 |
| `claude/fix-reconcilia-261026-sem-ci-261102-0912` | `757b6b3622e942338a3cdae78d0b94cbdc800656` | `b4a1d8f6f381` | 0 | 1 | 0 | 2 |
| `claude/fix-reconcilia-migrations-20261026-261101-2230` | `06ae04404de39b5931704e044fb33f75f39b6969` | `1252bb5a4112` | 0 | 1 | 0 | 3 |
| `claude/fix-replay-known-failures-261102-0935` | `86f6e8c31a96a263451f7d1ee0f58547ddb07068` | `68a5c356c9f4` | 1 | 0 | 0 | 2 |
| `claude/fix-revogar-grants-escrita-anon-261025-2115` | `eb8e6ad19907b98e87eb5e1918795c3a3a4b5ff4` | `2d97c44cfe7f` | 0 | 0 | 0 | 1 |
| `claude/fix-rls-department-invites-261101-2222` | `15d1d4990307867b8cdaea515c14f68c361bdc06` | `1252bb5a4112` | 4 | 1 | 0 | 1 |
| `claude/fix-rls-update-org-261101-1420` | `4cc19fc6c9fd7d907cdcccdea5f937295d5aa1e0` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `claude/fix-talkx-wizard-remonta-rascunho-261114-0715` | `04d30bf95bf774aedb0b8f08b83ab3d8a0d89e59` | `58f1713bae92` | 1 | 0 | 0 | 2 |
| `claude/fix-teste-notas-titulo-erro-261101-1410` | `ac145076c027fe78a721270a5932dc5645e9ad48` | `1252bb5a4112` | 0 | 0 | 0 | 3 |
| `claude/fix-testes-unitarios-minimo-251025-1230` | `c1952c450883b4be9c691e675064db5fc5f9a4d0` | `2d97c44cfe7f` | 0 | 0 | 1 | 4 |
| `claude/fix-types-rpc-ausentes-251025-1230` | `ef39213eff9c2d7cc2cafd6f5b00de90c094a151` | `fb57b4a5cd07` | 0 | 0 | 0 | 1 |
| `claude/fix-unit-tests-mechanical-261024-1527` | `af3fa1db777b150698beace933043ed75ac945bb` | `b1fe88215b48` | 0 | 0 | 0 | 1 |
| `claude/fix-x051-remote-completion-test-261108-2057` | `6081b1675dd4f60ab4483aeb048da101ced4ae62` | `9183f0f6fa42` | 0 | 0 | 0 | 3 |
| `claude/fix-z011bc-timing-safe-261018-1855` | `626811d3af6321a620b3891be646df0788239645` | `e322d3794848` | 0 | 0 | 0 | 3 |
| `claude/focused-hopper-qhavw1` | `c4500536e2545201015c8b9f402a8c79f22aa243` | `c4c7139e75aa` | 5 | 1 | 1 | 4 |
| `claude/infra-c121-ddl-261101-1350` | `14d1417a783ad1989beec00f25139d2cb44be86b` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude/keen-galileo-dxai3p` | `172c19c4382c5201a48b94341db7375e74d0d2a6` | `3d0b46c7aad3` | 1 | 0 | 0 | 5 |
| `claude/perf-bundle-inicial-261113` | `0ba37e1edc342eadff360a1483ea277dfdcf68c4` | `e50daef6a4d1` | 7 | 0 | 0 | 2 |
| `claude/test-e2e-contatos-fab-261021-0819` | `22cee627caba09f04c3d5e4fb2f5357f3c9b6428` | `bac62ba98454` | 0 | 0 | 0 | 3 |
| `claude/test-toque44-seletores-261021-0853` | `b19f9107dc711d917be3431400cfdf761f8f010a` | `bac62ba98454` | 0 | 0 | 0 | 2 |
| `claude/tmp-merge-ci-261116-1310` | `9aee73074d813a193efb7ef51228a1c5a26b2d8d` | `e50daef6a4d1` | 6 | 0 | 0 | 4 |
| `claude/w21-classificar-migration-drift` | `1b904f6a1f9e177dd7e55533645bc9ddb3068c7f` | `1252bb5a4112` | 0 | 0 | 0 | 2 |
| `claude_04/dazzling-archimedes-n9k59w` | `15d3bb73eae540190ec125de2b64d40628e87aaf` | `1252bb5a4112` | 0 | 0 | 0 | 3 |
| `claude_04/gifted-ride-xq3mj4` | `fb3676d4a371676498928755977843e8e7ed86f1` | `1252bb5a4112` | 2 | 0 | 0 | 2 |
| `claude_04/pensive-tesla-ixtl9w` | `f3cccccae8189a91743b37a05723a833565023cc` | `1252bb5a4112` | 0 | 0 | 0 | 4 |
| `claude_05/wonderful-goodall-94qjyg` | `1defc1da922e9e1119043cb8b6e1e7fb6fcc9a97` | `51bd8cb8759a` | 5 | 0 | 0 | 3 |
| `codex/consolidacao-baseline-pr-20261101` | `0eed116b72533a0be5a7752307668d0f6cab8f5c` | `1252bb5a4112` | 0 | 0 | 0 | 1 |
| `codex/diagnostico-e2e-mapa-20261028` | `94bfe9aa1211fb410f4d322edb8d38e8d9bddde4` | `180cc8cdd339` | 10 | 0 | 0 | 4 |
| `dependabot/bun/deps-semanal-0b89910d44` | `9aee73074d813a193efb7ef51228a1c5a26b2d8d` | `e50daef6a4d1` | 6 | 0 | 0 | 4 |
| `dependabot/bun/deps-semanal-241a479bd1` | `650a4eaa1f7e0b59aab0e789766f0446162a323d` | `75fbec3bad87` | 0 | 0 | 0 | 2 |
| `docs/update-pendencias-db-live-guard-261102` | `ed50aa9f35331bd635aea7d762259d2cc14a73e5` | `8ba0b4361290` | 0 | 0 | 0 | 1 |
| `fix/ci-f1b-restaura-workflows-20261018` | `4ce5a6e9705cf497dae51305d0045fdc8d391322` | `e322d3794848` | 0 | 0 | 0 | 4 |
| `fix/f1a-lote-b-audiomemes-storage-path` | `7fb8f446434590f356cf74be365ea911f5a9af83` | `bac62ba98454` | 0 | 0 | 0 | 2 |
| `fix/f1a-lote-b-authprovider` | `81543b967efb9b1fa8002855faf6fabc7ee16f65` | `9d65fed626e0` | 0 | 0 | 0 | 2 |
| `fix/f1a-lote-b-batch10` | `56187bdaeefff377ea9a2c80ffd8bae8827732b5` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/f1a-lote-b-batch2` | `d76fb9d57a028cecb00931522c05539c9020c4c0` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/f1a-lote-b-batch4` | `80a6e057a2fd699e252f83bba5860f259ffcb5e1` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/f1a-lote-b-batch6` | `8fa1bb340603201c336444db62d03d7e209a857a` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/f1a-lote-b-batch7` | `295286eb03813dfdbce12e21f4a44c63aed0d7d7` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/f1a-lote-b-realtime-channel-mock` | `adeae759234e936966a68601a929edfac172b84b` | `bac62ba98454` | 0 | 0 | 0 | 2 |
| `fix/f1a-lote-b-talkxsegments` | `81e74308988ec077cc83947068d1b60a55bdea9a` | `9d65fed626e0` | 0 | 0 | 0 | 2 |
| `fix/f1a-lote-b-useadmindata-createuser-avatar` | `8e37dd43ebbbda2cd7d4411aab5743728e71aaa0` | `bac62ba98454` | 2 | 0 | 0 | 2 |
| `fix/f1a-lote-b-useadmindata-select` | `cbef3bcab423d41f9f9bdf911a905c051a38e669` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/f1a-lote-b-useteamchatnotifications` | `ee3d010dbd516e7f7c02be0e0e5404cb77fefcdb` | `9d65fed626e0` | 0 | 0 | 0 | 2 |
| `fix/f1a-supabase-channel-mock-audiomeme-20261018` | `54a6c5661421d4f1acd8097fc7862da8b5a9ac9d` | `bac62ba98454` | 0 | 0 | 0 | 1 |
| `fix/reconciliar-migration-copilot-fases13-15` | `07ac5c6f0550bb12ffa990435d8be820bad2d251` | `1252bb5a4112` | 1 | 1 | 0 | 1 |
| `fix/sincronizar-migrations-sql-divergente-261101-0400` | `2e2f97fb9d0bd59431d7f6b06c3eb6ac09d4dba6` | `1252bb5a4112` | 0 | 1 | 0 | 2 |
| `fix/types-rpc-ausentes-261025` | `9fe3cd827c360e1538dd64c1428574136da397b1` | `2d97c44cfe7f` | 0 | 0 | 0 | 5 |

## Os 10 caminhos que NAO passaram, e as 12 branches que ficam abertas por causa deles

Estes caminhos tem trabalho de outro agente que a `main` nao tem. As branches que os carregam
**nao** foram apagadas e seguem abertas para resgate.

| caminho | branch que fica | o que se perde, em uma frase |
|---|---|---|
| `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` | `claude/fix-talkx-cron-startup-timeout-261025-1700` | Evita os timeouts do cron do Talk X (9,3% de falhas em 30 dias) e impede que dois ticks rodem sobrepostos disparando campanha em dobro. |
| `scripts/db-audit/docker-shim` | `resolve-2199-from-main` | Rede de segurança para a limpeza dos testes de banco nunca tentar apagar os papéis internos do Postgres nem o usuário postgres. |
| `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql` | `claude/fix-db-live-migrations-261107-1623` | Em reações feitas no mesmo instante, a versão da main pode apagar uma reação sem ter guardado cópia para desfazer. |
| `scripts/db-audit/secdef-guard-check.test.sh` | `claude/chore-secdef-guard-ci-test-261107-1600` | Sem essa guarda, o bug que travava a gamificacao do agente pode voltar em silencio na proxima migration. |
| `scripts/ci/ci-e2e-projects.unit.mjs` | `claude/infra-e2e-firefox-1-worker-261116-1930` | Sem isso o teste visual do email navy no Firefox volta a cair de forma aleatoria por falta de memoria, travando o CI de PRs que nao tem nada a ver com o problema. |
| `scripts/db-audit/talkx-suppression-reasons.test.sh` | `claude/feat-talkx-x070-suppression-reasons-261101-2230` | Hoje nada no CI prova que um atendente comum nao consegue inventar motivo de supressao: a regra esta no banco, mas sem teste que a defenda de uma regressao futura. |
| `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql` | `claude/fix-canonical-receipt-policies-261020-2005` | Num banco recriado do zero, qualquer usuario autenticado consegue gravar recibo de leitura em mensagem de conversa de que nao participa -- em producao isso ja esta certo, mas o repo nao reproduz. |
| `scripts/ci/render-workflow-docs.mjs` | `codex/consolida-docs-deploy-ga98` | Hoje o gerador de docs do CI joga fora, sem avisar, a segunda linha de uma descricao longa. |
| `scripts/ci/render-workflow-docs.multiline.unit.mjs` | `codex/consolida-docs-deploy-ga98` | Hoje, se alguem escrever a explicacao de um alerta de CI em duas linhas, o painel de documentacao dos workflows corta o texto e some com os itens seguintes, sem avisar. |
| `src/hooks/copilot/useRadarPanel.ts` | `claude/feat-radar-fase6-261108-1933` | Só falta na main o histórico dos insights da conversa; todo o resto do painel RADAR já está lá, e substituir o arquivo quebraria o painel atual. |

| branch mantida | caminho que a prende |
|---|---|
| `claude/chore-secdef-guard-ci-test-261107-1600` | `scripts/db-audit/secdef-guard-check.test.sh` |
| `claude/feat-radar-fase6-261108-1933` | `src/hooks/copilot/useRadarPanel.ts` |
| `claude/feat-talkx-x070-suppression-reasons-261101-2230` | `scripts/db-audit/talkx-suppression-reasons.test.sh` |
| `claude/fix-canonical-receipt-policies-261020-2005` | `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql` |
| `claude/fix-db-live-migrations-261107-1623` | `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql` |
| `claude/fix-migration-drift-071107-1500` | `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql` |
| `claude/fix-radar-fase6-cv056-shortcuts-261108-2335` | `src/hooks/copilot/useRadarPanel.ts` |
| `claude/fix-talkx-cron-startup-timeout-261025-1700` | `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` |
| `claude/fix-talkx-cron-startup-timeout-261101-2200` | `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` |
| `claude/infra-e2e-firefox-1-worker-261116-1930` | `scripts/ci/ci-e2e-projects.unit.mjs` |
| `codex/consolida-docs-deploy-ga98` | `scripts/ci/render-workflow-docs.mjs + render-workflow-docs.multiline.unit.mjs` |
| `resolve-2199-from-main` | `scripts/db-audit/docker-shim` |

### A prova de cada um dos 10

#### `supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql`

Branch: `claude/fix-talkx-cron-startup-timeout-261025-1700`

Dos 4 itens da migration, só a retenção de 7 dias existe na main (supabase/migrations/20261102022200_cron_historico_retencao_7d.sql:18-21, job 'cron-historico-retencao-7d'). Faltam na main: (a) o índice composto 'CREATE INDEX idx_job_run_details_jobid_start ON cron.job_run_details (jobid, start_time DESC, runid DESC)' — nenhuma migration da main cria índice em cron.job_run_details; (b) a janela de 14 dias no SELECT dinâmico de public.talkx_engine_cron_runs — a definição vigente na main é supabase/migrations/20261006193506_talkx_cron_runs_gate.sql:59-62, que filtra só por 'WHERE jobid = %L' sem recorte de tempo; (c) o pg_try_advisory_xact_lock(hashtext('trigger_talkx_engine_tick')) e o 'EXCEPTION WHEN query_canceled' em public.trigger_talkx_engine_tick — a definição vigente na main é supabase/migrations/20261009160000_talkx_storage_purge_drain.sql:105-106, que só tem 'EXCEPTION WHEN OTHERS THEN NULL' (WHEN OTHERS não captura SQLSTATE 57014) e nenhum lock contra ticks sobrepostos. Entra como migration nova pelo fluxo de docs/agentes/banco.md, recriando talkx_engine_cron_runs e trigger_talkx_engine_tick a partir da versão atual da main (a da branch é anterior ao QA5-05 da main? não: ela já contém o bloco talkx-storage-purge, então está alinhada).

**Tentativa de refutacao** (refutado: False): NAO ACHEI na main (origin/main, buscas exatas): (1) `git grep -n "idx_job_run_details_jobid_start\|ON cron.job_run_details" origin/main -- supabase` → zero ocorrencias em supabase/migrations (so textos de relatorio em analise-prs/); nenhum `CREATE INDEX` em schema cron. (2) `git grep -n "interval '14 days'\|14 day" origin/main -- supabase` → zero; a definicao vigente de public.talkx_engine_cron_runs (origin/main:supabase/migrations/20261006193506_talkx_cron_runs_gate.sql:57-63, lida) faz `FROM cron.job_run_details WHERE jobid = %L ORDER BY start_time DESC NULLS LAST, runid DESC LIMIT %s`, sem recorte de tempo. (3) `git grep -n "pg_try_advisory_xact_lock\|query_canceled\|57014" origin/main -- supabase` → nenhum hit em funcao talkx: a ultima definicao de public.trigger_talkx_engine_tick e origin/main:supabase/migrations/20261009160000_talkx_storage_purge_drain.sql:100-108 (lida), que no bloco de alertas tem apenas `EXCEPTION WHEN OTHERS THEN NULL;` e nenhum advisory lock; `git grep -n "advisory" origin/main -- supabase` lista 20+ usos de pg_advisory_xact_lock em outras funcoes, nenhum com hashtext('trigger_talkx_engine_tick'). Unico item coberto: retencao 7d em origin/main:supabase/migrations/20261102022200_cron_historico_retencao_7d.sql:20 (job 'cron-historico-retencao-7d'), que a propria alegacao ja reconhece. Ressalva (nao refuta a ausencia, muda o valor do resgate): origin/main:analise-prs/resgate-261115/auditoria/bruto/verificacoes/claude__fix-talkx-cron-startup-timeout-261025-1700.json:1 registra medicao em producao de que `CREATE INDEX` em cron.job_run_details falha no apply (postgres nao e superuser nem tem CREATE no schema cron) e que trocar o ORDER BY para `runid DESC` usa a pkey existente (1.653 ms → 0,94 ms).

#### `scripts/db-audit/docker-shim`

Branch: `resolve-2199-from-main`

Faltam na main as duas guardas da branch no laço de limpeza de roles: '[[ "$role" == pg_* ]] && continue' e '[[ "$role" == "postgres" ]] && continue'. Na main o laço é scripts/db-audit/docker-shim:183-185, que vai direto ao 'DROP ROLE IF EXISTS' para tudo que o comm -23 devolver, sem lista de exclusão. Entram como duas linhas antes do DROP ROLE em :184. Dúvida declarada: a main passou a abortar quando o snapshot de roles falha (:58, :171, :178), então em operação normal os roles built-in sempre estão no snapshot 'old' e nunca chegam ao comm -23 — a guarda é rede de segurança, não correção de bug observado; todo o resto da branch é a versão anterior ao endurecimento da main.

**Tentativa de refutacao** (refutado: False): origin/main:scripts/db-audit/docker-shim:182-185 — o laço tem só '[[ -z "$role" ]] && continue' e cai direto no 'DROP ROLE IF EXISTS \"$role\";' (:184) sobre a saída do 'comm -23' (:185); a consulta de origem em :178 é 'SELECT rolname FROM pg_roles ORDER BY rolname' sem WHERE/NOT IN. Termos procurados na main e não encontrados em scripts/db-audit/docker-shim: 'pg_*', '== "postgres"', 'rolname NOT IN', "NOT LIKE 'pg_", 'rolcanlogin', 'builtin'. O único 'rolname NOT IN (''postgres'', ''service_role'')' da main está em scripts/db-audit/check-mcp-exec-acl.sql:154, que é auditoria de ACL e não o cleanup do shim.

#### `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql`

Branch: `claude/fix-db-live-migrations-261107-1623`

A branch tem duas proteções que a main não tem: (1) desempate determinístico `ORDER BY created_at DESC, id DESC`, enquanto a main ordena só por `created_at DESC` nas DUAS janelas (a do backup e a do DELETE, migration da main linhas 15-19 e 31-39) — em empate exato de instante o backup pode salvar uma linha e o DELETE apagar outra, justamente o que o comentário da main promete evitar ("Mesmo predicado do DELETE, para os dois andarem sempre juntos"); (2) o DELETE da branch é `USING` a tabela de rollback, então só apaga o que foi salvo, e o INSERT tem `ON CONFLICT (id) DO NOTHING` (replay idempotente). Deveria entrar na própria migration, nas linhas do backup/DELETE. Dúvida declarada: a migration tem data 2026-11-07 e provavelmente já foi aplicada em produção, então o ganho vale para replay/ambiente novo, não para o banco oficial de hoje — por isso RECUPERAR e não OBSOLETO.

**Tentativa de refutacao** (refutado: False): supabase/migrations/20261107121000_message_reactions_one_per_agent.sql:20 e :36 (origin/main) — ambas as janelas usam apenas `ORDER BY created_at DESC`, sem `, id DESC`; linha 15 INSERT sem `ON CONFLICT`; linhas 32-41 DELETE com `WHERE id IN (subquery)`, sem `USING` da tabela de rollback. Termos procurados e não achados em origin/main para message_reactions: `created_at DESC, id DESC` (só em 20261010064729_team_messages_page_cursor_tiebreak_and_min_limit.sql:10 e 20261026200000_contact_notes_pinned.sql:32), `ON CONFLICT (id) DO NOTHING` em _rb_message_reactions_one_per_agent_20261107121000, `DELETE ... USING` em supabase/migrations.

#### `scripts/db-audit/secdef-guard-check.test.sh`

Branch: `claude/chore-secdef-guard-ci-test-261107-1600`

A correcao do guard esta na main (supabase/migrations/20261107153000_fix_gamification_streak_resolutions_guard.sql:15-18 e :48-51, padrao auth.role()='anon' OR (auth.uid() IS NOT NULL AND NOT ...)), mas NADA na main testa isso: 'git grep -l update_agent_streak origin/main -- scripts/' retorna somente scripts/db-tests/01-security-grants.sql:12 (lista de grants, nao exercita o guard), e nenhum arquivo da main casa com o padrao quebrado "auth.role() = 'authenticated' AND NOT". A branch traz prova de comportamento em Postgres 17 descartavel: service_role (uid=null) executa, anon recebe permission denied, authenticated passa no proprio profile e e negado no alheio. Deveria entrar como scripts/db-audit/secdef-guard-check.test.sh, rodado pelo workflow db-guard junto dos outros scripts/db-audit/*.test.sh.

**Tentativa de refutacao** (refutado: False): scripts/db-tests/01-security-grants.sql:12 — unico hit de "update_agent_streak"/"increment_agent_resolutions" em origin/main dentro de scripts/ e e apenas `routine_name IN ('increment_agent_messages','increment_agent_resolutions','update_agent_streak')` numa consulta a information_schema.routine_privileges (ausencia de EXECUTE para anon), sem invocar as funcoes nem exercitar o guard. Termos procurados e NAO encontrados em origin/main -- scripts .github e2e api server: arquivo `scripts/db-audit/secdef-guard-check.test.sh` (ausente no `git ls-tree -r origin/main -- scripts/db-audit`); qualquer chamada a `update_agent_streak(`/`increment_agent_resolutions(` em teste; o padrao quebrado `auth.role() = 'authenticated' AND NOT` (0 hits); `secdef-guard`/`secdef_guard` como codigo (so aparece em relatorios: analise-prs/resgate-261115/RELATORIO-ANEXO-BRANCHES.md:1488 descreve a lacuna como "Arquivo novo inteiro ausente na main"). Candidatos lidos e descartados: scripts/db-audit/secd-caller-check.test.sh (cabecalho lista as 13 funcoes cobertas, nenhuma delas de gamificacao), scripts/db-audit/gamification-marco-nao-bloqueia-envio.test.sh (exercita grant_agent_achievement/increment_agent_messages), scripts/db-audit/global-guards-regression.test.mjs (runtime-config + baseline realtime), scripts/db-audit/check-secdef-public-execute.sql e 01-security-grants.sql asserts 2-3 (search_path fixo e EXECUTE PUBLIC, nao o corpo do guard).

#### `scripts/ci/ci-e2e-projects.unit.mjs`

Branch: `claude/infra-e2e-firefox-1-worker-261116-1930`

A branch acrescenta dois testes ('firefox-email-navy roda em invocacao propria, fora do passo coletivo' e 'a invocacao do firefox-email-navy limita a um worker') que nao tem equivalente na main - o arquivo da main termina no teste E88 (linha 185). E a main nao cumpre o arranjo: .github/workflows/ci.yml:502 ainda roda --project=firefox-email-navy junto de outros 7 projetos na mesma invocacao, sem --workers=1, que era a causa do 'Page crashed' por memoria. Recuperar exige entrar junto com a quebra da linha 502 do ci.yml em invocacao propria com --workers=1; sozinho, o guarda reprova na main.

**Tentativa de refutacao** (refutado: False): origin/main:.github/workflows/ci.yml:502 — ainda "--project=firefox-email-navy" junto de outros 7 projetos na mesma invocacao, sem --workers=1; origin/main:scripts/ci/ci-e2e-projects.unit.mjs termina em 187 linhas no teste "E88: todo --project= do e2e-logado.yml existe de fato no playwright.config.ts". Termos procurados e nao achados em origin/main -- scripts e2e .github: "invocação própria", "invocacao propria", "firefox-email" (só ci.yml:502), "--workers=1" (só scripts/ci/e2e-isolated-runtime.unit.mjs:623 e scripts/e2e-isolated/run.mjs:698, do runtime isolado — outro fluxo).

#### `scripts/db-audit/talkx-suppression-reasons.test.sh`

Branch: `claude/feat-talkx-x070-suppression-reasons-261101-2230`

A funcionalidade X070 existe na main por outro nome de arquivo (supabase/migrations/20261108100000_talkx_suppression_reasons.sql + 20261112172000_talkx_suppression_reasons_hardening.sql:110, que ja barra desativar motivo do sistema), e scripts/db-audit/talkx-suppression-reasons.smoke.sh:23-25/:51-55/:64-65 cobre semente de 6 is_system, FK, RLS habilitado e privilegio de coluna. O que nao achei em nenhum arquivo da main e a prova COMPORTAMENTAL em Postgres descartavel dos criterios 2, 3, 5 e 6 do P046: admin criando codigo personalizado, agente recebendo erro de RLS no INSERT, FK recusando codigo inexistente (23503) e talkx_suppress_contact como service_role devolvendo uuid - e o proprio smoke.sh:2-4 diz 'nao e teste de CI: exige um banco com a migration aplicada'. DUVIDA declarada: pode haver sobreposicao com supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh, que aplica as migrations reais ate a 20261108100000 e exercita reason_code/motivo inativo; se um refutador mostrar os 4 criterios ali, isto vira OBSOLETO. Recuperar exige repontar migration= para 20261108100000_talkx_suppression_reasons.sql (o caminho citado na branch nao existe na main).

**Tentativa de refutacao** (refutado: False): supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh:238 insere em talkx_suppression_reasons SEM SET ROLE (roda como postgres, RLS ignorada) e :239 so prova o gatilho de motivo inativo; talkx_suppress_contact aparece apenas em :42 e :145 (DROP FUNCTION de harness), nunca e invocada. scripts/db-audit/talkx-suppression-reasons.smoke.sh:2-4 se declara conferencia pos-deploy e :20-66 sao 10 checagens de catalogo, sem INSERT por papel. Termos procurados em origin/main e nao achados fora de docs/ e analise-prs/: "cliente_vip" (git grep -ln "cliente_vip" origin/main -> so docs/ e analise-prs/), "23503" (git grep -ln "23503" origin/main -- scripts supabase e2e src -> nenhum arquivo ligado a talkx_suppression_reasons/reason_code), e talkx_suppress_contact invocado como service_role com a 20261108100000 aplicada (os unicos invocadores, scripts/db-audit/talkx-optout.test.sh:290 e talkx-lgpd.test.sh:422, param na 20260930330000 e usam o enum talkx_blacklist_reason que a X070 derruba). Nenhum arquivo da main exercita os criterios 2, 3, 5 e 6 do P046 (X070).

#### `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql`

Branch: `claude/fix-canonical-receipt-policies-261020-2005`

A main tem um buraco real no replay limpo das migrations, e nenhum arquivo da main o fecha. origin/main:supabase/migrations/20260928430000_team_chat_fix_policies_to_authenticated.sql:20 e :24 criam a forma FRACA das duas policies de recibo (SELECT com is_team_conversation_member(auth.uid(), conversation_id); INSERT com apenas profile_id = current_profile_id(), sem vinculo com a conversa da mensagem). Depois, origin/main:supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql:69-73 e :89-93 so aplicam a forma canonica dentro de 'if not exists (... policyname = <nome> ...)' -- como a policy fraca ja existe do passo anterior, a guarda PULA e o canonico nunca entra. Varri todas as migrations da main com versao > 20261003272707 que mencionam team_message_receipts (20261006222024, 20261009193246, 20261009214931, 20261031170000): nenhuma faz CREATE POLICY nessa tabela. O arquivo da branch e DROP+CREATE incondicional e com versao posterior, logo e a ultima palavra. Onde deveria entrar: supabase/migrations/ com versao > 20261003272707, exatamente como esta (em producao e no-op; o ganho e no replay do job replay-migrations de .github/workflows/db-guard.yml e em qualquer ambiente novo).

**Tentativa de refutacao** (refutado: False): Nao achei na main: (1) nenhum "CREATE POLICY ... ON public.team_message_receipts" em migration com versao > 20261003272707 — os unicos 4 arquivos posteriores que citam a tabela sao origin/main:supabase/migrations/20261006222024_team_receipts_reactions_conversation_id_forced.sql (trigger/UPDATE de dados), 20261009193246_* (idem), 20261009214931_team_message_read_state_view.sql:22 (view) e 20261031170000_high3-fk-indexes.sql:48 (indice); (2) nenhum "DROP POLICY ... Members can insert own receipts" / "Conversation members can read receipts" posterior; (3) nenhum DDL dinamico atingindo a tabela — a unica migration posterior com execute format/pg_policies sobre policies, origin/main:supabase/migrations/20261011003022_harden_policy_roles_and_message_reactions_clause.sql:41-52, tem lista fixa (conversation_snoozes, favorite_contacts, pinned_conversations); (4) "recreate_team_message_receipt_policies_canonical" em supabase/migrations/ (git cat-file -e origin/main:supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql -> "does not exist"; o nome so aparece em analise-prs/). Confirmei a forma fraca em origin/main:supabase/migrations/20260928430000_team_chat_fix_policies_to_authenticated.sql:20 e :24 (ambas TO authenticated) e as guardas que pulam em origin/main:supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql:69-73 (checa policyname + roles='{authenticated}', que casa com a fraca) e :89-93 (checa so policyname); nada entre as duas versoes faz DROP/CREATE dessas policies (20260928490000 recria apenas a de UPDATE; 20260930470000 so faz CREATE OR REPLACE FUNCTION mark_team_conversation_read).

#### `scripts/ci/render-workflow-docs.mjs`

Branch: `codex/consolida-docs-deploy-ga98`

A branch trata descricao de item 'nao-e-bug' quebrada em duas linhas (regex /^#\s{5,}(\S.*?)\s*$/ concatenando na descricao anterior) e exporta `extrairDocs`/`extrairNaoEBug` atras de guarda `process.argv[1] === fileURLToPath(import.meta.url)` para teste unitario. A main NAO tem nada disso: scripts/ci/render-workflow-docs.mjs:94-96 encerra o bloco no `break` ao ver qualquer linha que nao case o item nem seja comentario vazio, descartando a continuacao em silencio; a main nao tem nenhum `export`. Deveria entrar nessa mesma funcao extrairNaoEBug. DUVIDA declarada: hoje nenhum workflow da main usa descricao multilinha, logo o efeito pratico atual e zero — e protecao futura, nao bug ativo.

**Tentativa de refutacao** (refutado: False): origin/main:scripts/ci/render-workflow-docs.mjs:89-96 (extrairNaoEBug: item casa /^#\s+-\s+(.+?):\s*(.+?)\s*$/, so comentario vazio /^#\s*$/ continua, qualquer outra linha faz `break` descartando a continuacao; nenhum ramo concatena na descricao anterior) + :197 unico process.argv, `process.argv.includes('--check')`. Termos procurados e NAO encontrados em origin/main: `export`, `fileURLToPath(import.meta.url) ===`/`process.argv[1]`, `/^#\s{5,}`, `descricao +=`; e `git ls-tree -r --name-only origin/main | grep -i render-workflow` devolve apenas o proprio script (sem teste unitario).

#### `scripts/ci/render-workflow-docs.multiline.unit.mjs`

Branch: `codex/consolida-docs-deploy-ga98`

O comportamento nao existe na main. Em scripts/ci/render-workflow-docs.mjs:89-96 (main) o parser de 'nao-e-bug' so aceita a linha do item ('#   - chave: texto'); uma linha de continuacao mais indentada nao casa com o regex nem com o '^#\s*$', entao cai no break: a descricao fica cortada E o resto do bloco e descartado em silencio. A branch corrige o parser (continuacao somada a descricao) e exporta extrairDocs/extrairNaoEBug — a main nao exporta nenhum dos dois, por isso este teste nem importa hoje. Onde entra: scripts/ci/render-workflow-docs.mjs (export + regra de continuacao) e o teste em scripts/ci/, no mesmo padrao dos outros *.unit.mjs. Duvida declarada: nenhum workflow da main usa hoje item de 'nao-e-bug' em duas linhas (varri os 1171 .yml), logo a falha esta latente — quem refutar pode argumentar que e risco futuro, nao bug em producao.

**Tentativa de refutacao** (refutado: False): scripts/ci/render-workflow-docs.mjs:88-95 (origin/main): regex de item /^#\s+-\s+(.+?):\s*(.+?)\s*$/ seguido de `if (/^#\s*$/.test(linha)) continue; break;` — linha de continuacao indentada cai no break; e `git show origin/main:scripts/ci/render-workflow-docs.mjs | grep -n export` retorna zero linhas (extrairDocs/extrairNaoEBug nao exportados); `git ls-tree origin/main scripts/ci/` nao tem nenhum render-workflow-docs*.unit.mjs; `git grep -ln "nao-e-bug|naoEBug" origin/main -- scripts` lista apenas render-workflow-docs.mjs (sem parser equivalente com outro nome)

#### `src/hooks/copilot/useRadarPanel.ts`

Branch: `claude/feat-radar-fase6-261108-1933`

Só o histórico de insights da sessão: timeline + pushInsight (branch, linhas 165-171 do hook), consumido por src/components/copilot/RadarPhase6Panel.tsx, único consumidor na branch. Na main não existe acumulado: useRadarPanel.ts não tem timeline e RadarPanel.tsx:104 trata CV-055 só como aria-live da sugestão mais recente (nenhum 'histor|timeline|acumul' no arquivo). Onde entraria: um cartão/lista no RadarPanel.tsx alimentado por um pushInsight em useRadarPanel.ts. DÚVIDA declarada: o resto do arquivo da branch é OBSOLETO e regressivo — modo mini/normal/foco (main:66), DND por conversa e 30 min (main:110-120) e timeout do 'pensando' (RadarPanel.tsx:63/97, 8 s) já existem, e a API da branch perde cardOrder/collapsedCards/position que RadarPanel.tsx e RadarCards.tsx consomem; trocar o arquivo inteiro quebraria a main.

**Tentativa de refutacao** (refutado: False): Termos procurados e NAO achados em origin/main (pushInsight|timeline|histor|acumul em src/hooks/copilot, src/components/inbox/copilot, src/components/copilot: zero no contexto RADAR). Leitura que confirma a ausencia: origin/main:src/components/inbox/copilot/RadarPanel.tsx:104 "const latestSuggestionText = !isDnd ? (suggestions[0]?.text ?? null) : null;" (so a sugestao mais recente) e origin/main:src/hooks/copilot/useLiveSuggestions.ts:39 "const daRodada = rows.filter((r) => r.state_version === ultima);" (descarta as rodadas anteriores, logo nao ha acumulado); origin/main:src/hooks/copilot/useRadarPanel.ts:55-66 (UseRadarPanelResult sem timeline/pushInsight).

## Onde ficam os 133 vereditos completos

Os pareceres por extenso dos 133 caminhos deste lote estao em
`analise-prs/vereditos-133-caminhos-261117.md`, publicado no mesmo PR.

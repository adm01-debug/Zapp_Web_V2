# Deno: politica de reprodutibilidade dos contratos de CI

- Runtime do runner: **2.9.5**, versionado explicitamente no workflow.
- Lock: `scripts/ci/deno.lock`, regenerado a partir dos sete entrypoints de teste
  da CI, nunca copiado do `deno.lock` pessoal da raiz.
- Configuracao isolada: `scripts/ci/deno.json`; CI exige `--frozen`.
- `bun.lock` continua responsavel pelas dependencias do frontend.
- Esta politica nao muda o runtime hospedado do Supabase nem certifica o build
  remoto. As dependencias produtivas das 67 funcoes exigem rollout separado se
  forem convertidas para deno.json/lock por funcao. Nao afirmar equivalencia de
  bundles a partir deste lock de testes.

Atualizacao intencional: use Deno 2.9.5, execute o comando de contratos da CI
com `--frozen=false` no lugar de `--frozen`, revise o diff do lock e repita com
`--frozen`. Uma alteracao de versao do runtime deve atualizar o teste de contrato
e passar pela mesma matriz. Nao usar `--no-check`, `--no-lock` ou permissao de rede
para contornar falhas de testes; os testes nao enviam mensagens nem acessam dados.

Referencias: [lockfile do Deno](https://docs.deno.com/runtime/fundamentals/modules/)
e [dependencias em Edge Functions](https://supabase.com/docs/guides/functions/dependencies).

// IA-SEM-TAGS-001 — o prompt das IAs não lê `contacts.tags` (função de ETIQUETAS
// retirada). A coluna vai sair do banco (migration em trilha separada); antes
// disso nenhuma Edge de IA pode continuar pedindo/derivando essa coluna.
//
// Cobre as quatro edges que montam prompt de contato:
//   - ai-conversation-analysis/index.ts   (projeção inline + linha do contexto)
//   - ai-conversation-summary/index.ts    (projeção inline)
//   - ai-conversation-summary/contact-context.ts (linha "Tags: …" do prompt)
//   - ai-suggest-reply/index.ts e ai-proxy/index.ts (não podem ter tags de contato)
//
// O teste é de FONTE (o mesmo estilo de fiação de `_shared/__tests__/`): prova
// que a leitura sumiu do código que monta o prompt, sem depender de rede.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/ai-conversation-analysis/sem-tags-no-prompt.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ARQUIVOS: Array<{ alvo: string; arquivo: string }> = [
  { alvo: "ai-conversation-analysis", arquivo: "./index.ts" },
  { alvo: "ai-conversation-summary (projeção)", arquivo: "../ai-conversation-summary/index.ts" },
  { alvo: "ai-conversation-summary (contexto)", arquivo: "../ai-conversation-summary/contact-context.ts" },
  { alvo: "ai-suggest-reply", arquivo: "../ai-suggest-reply/index.ts" },
  { alvo: "ai-proxy", arquivo: "../ai-proxy/index.ts" },
];

for (const { alvo, arquivo } of ARQUIVOS) {
  Deno.test(`${alvo}: o prompt de IA não lê etiquetas do contato (contacts.tags)`, async () => {
    const fonte = await Deno.readTextFile(new URL(arquivo, import.meta.url));
    assert(
      !fonte.includes("tags"),
      `${alvo} ainda menciona "tags": o prompt de IA não pode ler etiquetas do contato`,
    );
  });
}

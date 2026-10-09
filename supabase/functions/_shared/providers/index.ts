// Bloco 5 / etapas 046-047 — face publica dos provedores de WhatsApp.
//
// Quem precisa enviar importa DAQUI (ou direto de `registry.ts`): o contrato
// (`types.ts`), o resolvedor (`registry.ts`), o adaptador do transporte
// (`evolution/index.ts`) e o provedor falso da suite (`fake/index.ts`).

export * from "./types.ts";
export * from "./env.ts";
export * from "./registry.ts";
export * from "./evolution/index.ts";
export * from "./fake/index.ts";

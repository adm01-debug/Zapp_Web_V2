/**
 * Tipos dos helpers de QA de `contraste-contatos.mjs`, consumidos pelo teste de
 * contrato `ContactViewsM.contrato.test.tsx`. Fica ao lado do `.mjs` porque o
 * tsconfig do app só inclui `src` — a declaração adjacente é resolvida junto com
 * o próprio módulo importado.
 */
export type Cor = [number, number, number];
export type Tema = Record<string, Cor>;
export type Temas = { claro: Tema; escuro: Tema };
export type Par = { label: string; theme: string; ratio: number };

export declare const PAIRS: ReadonlyArray<readonly [string, string, string, number]>;
export declare function parseThemes(css: string): Temas;
export declare function hslToRgb(cor: Cor): Cor;
export declare function contrast(fg: Cor, bg: Cor): number;
export declare function measure(temas: Temas): Par[];
export declare function parseBadges(tsx: string): Array<{ label: string; fg: string; bg: string }>;
export declare function measureBadges(temas: Temas, badges: ReturnType<typeof parseBadges>): Par[];
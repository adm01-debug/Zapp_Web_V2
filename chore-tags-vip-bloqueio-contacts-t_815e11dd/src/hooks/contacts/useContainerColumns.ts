import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * RD-005 — quantos cards por linha, medidos pela largura real do CONTÊINER.
 *
 * `window.innerWidth` não serve: com a barra lateral aberta ou fechada a área
 * dos cards muda de largura sem a janela mudar. O hook observa o próprio
 * contêiner (`ResizeObserver`, uma medição por evento — sem rAF em laço) e
 * traduz a largura em colunas pela regra do design aprovado:
 *
 *   largura >= 1200 -> a preferência do usuário (2, 3 ou 4)
 *   largura >=  900 -> no máximo 3
 *   largura >=  560 -> 2
 *   abaixo disso    -> 1
 *
 * A medida sai em `useLayoutEffect`, antes do primeiro paint: numa tela larga
 * não pisca 1 coluna e depois corrige. A preferência é do operador e sobrevive
 * à sessão em `localStorage`; o acesso pode lançar (modo privado, armazenamento
 * cheio, política do navegador) e nunca derruba a tela — sem armazenamento o
 * hook funciona igual.
 */

/** Chave da preferência de colunas dos cards de Contatos. */
export const COLUMNS_STORAGE_KEY = 'contacts.v2.columns';

/** Limiares de largura do contêiner, em px (regra do design). */
export const COLUMNS_BREAKPOINTS = { narrow: 560, medium: 900, wide: 1200 } as const;

/** Colunas que o operador escolhe na tela larga. */
export type ColumnsPreference = 2 | 3 | 4;

/** Menor e maior número de colunas liberados (abaixo de 560 px é 1). */
export const COLUMNS_MIN = 1;
export const COLUMNS_MAX = 4;

/** Preferência usada quando o valor recebido não é um número. */
export const COLUMNS_PREFERENCE_DEFAULT = 2;

export interface ContainerColumns {
  /** Colunas a renderizar. Antes da primeira medida vale a preferência do usuário. */
  columns: number;
  /** Largura medida do contêiner, em px; `null` antes da primeira medida. */
  width: number | null;
}

/** Traz a preferência para a faixa suportada, sem deixar valor inválido virar layout. */
export function clampColumnsPreference(preference: number): number {
  if (!Number.isFinite(preference)) return COLUMNS_PREFERENCE_DEFAULT;
  return Math.min(COLUMNS_MAX, Math.max(COLUMNS_MIN, Math.floor(preference)));
}

/** Regra do design: largura do contêiner + preferência do usuário -> colunas. */
export function resolveContainerColumns(width: number, preference: number): number {
  const preferidas = clampColumnsPreference(preference);
  if (!Number.isFinite(width) || width < COLUMNS_BREAKPOINTS.narrow) return 1;
  if (width < COLUMNS_BREAKPOINTS.medium) return 2;
  if (width < COLUMNS_BREAKPOINTS.wide) return Math.min(preferidas, 3);
  return preferidas;
}

/** Lê a preferência salva; `null` quando não há valor válido ou o armazenamento não deixa ler. */
export function readStoredColumnsPreference(): ColumnsPreference | null {
  try {
    const bruto = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (bruto === null) return null;
    const valor = Number(bruto);
    if (valor !== 2 && valor !== 3 && valor !== 4) return null;
    return valor;
  } catch {
    return null;
  }
}

/** Salva a preferência; silencioso quando o armazenamento não está disponível. */
export function storeColumnsPreference(preference: number): void {
  try {
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, String(clampColumnsPreference(preference)));
  } catch {
    // Sem armazenamento a tela continua funcionando; a preferência só não sobrevive.
  }
}

export function useContainerColumns(
  ref: RefObject<HTMLElement | null>,
  preference: ColumnsPreference | number,
): ContainerColumns {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const medir = () => setWidth(element.getBoundingClientRect().width);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(medir);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    storeColumnsPreference(preference);
  }, [preference]);

  return {
    columns:
      width === null
        ? clampColumnsPreference(preference)
        : resolveContainerColumns(width, preference),
    width,
  };
}

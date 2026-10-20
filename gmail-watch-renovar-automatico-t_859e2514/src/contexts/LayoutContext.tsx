import { createContext, useContext } from 'react';

interface LayoutContextValue {
  /** true = o PageHeader não desenha a própria trilha (desktop: sem texto de módulo/submódulo no topo). */
  hidePageBreadcrumbs: boolean;
  /** Estado e ação do modo Zen, compartilhados com cabeçalhos internos do layout. */
  isZen?: boolean;
  toggleZen?: () => void;
}

const LayoutContext = createContext<LayoutContextValue>({ hidePageBreadcrumbs: false });

export const LayoutProvider = LayoutContext.Provider;

export function useLayoutContext(): LayoutContextValue {
  return useContext(LayoutContext);
}

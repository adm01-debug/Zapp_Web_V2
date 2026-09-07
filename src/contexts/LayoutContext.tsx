import { createContext, useContext } from 'react';

interface LayoutContextValue {
  hasBreadcrumbBar: boolean;
}

const LayoutContext = createContext<LayoutContextValue>({ hasBreadcrumbBar: false });

export const LayoutProvider = LayoutContext.Provider;

export function useLayoutContext(): LayoutContextValue {
  return useContext(LayoutContext);
}

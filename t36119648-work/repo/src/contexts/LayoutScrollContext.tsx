import { createContext, useContext, useRef, RefObject } from 'react';

const LayoutScrollContext = createContext<RefObject<HTMLDivElement | null>>({ current: null } as RefObject<HTMLDivElement | null>);

export const LayoutScrollProvider = LayoutScrollContext.Provider;

export function useLayoutScroll(): RefObject<HTMLDivElement | null> {
  return useContext(LayoutScrollContext);
}

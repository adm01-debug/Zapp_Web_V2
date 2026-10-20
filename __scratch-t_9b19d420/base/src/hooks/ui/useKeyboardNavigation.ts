 import { useEffect } from 'react';
 
 interface KeyboardNavigationOptions {
   goBack: () => void;
   goForward: () => void;
   setCurrentView: (viewId: string) => void;
   canGoBack: boolean;
 }
 
 export function useKeyboardNavigation({
   goBack,
   goForward,
   setCurrentView,
   canGoBack
 }: KeyboardNavigationOptions) {
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       const target = e.target as HTMLElement;
       const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
 
       if (e.altKey && e.key === 'ArrowLeft') {
         e.preventDefault();
         goBack();
       } else if (e.altKey && e.key === 'ArrowRight') {
         e.preventDefault();
         goForward();
       } else if (e.key === 'Escape' && !isInput) {
         const hasOpenDialog = document.querySelector('[data-state="open"][role="dialog"]');
         if (!hasOpenDialog && canGoBack) {
           goBack();
         }
       } else if (e.altKey && e.key === 'Home') {
         e.preventDefault();
         setCurrentView('inbox');
       }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, [goBack, goForward, canGoBack, setCurrentView]);
 }
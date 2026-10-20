 export function A11yBoilerplate() {
   return (
     <>
       {/* Skip to content — a11y */}
       <a
         href="#main-content"
         className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
       >
         Pular para o conteúdo
       </a>
 
       {/* Accessible live region for screen reader announcements */}
       <div
         id="a11y-status"
         role="status"
         aria-live="polite"
         aria-atomic="true"
         className="sr-only"
       />
       <div
         id="a11y-alert"
         role="alert"
         aria-live="assertive"
         aria-atomic="true"
         className="sr-only"
       />
     </>
   );
 }
 import { useEffect, useRef } from 'react';
 import { useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { toast } from 'sonner';
 import {
   consumeGmailOAuthReturnContext,
   parseGmailOAuthState,
   setPendingIntegrationView
 } from '@/lib/gmailOAuth';
 
 export function useGmailOAuth(user: any, loading: boolean, setCurrentView: (view: string) => void) {
   const queryClient = useQueryClient();
   const handledRef = useRef(false);
 
   useEffect(() => {
     if (loading || !user || handledRef.current) return;
 
     const searchParams = new URLSearchParams(window.location.search);
     const code = searchParams.get('code');
     const oauthError = searchParams.get('error');
     const issuer = searchParams.get('iss');
     const oauthState = parseGmailOAuthState(searchParams.get('state'));
     const hasGmailOAuthParams = Boolean(code || oauthError || issuer === 'https://accounts.google.com');
 
     if (!hasGmailOAuthParams) return;
 
     handledRef.current = true;
 
     const fallbackContext = consumeGmailOAuthReturnContext();
     const returnView = oauthState?.view || fallbackContext.view;
     const integrationView = oauthState?.integrationView || fallbackContext.integrationView;
 
     if (integrationView) {
       setPendingIntegrationView(integrationView);
     }
 
     const returnToSavedView = () => {
       window.history.replaceState(null, '', window.location.pathname);
       setCurrentView(returnView);
     };
 
     if (oauthError) {
       toast.error('Conexão com Gmail cancelada.');
       returnToSavedView();
       return;
     }
 
     if (!code) {
       returnToSavedView();
       return;
     }
 
     void (async () => {
       try {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) throw new Error('Sessão expirada.');
 
         const response = await supabase.functions.invoke('gmail-oauth', {
           body: { action: 'exchange-code', code },
           headers: { Authorization: `Bearer ${session.access_token}` },
         });
 
         if (response.error) throw new Error(response.error.message);
 
         await Promise.all([
           queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] }),
           queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }),
         ]);
 
         toast.success('Gmail conectado com sucesso!');
       } catch (error) {
         toast.error(`Erro na autenticação: ${error instanceof Error ? error.message : 'Falha'}`);
       } finally {
         returnToSavedView();
       }
     })();
   }, [loading, queryClient, setCurrentView, user]);
 }
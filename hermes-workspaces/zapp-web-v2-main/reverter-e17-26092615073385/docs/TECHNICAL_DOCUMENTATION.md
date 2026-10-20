# 📚 Documentação Técnica Completa - Sistema de Atendimento WhatsApp

> **Versão:** 1.0.0  
> **Última atualização:** Dezembro 2024  
> **Stack:** React + TypeScript + Supabase + Tailwind CSS

---

## 📋 Índice

1. [Arquitetura Geral](#arquitetura-geral)
2. [Autenticação & Usuários](#1-autenticação--usuários)
3. [Inbox/Chat em Tempo Real](#2-inboxchat-em-tempo-real)
4. [Inteligência Artificial](#3-inteligência-artificial)
5. [Gestão de Contatos](#4-gestão-de-contatos)
6. [Filas de Atendimento](#5-filas-de-atendimento)
7. [SLA (Service Level Agreement)](#6-sla-service-level-agreement)
8. [Gamificação](#7-gamificação)
9. [Conexões WhatsApp](#8-conexões-whatsapp)
10. [Catálogo de Produtos](#9-catálogo-de-produtos)
11. [Relatórios & Analytics](#10-relatórios--analytics)
12. [Configurações](#11-configurações)
13. [Chamadas](#12-chamadas)
14. [Grupos WhatsApp](#13-grupos-whatsapp)
15. [Carteira de Clientes](#14-carteira-de-clientes)
16. [Auditoria](#15-auditoria)

---

## Arquitetura Geral

### Stack Tecnológica

```json
{
  "frontend": {
    "framework": "React 18.3.1",
    "language": "TypeScript",
    "styling": "Tailwind CSS + shadcn/ui",
    "state": "TanStack Query + React Context",
    "routing": "React Router DOM 6.x",
    "animations": "Framer Motion"
  },
  "backend": {
    "platform": "Supabase (Lovable Cloud)",
    "database": "PostgreSQL",
    "auth": "Supabase Auth",
    "realtime": "Supabase Realtime",
    "storage": "Supabase Storage",
    "functions": "Deno Edge Functions"
  },
  "integrations": {
    "whatsapp": "Evolution API",
    "ai": "Lovable AI Gateway (Gemini/GPT)",
    "maps": "Mapbox GL"
  }
}
```

### Estrutura de Pastas

```
src/
├── components/           # Componentes React
│   ├── ui/              # Componentes base (shadcn)
│   ├── inbox/           # Chat e mensagens
│   ├── dashboard/       # Dashboard e métricas
│   ├── gamification/    # Sistema de gamificação
│   └── ...
├── hooks/               # Custom hooks
├── pages/               # Páginas/rotas
├── lib/                 # Utilitários
├── types/               # Tipos TypeScript
└── integrations/        # Integrações (Supabase)

supabase/
├── functions/           # Edge Functions
└── config.toml          # Configuração
```

---

## 1. Autenticação & Usuários

### Descrição
Sistema completo de autenticação com suporte a múltiplos níveis de acesso (admin, supervisor, agent).

### Tabelas do Banco

```sql
-- Perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'agent',
  department TEXT,
  job_title TEXT,
  phone TEXT,
  max_chats INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Roles de usuário (separado para segurança)
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Função para verificar role
CREATE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para verificar admin/supervisor
CREATE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
```

### Hook Principal

**Arquivo:** `src/hooks/useAuth.tsx`

```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Configurar listener de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Buscar perfil
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .single();
          setProfile(profile);
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### Hook de Roles

**Arquivo:** `src/hooks/useUserRole.ts`

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type AppRole = 'admin' | 'supervisor' | 'agent';

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole>('agent');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      setRole(data?.role || 'agent');
      setIsLoading(false);
    };

    fetchRole();
  }, [user]);

  const isAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor';
  const isAgent = role === 'agent';
  const canManage = isAdmin || isSupervisor;

  return { role, isAdmin, isSupervisor, isAgent, canManage, isLoading };
}
```

### Dependências
```json
{
  "@supabase/supabase-js": "^2.87.1"
}
```

---

## 2. Inbox/Chat em Tempo Real

### Descrição
Sistema de mensagens em tempo real com suporte a múltiplos tipos de mídia, reações, respostas citadas e status de entrega.

### Tabelas do Banco

```sql
-- Mensagens
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id),
  agent_id UUID REFERENCES public.profiles(id),
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  sender TEXT NOT NULL, -- 'agent' | 'contact'
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- text, image, audio, video, document, location
  media_url TEXT,
  external_id TEXT, -- ID da mensagem no WhatsApp
  status TEXT DEFAULT 'sent', -- sent, delivered, read, failed
  status_updated_at TIMESTAMPTZ DEFAULT now(),
  is_read BOOLEAN DEFAULT false,
  transcription TEXT,
  transcription_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Reações
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id),
  user_id UUID REFERENCES public.profiles(id),
  contact_id UUID REFERENCES public.contacts(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Hook de Mensagens em Tempo Real

**Arquivo:** `src/hooks/useRealtimeMessages.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface Message {
  id: string;
  contact_id: string;
  sender: 'agent' | 'contact';
  content: string;
  message_type: string;
  media_url?: string;
  status?: string;
  created_at: string;
}

export function useRealtimeMessages(contactId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Buscar mensagens iniciais
  const fetchMessages = useCallback(async () => {
    if (!contactId) return;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
    setIsLoading(false);
  }, [contactId]);

  // Configurar Realtime
  useEffect(() => {
    if (!contactId) return;

    fetchMessages();

    // Subscription para novas mensagens
    const channel: RealtimeChannel = supabase
      .channel(`messages:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, fetchMessages]);

  // Enviar mensagem
  const sendMessage = async (content: string, type = 'text', mediaUrl?: string) => {
    if (!contactId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { error } = await supabase.from('messages').insert({
      contact_id: contactId,
      agent_id: profile?.id,
      sender: 'agent',
      content,
      message_type: type,
      media_url: mediaUrl,
    });

    if (error) throw error;
  };

  // Marcar como lidas
  const markAsRead = async () => {
    if (!contactId) return;

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('contact_id', contactId)
      .eq('sender', 'contact')
      .eq('is_read', false);
  };

  return { messages, isLoading, sendMessage, markAsRead, refetch: fetchMessages };
}
```

### Componente de Chat

**Arquivo:** `src/components/inbox/ChatPanel.tsx` (estrutura simplificada)

```typescript
import { useState, useRef, useEffect } from 'react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Paperclip, Mic, Smile } from 'lucide-react';

interface ChatPanelProps {
  contactId: string;
}

export function ChatPanel({ contactId }: ChatPanelProps) {
  const { messages, isLoading, sendMessage, markAsRead } = useRealtimeMessages(contactId);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Marcar como lidas ao abrir
  useEffect(() => {
    markAsRead();
  }, [contactId]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    
    await sendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensagem */}
      <div className="border-t p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Paperclip className="h-5 w-5" />
          </Button>
          
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem..."
            className="flex-1"
          />
          
          <Button variant="ghost" size="icon">
            <Smile className="h-5 w-5" />
          </Button>
          
          <Button variant="ghost" size="icon">
            <Mic className="h-5 w-5" />
          </Button>
          
          <Button onClick={handleSend} disabled={!inputValue.trim()}>
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Hook de Status de Mensagem

**Arquivo:** `src/hooks/useMessageStatus.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MessageStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  status_updated_at: string;
}

export function useMessageStatus(contactId?: string) {
  const [statusUpdates, setStatusUpdates] = useState<Map<string, MessageStatusUpdate>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!contactId) return;

    // Buscar status iniciais
    const fetchStatuses = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, status, status_updated_at')
        .eq('contact_id', contactId)
        .eq('sender', 'agent');

      if (data) {
        const map = new Map();
        data.forEach((msg) => map.set(msg.id, msg));
        setStatusUpdates(map);
      }
      setIsLoading(false);
    };

    fetchStatuses();

    // Subscription para atualizações
    const channel = supabase
      .channel(`status:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          const { id, status, status_updated_at } = payload.new;
          setStatusUpdates((prev) => {
            const updated = new Map(prev);
            updated.set(id, { id, status, status_updated_at });
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  const getMessageStatus = useCallback(
    (messageId: string) => statusUpdates.get(messageId)?.status,
    [statusUpdates]
  );

  return { statusUpdates, getMessageStatus, isLoading };
}
```

### Gravação de Áudio

**Arquivo:** `src/hooks/useAudioRecorder.ts`

```typescript
import { useState, useRef, useCallback } from 'react';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  duration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      // Timer de duração
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      setIsRecording(false);
    });
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  return { isRecording, duration, startRecording, stopRecording, cancelRecording };
}
```

### Dependências
```json
{
  "@supabase/supabase-js": "^2.87.1",
  "lucide-react": "^0.462.0",
  "framer-motion": "^12.23.26"
}
```

---

## 3. Inteligência Artificial

### Descrição
Integração com IA para sugestões de resposta, resumo de conversas, análise de sentimento e alertas automáticos.

### Tabelas do Banco

```sql
-- Análises de conversa
CREATE TABLE public.conversation_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  analyzed_by UUID REFERENCES public.profiles(id),
  summary TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  sentiment TEXT DEFAULT 'neutro', -- positivo, neutro, negativo
  sentiment_score INTEGER DEFAULT 50, -- 0-100
  topics TEXT[] DEFAULT '{}',
  key_points TEXT[] DEFAULT '{}',
  next_steps TEXT[] DEFAULT '{}',
  urgency TEXT DEFAULT 'media', -- baixa, media, alta, critica
  customer_satisfaction INTEGER DEFAULT 3, -- 1-5
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Edge Function - Sugestão de Resposta

**Arquivo:** `supabase/functions/ai-suggest-reply/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    // Formatar histórico de mensagens
    const conversationHistory = messages.map((msg: any) => ({
      role: msg.sender === 'agent' ? 'assistant' : 'user',
      content: msg.content,
    }));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente de atendimento ao cliente profissional e empático.
            
Contexto do cliente:
${context ? JSON.stringify(context) : 'Não disponível'}

Sua tarefa é sugerir 3 respostas diferentes para a última mensagem do cliente:
1. Uma resposta formal e profissional
2. Uma resposta amigável e casual
3. Uma resposta empática e acolhedora

Retorne as sugestões em formato JSON:
{
  "suggestions": [
    { "type": "formal", "content": "..." },
    { "type": "casual", "content": "..." },
    { "type": "empathetic", "content": "..." }
  ]
}`,
          },
          ...conversationHistory,
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'suggest_replies',
              description: 'Retorna sugestões de resposta',
              parameters: {
                type: 'object',
                properties: {
                  suggestions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['formal', 'casual', 'empathetic'] },
                        content: { type: 'string' },
                      },
                      required: ['type', 'content'],
                    },
                  },
                },
                required: ['suggestions'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'suggest_replies' } },
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall) {
      const suggestions = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(suggestions), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Resposta inválida da IA');
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Edge Function - Resumo de Conversa

**Arquivo:** `supabase/functions/ai-conversation-summary/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contactId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Buscar mensagens do contato
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!messages?.length) {
      throw new Error('Nenhuma mensagem encontrada');
    }

    // Buscar dados do contato
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    const conversationText = messages
      .map((m) => `${m.sender === 'agent' ? 'Atendente' : 'Cliente'}: ${m.content}`)
      .join('\n');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Analise a conversa e forneça um resumo estruturado.
            
Cliente: ${contact?.name || 'Desconhecido'}

Forneça:
1. Resumo geral (2-3 frases)
2. Principais tópicos discutidos
3. Sentimento geral (positivo/neutro/negativo)
4. Próximos passos sugeridos
5. Nível de urgência (baixa/media/alta/critica)`,
          },
          { role: 'user', content: conversationText },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'analyze_conversation',
              parameters: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  topics: { type: 'array', items: { type: 'string' } },
                  sentiment: { type: 'string', enum: ['positivo', 'neutro', 'negativo'] },
                  sentiment_score: { type: 'integer', minimum: 0, maximum: 100 },
                  next_steps: { type: 'array', items: { type: 'string' } },
                  urgency: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'] },
                  key_points: { type: 'array', items: { type: 'string' } },
                },
                required: ['summary', 'topics', 'sentiment', 'urgency'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'analyze_conversation' } },
      }),
    });

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.tool_calls[0].function.arguments);

    // Salvar análise no banco
    const { data: savedAnalysis, error } = await supabase
      .from('conversation_analyses')
      .insert({
        contact_id: contactId,
        ...analysis,
        message_count: messages.length,
      })
      .select()
      .single();

    return new Response(JSON.stringify(savedAnalysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Hook de Análises

**Arquivo:** `src/hooks/useConversationAnalyses.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  summary: string;
  status: string;
  sentiment: string;
  sentiment_score: number;
  topics: string[];
  key_points: string[];
  next_steps: string[];
  urgency: string;
  message_count: number;
  created_at: string;
}

export function useConversationAnalyses(contactId: string | null) {
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    if (!contactId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('conversation_analyses')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      setError(error.message);
    } else {
      setAnalyses(data || []);
    }
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  const saveAnalysis = async (analysis: Omit<ConversationAnalysis, 'id' | 'created_at'>) => {
    const { data: user } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('conversation_analyses')
      .insert({
        ...analysis,
        analyzed_by: user?.user?.id,
      })
      .select()
      .single();

    if (error) throw error;
    
    setAnalyses((prev) => [data, ...prev]);
    return data;
  };

  const getLatestAnalysis = () => analyses[0] || null;

  const getSentimentTrend = () => {
    if (analyses.length < 2) return 'stable';
    
    const recent = analyses.slice(0, 3).map((a) => a.sentiment_score);
    const older = analyses.slice(3, 6).map((a) => a.sentiment_score);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    
    if (recentAvg > olderAvg + 10) return 'improving';
    if (recentAvg < olderAvg - 10) return 'declining';
    return 'stable';
  };

  return {
    analyses,
    loading,
    error,
    saveAnalysis,
    getLatestAnalysis,
    getSentimentTrend,
    refetch: fetchAnalyses,
  };
}
```

### Dependências
```json
{
  "@supabase/supabase-js": "^2.87.1"
}
```

---

## 4. Gestão de Contatos

### Descrição
Sistema completo de gerenciamento de contatos com tags, notas privadas, atribuição a agentes e histórico.

### Tabelas do Banco

```sql
-- Contatos
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  surname TEXT,
  nickname TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  company TEXT,
  job_title TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  assigned_to UUID REFERENCES public.profiles(id),
  queue_id UUID REFERENCES public.queues(id),
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Relacionamento Contato-Tag
CREATE TABLE public.contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  tag_id UUID NOT NULL REFERENCES public.tags(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

-- Notas privadas
CREATE TABLE public.contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Hook de Tags

**Arquivo:** `src/hooks/useTags.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name');

    if (!error && data) {
      setTags(data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = async (tag: Omit<Tag, 'id'>) => {
    const { data, error } = await supabase
      .from('tags')
      .insert(tag)
      .select()
      .single();

    if (error) throw error;
    setTags((prev) => [...prev, data]);
    return data;
  };

  const updateTag = async (id: string, updates: Partial<Tag>) => {
    const { data, error } = await supabase
      .from('tags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setTags((prev) => prev.map((t) => (t.id === id ? data : t)));
    return data;
  };

  const deleteTag = async (id: string) => {
    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setTags((prev) => prev.filter((t) => t.id !== id));
  };

  const addTagToContact = async (contactId: string, tagId: string) => {
    const { error } = await supabase
      .from('contact_tags')
      .insert({ contact_id: contactId, tag_id: tagId });

    if (error && error.code !== '23505') throw error; // Ignora duplicados
  };

  const removeTagFromContact = async (contactId: string, tagId: string) => {
    const { error } = await supabase
      .from('contact_tags')
      .delete()
      .match({ contact_id: contactId, tag_id: tagId });

    if (error) throw error;
  };

  return {
    tags,
    isLoading,
    createTag,
    updateTag,
    deleteTag,
    addTagToContact,
    removeTagFromContact,
    refetch: fetchTags,
  };
}
```

### Hook de Notas

**Arquivo:** `src/hooks/useContactNotes.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: {
    name: string;
    avatar_url?: string;
  };
}

export function useContactNotes(contactId: string | null) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;

    const { data, error } = await supabase
      .from('contact_notes')
      .select(`
        *,
        author:profiles!author_id(name, avatar_url)
      `)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotes(data);
    }
    setIsLoading(false);
  }, [contactId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = async (content: string) => {
    if (!contactId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    const { data, error } = await supabase
      .from('contact_notes')
      .insert({
        contact_id: contactId,
        author_id: profile?.id,
        content,
      })
      .select(`
        *,
        author:profiles!author_id(name, avatar_url)
      `)
      .single();

    if (error) throw error;
    setNotes((prev) => [data, ...prev]);
    return data;
  };

  const updateNote = async (noteId: string, content: string) => {
    const { data, error } = await supabase
      .from('contact_notes')
      .update({ content })
      .eq('id', noteId)
      .select()
      .single();

    if (error) throw error;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, content } : n)));
    return data;
  };

  const deleteNote = async (noteId: string) => {
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) throw error;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  return { notes, isLoading, addNote, updateNote, deleteNote, refetch: fetchNotes };
}
```

---

## 5. Filas de Atendimento

### Descrição
Sistema de filas para organização e distribuição de atendimentos entre agentes.

### Tabelas do Banco

```sql
-- Filas
CREATE TABLE public.queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  priority INTEGER DEFAULT 0,
  max_wait_time_minutes INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Membros da fila
CREATE TABLE public.queue_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.queues(id),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(queue_id, profile_id)
);

-- Metas da fila
CREATE TABLE public.queue_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.queues(id),
  max_waiting_contacts INTEGER DEFAULT 10,
  max_avg_wait_minutes INTEGER DEFAULT 15,
  max_messages_pending INTEGER DEFAULT 50,
  min_assignment_rate INTEGER DEFAULT 80,
  alerts_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(queue_id)
);
```

### Hook de Filas

**Arquivo:** `src/hooks/useQueues.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Queue {
  id: string;
  name: string;
  description?: string;
  color: string;
  priority: number;
  max_wait_time_minutes: number;
  is_active: boolean;
  members?: QueueMember[];
}

interface QueueMember {
  id: string;
  profile_id: string;
  is_active: boolean;
  profile?: {
    name: string;
    avatar_url?: string;
  };
}

export function useQueues() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchQueues = useCallback(async () => {
    const { data, error } = await supabase
      .from('queues')
      .select(`
        *,
        members:queue_members(
          id,
          profile_id,
          is_active,
          profile:profiles(name, avatar_url)
        )
      `)
      .order('priority', { ascending: false });

    if (!error && data) {
      setQueues(data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  const createQueue = async (queue: Omit<Queue, 'id' | 'members'>) => {
    const { data, error } = await supabase
      .from('queues')
      .insert(queue)
      .select()
      .single();

    if (error) throw error;
    setQueues((prev) => [...prev, { ...data, members: [] }]);
    return data;
  };

  const updateQueue = async (id: string, updates: Partial<Queue>) => {
    const { data, error } = await supabase
      .from('queues')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setQueues((prev) => prev.map((q) => (q.id === id ? { ...q, ...data } : q)));
    return data;
  };

  const deleteQueue = async (id: string) => {
    const { error } = await supabase.from('queues').delete().eq('id', id);
    if (error) throw error;
    setQueues((prev) => prev.filter((q) => q.id !== id));
  };

  const addMember = async (queueId: string, profileId: string) => {
    const { data, error } = await supabase
      .from('queue_members')
      .insert({ queue_id: queueId, profile_id: profileId })
      .select(`
        id,
        profile_id,
        is_active,
        profile:profiles(name, avatar_url)
      `)
      .single();

    if (error) throw error;
    
    setQueues((prev) =>
      prev.map((q) =>
        q.id === queueId ? { ...q, members: [...(q.members || []), data] } : q
      )
    );
    return data;
  };

  const removeMember = async (queueId: string, memberId: string) => {
    const { error } = await supabase
      .from('queue_members')
      .delete()
      .eq('id', memberId);

    if (error) throw error;
    
    setQueues((prev) =>
      prev.map((q) =>
        q.id === queueId
          ? { ...q, members: q.members?.filter((m) => m.id !== memberId) }
          : q
      )
    );
  };

  return {
    queues,
    isLoading,
    createQueue,
    updateQueue,
    deleteQueue,
    addMember,
    removeMember,
    refetch: fetchQueues,
  };
}
```

### Hook de Metas

**Arquivo:** `src/hooks/useQueueGoals.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface QueueGoals {
  id: string;
  queue_id: string;
  max_waiting_contacts: number;
  max_avg_wait_minutes: number;
  max_messages_pending: number;
  min_assignment_rate: number;
  alerts_enabled: boolean;
}

export function useQueueGoals(queueId: string | null) {
  const [goals, setGoals] = useState<QueueGoals | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!queueId) return;

    const { data, error } = await supabase
      .from('queue_goals')
      .select('*')
      .eq('queue_id', queueId)
      .single();

    if (!error && data) {
      setGoals(data);
    }
    setIsLoading(false);
  }, [queueId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const saveGoals = async (newGoals: Omit<QueueGoals, 'id'>) => {
    const { data, error } = await supabase
      .from('queue_goals')
      .upsert(newGoals, { onConflict: 'queue_id' })
      .select()
      .single();

    if (error) throw error;
    setGoals(data);
    return data;
  };

  return { goals, isLoading, saveGoals, refetch: fetchGoals };
}
```

---

## 6. SLA (Service Level Agreement)

### Descrição
Sistema de monitoramento de tempo de resposta e resolução com alertas e histórico.

### Tabelas do Banco

```sql
-- Configurações de SLA
CREATE TABLE public.sla_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  priority TEXT DEFAULT 'medium', -- low, medium, high, critical
  first_response_minutes INTEGER DEFAULT 5,
  resolution_minutes INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SLA por conversa
CREATE TABLE public.conversation_sla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id),
  sla_configuration_id UUID REFERENCES public.sla_configurations(id),
  first_message_at TIMESTAMPTZ DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  first_response_breached BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_breached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Hook de Métricas SLA

**Arquivo:** `src/hooks/useSLAMetrics.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SLAMetrics {
  totalConversations: number;
  withinSLA: number;
  breached: number;
  avgFirstResponseMinutes: number;
  avgResolutionMinutes: number;
  slaComplianceRate: number;
}

export function useSLAMetrics(dateRange?: { start: Date; end: Date }) {
  const [metrics, setMetrics] = useState<SLAMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    let query = supabase
      .from('conversation_sla')
      .select('*');

    if (dateRange) {
      query = query
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar métricas SLA:', error);
      return;
    }

    if (data) {
      const total = data.length;
      const breached = data.filter(
        (d) => d.first_response_breached || d.resolution_breached
      ).length;
      const withinSLA = total - breached;

      // Calcular médias
      const responseTimes = data
        .filter((d) => d.first_response_at)
        .map((d) => {
          const start = new Date(d.first_message_at);
          const response = new Date(d.first_response_at!);
          return (response.getTime() - start.getTime()) / 60000;
        });

      const resolutionTimes = data
        .filter((d) => d.resolved_at)
        .map((d) => {
          const start = new Date(d.first_message_at);
          const resolved = new Date(d.resolved_at!);
          return (resolved.getTime() - start.getTime()) / 60000;
        });

      setMetrics({
        totalConversations: total,
        withinSLA,
        breached,
        avgFirstResponseMinutes:
          responseTimes.length
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0,
        avgResolutionMinutes:
          resolutionTimes.length
            ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
            : 0,
        slaComplianceRate: total ? (withinSLA / total) * 100 : 100,
      });
    }

    setIsLoading(false);
  }, [dateRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, isLoading, refetch: fetchMetrics };
}
```

---

## 7. Gamificação

### Descrição
Sistema de engajamento com XP, níveis, conquistas, streaks e leaderboard.

### Tabelas do Banco

```sql
-- Stats do agente
CREATE TABLE public.agent_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) UNIQUE,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  achievements_count INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  conversations_resolved INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  customer_satisfaction_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Conquistas
CREATE TABLE public.agent_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  achievement_name TEXT NOT NULL,
  achievement_type TEXT NOT NULL,
  achievement_description TEXT,
  xp_earned INTEGER DEFAULT 0,
  earned_at TIMESTAMPTZ DEFAULT now()
);

-- Função para calcular nível
CREATE FUNCTION public.calculate_level(xp_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN GREATEST(1, FLOOR(SQRT(xp_amount / 50.0))::INTEGER + 1);
END;
$$;

-- Trigger para atualizar nível
CREATE FUNCTION public.update_agent_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.level := calculate_level(NEW.xp);
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_level_update
BEFORE UPDATE OF xp ON public.agent_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_agent_level();
```

### Hook de Gamificação

**Arquivo:** `src/hooks/useAgentGamification.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AgentStats {
  id: string;
  profile_id: string;
  xp: number;
  level: number;
  achievements_count: number;
  messages_sent: number;
  conversations_resolved: number;
  current_streak: number;
  best_streak: number;
}

interface Achievement {
  id: string;
  achievement_name: string;
  achievement_type: string;
  achievement_description?: string;
  xp_earned: number;
  earned_at: string;
}

export function useAgentGamification(profileId?: string) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profileId) return;

    // Buscar stats
    const { data: statsData } = await supabase
      .from('agent_stats')
      .select('*')
      .eq('profile_id', profileId)
      .single();

    // Buscar conquistas
    const { data: achievementsData } = await supabase
      .from('agent_achievements')
      .select('*')
      .eq('profile_id', profileId)
      .order('earned_at', { ascending: false });

    if (statsData) setStats(statsData);
    if (achievementsData) setAchievements(achievementsData);
    setIsLoading(false);
  }, [profileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addXP = async (amount: number) => {
    if (!profileId || !stats) return;

    const { data, error } = await supabase
      .from('agent_stats')
      .update({ xp: stats.xp + amount })
      .eq('profile_id', profileId)
      .select()
      .single();

    if (!error && data) {
      setStats(data);
    }
    return data;
  };

  const grantAchievement = async (
    name: string,
    type: string,
    description: string,
    xpReward: number
  ) => {
    if (!profileId) return;

    // Verificar se já tem a conquista
    const existing = achievements.find(
      (a) => a.achievement_name === name && a.achievement_type === type
    );
    if (existing) return null;

    // Inserir conquista
    const { data: achievement, error } = await supabase
      .from('agent_achievements')
      .insert({
        profile_id: profileId,
        achievement_name: name,
        achievement_type: type,
        achievement_description: description,
        xp_earned: xpReward,
      })
      .select()
      .single();

    if (error) throw error;

    // Adicionar XP
    await addXP(xpReward);

    // Atualizar contador
    await supabase
      .from('agent_stats')
      .update({ achievements_count: (stats?.achievements_count || 0) + 1 })
      .eq('profile_id', profileId);

    setAchievements((prev) => [achievement, ...prev]);
    return achievement;
  };

  const updateStreak = async (increment: boolean) => {
    if (!profileId || !stats) return;

    const newStreak = increment ? stats.current_streak + 1 : 0;
    const newBest = Math.max(newStreak, stats.best_streak);

    const { data, error } = await supabase
      .from('agent_stats')
      .update({
        current_streak: newStreak,
        best_streak: newBest,
      })
      .eq('profile_id', profileId)
      .select()
      .single();

    if (!error && data) {
      setStats(data);
    }
    return data;
  };

  const incrementMessageCount = async () => {
    if (!profileId || !stats) return;

    await supabase
      .from('agent_stats')
      .update({ messages_sent: stats.messages_sent + 1 })
      .eq('profile_id', profileId);

    setStats((prev) =>
      prev ? { ...prev, messages_sent: prev.messages_sent + 1 } : prev
    );
  };

  const incrementResolved = async () => {
    if (!profileId || !stats) return;

    await supabase
      .from('agent_stats')
      .update({ conversations_resolved: stats.conversations_resolved + 1 })
      .eq('profile_id', profileId);

    setStats((prev) =>
      prev ? { ...prev, conversations_resolved: prev.conversations_resolved + 1 } : prev
    );
  };

  return {
    stats,
    achievements,
    isLoading,
    addXP,
    grantAchievement,
    updateStreak,
    incrementMessageCount,
    incrementResolved,
    refetch: fetchData,
  };
}
```

### Provider de Gamificação

**Arquivo:** `src/components/gamification/GamificationProvider.tsx`

```typescript
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAgentGamification } from '@/hooks/useAgentGamification';
import { AchievementToast } from './AchievementToast';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  type: string;
}

interface GamificationContextType {
  showAchievement: (achievement: Achievement) => void;
  triggerFastResponse: () => Promise<void>;
  triggerStreak: (days: number) => Promise<void>;
  triggerMilestone: (type: string, count: number) => Promise<void>;
  stats: ReturnType<typeof useAgentGamification>['stats'];
  achievements: ReturnType<typeof useAgentGamification>['achievements'];
}

const GamificationContext = createContext<GamificationContextType | null>(null);

export function GamificationProvider({
  children,
  profileId,
}: {
  children: ReactNode;
  profileId?: string;
}) {
  const gamification = useAgentGamification(profileId);
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const [queue, setQueue] = useState<Achievement[]>([]);

  const showAchievement = useCallback((achievement: Achievement) => {
    if (currentAchievement) {
      setQueue((prev) => [...prev, achievement]);
    } else {
      setCurrentAchievement(achievement);
    }
  }, [currentAchievement]);

  const handleClose = useCallback(() => {
    setCurrentAchievement(null);
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrentAchievement(next);
      setQueue(rest);
    }
  }, [queue]);

  const triggerFastResponse = async () => {
    const achievement = await gamification.grantAchievement(
      'Raio',
      'speed',
      'Respondeu em menos de 1 minuto',
      25
    );
    if (achievement) {
      showAchievement({
        id: achievement.id,
        name: 'Raio',
        description: 'Respondeu em menos de 1 minuto',
        icon: '⚡',
        xp: 25,
        type: 'speed',
      });
    }
  };

  const triggerStreak = async (days: number) => {
    const name = days >= 30 ? 'Mestre' : days >= 7 ? 'Veterano' : 'Iniciante';
    const xp = days >= 30 ? 500 : days >= 7 ? 100 : 25;

    const achievement = await gamification.grantAchievement(
      `Streak ${name}`,
      'streak',
      `${days} dias consecutivos atendendo`,
      xp
    );

    if (achievement) {
      showAchievement({
        id: achievement.id,
        name: `Streak ${name}`,
        description: `${days} dias consecutivos atendendo`,
        icon: '🔥',
        xp,
        type: 'streak',
      });
    }
  };

  const triggerMilestone = async (type: string, count: number) => {
    const milestones = [10, 50, 100, 500, 1000];
    const milestone = milestones.find((m) => count === m);
    if (!milestone) return;

    const xp = milestone * 2;
    const achievement = await gamification.grantAchievement(
      `${milestone} ${type}`,
      'milestone',
      `Alcançou ${milestone} ${type}`,
      xp
    );

    if (achievement) {
      showAchievement({
        id: achievement.id,
        name: `${milestone} ${type}`,
        description: `Alcançou ${milestone} ${type}`,
        icon: '🏆',
        xp,
        type: 'milestone',
      });
    }
  };

  return (
    <GamificationContext.Provider
      value={{
        showAchievement,
        triggerFastResponse,
        triggerStreak,
        triggerMilestone,
        stats: gamification.stats,
        achievements: gamification.achievements,
      }}
    >
      {children}
      {currentAchievement && (
        <AchievementToast
          achievement={currentAchievement}
          onClose={handleClose}
        />
      )}
    </GamificationContext.Provider>
  );
}

export const useGamification = () => {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within GamificationProvider');
  }
  return context;
};
```

---

## 8. Conexões WhatsApp

### Descrição
Integração com Evolution API para conexão real com WhatsApp, incluindo QR Code, status e envio de mensagens.

### Tabelas do Banco

```sql
-- Conexões WhatsApp
CREATE TABLE public.whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  instance_id TEXT,
  qr_code TEXT,
  status TEXT DEFAULT 'disconnected', -- connected, disconnected, connecting, pending
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Horário comercial
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id),
  day_of_week INTEGER NOT NULL, -- 0=Sunday
  is_open BOOLEAN DEFAULT true,
  open_time TIME DEFAULT '09:00',
  close_time TIME DEFAULT '18:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mensagem de ausência
CREATE TABLE public.away_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) UNIQUE,
  content TEXT DEFAULT 'Estamos fora do horário de atendimento.',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Edge Function - Evolution API

**Arquivo:** `supabase/functions/evolution-api/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();
  
  const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
  const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Evolution API não configurada' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = req.method === 'POST' || req.method === 'DELETE'
      ? await req.json()
      : null;

    switch (action) {
      case 'create-instance': {
        const { instanceName } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'connect': {
        const { instanceName } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'status': {
        const { instanceName } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-text': {
        const { instanceName, number, text } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            text,
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-media': {
        const { instanceName, number, mediaUrl, mediaType, caption } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            mediatype: mediaType,
            media: mediaUrl,
            caption,
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-audio': {
        const { instanceName, number, mediaUrl } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendWhatsAppAudio/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            audio: mediaUrl,
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-location': {
        const { instanceName, number, latitude, longitude, locationName, locationAddress } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/message/sendLocation/${instanceName}`, {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number,
            latitude,
            longitude,
            name: locationName,
            address: locationAddress,
          }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'disconnect': {
        const { instanceName } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete-instance': {
        const { instanceName } = body;
        
        const response = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'list-instances': {
        const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
          method: 'GET',
          headers: { 'apikey': EVOLUTION_API_KEY },
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Ação não reconhecida' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Erro Evolution API:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Hook Evolution API

**Arquivo:** `src/hooks/useEvolutionApi.ts`

```typescript
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SendMessageParams {
  instanceName: string;
  number: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;
}

export function useEvolutionApi() {
  const [isLoading, setIsLoading] = useState(false);

  const callEvolutionApi = async (
    action: string,
    body?: object,
    method: 'GET' | 'POST' | 'DELETE' = 'POST'
  ) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(`evolution-api/${action}`, {
        method,
        body,
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error(`Evolution API error (${action}):`, error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const createInstance = async (instanceName: string) => {
    try {
      const data = await callEvolutionApi('create-instance', { instanceName });
      toast.success('Instância criada com sucesso');
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar instância');
      throw error;
    }
  };

  const connectInstance = async (instanceName: string) => {
    return callEvolutionApi('connect', { instanceName });
  };

  const getInstanceStatus = async (instanceName: string) => {
    return callEvolutionApi('status', { instanceName });
  };

  const sendTextMessage = async (instanceName: string, number: string, text: string) => {
    try {
      const data = await callEvolutionApi('send-text', { instanceName, number, text });
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar mensagem');
      throw error;
    }
  };

  const sendMediaMessage = async (params: SendMessageParams) => {
    try {
      const data = await callEvolutionApi('send-media', params);
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar mídia');
      throw error;
    }
  };

  const sendAudioMessage = async (instanceName: string, number: string, mediaUrl: string) => {
    return callEvolutionApi('send-audio', { instanceName, number, mediaUrl });
  };

  const sendLocationMessage = async (params: SendMessageParams) => {
    return callEvolutionApi('send-location', params);
  };

  const disconnectInstance = async (instanceName: string) => {
    try {
      const data = await callEvolutionApi('disconnect', { instanceName });
      toast.success('Instância desconectada');
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao desconectar');
      throw error;
    }
  };

  const deleteInstance = async (instanceName: string) => {
    try {
      const data = await callEvolutionApi('delete-instance', { instanceName }, 'DELETE');
      toast.success('Instância excluída');
      return data;
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir instância');
      throw error;
    }
  };

  const listInstances = async () => {
    return callEvolutionApi('list-instances', undefined, 'GET');
  };

  return {
    isLoading,
    createInstance,
    connectInstance,
    getInstanceStatus,
    sendTextMessage,
    sendMediaMessage,
    sendAudioMessage,
    sendLocationMessage,
    disconnectInstance,
    deleteInstance,
    listInstances,
  };
}
```

---

## 9. Catálogo de Produtos

### Descrição
Sistema de gestão de produtos com suporte a envio via chat.

### Tabelas do Banco

```sql
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'BRL',
  category TEXT,
  sku TEXT,
  retailer_id TEXT,
  image_url TEXT,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Componente de Card de Produto

**Arquivo:** `src/components/catalog/ProductCard.tsx`

```typescript
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Edit, Trash } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  image_url?: string;
  stock_quantity: number;
  is_active: boolean;
}

interface ProductCardProps {
  product: Product;
  onSend?: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
  showActions?: boolean;
}

export function ProductCard({
  product,
  onSend,
  onEdit,
  onDelete,
  showActions = true,
}: ProductCardProps) {
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(price);
  };

  return (
    <Card className="overflow-hidden">
      {product.image_url && (
        <div className="aspect-square overflow-hidden">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">{product.name}</h3>
            {product.category && (
              <Badge variant="secondary" className="mt-1">
                {product.category}
              </Badge>
            )}
          </div>
          <span className="font-bold text-primary">
            {formatPrice(product.price, product.currency)}
          </span>
        </div>
        
        {product.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {product.description}
          </p>
        )}
        
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={product.stock_quantity > 0 ? 'default' : 'destructive'}>
            {product.stock_quantity > 0
              ? `${product.stock_quantity} em estoque`
              : 'Sem estoque'}
          </Badge>
          {!product.is_active && (
            <Badge variant="outline">Inativo</Badge>
          )}
        </div>
      </CardContent>
      
      {showActions && (
        <CardFooter className="p-4 pt-0 gap-2">
          {onSend && (
            <Button size="sm" onClick={() => onSend(product)}>
              <Send className="w-4 h-4 mr-1" />
              Enviar
            </Button>
          )}
          {onEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(product)}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
          {onDelete && (
            <Button size="sm" variant="destructive" onClick={() => onDelete(product)}>
              <Trash className="w-4 h-4" />
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
```

---

## 10. Relatórios & Analytics

### Descrição
Dashboard com métricas, gráficos e exportação de relatórios.

### Hook de Dashboard

**Arquivo:** `src/hooks/useDashboardData.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, subDays } from 'date-fns';

interface DashboardMetrics {
  totalConversations: number;
  activeConversations: number;
  resolvedToday: number;
  avgResponseTime: number;
  totalMessages: number;
  messagesReceived: number;
  messagesSent: number;
  customerSatisfaction: number;
}

interface ChartData {
  date: string;
  messages: number;
  conversations: number;
}

export function useDashboardData(dateRange?: { start: Date; end: Date }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const start = dateRange?.start || subDays(new Date(), 7);
    const end = dateRange?.end || new Date();

    // Buscar contatos
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Buscar mensagens
    const { data: messages } = await supabase
      .from('messages')
      .select('id, sender, created_at')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Buscar conversas resolvidas hoje
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    
    const { data: resolvedToday } = await supabase
      .from('conversation_sla')
      .select('id')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', todayStart.toISOString())
      .lte('resolved_at', todayEnd.toISOString());

    // Calcular métricas
    const totalMessages = messages?.length || 0;
    const messagesReceived = messages?.filter((m) => m.sender === 'contact').length || 0;
    const messagesSent = messages?.filter((m) => m.sender === 'agent').length || 0;

    setMetrics({
      totalConversations: contacts?.length || 0,
      activeConversations: 0, // Calcular baseado em status
      resolvedToday: resolvedToday?.length || 0,
      avgResponseTime: 0, // Calcular baseado em SLA
      totalMessages,
      messagesReceived,
      messagesSent,
      customerSatisfaction: 4.5, // Média de avaliações
    });

    // Gerar dados para gráfico
    const chartDataMap = new Map<string, ChartData>();
    
    messages?.forEach((msg) => {
      const date = new Date(msg.created_at).toISOString().split('T')[0];
      const existing = chartDataMap.get(date) || { date, messages: 0, conversations: 0 };
      existing.messages++;
      chartDataMap.set(date, existing);
    });

    contacts?.forEach((contact) => {
      const date = new Date(contact.created_at).toISOString().split('T')[0];
      const existing = chartDataMap.get(date) || { date, messages: 0, conversations: 0 };
      existing.conversations++;
      chartDataMap.set(date, existing);
    });

    setChartData(Array.from(chartDataMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
    setIsLoading(false);
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { metrics, chartData, isLoading, refetch: fetchData };
}
```

### Utilitário de Exportação

**Arquivo:** `src/utils/exportReport.ts`

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ReportData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: Record<string, string | number>;
}

export function exportToPDF(data: ReportData): void {
  const doc = new jsPDF();
  
  // Título
  doc.setFontSize(18);
  doc.text(data.title, 14, 22);
  
  // Data de geração
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
  
  // Tabela
  autoTable(doc, {
    head: [data.headers],
    body: data.rows,
    startY: 35,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  // Resumo
  if (data.summary) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text('Resumo:', 14, finalY);
    
    let y = finalY + 8;
    Object.entries(data.summary).forEach(([key, value]) => {
      doc.setFontSize(10);
      doc.text(`${key}: ${value}`, 14, y);
      y += 6;
    });
  }
  
  doc.save(`${data.title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

export function exportToExcel(data: ReportData): void {
  const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  
  // Adicionar resumo em nova aba
  if (data.summary) {
    const summaryData = Object.entries(data.summary).map(([k, v]) => [k, v]);
    const wsSummary = XLSX.utils.aoa_to_sheet([['Métrica', 'Valor'], ...summaryData]);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
  }
  
  XLSX.writeFile(wb, `${data.title.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
}

export function exportToCSV(data: ReportData): void {
  const csvContent = [
    data.headers.join(','),
    ...data.rows.map((row) => row.join(',')),
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${data.title.toLowerCase().replace(/\s+/g, '-')}.csv`;
  link.click();
}
```

### Dependências de Relatórios
```json
{
  "jspdf": "^3.0.4",
  "jspdf-autotable": "^5.0.2",
  "xlsx": "^0.18.5",
  "recharts": "^2.15.4"
}
```

---

## 11. Configurações

### Descrição
Sistema de configurações do usuário com preferências de tema, notificações, horário comercial e mensagens automáticas.

### Tabela do Banco

```sql
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  theme TEXT DEFAULT 'system', -- light, dark, system
  language TEXT DEFAULT 'pt-BR',
  compact_mode BOOLEAN DEFAULT false,
  sound_enabled BOOLEAN DEFAULT true,
  browser_notifications_enabled BOOLEAN DEFAULT true,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '07:00',
  business_hours_enabled BOOLEAN DEFAULT true,
  business_hours_start TEXT DEFAULT '09:00',
  business_hours_end TEXT DEFAULT '18:00',
  work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  auto_assignment_enabled BOOLEAN DEFAULT true,
  auto_assignment_method TEXT DEFAULT 'roundrobin',
  inactivity_timeout INTEGER DEFAULT 30,
  welcome_message TEXT DEFAULT '',
  away_message TEXT DEFAULT '',
  closing_message TEXT DEFAULT '',
  sentiment_alert_enabled BOOLEAN DEFAULT true,
  sentiment_alert_threshold INTEGER DEFAULT 30,
  sentiment_consecutive_count INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
```

### Hook de Configurações

**Arquivo:** `src/hooks/useUserSettings.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface UserSettings {
  id: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  compact_mode: boolean;
  sound_enabled: boolean;
  browser_notifications_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  work_days: number[];
  auto_assignment_enabled: boolean;
  auto_assignment_method: string;
  inactivity_timeout: number;
  welcome_message: string;
  away_message: string;
  closing_message: string;
  sentiment_alert_enabled: boolean;
  sentiment_alert_threshold: number;
}

const defaultSettings: Omit<UserSettings, 'id'> = {
  theme: 'system',
  language: 'pt-BR',
  compact_mode: false,
  sound_enabled: true,
  browser_notifications_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  business_hours_enabled: true,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  auto_assignment_enabled: true,
  auto_assignment_method: 'roundrobin',
  inactivity_timeout: 30,
  welcome_message: '',
  away_message: '',
  closing_message: '',
  sentiment_alert_enabled: true,
  sentiment_alert_threshold: 30,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Criar configurações padrão
      const { data: newSettings } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, ...defaultSettings })
        .select()
        .single();
      setSettings(newSettings);
    } else if (data) {
      setSettings(data);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!user || !settings) return;

    const { data, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    setSettings(data);
    return data;
  };

  return { settings, isLoading, updateSettings, refetch: fetchSettings };
}
```

---

## 12. Chamadas

### Descrição
Sistema de registro e gerenciamento de ligações telefônicas.

### Tabela do Banco

```sql
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id),
  agent_id UUID REFERENCES public.profiles(id),
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  direction TEXT NOT NULL, -- inbound, outbound
  status TEXT DEFAULT 'ringing', -- ringing, answered, missed, busy, failed
  started_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Hook de Chamadas

**Arquivo:** `src/hooks/useCalls.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Call {
  id: string;
  contact_id: string;
  agent_id?: string;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'answered' | 'missed' | 'busy' | 'failed';
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  recording_url?: string;
  notes?: string;
  contact?: {
    name: string;
    phone: string;
  };
}

export function useCalls(contactId?: string) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCalls = useCallback(async () => {
    let query = supabase
      .from('calls')
      .select(`
        *,
        contact:contacts(name, phone)
      `)
      .order('started_at', { ascending: false })
      .limit(50);

    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { data, error } = await query;

    if (!error && data) {
      setCalls(data);
    }
    setIsLoading(false);
  }, [contactId]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const createCall = async (call: Omit<Call, 'id' | 'started_at'>) => {
    const { data, error } = await supabase
      .from('calls')
      .insert(call)
      .select()
      .single();

    if (error) throw error;
    setCalls((prev) => [data, ...prev]);
    return data;
  };

  const updateCall = async (id: string, updates: Partial<Call>) => {
    const { data, error } = await supabase
      .from('calls')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    setCalls((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  };

  const endCall = async (id: string, notes?: string) => {
    const call = calls.find((c) => c.id === id);
    if (!call) return;

    const endedAt = new Date().toISOString();
    const startedAt = new Date(call.answered_at || call.started_at);
    const durationSeconds = Math.floor((new Date(endedAt).getTime() - startedAt.getTime()) / 1000);

    return updateCall(id, {
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      status: 'answered',
      notes,
    });
  };

  return { calls, isLoading, createCall, updateCall, endCall, refetch: fetchCalls };
}
```

---

## 13. Grupos WhatsApp

### Descrição
Gerenciamento de grupos do WhatsApp.

### Tabela do Banco

```sql
CREATE TABLE public.whatsapp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  participant_count INTEGER DEFAULT 0,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 14. Carteira de Clientes

### Descrição
Sistema de distribuição automática de clientes para agentes.

### Tabela do Banco

```sql
CREATE TABLE public.client_wallet_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.profiles(id),
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para auto-atribuição
CREATE FUNCTION public.auto_assign_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_agent_id UUID;
BEGIN
  SELECT agent_id INTO assigned_agent_id
  FROM public.client_wallet_rules
  WHERE is_active = true
    AND (whatsapp_connection_id IS NULL OR whatsapp_connection_id = NEW.whatsapp_connection_id)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;
  
  IF assigned_agent_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := assigned_agent_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER contact_auto_assign
BEFORE INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_contact();
```

---

## 15. Auditoria

### Descrição
Sistema de logs para rastreamento de ações.

### Tabela do Banco

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Utilitário de Auditoria

**Arquivo:** `src/lib/audit.ts`

```typescript
import { supabase } from '@/integrations/supabase/client';

type AuditAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'send_message'
  | 'assign'
  | 'transfer';

interface AuditLogParams {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, any>;
}

export async function logAudit({
  action,
  entityType,
  entityId,
  details,
}: AuditLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      user_agent: navigator.userAgent,
    });
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
  }
}

// Helpers
export const auditLogin = () => logAudit({ action: 'login' });
export const auditLogout = () => logAudit({ action: 'logout' });

export const auditCreate = (entityType: string, entityId: string, details?: Record<string, any>) =>
  logAudit({ action: 'create', entityType, entityId, details });

export const auditUpdate = (entityType: string, entityId: string, details?: Record<string, any>) =>
  logAudit({ action: 'update', entityType, entityId, details });

export const auditDelete = (entityType: string, entityId: string) =>
  logAudit({ action: 'delete', entityType, entityId });

export const auditSendMessage = (contactId: string, messageType: string) =>
  logAudit({ action: 'send_message', entityType: 'message', details: { contactId, messageType } });

export const auditAssign = (contactId: string, agentId: string) =>
  logAudit({ action: 'assign', entityType: 'contact', entityId: contactId, details: { agentId } });

export const auditTransfer = (contactId: string, fromAgent: string, toAgent: string) =>
  logAudit({
    action: 'transfer',
    entityType: 'contact',
    entityId: contactId,
    details: { fromAgent, toAgent },
  });
```

---

## 📦 Dependências Completas

```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-*": "latest",
    "@supabase/supabase-js": "^2.87.1",
    "@tanstack/react-query": "^5.83.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^3.6.0",
    "embla-carousel-react": "^8.6.0",
    "framer-motion": "^12.23.26",
    "jspdf": "^3.0.4",
    "jspdf-autotable": "^5.0.2",
    "lucide-react": "^0.462.0",
    "mapbox-gl": "^3.17.0",
    "next-themes": "^0.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.61.1",
    "react-resizable-panels": "^2.1.9",
    "react-router-dom": "^6.30.1",
    "recharts": "^2.15.4",
    "sonner": "^1.7.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "vaul": "^0.9.9",
    "xlsx": "^0.18.5",
    "zod": "^3.25.76"
  }
}
```

---

## 🔐 Variáveis de Ambiente Necessárias

```env
# Supabase (automático via Lovable Cloud)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Evolution API (para WhatsApp)
EVOLUTION_API_URL=
EVOLUTION_API_KEY=

# Mapbox (para localização)
MAPBOX_PUBLIC_TOKEN=

# Lovable AI (automático)
LOVABLE_API_KEY=
```

---

## 📝 Notas de Implementação

### Padrões Recomendados

1. **Hooks personalizados** para toda lógica de dados
2. **Componentes pequenos** e focados
3. **RLS habilitado** em todas as tabelas
4. **Triggers** para automações
5. **Realtime** para atualizações em tempo real
6. **Edge Functions** para integrações externas

### Segurança

- Nunca armazenar roles na tabela de perfis
- Usar `SECURITY DEFINER` em funções sensíveis
- Validar permissões via RLS
- Sanitizar inputs do usuário
- Usar HTTPS em todas as chamadas

---

*Documentação gerada automaticamente para padronização entre projetos.*

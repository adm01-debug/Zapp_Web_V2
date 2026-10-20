# 🏗️ Template de Projeto Base - WhatsApp CRM

Este documento serve como guia completo para criar novos projetos seguindo a mesma arquitetura e padrões deste sistema.

---

## 📁 Estrutura de Pastas

```
projeto-base/
├── docs/                           # Documentação do projeto
│   ├── TECHNICAL_DOCUMENTATION.md  # Documentação técnica detalhada
│   └── PROJECT_TEMPLATE.md         # Este arquivo
│
├── public/                         # Arquivos estáticos públicos
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
│
├── src/
│   ├── assets/                     # Imagens e recursos estáticos
│   │
│   ├── components/                 # Componentes React
│   │   ├── ui/                     # Componentes base (shadcn/ui)
│   │   │   ├── accordion.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── sonner.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   └── tooltip.tsx
│   │   │
│   │   ├── layout/                 # Componentes de layout
│   │   │   └── Sidebar.tsx
│   │   │
│   │   ├── theme/                  # Tema e dark mode
│   │   │   └── ThemeToggle.tsx
│   │   │
│   │   └── [feature]/              # Componentes por feature
│   │       └── FeatureComponent.tsx
│   │
│   ├── hooks/                      # Custom hooks
│   │   ├── use-mobile.tsx          # Detecção de mobile
│   │   ├── use-toast.ts            # Sistema de notificações
│   │   ├── useAuth.tsx             # Autenticação
│   │   ├── useDebounce.ts          # Debounce utility
│   │   └── [feature].ts            # Hooks por feature
│   │
│   ├── integrations/               # Integrações externas
│   │   └── supabase/
│   │       ├── client.ts           # Cliente Supabase (auto-gerado)
│   │       └── types.ts            # Tipos do banco (auto-gerado)
│   │
│   ├── lib/                        # Utilitários e libs
│   │   ├── utils.ts                # Funções utilitárias (cn, etc)
│   │   └── audit.ts                # Sistema de auditoria
│   │
│   ├── pages/                      # Páginas da aplicação
│   │   ├── Auth.tsx                # Login/Registro
│   │   ├── Index.tsx               # Página principal
│   │   └── NotFound.tsx            # 404
│   │
│   ├── types/                      # Tipos TypeScript
│   │   └── [feature].ts
│   │
│   ├── utils/                      # Funções utilitárias
│   │   └── [utility].ts
│   │
│   ├── App.tsx                     # Componente raiz
│   ├── App.css                     # Estilos globais
│   ├── index.css                   # Design system (Tailwind)
│   ├── main.tsx                    # Entry point
│   └── vite-env.d.ts               # Tipos do Vite
│
├── supabase/
│   ├── config.toml                 # Configuração Supabase (auto-gerado)
│   ├── migrations/                 # Migrações do banco
│   │   └── YYYYMMDDHHMMSS_nome.sql
│   └── functions/                  # Edge Functions
│       └── [function-name]/
│           └── index.ts
│
├── .env                            # Variáveis de ambiente (auto-gerado)
├── components.json                 # Configuração shadcn/ui
├── eslint.config.js                # Configuração ESLint
├── index.html                      # HTML template
├── package.json                    # Dependências
├── postcss.config.js               # Configuração PostCSS
├── tailwind.config.ts              # Configuração Tailwind
├── tsconfig.json                   # Configuração TypeScript
└── vite.config.ts                  # Configuração Vite
```

---

## 🎨 Design System Base

### index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Cores Base */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    
    /* Cards e Superfícies */
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    
    /* Cores Primárias */
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    
    /* Cores Secundárias */
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    
    /* Estados */
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    
    /* Bordas e Inputs */
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    
    /* Gráficos */
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    
    /* Layout */
    --radius: 0.5rem;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## 📦 Dependências Essenciais

### package.json (dependências principais)

```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@supabase/supabase-js": "^2.87.1",
    "@tanstack/react-query": "^5.83.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "framer-motion": "^12.23.26",
    "lucide-react": "^0.462.0",
    "next-themes": "^0.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.61.1",
    "react-router-dom": "^6.30.1",
    "recharts": "^2.15.4",
    "sonner": "^1.7.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.25.76"
  }
}
```

---

## 🔧 Arquivos de Configuração Base

### tailwind.config.ts

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

### vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
```

---

## 🚀 Componentes Base Essenciais

### src/lib/utils.ts

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### src/main.tsx

```typescript
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </QueryClientProvider>
);
```

### src/App.tsx

```typescript
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<Index />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
```

---

## 🔐 Hook de Autenticação Base

### src/hooks/useAuth.tsx

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Verificar sessão existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escutar mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === 'SIGNED_OUT') {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

---

## 📊 Hook de Query Base (React Query + Supabase)

### src/hooks/useQuery.ts (Exemplo)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Hook genérico para buscar dados
export function useSupabaseQuery<T>(
  queryKey: string[],
  tableName: string,
  options?: {
    select?: string;
    filter?: { column: string; value: any };
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
  }
) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase.from(tableName).select(options?.select || '*');
      
      if (options?.filter) {
        query = query.eq(options.filter.column, options.filter.value);
      }
      
      if (options?.orderBy) {
        query = query.order(options.orderBy.column, { 
          ascending: options.orderBy.ascending ?? false 
        });
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as T[];
    },
  });
}

// Hook genérico para inserir dados
export function useSupabaseInsert<T>(tableName: string, queryKey: string[]) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newData: Partial<T>) => {
      const { data, error } = await supabase
        .from(tableName)
        .insert(newData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Registro criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}

// Hook genérico para atualizar dados
export function useSupabaseUpdate<T>(tableName: string, queryKey: string[]) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<T> }) => {
      const { data: result, error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Registro atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}

// Hook genérico para deletar dados
export function useSupabaseDelete(tableName: string, queryKey: string[]) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Registro removido!');
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}
```

---

## 🗄️ Migrações Base do Banco de Dados

### Tabela de Profiles (Essencial)

```sql
-- Criar tabela de profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
CREATE POLICY "Usuários podem ver todos os profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários podem atualizar próprio profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir próprio profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
```

### Tabela de Audit Logs (Recomendado)

```sql
-- Criar tabela de logs de auditoria
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver logs
CREATE POLICY "Admins podem ver todos os logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Qualquer usuário autenticado pode inserir logs
CREATE POLICY "Usuários podem criar logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

---

## 📝 Checklist de Implementação

### Fase 1: Setup Inicial
- [ ] Criar projeto Lovable
- [ ] Habilitar Lovable Cloud (Supabase)
- [ ] Configurar autenticação (auto-confirm email)
- [ ] Criar tabela profiles com trigger
- [ ] Implementar página de Auth

### Fase 2: Estrutura Base
- [ ] Configurar design system (index.css)
- [ ] Instalar componentes shadcn/ui essenciais
- [ ] Criar layout com Sidebar
- [ ] Implementar ThemeToggle (dark mode)
- [ ] Configurar React Query

### Fase 3: Funcionalidades Core
- [ ] Implementar hook useAuth
- [ ] Criar hooks de query genéricos
- [ ] Implementar sistema de toast/notificações
- [ ] Criar sistema de auditoria

### Fase 4: Features Específicas
- [ ] Implementar features do domínio
- [ ] Criar Edge Functions necessárias
- [ ] Configurar Realtime onde necessário
- [ ] Implementar dashboards/relatórios

### Fase 5: Polish
- [ ] Revisar responsividade
- [ ] Otimizar performance
- [ ] Revisar segurança (RLS)
- [ ] Documentar API/Componentes

---

## 🔗 Recursos Úteis

- [Documentação Shadcn/ui](https://ui.shadcn.com/)
- [Documentação Tailwind CSS](https://tailwindcss.com/docs)
- [Documentação React Query](https://tanstack.com/query/latest)
- [Documentação Supabase](https://supabase.com/docs)
- [Documentação Lovable](https://docs.lovable.dev/)

---

## 📋 Padrões de Código

### Nomenclatura
- **Componentes**: PascalCase (`UserProfile.tsx`)
- **Hooks**: camelCase com prefixo use (`useUserData.ts`)
- **Utilitários**: camelCase (`formatDate.ts`)
- **Tipos**: PascalCase (`UserProfile`, `ChatMessage`)
- **Constantes**: SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE`)

### Estrutura de Componente

```typescript
// Imports
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Types
interface ComponentProps {
  id: string;
  className?: string;
}

// Component
export function Component({ id, className }: ComponentProps) {
  // Hooks
  const [state, setState] = useState(false);
  
  // Queries
  const { data, isLoading } = useQuery({ ... });
  
  // Handlers
  const handleClick = () => { ... };
  
  // Early returns
  if (isLoading) return <Skeleton />;
  
  // Render
  return (
    <div className={cn("base-styles", className)}>
      {/* content */}
    </div>
  );
}
```

---

*Este template é mantido e atualizado conforme novas funcionalidades são adicionadas ao sistema principal.*

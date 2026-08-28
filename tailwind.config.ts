import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Fluid responsive sizes (CSS custom properties)
        "fluid-xs": "var(--text-xs)",
        "fluid-sm": "var(--text-sm)",
        "fluid-base": "var(--text-base)",
        "fluid-lg": "var(--text-lg)",
        "fluid-xl": "var(--text-xl)",
        "fluid-2xl": "var(--text-2xl)",
        "fluid-3xl": "var(--text-3xl)",
        "fluid-4xl": "var(--text-4xl)",
        // Modular typographic scale (1.25 ratio)
        "2xs": ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.02em" }],
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        sm: ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.01em" }],
        base: ["1rem", { lineHeight: "1.5rem", letterSpacing: "0" }],
        lg: ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.875rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.03em" }],
        "5xl": ["3rem", { lineHeight: "3.25rem", letterSpacing: "-0.03em" }],
        "6xl": ["3.75rem", { lineHeight: "4rem", letterSpacing: "-0.04em" }],
        "7xl": ["4.5rem", { lineHeight: "4.75rem", letterSpacing: "-0.04em" }],
        "8xl": ["6rem", { lineHeight: "6.25rem", letterSpacing: "-0.05em" }],
        "9xl": ["8rem", { lineHeight: "8.25rem", letterSpacing: "-0.05em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
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
          elevated: "hsl(var(--card-elevated))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        xp: {
          DEFAULT: "hsl(var(--xp))",
          foreground: "hsl(var(--xp-foreground))",
        },
        coins: {
          DEFAULT: "hsl(var(--coins))",
          foreground: "hsl(var(--coins-foreground))",
        },
        streak: {
          DEFAULT: "hsl(var(--streak))",
          foreground: "hsl(var(--streak-foreground))",
        },
        "rank-gold": {
          DEFAULT: "hsl(var(--rank-gold))",
          foreground: "hsl(var(--rank-gold-foreground))",
        },
        "rank-silver": {
          DEFAULT: "hsl(var(--rank-silver))",
          foreground: "hsl(var(--rank-silver-foreground))",
        },
        "rank-bronze": {
          DEFAULT: "hsl(var(--rank-bronze))",
          foreground: "hsl(var(--rank-bronze-foreground))",
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
        whatsapp: {
          DEFAULT: "hsl(var(--whatsapp))",
          dark: "hsl(var(--whatsapp-dark))",
        },
        status: {
          online: "hsl(var(--online))",
          away: "hsl(var(--away))",
          offline: "hsl(var(--offline))",
          open: "hsl(var(--status-open))",
          pending: "hsl(var(--status-pending))",
          resolved: "hsl(var(--status-resolved))",
          waiting: "hsl(var(--status-waiting))",
        },
        priority: {
          high: "hsl(var(--priority-high))",
          medium: "hsl(var(--priority-medium))",
          low: "hsl(var(--priority-low))",
        },
        chat: {
          sent: "hsl(var(--chat-bubble-sent))",
          "sent-foreground": "hsl(var(--chat-bubble-sent-foreground))",
          received: "hsl(var(--chat-bubble-received))",
          "received-foreground": "hsl(var(--chat-bubble-received-foreground))",
          header: "hsl(var(--chat-header))",
          "input-bg": "hsl(var(--chat-input-bg))",
        },
        elevated: {
          DEFAULT: "hsl(var(--elevated))",
          hover: "hsl(var(--elevated-hover))",
        },
        tonal: {
          50:  "hsl(var(--primary-50))",
          100: "hsl(var(--primary-100))",
          200: "hsl(var(--primary-200))",
          300: "hsl(var(--primary-300))",
          400: "hsl(var(--primary-400))",
          500: "hsl(var(--primary-500))",
          600: "hsl(var(--primary-600))",
          700: "hsl(var(--primary-700))",
          800: "hsl(var(--primary-800))",
          900: "hsl(var(--primary-900))",
          950: "hsl(var(--primary-950))",
        },
        neutral: {
          50:  "hsl(var(--neutral-50))",
          100: "hsl(var(--neutral-100))",
          200: "hsl(var(--neutral-200))",
          300: "hsl(var(--neutral-300))",
          400: "hsl(var(--neutral-400))",
          500: "hsl(var(--neutral-500))",
          600: "hsl(var(--neutral-600))",
          700: "hsl(var(--neutral-700))",
          800: "hsl(var(--neutral-800))",
          900: "hsl(var(--neutral-900))",
          950: "hsl(var(--neutral-950))",
        },
      },
      spacing: {
        // 8px grid system
        "0.5": "0.125rem", // 2px
        "1": "0.25rem",    // 4px
        "1.5": "0.375rem", // 6px
        "2": "0.5rem",     // 8px (base)
        "2.5": "0.625rem", // 10px
        "3": "0.75rem",    // 12px
        "3.5": "0.875rem", // 14px
        "4": "1rem",       // 16px
        "5": "1.25rem",    // 20px
        "6": "1.5rem",     // 24px
        "7": "1.75rem",    // 28px
        "8": "2rem",       // 32px
        "9": "2.25rem",    // 36px
        "10": "2.5rem",    // 40px
        "11": "2.75rem",   // 44px
        "12": "3rem",      // 48px
        "14": "3.5rem",    // 56px
        "16": "4rem",      // 64px
        "18": "4.5rem",    // 72px
        "20": "5rem",      // 80px
        "24": "6rem",      // 96px
        card: "var(--spacing-card)",
        "card-sm": "var(--spacing-card-sm)",
        "card-lg": "var(--spacing-card-lg)",
        section: "var(--spacing-section)",
        "section-lg": "var(--spacing-section-lg)",
      },
      /* fontSize unified above — single definition */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 12px)",
        "token-xs":  "var(--radius-xs)",
        "token-sm":  "var(--radius-sm)",
        "token-md":  "var(--radius-md)",
        "token-lg":  "var(--radius-lg)",
        "token-xl":  "var(--radius-xl)",
        "token-2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "glow-primary": "var(--shadow-glow-primary)",
        "glow-secondary": "var(--shadow-glow-secondary)",
        "glow-success": "var(--shadow-glow-success)",
        header: "var(--shadow-header)",
        elevated: "0 4px 20px -2px hsl(var(--foreground) / 0.08)",
        "elev-0": "var(--elev-0)",
        "elev-1": "var(--elev-1)",
        "elev-2": "var(--elev-2)",
        "elev-3": "var(--elev-3)",
        "elev-4": "var(--elev-4)",
        "elev-5": "var(--elev-5)",
        "glow-primary-sm": "var(--glow-primary-sm)",
        "glow-primary-md": "var(--glow-primary-md)",
        "glow-primary-lg": "var(--glow-primary-lg)",
        "glow-secondary-sm": "var(--glow-secondary-sm)",
        "glow-secondary-md": "var(--glow-secondary-md)",
        "glow-secondary-lg": "var(--glow-secondary-lg)",
        "glow-accent-sm": "var(--glow-accent-sm)",
        "glow-accent-md": "var(--glow-accent-md)",
        "glow-destructive-md": "var(--glow-destructive-md)",
        "glow-success-md": "var(--glow-success-md)",
        "glow-whatsapp-md": "var(--glow-whatsapp-md)",
        "glow-whatsapp-lg": "var(--glow-whatsapp-lg)",
        "glow-xp-md": "var(--glow-xp-md)",
        "glow-coins-md": "var(--glow-coins-md)",
        "glow-streak-md": "var(--glow-streak-md)",
        "glow-rank-gold-md": "var(--glow-rank-gold-md)",
        "glow-aura-secondary": "var(--glow-aura-secondary)",
        "glow-aura-gradient": "var(--glow-aura-gradient)",
        "glow-aura-neon": "var(--glow-aura-neon)",
        "glow-neon-inset": "var(--glow-neon-inset)",
      },
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
        "250": "250ms",
        "300": "300ms",
        "400": "400ms",
        "500": "500ms",
      },
      transitionTimingFunction: {
        "bounce-in": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-up": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          from: { transform: "translateY(-10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-left": {
          from: { transform: "translateX(10px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-right": {
          from: { transform: "translateX(-10px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "scale-out": {
          from: { transform: "scale(1)", opacity: "1" },
          to: { transform: "scale(0.95)", opacity: "0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.5" },
          "50%": { transform: "scale(1.2)", opacity: "0" },
          "100%": { transform: "scale(0.8)", opacity: "0.5" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 5px hsl(var(--primary) / 0.3)" },
          "50%": { boxShadow: "0 0 20px hsl(var(--primary) / 0.6)" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "hsl(var(--primary) / 0.3)" },
          "50%": { borderColor: "hsl(var(--primary) / 0.8)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        typing: {
          "0%, 60%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "30%": { opacity: "1", transform: "scale(1.2)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "fade-out": "fade-out 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "slide-left": "slide-left 0.3s ease-out",
        "slide-right": "slide-right 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "scale-out": "scale-out 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "bounce-in": "bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        shimmer: "shimmer 2s linear infinite",
        float: "float 3s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "border-glow": "border-glow 2s ease-in-out infinite",
        wiggle: "wiggle 0.3s ease-in-out",
        pop: "pop 0.3s ease-out",
        "count-up": "count-up 0.4s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        typing: "typing 1.4s ease-in-out infinite",
        enter: "fade-in 0.3s ease-out, scale-in 0.2s ease-out",
        exit: "fade-out 0.3s ease-out, scale-out 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

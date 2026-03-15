/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        // ── Primary (Indigo) — main brand ────────────────────────────────
        primary: {
          DEFAULT: '#4F46E5',
          foreground: '#ffffff',
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },

        // ── Saradhi (legacy alias → indigo for zero-breakage transition) ─
        saradhi: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          DEFAULT: '#4F46E5',
        },

        // ── Accent (Orange) — CTA / student highlights ───────────────────
        accent: {
          DEFAULT: '#F97316',
          foreground: '#ffffff',
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },

        // ── Coral (legacy alias → orange-aligned) ────────────────────────
        coral: {
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
          DEFAULT: '#F97316',
        },

        // ── AI (Teal) ─────────────────────────────────────────────────────
        teal: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          DEFAULT: '#14b8a6',
        },

        // ── Neutral (Slate) ───────────────────────────────────────────────
        slate: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },

        // ── Semantic ──────────────────────────────────────────────────────
        success: {
          DEFAULT: '#22C55E',
          50:  '#F0FDF4',
          100: '#DCFCE7',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        warning: {
          DEFAULT: '#F59E0B',
          50:  '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        error: {
          DEFAULT: '#EF4444',
          50:  '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        info: {
          DEFAULT: '#3B82F6',
          50:  '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },

        // ── shadcn/ui CSS-var tokens ──────────────────────────────────────
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ── Subject color map ─────────────────────────────────────────────
        subject: {
          math:        '#3b82f6',
          physics:     '#8b5cf6',
          chemistry:   '#10b981',
          biology:     '#059669',
          cs:          '#f59e0b',
          literature:  '#f43f5e',
          art:         '#ec4899',
          engineering: '#6366f1',
          general:     '#64748b',
        },
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'source-code-pro', 'Menlo', 'monospace'],
      },

      boxShadow: {
        'card':          '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover':    '0 4px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.10)',
        'glass':         '0 8px 32px rgba(79, 70, 229, 0.08)',
        'glass-lg':      '0 16px 48px rgba(79, 70, 229, 0.12)',
        'glow-primary':  '0 0 24px rgba(79, 70, 229, 0.30)',
        'glow-accent':   '0 0 24px rgba(249, 115, 22, 0.30)',
        'glow-teal':     '0 0 24px rgba(20, 184, 166, 0.25)',
        // legacy shadow aliases
        'glow-saradhi':  '0 0 24px rgba(79, 70, 229, 0.30)',
        'glow-coral':    '0 0 24px rgba(249, 115, 22, 0.30)',
        'sidebar':       '4px 0 24px rgba(0, 0, 0, 0.08)',
        'topbar':        '0 2px 16px rgba(0, 0, 0, 0.06)',
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-slide-in": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "shimmer-glass": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "slide-up": {
          "0%":   { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
        "score-pop": {
          "0%":   { transform: "scale(1)" },
          "50%":  { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-6px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
      },

      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "page-in":         "fade-slide-in 0.2s ease-out both",
        "fade-up":         "fade-up 0.3s ease-out both",
        "slide-in-left":   "slide-in-left 0.25s ease-out both",
        "slide-in-right":  "slide-in-right 0.25s ease-out both",
        shimmer:           "shimmer 1.6s linear infinite",
        "shimmer-glass":   "shimmer-glass 2s linear infinite",
        "slide-up":        "slide-up 0.25s ease-out both",
        "score-pop":       "score-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        float:             "float 3s ease-in-out infinite",
        "pulse-glow":      "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

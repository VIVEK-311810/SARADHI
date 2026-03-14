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
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // Updated to saradhi violet — all bg-primary-* classes now use brand color
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
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

        // ── SARADHI Brand Colors ────────────────────────────────────────
        saradhi: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          DEFAULT: '#6d28d9',
        },

        // Student accent — warm coral
        coral: {
          50:  '#fff4f2',
          100: '#ffe4de',
          200: '#ffc9be',
          300: '#ffa48f',
          400: '#ff7a60',
          500: '#f25c3a',
          600: '#d94424',
          700: '#b63018',
          800: '#952718',
          900: '#7a2418',
          DEFAULT: '#f25c3a',
        },

        // AI accent — teal
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

        // Warm slate — neutral foundation
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
        },

        // Subject color map (for badges and tags)
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
        'glass':         '0 8px 32px rgba(0,0,0,0.08)',
        'glow-saradhi':  '0 0 24px rgba(109, 40, 217, 0.25)',
        'glow-coral':    '0 0 24px rgba(242, 92, 58, 0.25)',
        'glow-teal':     '0 0 24px rgba(20, 184, 166, 0.25)',
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
        shimmer: {
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
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "page-in":        "fade-slide-in 0.2s ease-out both",
        shimmer:          "shimmer 1.6s linear infinite",
        "slide-up":       "slide-up 0.25s ease-out both",
        "score-pop":      "score-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        float:            "float 3s ease-in-out infinite",
        "pulse-glow":     "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

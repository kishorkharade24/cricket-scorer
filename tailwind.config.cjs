/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      colors: {
        // Every colour the app paints with resolves through a CSS variable, so
        // one attribute on <html> flips the whole thing between dark and light.
        // "white" is really "the overlay/foreground colour" — bg-white/5 is a
        // pale wash on dark, and a faint grey wash on light.
        white: 'rgb(var(--c-fg) / <alpha-value>)',
        pure:  '#ffffff',
        onaccent: 'rgb(var(--c-on-accent) / <alpha-value>)',
        ink: {
          950: 'rgb(var(--c-bg-950) / <alpha-value>)',
          900: 'rgb(var(--c-bg-900) / <alpha-value>)',
          850: 'rgb(var(--c-bg-850) / <alpha-value>)',
          800: 'rgb(var(--c-bg-800) / <alpha-value>)'
        },
        slate: {
          100: 'rgb(var(--c-t100) / <alpha-value>)',
          200: 'rgb(var(--c-t200) / <alpha-value>)',
          300: 'rgb(var(--c-t300) / <alpha-value>)',
          400: 'rgb(var(--c-t400) / <alpha-value>)',
          500: 'rgb(var(--c-t500) / <alpha-value>)',
          600: 'rgb(var(--c-t600) / <alpha-value>)',
          700: 'rgb(var(--c-t700) / <alpha-value>)',
          800: 'rgb(var(--c-t800) / <alpha-value>)',
          900: 'rgb(var(--c-t900) / <alpha-value>)'
        },
        turf:   { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
        ball:   { 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' }
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,.06), 0 10px 40px -12px rgba(0,0,0,.8)',
        lift: '0 18px 45px -20px rgba(0,0,0,.9)'
      },
      keyframes: {
        pop:        { '0%': { transform: 'scale(.72)', opacity: '0' }, '60%': { transform: 'scale(1.12)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        fadeIn:     { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:    { from: { transform: 'translateY(18px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        sheetUp:    { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        ballIn:     { '0%': { transform: 'translateX(14px) scale(.6)', opacity: '0' }, '100%': { transform: 'translateX(0) scale(1)', opacity: '1' } },
        celebrate:  { '0%': { transform: 'scale(.4) rotate(-8deg)', opacity: '0' }, '35%': { transform: 'scale(1.15) rotate(2deg)', opacity: '1' }, '75%': { transform: 'scale(1) rotate(0)', opacity: '1' }, '100%': { transform: 'scale(1.4)', opacity: '0' } },
        pulseRing:  { '0%': { boxShadow: '0 0 0 0 rgba(34,197,94,.55)' }, '70%': { boxShadow: '0 0 0 12px rgba(34,197,94,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(34,197,94,0)' } },
        shimmer:    { '100%': { transform: 'translateX(100%)' } },
        wobble:     { '0%,100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-6deg)' }, '75%': { transform: 'rotate(6deg)' } },
        countUp:    { from: { transform: 'translateY(60%)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } }
      },
      animation: {
        pop: 'pop .32s cubic-bezier(.34,1.56,.64,1) both',
        'fade-in': 'fadeIn .25s ease both',
        'slide-up': 'slideUp .3s cubic-bezier(.22,1,.36,1) both',
        'sheet-up': 'sheetUp .28s cubic-bezier(.22,1,.36,1) both',
        'ball-in': 'ballIn .28s cubic-bezier(.34,1.56,.64,1) both',
        celebrate: 'celebrate 1s cubic-bezier(.22,1,.36,1) both',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        wobble: 'wobble .5s ease-in-out both',
        'count-up': 'countUp .28s cubic-bezier(.22,1,.36,1) both'
      }
    }
  },
  // Team accent classes are built from data, so Tailwind cannot see them in the
  // source. Only the five shapes actually used by ACCENTS in util.js are kept.
  safelist: [
    { pattern: /^bg-(emerald|sky|violet|amber|rose|teal|orange|fuchsia|lime|cyan|indigo|pink)-500$/ },
    { pattern: /^text-(emerald|sky|violet|amber|rose|teal|orange|fuchsia|lime|cyan|indigo|pink)-300$/ },
    { pattern: /^ring-(emerald|sky|violet|amber|rose|teal|orange|fuchsia|lime|cyan|indigo|pink)-500\/40$/ },
    { pattern: /^bg-(emerald|sky|violet|amber|rose|teal|orange|fuchsia|lime|cyan|indigo|pink)-500\/15$/ },
    { pattern: /^border-(emerald|sky|violet|amber|rose|teal|orange|fuchsia|lime|cyan|indigo|pink)-500\/30$/ }
  ],
  plugins: []
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        // Barlow is bundled (src/fonts) so the app keeps working offline and
        // looks the same on every phone. The stacks below are only a fallback
        // for the first paint before the woff2 lands.
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Barlow Condensed', 'ui-sans-serif', 'system-ui', 'Arial Narrow', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      // Only the weights actually bundled. Barlow stops at 600; the condensed
      // display face carries 700 and 800, so anything heavier than semibold is
      // a display face by definition.
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '600',
        extrabold: '700',
        black: '800'
      },
      colors: {
        // Six roles, one job each. Every value resolves through a CSS variable,
        // so one attribute on <html> swaps the scoreboard for the scorebook.
        ground:   'rgb(var(--c-ground) / <alpha-value>)',    // the board / the paper
        plate:    'rgb(var(--c-plate) / <alpha-value>)',     // a raised number plate
        fill:     'rgb(var(--c-fill) / <alpha-value>)',      // a plate one step up
        rule:     'rgb(var(--c-rule) / <alpha-value>)',      // the ruled line
        fg:       'rgb(var(--c-fg) / <alpha-value>)',        // chalk / ink
        muted:    'rgb(var(--c-muted) / <alpha-value>)',
        faint:    'rgb(var(--c-faint) / <alpha-value>)',
        wicket:   'rgb(var(--c-wicket) / <alpha-value>)',    // a wicket fell. Nothing else.
        boundary: 'rgb(var(--c-boundary) / <alpha-value>)',  // four, six, free hit, champion
        action:   'rgb(var(--c-action) / <alpha-value>)',    // the thing you tap to go on
        onaction: 'rgb(var(--c-onaction) / <alpha-value>)',
        pure: '#ffffff'                                       // QR panels only — white in both themes
      },
      boxShadow: {
        plate: '0 1px 0 rgb(var(--c-rule) / .9)',
        lift: '0 18px 45px -22px rgb(var(--c-shadow) / .55)'
      },
      keyframes: {
        // Motion answers a tap. There are no entrance animations on content.
        pop:       { '0%': { transform: 'scale(.82)', opacity: '0' }, '60%': { transform: 'scale(1.04)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        sheetUp:   { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        ballIn:    { '0%': { transform: 'translateX(10px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        celebrate: { '0%': { transform: 'scale(.5)', opacity: '0' }, '35%': { transform: 'scale(1.08)', opacity: '1' }, '75%': { transform: 'scale(1)', opacity: '1' }, '100%': { transform: 'scale(1.25)', opacity: '0' } },
        pulseRing: { '0%': { opacity: '1' }, '50%': { opacity: '.35' }, '100%': { opacity: '1' } }
      },
      animation: {
        pop: 'pop .26s cubic-bezier(.2,.9,.3,1) both',
        'fade-in': 'fadeIn .2s ease both',
        'sheet-up': 'sheetUp .26s cubic-bezier(.22,1,.36,1) both',
        'ball-in': 'ballIn .2s cubic-bezier(.2,.9,.3,1) both',
        celebrate: 'celebrate .9s cubic-bezier(.22,1,.36,1) both',
        'pulse-ring': 'pulseRing 2s ease-in-out infinite'
      }
    }
  },
  plugins: []
}

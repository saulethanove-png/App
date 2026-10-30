/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        navy: {
          50: '#EEF2FA', 100: '#D9E1F2', 200: '#B3C2E3', 300: '#8197C9', 400: '#566FAD',
          500: '#3A5290', 600: '#2A3D70', 700: '#1D2C54', 800: '#14203F', 850: '#0F1932',
          900: '#0B1328', 950: '#060C1C',
        },
        mint: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700].map((n) => [n, `rgb(var(--a-${n}) / <alpha-value>)`])),
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,19,40,.04), 0 8px 24px -12px rgba(11,19,40,.12)',
        glow: '0 10px 40px -10px rgb(var(--a-400) / .55)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'sheet-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        'pop': { '0%': { opacity: 0, transform: 'scale(.96)' }, '100%': { opacity: 1, transform: 'none' } },
        'fade': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.2,.8,.2,1) backwards',
        'sheet-up': 'sheet-up .3s cubic-bezier(.2,.8,.2,1) both',
        'pop': 'pop .22s cubic-bezier(.2,.8,.2,1) both',
        'fade': 'fade .2s ease both',
      },
    },
  },
  plugins: [],
};

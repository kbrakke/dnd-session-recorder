/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        parchment: {
          50: '#fbf8f1',
          100: '#f6efde',
          200: '#ece1c1',
          300: '#dcc999',
          400: '#c9ad6e',
        },
        gold: {
          500: '#c89b3c',
          600: '#a37d2a',
        },
      },
      fontFamily: {
        display: ["'Crimson Text'", "'Iowan Old Style'", 'Georgia', 'serif'],
        body: ["'Source Sans 3'", "'Source Sans Pro'", 'system-ui', 'sans-serif'],
        sans: ["'Source Sans 3'", "'Source Sans Pro'", 'var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', "'SF Mono'", 'Menlo', 'monospace'],
      },
      borderRadius: {
        'ss-sm': '2px',
        'ss-md': '3px',
        'ss-lg': '4px',
        'ss-xl': '6px',
        'ss-2xl': '8px',
        'ss-3xl': '10px',
      },
      boxShadow: {
        'ss-xs': '0 1px 0 0 rgba(15, 23, 42, 0.04)',
        'ss-sm': '0 1px 0 0 rgba(15, 23, 42, 0.04), 0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        'ss-md': '0 1px 0 0 rgba(15, 23, 42, 0.04), 0 2px 4px 0 rgba(15, 23, 42, 0.08)',
        'ss-lg': '0 1px 0 0 rgba(15, 23, 42, 0.05), 0 6px 12px -2px rgba(15, 23, 42, 0.10)',
        'ss-xl': '0 1px 0 0 rgba(15, 23, 42, 0.05), 0 12px 24px -6px rgba(15, 23, 42, 0.14)',
        'ss-2xl': '0 1px 0 0 rgba(15, 23, 42, 0.06), 0 24px 40px -12px rgba(15, 23, 42, 0.22)',
        'ss-card': 'inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 1px 0 0 rgba(15, 23, 42, 0.04), 0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        'ss-card-hover': 'inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 1px 0 0 rgba(15, 23, 42, 0.04), 0 2px 4px 0 rgba(15, 23, 42, 0.08)',
        'ss-btn': 'inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 1px 0 0 rgba(15, 23, 42, 0.05)',
        'ss-btn-light': 'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 1px 0 0 rgba(15, 23, 42, 0.04)',
        'ss-modal': 'inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 1px 0 0 rgba(15, 23, 42, 0.06), 0 24px 40px -12px rgba(15, 23, 42, 0.22)',
      },
    },
  },
  plugins: [],
}

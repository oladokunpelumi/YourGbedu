/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './{pages,components,contexts,services}/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Editorial YourGbedu Palette */
        ivory: '#FAF6EE',
        cream: '#FFFDF6',
        terracotta: {
          DEFAULT: '#943B2F',
          dark: '#8B3E22',
          soft: '#E8B89E',
          pale: '#F7E5DA',
        },
        sage: {
          DEFAULT: '#7C8B5C',
          dark: '#5D6A42',
          soft: '#C9D2B0',
          pale: '#EEF2E2',
        },
        mustard: {
          DEFAULT: '#D8B253',
          soft: '#F0DCA8',
          pale: '#FBF0CF',
        },
        ink: {
          DEFAULT: '#1F1B14',
          soft: '#5A4F3F',
          muted: '#8B7F6C',
        },
        line: {
          DEFAULT: '#E5DDD0',
          strong: '#C7BDA8',
        },
        canvas: '#FAF6EE',
        'on-surface': '#1F1B14',
        'on-surface-variant': '#8B7F6C',
        'outline-variant': '#C7BDA8',

        primary: {
          DEFAULT: '#C99B3E',
          dark: '#A77E2F',
          container: '#FBF0CF',
        },
        'on-primary': '#1F1B14',

        secondary: {
          DEFAULT: '#943B2F',
          dark: '#8B3E22',
        },

        tertiary: {
          DEFAULT: '#7C8B5C',
        },

        obsidian: '#1F1B14',

        surface: {
          DEFAULT: '#FAF6EE',
          bright: '#FFFDF6',
          'container-lowest': '#ffffff',
          'container-low': '#FFFDF6',
          container: '#F5EDE2',
          'container-high': '#EFE5D6',
          'container-highest': '#E5DDD0',
          variant: '#C7BDA8',
        },

        background: {
          DEFAULT: '#FAF6EE',
          surface: '#FFFDF6',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        headline: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'Inter', 'sans-serif'],
        ui: ['"DM Sans"', 'Inter', 'sans-serif'],
        label: ['"DM Sans"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.5rem',
        lg: '0.25rem',
        md: '0.375rem',
        DEFAULT: '0.125rem',
        full: '9999px',
      },
      spacing: {
        section: '5.5rem',
        'section-lg': '7rem',
      },
      boxShadow: {
        ambient: '0 10px 30px rgba(31, 27, 20, 0.06)',
        'ambient-lg': '0 18px 50px rgba(31, 27, 20, 0.09)',
        obsidian: '0 18px 44px rgba(31, 27, 20, 0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s infinite linear',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%) skewX(-12deg)' },
          '100%': { transform: 'translateX(200%) skewX(-12deg)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};

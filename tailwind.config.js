/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Animation durations for consistent timing
      animation: {
        'slide-in-right': 'slideInRight 300ms ease-out',
        'slide-out-right': 'slideOutRight 300ms ease-in',
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-out': 'fadeOut 200ms ease-in',
        'collapsible-close': 'collapsibleClose 200ms ease-out forwards',
        'collapsible-open': 'collapsibleOpen 200ms ease-out forwards'
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        slideOutRight: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        collapsibleClose: {
          '0%': { opacity: '1', maxHeight: '500px' },
          '100%': { opacity: '0', maxHeight: '0' }
        },
        collapsibleOpen: {
          '0%': { opacity: '0', maxHeight: '0' },
          '100%': { opacity: '1', maxHeight: '500px' }
        }
      },
      // Font families migrated from CSS variables
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'Fira Sans',
          'Droid Sans',
          'Helvetica Neue',
          'sans-serif'
        ],
        serif: ['Newsreader', 'Merriweather', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace']
      },
      // Colors migrated from CSS variables
      colors: {
        // Background colors
        'bg-primary': '#ffffff',
        'bg-secondary': '#f9f9f8', // Warm off-white for sidebar/backgrounds
        'bg-accent': '#f0f0f0',
        // Text colors
        'text-primary': '#1a1a1a', // Soft black
        'text-secondary': '#525252', // Dark gray
        'text-tertiary': '#a3a3a3', // Light gray
        // Accent colors
        accent: '#da7756', // Burnt orange accent
        'accent-hover': '#c76545',
        // Border colors
        'border-subtle': '#e5e5e5',
        'border-strong': '#d4d4d4'
      }
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require('tailwindcss-animate')]
};

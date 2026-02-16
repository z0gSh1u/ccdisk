/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
  plugins: []
};

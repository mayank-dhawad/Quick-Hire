/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // THIS LINE IS CRITICAL
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8f4',
          100: '#d7efe6',
          200: '#b0dfcf',
          300: '#7ec6b0',
          500: '#007a5b',
          600: '#05684d',
          700: '#13795f',
          800: '#0b5240',
        },
        surface: '#fbfcf8',
        borderLight: '#e4e7ec',
        ink: {
          primary: '#18201b',
          muted: '#5c6460',
          light: '#8d9590',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        heading: ['Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8eaff',
          100: '#c5caff',
          200: '#9da6ff',
          300: '#7580ff',
          400: '#5470ff',
          500: '#2962FF',
          600: '#2255e0',
          700: '#1a44b8',
          800: '#133591',
          900: '#0c2670',
        },
      },
    },
  },
  plugins: [],
};

const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    ...defaultTheme,
    fontWeight: {
      ...defaultTheme.fontWeight,
      medium: '600',
    },
  },
  plugins: [],
};

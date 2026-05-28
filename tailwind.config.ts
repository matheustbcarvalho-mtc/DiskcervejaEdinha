import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        beer: {
          50: '#fff8eb',
          100: '#fee9bd',
          500: '#f59e0b',
          700: '#b45309',
          900: '#78350f'
        }
      }
    }
  },
  plugins: []
};

export default config;

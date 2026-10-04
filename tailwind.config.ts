import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vajra: {
          void: '#050a12',
          deep: '#0a1220',
          panel: '#0d1a2a',
          border: '#1a3348',
          cyan: '#00e5c8',
          blue: '#3b9eff',
          amber: '#f5a623',
          red: '#ff3b5c',
          green: '#00d68f',
          text: '#e0edf5',
          muted: '#5a7a8f',
          dim: '#3a5568',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Code', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 4s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

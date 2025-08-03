/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./apps/hydro-sense/frontend/src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}", // サブディレクトリも含める場合
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  darkMode: 'media', // ← 'media' でOS設定に自動追従
}

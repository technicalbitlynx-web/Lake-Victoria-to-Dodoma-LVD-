import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* GitHub Pages serves the demo from a repo subpath, so `npm run build:pages`
   builds with `--mode pages` to pick up that base. Passing the base on the
   command line instead is not safe here: Git Bash rewrites a leading-slash
   argument into a Windows path. */
const PAGES_BASE = '/Lake-Victoria-to-Dodoma-LVD-/'

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? PAGES_BASE : '/',
  plugins: [react(), tailwindcss()],
}))

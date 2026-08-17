import {defineConfig} from 'vite';

// GitHub Pages serves project sites from /<repo>/, so the base path has to match.
// Override with BASE_PATH=/ when serving from a custom domain or a user site.
const base = process.env.BASE_PATH ?? '/hackweek-post-deploy-monitoring/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

import viteConfig from './vite.config';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(
  mergeConfig(viteConfig, {
    test: {
      environment: 'node',
      exclude: [
        ...configDefaults.exclude,
        '.claude/**',
        '.superpowers/**',
        '.worktrees/**'
      ]
    }
  })
);

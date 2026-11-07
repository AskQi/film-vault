import { defineConfig } from 'drizzle-kit'
import { resolveStoragePath } from './src/config.js'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: resolveStoragePath('film-vault.db'),
  },
})

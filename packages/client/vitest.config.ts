import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'client',
    environment: 'node',
    setupFiles: ['./src/i18n/testSetup.ts'],
  },
});

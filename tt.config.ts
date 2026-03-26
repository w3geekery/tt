import type { TtConfig } from './src/core/types';

const config: TtConfig = {
  port: 4301,
  db: '~/.tt/tt.db',
  timezone: 'America/Los_Angeles',
  roundingMinutes: 15,
  extensions: {
    // Register extension hooks here.
    // Extensions are optional — the core works standalone.
    //
    // Example:
    //   onTimerStop: async (timer) => {
    //     console.log(`Timer stopped: ${timer.id}`);
    //   },
    //
    // For private extensions, import from a separate repo:
    //   import { zerobias } from '@w3geekery/tt-extensions';
    //   ...
    //   onTimerStop: zerobias.syncTimerToTask,
    //   formatInvoice: zerobias.invoiceTemplate,
  },
};

export default config;

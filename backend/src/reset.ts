// `npm run reset-data`: discard runtime state and reseed from /data on the next start.
import { store } from './store.ts';

store.reset();
console.log('[reset] runtime state re-seeded from /data');

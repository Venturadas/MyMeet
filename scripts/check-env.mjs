import nextEnv from '@next/env';
import { inspectEnvironment } from '../lib/runtime-config.ts';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--development')) {
  console.error('Usage: npm run check:env -- [--development]');
  process.exit(2);
}
nextEnv.loadEnvConfig(process.cwd(), args.includes('--development'));
const result = inspectEnvironment(process.env, !args.includes('--development'));
// Only variable names and fixed reason codes. Never serialize process.env.
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.valid ? 0 : 1;

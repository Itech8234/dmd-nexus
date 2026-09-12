import { spawnSync } from 'child_process';
const r = spawnSync('npx', ['tsc', '--noEmit'], { cwd: 'frontend', encoding: 'utf8', timeout: 120000 });
const out = (r.stdout || '') + (r.stderr || '');
const errors = out.split('\n').filter(l => l.includes('error TS'));
console.log('TypeScript errors:', errors.length);
errors.slice(0, 10).forEach(e => console.log('  ', e));

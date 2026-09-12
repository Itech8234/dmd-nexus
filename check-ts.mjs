import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

// Verify the map file has correct syntax by checking key parts
const map = readFileSync('frontend/src/components/map/OperationsMap.tsx', 'utf8');
console.log('Carto key reference:', map.includes('NEXT_PUBLIC_CARTO_API_KEY'));
console.log('Voyager light URL:', map.includes('rastertiles/voyager/'));
console.log('Voyager nolabels URL:', map.includes('rastertiles/voyager_nolabels/'));
console.log('Key suffix:', map.includes('?key=${CARTO_API_KEY}'));
console.log('Fallback tiles:', map.includes('light_all/'));

// Run tsc
const r = spawnSync('npx', ['tsc', '--noEmit'], { cwd: 'frontend', encoding: 'utf8', timeout: 120000 });
const out = (r.stdout || '') + (r.stderr || '');
const errors = out.split('\n').filter(l => l.includes('error TS'));
console.log('\nTypeScript errors:', errors.length);
errors.slice(0, 10).forEach(e => console.log('  ', e));
console.log('Exit code:', r.status);

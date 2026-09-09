// Local-only harness: imports real onboarding screens, not the application root.
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const toolRoot = process.env.NOSPI_PREVIEW_TOOLS || (fs.existsSync(path.join(__dirname, 'node_modules/esbuild')) ? path.join(__dirname, 'node_modules') : path.resolve(repo, '../preview-tools/node_modules'));
const esbuild = require(path.join(toolRoot, 'esbuild'));
const { PGlite } = require(path.join(toolRoot, '@electric-sql/pglite'));

async function main() {
  const db = new PGlite(path.join(repo, '.preview-data'));
  await db.exec('CREATE TABLE IF NOT EXISTS public.users (id uuid primary key, age integer, age_range_min integer, age_range_max integer);');
  const schema = fs.readFileSync(path.join(repo, 'supabase/migrations/20260909033255_age_range_fallback_preference.sql'), 'utf8');
  const existing = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='age_range_fallback'");
  if (!existing.rows.length) await db.exec(schema);
  const build = await esbuild.build({
    absWorkingDir: repo, entryPoints: ['preview/entry.jsx'], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', sourcemap: 'inline',
    define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true' },
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    loader: { '.js': 'jsx', '.png': 'dataurl' },
    alias: {
      'react-native': 'react-native-web', 'expo-router': path.join(__dirname, 'router.tsx'),
      '@/utils/onboardingTracker': path.join(__dirname, 'tracker.ts'),
    },
    plugins: [{ name: 'block-production', setup(build) {
      build.onResolve({ filter: /supabase|sentry|onboardingTracker/ }, args => {
        if (args.path === '@/utils/onboardingTracker') return { path: path.join(__dirname, 'tracker.ts') };
        throw new Error('Production dependency forbidden in local preview: ' + args.path);
      });
    } }], metafile: true,
  });
  const inputs = Object.keys(build.metafile.inputs);
  if (inputs.some(file => /lib\/supabase|contexts\/|app\/_layout|public\/index/.test(file))) throw new Error('Unexpected production entry');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(build.outputFiles[0].text); }
    if (req.url === '/api/fixture' && req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4173') { res.statusCode = 403; return res.end(); }
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Payload too large'); }
        const x = JSON.parse(body);
        if (![x.age, x.age_range_min, x.age_range_max].every(Number.isInteger) || x.age < 18 || x.age > 90
          || x.age_range_min < 18 || x.age_range_max > 60 || x.age_range_max - x.age_range_min < 10
          || !['attend', 'postpone'].includes(x.age_range_fallback) || !Number.isFinite(Date.parse(x.age_range_confirmed_at))) throw new Error('Invalid fixture');
        const result = await db.query('INSERT INTO public.users (id, age, age_range_min, age_range_max, age_range_fallback, age_range_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [randomUUID(), x.age, x.age_range_min, x.age_range_max, x.age_range_fallback, x.age_range_confirmed_at]);
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result.rows[0]));
      } catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: error.message })); }
    }
    if (req.url === '/' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    res.statusCode = 404; res.end();
  });
  server.listen(4173, '127.0.0.1', () => console.log('Nospi isolated preview: http://127.0.0.1:4173'));
}
main().catch(error => { console.error(error); process.exit(1); });

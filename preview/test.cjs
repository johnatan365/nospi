const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tools = process.env.NOSPI_PREVIEW_TOOLS || (fs.existsSync(path.join(__dirname, 'node_modules/esbuild')) ? path.join(__dirname, 'node_modules') : path.resolve(__dirname, '../../preview-tools/node_modules'));
const { transformSync } = require(path.join(tools, 'esbuild'));
const { PGlite } = require(path.join(tools, '@electric-sql/pglite'));
const source = fs.readFileSync(path.join(__dirname, '../utils/agePreferences.ts'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, { module: mod, exports: mod.exports });
const { validAgeRange, moveAgeBound, agePreferenceFields } = mod.exports;

(async () => {
  for (let min = 18; min <= 50; min++) for (let max = min + 10; max <= 60; max++) {
    for (let value = 0; value <= 90; value++) {
      assert(validAgeRange(moveAgeBound({ min, max }, 'min', value)));
      assert(validAgeRange(moveAgeBound({ min, max }, 'max', value)));
    }
  }
  assert(!validAgeRange({ min: 40, max: 45 }));
  assert.equal(agePreferenceFields('unknown', new Date().toISOString()).age_range_fallback, null);
  assert.equal(agePreferenceFields(null, new Date().toISOString()).age_range_confirmed_at, null);
  assert.equal(agePreferenceFields('postpone', 'invalid').age_range_confirmed_at, null);
  const db = new PGlite();
  await db.exec('create table public.users(id integer primary key); insert into public.users values (1);');
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260909033255_age_range_fallback_preference.sql'), 'utf8'));
  assert.equal((await db.query('select age_range_fallback from users where id=1')).rows[0].age_range_fallback, null);
  await assert.rejects(db.exec("insert into users(id,age_range_fallback) values(2,'arbitrary')"));
  await db.exec("insert into users(id,age_range_fallback) values(2,'attend'),(3,'postpone');");
  assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n, 3);
  await db.close();
  for (const filename of ['app/index.tsx', 'app/onboarding/register.tsx']) {
    const code = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    assert(code.includes('onboarding_age_fallback') && code.includes('onboarding_age_confirmed_at'));
    assert(code.includes('...agePreferenceFields('));
  }
  console.log('PASS: exhaustive range bounds, unknown consent, PostgreSQL migration, old rows and allowed choices.');
})().catch(e => { console.error(e); process.exitCode = 1; });

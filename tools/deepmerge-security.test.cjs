const assert = require('node:assert/strict');
const { test } = require('node:test');
const merge = require('./vendor/deepmerge/cjs.js');

for (const side of ['target', 'source']) {
  test(`preserves the result prototype with a malicious ${side}`, () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');
    const target = side === 'target' ? payload : Object.create(null);
    const source = side === 'source' ? payload : {};
    const result = merge(target, source);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.polluted, undefined);
    assert.equal({}.polluted, undefined);
    assert.equal(result.safe, 1);
  });
}
test('nested poison remains data without changing prototypes', () => {
  const result = merge({}, { nested: JSON.parse('{"__proto__":{"polluted":true}}') });
  assert.equal(Object.getPrototypeOf(result.nested), Object.prototype);
  assert.equal(result.nested.polluted, undefined);
});
test('retains arrays, symbols, custom merge, and merge.all', () => {
  const key = Symbol('key');
  const result = merge({ list: [1], nested: { a: 1 } }, { list: [2], nested: { b: 2 }, [key]: 3 });
  assert.deepEqual(result.list, [1, 2]);
  assert.deepEqual(result.nested, { a: 1, b: 2 });
  assert.equal(result[key], 3);
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
  assert.deepEqual(merge({ list: [1] }, { list: [2] }, { customMerge: key => key === 'list' ? (_, source) => source : undefined }), { list: [2] });
});
test('the installed dependency uses the hardened merge', () => {
  const installed = require('deepmerge');
  const payload = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal(Object.getPrototypeOf(installed(payload, {})), Object.prototype);
  assert.equal(installed(payload, {}).polluted, undefined);
});
test('legacy minimatch consumers use the patched matcher', () => {
  const match = require('minimatch');
  assert.equal(typeof match, 'function');
  assert.equal(match('src/index.js', '**/*.js'), true);
  assert.deepEqual(match.match(['a.js', 'b.ts'], '*.js'), ['a.js']);
  assert.equal(new match.Minimatch('*.js').match('a.js'), true);
  assert.deepEqual(match.braceExpand('a{1,2}'), ['a1', 'a2']);
});

test('legacy glob traverses patched minimatch segments in sync and callback APIs', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const glob = require('glob');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'modal-glob-'));
  try {
    fs.mkdirSync(path.join(root, 'nested'));
    for (const file of ['Example.podspec', '.Hidden.podspec', 'nested/Other.podspec', 'ignored.txt']) {
      fs.writeFileSync(path.join(root, file), '');
    }
    assert.deepEqual(glob.sync('*.podspec', { cwd: root }), ['Example.podspec']);
    assert.deepEqual(glob.sync('**/*.podspec', { cwd: root }), ['Example.podspec', 'nested/Other.podspec']);
    assert.deepEqual(glob.sync('.*.podspec', { cwd: root }), ['.Hidden.podspec']);
    assert.deepEqual(glob.sync('*.podspec', { cwd: root, dot: true }), ['.Hidden.podspec', 'Example.podspec']);
    const files = await new Promise((resolve, reject) => glob('**/*.podspec', { cwd: root }, (error, result) => error ? reject(error) : resolve(result)));
    assert.deepEqual(files, ['Example.podspec', 'nested/Other.podspec']);
    const defaults = require('minimatch').defaults({ dot: true });
    const segment = new defaults.Minimatch('*.podspec').set[0][0];
    assert.equal(segment._glob, '*.podspec');
    assert.deepEqual('.Hidden.podspec'.match(segment), ['.Hidden.podspec']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

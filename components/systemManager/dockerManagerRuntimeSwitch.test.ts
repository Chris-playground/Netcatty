import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('kubernetes keeps the shared runtime select and drops the Containers back button', () => {
  const tab = readFileSync(new URL('./DockerManagerTab.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(
    new URL('../../application/state/systemManager/useContainerRuntimeSelection.ts', import.meta.url),
    'utf8',
  );

  assert.equal(tab.includes('container-runtime-back'), false);
  assert.match(tab, /data-section=\{section\}/);
  assert.match(tab, /section="container-runtime-switcher"/);
  assert.match(tab, /section="k8s-context-select"/);
  assert.match(tab, /section="k8s-namespace-select"/);
  assert.match(hook, /const showRuntimeSwitcher = detected\.length > 1;/);
  assert.doesNotMatch(hook, /source !== 'kubernetes' && detected\.length/);
});

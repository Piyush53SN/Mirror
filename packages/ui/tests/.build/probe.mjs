import TestRenderer from 'react-test-renderer';
import React from 'react';
import { pathToFileURL } from 'node:url';
const ui = await import(pathToFileURL('/home/user/Mirror/packages/ui/tests/.build/ui.mjs').href);
const r = TestRenderer.create(ui.renderOne('onboarding','ananya').element);
const buttons = r.root.findAllByType('button', { deep: true });
console.log('buttons:', buttons.length);
for (const b of buttons.slice(0, 3)) {
  console.log('---', b.props['aria-label'], '| role:', b.props.role, '| style keys:', Object.keys(b.props.style || {}).join(','));
  console.log('    style:', JSON.stringify(b.props.style || {}).slice(0, 300));
}
console.log('View typeof:', typeof ui.View, 'Pressable typeof:', typeof ui.Pressable);

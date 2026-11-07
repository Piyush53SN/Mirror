/** Test and mockup shim for expo-linear-gradient: a DOM element with a CSS gradient background. */
import * as React from 'react';

export function LinearGradient(props: { colors: readonly string[]; style?: unknown; children?: React.ReactNode }) {
  const css = `linear-gradient(${props.colors.join(', ')})`;
  return React.createElement('div', { 'data-gradient': props.colors.join(' '), style: { backgroundImage: css, ...(props.style as object) } }, props.children);
}

/**
 * Test and mockup shim for react-native-svg. Renders each element as a plain DOM element that
 * keeps its attributes and text alternative, so render tests can read them. Real drawing happens
 * in the native library on device.
 */
import * as React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
const make = (tag: string) => {
  const C = (props: AnyProps) => React.createElement(tag, { ...props, 'data-svg': tag }, props.children);
  C.displayName = tag;
  return C;
};

export const Svg = make('svg');
export const G = make('g');
export const Path = make('path');
export const Line = make('line');
export const Circle = make('circle');
export const Rect = make('rect');
export const Defs = make('defs');
export const Stop = make('stop');
export const RadialGradient = make('radialGradient');
export const LinearGradient = make('linearGradient');
export const Pattern = make('pattern');
export const Image = make('image');
export const SvgText = make('text');
export default Svg;

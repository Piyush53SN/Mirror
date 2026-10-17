/**
 * The renderer entry point.
 *
 * Bundled by mockups/render.mjs with `react-native` aliased to ./rn-dom.tsx, so
 * the design system under test is exactly the design system that ships. This file
 * exists only to add the DOM server renderer; the screen helpers themselves live
 * in ../screens/render.tsx so the component tests do not need a DOM at all.
 */
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTheme } from '../src/tokens.js';
import {
  renderScreen,
  renderMatrix,
  renderOne,
  specFor,
  personaFor,
  personaById,
  isDegraded,
  SCREENS,
  PERSONAS,
  type Persona,
  type ScreenSpec,
  type ScreenState,
  type RenderedItem,
} from '../screens/render.js';
import { SECTION_J, PHASES, TAB_ITEMS, screensByKind, screensByPhase, specBySlug } from '../screens/index.js';
import type { MirrorTheme, ThemeName } from '../src/tokens.js';

export {
  renderScreen,
  renderMatrix,
  renderOne,
  specFor,
  personaFor,
  personaById,
  isDegraded,
  renderToStaticMarkup,
  createTheme,
  SCREENS,
  SECTION_J,
  PHASES,
  TAB_ITEMS,
  PERSONAS,
  screensByKind,
  screensByPhase,
  specBySlug,
};
export type { Persona, ScreenSpec, ScreenState, RenderedItem, MirrorTheme, ThemeName };

/**
 * Convenience for the renderer: one inventory item → static HTML. Accepts either
 * a `RenderedItem` (spec + element) or a bare React element, because both are
 * natural at a call site and silently rendering `undefined` is not.
 */
export function htmlFor(input: RenderedItem | React.ReactElement): string {
  const element = (input as RenderedItem)?.element ?? (input as React.ReactElement);
  if (!element || typeof element !== 'object') {
    throw new Error('htmlFor() needs a React element or a RenderedItem from renderScreen()/renderMatrix()');
  }
  return renderToStaticMarkup(element);
}

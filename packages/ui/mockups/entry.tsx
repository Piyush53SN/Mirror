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
  SCREENS,
  PERSONAS,
  type Persona,
  type ScreenSpec,
  type ScreenState,
  type RenderedScreen,
} from '../screens/render.js';
import type { MirrorTheme, ThemeName } from '../src/tokens.js';

export {
  renderScreen,
  renderMatrix,
  renderOne,
  specFor,
  personaFor,
  personaById,
  renderToStaticMarkup,
  createTheme,
  SCREENS,
  PERSONAS,
};
export type { Persona, ScreenSpec, ScreenState, RenderedScreen, MirrorTheme, ThemeName };

/** Convenience for the renderer: one screen → static HTML. */
export function htmlFor(screen: RenderedScreen): string {
  return renderToStaticMarkup(screen.element);
}

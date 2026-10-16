/**
 * Rendering helpers for screens.
 *
 * These live next to the screens (not in mockups/) because they are useful in
 * three places and none of them is a mockup: the mockup renderer, the component
 * tests, and any future Storybook/dev-menu. Nothing here imports a DOM, so the
 * same helpers work under react-test-renderer and under react-dom/server.
 */
import * as React from 'react';
import { ThemeProvider } from '../src/theme.js';
import { createTheme, type MirrorTheme, type ThemeName } from '../src/tokens.js';
import { SCREENS, PERSONAS, type Persona, type ScreenSpec, type ScreenState } from './index.js';

export type RenderedScreen = { spec: ScreenSpec; persona: Persona; state: ScreenState; theme: MirrorTheme; element: React.ReactElement };

/** Render one screen in its own provider: independent, deterministic, no globals. */
export function renderScreen(
  spec: ScreenSpec,
  persona: Persona,
  theme: MirrorTheme,
  state: ScreenState = 'default',
): React.ReactElement {
  const Component = spec.Component;
  return (
    <ThemeProvider
      initialTheme={theme.name}
      overrides={{ reducedTransparency: theme.reducedTransparency, reducedMotion: theme.reducedMotion, textScale: 1 }}
      followSystem={false}
    >
      <Component theme={theme} persona={persona} state={state} />
    </ThemeProvider>
  );
}

/** The persona that can actually show this screen, given what it requires. */
export function personaFor(spec: ScreenSpec, preferred?: Persona): Persona {
  if (preferred) return preferred;
  return PERSONAS.find((p) => spec.requires.every((tier) => p.tiers.includes(tier))) ?? PERSONAS[1]!;
}

export function specFor(slug: string): ScreenSpec {
  const spec = SCREENS.find((s) => s.slug === slug);
  if (!spec) throw new Error(`unknown screen "${slug}" (known: ${SCREENS.map((s) => s.slug).join(', ')})`);
  return spec;
}

export function personaById(id: string): Persona {
  const persona = PERSONAS.find((p) => p.id === id);
  if (!persona) throw new Error(`unknown persona "${id}" (known: ${PERSONAS.map((p) => p.id).join(', ')})`);
  return persona;
}

export function renderOne(
  slug: string,
  personaId: string,
  state: ScreenState = 'default',
  themeName: ThemeName = 'dark',
): RenderedScreen {
  const spec = specFor(slug);
  const persona = personaById(personaId);
  const theme = createTheme(themeName);
  return { spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) };
}

/**
 * Every combination the mockups must cover, in one place, so tests and the
 * renderer cannot disagree about what "all screens, both themes" means.
 */
export function renderMatrix(options: { screen?: string; persona?: Persona; states?: ScreenState[]; themes?: ThemeName[] } = {}): RenderedScreen[] {
  const out: RenderedScreen[] = [];
  for (const spec of SCREENS) {
    if (options.screen && spec.slug !== options.screen) continue;
    const persona = personaFor(spec, options.persona);
    for (const state of options.states ?? spec.states) {
      for (const name of options.themes ?? (['dark', 'light'] as ThemeName[])) {
        const theme = createTheme(name);
        out.push({ spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) });
      }
    }
  }
  return out;
}

export { SCREENS, PERSONAS };
export type { Persona, ScreenSpec, ScreenState };

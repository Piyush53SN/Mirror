/**
 * Rendering helpers for the Section J inventory.
 *
 * These live next to the screens (not in mockups/) because three callers need
 * them and none of them is a mockup: the mockup renderer, the component tests,
 * and any future dev menu. Nothing here imports a DOM, so the same helpers work
 * under react-test-renderer and under react-dom/server.
 *
 * A sheet or a state is rendered *over its parent screen*, because that is what
 * it is: the Why drawer is not a page, and rendering it as one would be a
 * drawing of the product rather than the product.
 */
import * as React from 'react';
import { View } from '../src/host.js';
import { ThemeProvider } from '../src/theme.js';
import { createTheme, type MirrorTheme, type ThemeName } from '../src/tokens.js';
import { SCREENS, specBySlug, type ScreenSpec, type ScreenState } from './index.js';
import { PERSONAS, type Persona } from './personas.js';

export { PERSONAS };

export type RenderedItem = { spec: ScreenSpec; persona: Persona; state: ScreenState; theme: MirrorTheme; element: React.ReactElement };

const OVERLAY = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** The component tree for one inventory item: the item itself, or the parent with the item over it. */
export function treeFor(spec: ScreenSpec, persona: Persona, theme: MirrorTheme, state: ScreenState = 'default'): React.ReactElement {
  const Item = spec.Component;
  if (spec.kind === 'screen' || spec.kind === 'widget') {
    return <Item theme={theme} persona={persona} state={state} />;
  }
  const parentSpec = spec.parent ? specBySlug(spec.parent) : undefined;
  if (!parentSpec) {
    throw new Error(`${spec.id} ${spec.slug}: a ${spec.kind} needs a parent screen, and "${spec.parent}" is not in the inventory`);
  }
  const Parent = parentSpec.Component;
  return (
    <View style={{ flex: 1 }}>
      <Parent theme={theme} persona={persona} state="default" />
      <View style={OVERLAY}>
        <Item theme={theme} persona={persona} state={state} />
      </View>
    </View>
  );
}

/** Render one item in its own provider: independent, deterministic, no globals. */
export function renderScreen(spec: ScreenSpec, persona: Persona, theme: MirrorTheme, state: ScreenState = 'default'): React.ReactElement {
  return (
    <ThemeProvider
      initialTheme={theme.name}
      overrides={{ reducedTransparency: theme.reducedTransparency, reducedMotion: theme.reducedMotion, textScale: 1 }}
      followSystem={false}
    >
      {treeFor(spec, persona, theme, state)}
    </ThemeProvider>
  );
}

/**
 * The persona a frame is rendered with.
 *
 * A "default" frame uses a persona that can actually show the item. An "empty"
 * frame is the interesting one: it prefers a persona that *lacks* a tier the item
 * needs, so the frame shows the real degraded view instead of a second copy of
 * the default one.
 */
export function personaFor(spec: ScreenSpec, state: ScreenState = 'default', all: Persona[] = PERSONAS): Persona {
  const capable = all.find((p) => spec.requires.every((tier) => p.tiers.includes(tier))) ?? all[0];
  if (state !== 'empty' || spec.requires.length === 0 || !capable) return capable as Persona;
  const lacking = [...all]
    .sort((a, b) => a.tiers.length - b.tiers.length)
    .find((p) => spec.requires.some((tier) => !p.tiers.includes(tier)));
  return lacking ?? capable;
}

export function specFor(slug: string): ScreenSpec {
  const spec = specBySlug(slug);
  if (!spec) throw new Error(`unknown screen "${slug}" (known: ${SCREENS.map((s) => s.slug).join(', ')})`);
  return spec;
}

export function personaById(id: string, all: Persona[] = PERSONAS): Persona {
  const persona = all.find((p) => p.id === id);
  if (!persona) throw new Error(`unknown persona "${id}" (known: ${all.map((p) => p.id).join(', ')})`);
  return persona;
}

export function renderOne(slug: string, personaId: string, state: ScreenState = 'default', themeName: ThemeName = 'dark'): RenderedItem {
  const spec = specFor(slug);
  const persona = personaById(personaId);
  const theme = createTheme(themeName);
  return { spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) };
}

/**
 * Every combination the mockups must cover, in one place, so tests and the
 * renderer cannot disagree about what "all screens, both themes" means.
 */
export function renderMatrix(
  options: { screen?: string; persona?: Persona; states?: ScreenState[]; themes?: ThemeName[]; all?: Persona[] } = {},
): RenderedItem[] {
  const all = options.all ?? PERSONAS;
  const out: RenderedItem[] = [];
  for (const spec of SCREENS) {
    if (options.screen && spec.slug !== options.screen) continue;
    for (const state of options.states ?? spec.states) {
      const persona = options.persona ?? personaFor(spec, state, all);
      for (const name of options.themes ?? (['dark', 'light'] as ThemeName[])) {
        const theme = createTheme(name);
        out.push({ spec, persona, state, theme, element: renderScreen(spec, persona, theme, state) });
      }
    }
  }
  return out;
}

export { SCREENS, specBySlug };
export type { ScreenSpec, ScreenState, ScreenKind } from './index.js';
export type { Persona } from './personas.js';

/**
 * The app entry point.
 *
 * It exists in P1a because the React 19 migration is not proven until the design
 * system is bundled by the real toolchain (Metro), not only by esbuild in tests.
 * This is the smallest entry that pulls the UI in: the first screen in the
 * inventory, with a persona and a theme. P1b replaces it with navigation and the
 * encrypted store.
 */
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

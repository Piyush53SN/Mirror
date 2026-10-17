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
// Imported for the bundle graph, not started: the encrypted store and the
// collector are compiled into the app from P1b-1 so the release bundle check
// covers them, but nothing opens the store until ingestion arrives in P1b-2.
import './src/runtime';

registerRootComponent(App);

// Shared esbuild aliases for render tests: native modules map to DOM shims.
import { join } from 'node:path';

export function nativeAliases(uiRoot) {
  return {
    'react-native': join(uiRoot, 'mockups/rn-dom.tsx'),
    'react-native-svg': join(uiRoot, 'mockups/shims/react-native-svg.tsx'),
    'expo-linear-gradient': join(uiRoot, 'mockups/shims/expo-linear-gradient.tsx'),
    'expo-haptics': join(uiRoot, 'mockups/shims/expo-haptics.ts'),
  };
}

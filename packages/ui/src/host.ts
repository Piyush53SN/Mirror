/**
 * The single place this package touches React Native.
 *
 * Everything else imports from here, which means:
 *   - the RN binding is one 20-line file, so it is easy to audit;
 *   - tests and the mockup renderer can alias `react-native` to a DOM/host shim
 *     without patching the design system (see packages/ui/mockups/rn-dom.tsx and
 *     packages/ui/tests/ui.test.mjs);
 *   - if the app ever moves to a different host (web, folded devices), there is
 *     exactly one file to port.
 */
export {
  View,
  Text as RNText,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';

export type { ViewStyle, TextStyle, StyleProp, TextInputProps } from 'react-native';

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Add <queries> for HOME role (CATEGORY_HOME) and LAUNCHER (MAIN+LAUNCHER) so that
 * PackageManager.queryIntentActivities can resolve launchers dynamically and
 * getAppLabels can resolve readable names without QUERY_ALL_PACKAGES.
 * Needed for POCO Launcher com.mi.android.globallauncher 10h04m bug fix.
 */
module.exports = function withAddQueries(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) manifest.queries = [];
    if (!Array.isArray(manifest.queries)) manifest.queries = [manifest.queries];
    // Find or create queries array
    // manifest.queries is expected to be array of objects, but Expo's manifest parser may have different shape
    // We handle both: if queries is object with intent array, or array
    let queries = manifest.queries;
    // Normalize to array
    if (!Array.isArray(queries)) {
      // If it's an object, wrap
      queries = [queries];
      manifest.queries = queries;
    }

    // Helper to check if intent with given action+category exists
    const hasIntent = (action, category) => {
      for (const q of queries) {
        const intents = q.intent || [];
        const intentArray = Array.isArray(intents) ? intents : [intents];
        for (const intent of intentArray) {
          const actions = intent.action || [];
          const actionArray = Array.isArray(actions) ? actions : [actions];
          const categories = intent.category || [];
          const catArray = Array.isArray(categories) ? categories : [categories];
          const hasAction = actionArray.some((a) => a.$ && a.$['android:name'] === action);
          if (!hasAction) continue;
          if (!category) return true;
          const hasCat = catArray.some((c) => c.$ && c.$['android:name'] === category);
          if (hasCat) return true;
        }
      }
      return false;
    };

    // Add HOME query if missing
    if (!hasIntent('android.intent.action.MAIN', 'android.intent.category.HOME')) {
      queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HOME' } }],
          },
        ],
      });
    }

    // Add LAUNCHER query if missing
    if (!hasIntent('android.intent.action.MAIN', 'android.intent.category.LAUNCHER')) {
      queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
          },
        ],
      });
    }

    return config;
  });
};

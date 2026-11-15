// Expo config plugin: tells @iternio/react-native-auto-play which Android Auto app category
// to declare. "poi" = a points-of-interest app (lists of fuel stations, restrooms, food) using
// template screens only — no navigation-app permissions, which the Play Store reviews strictly.
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'ReactNativeAutoPlay_androidAutoAppCategory';

module.exports = function withAndroidAutoCategory(config, { category = 'poi' } = {}) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: category });
    return cfg;
  });
};

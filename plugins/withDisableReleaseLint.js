const { withAppBuildGradle } = require('@expo/config-plugins');

// ---------------------------------------------------------------------------
// withDisableReleaseLint — desactiva el lint en builds de RELEASE.
//
// Por que: al agregar expo-updates, la fase lintVitalRelease del build de CI
// empezo a fallar: el worker de lint se quedaba sin Metaspace en
// react-native-async-storage (`> Metaspace`, OutOfMemoryError) y ademas
// expo-updates disparaba un bug interno del lint ("Unexpected failure during
// lint analysis"). El lint NO es necesario para generar el AAB/IPA, asi que lo
// apagamos solo para release. El chequeo de tipos (tsc) y el lint de desarrollo
// (npm run lint / eslint) siguen funcionando igual.
//
// Como: como el proyecto usa prebuild (CNG), android/ se regenera en cada CI,
// por eso se aplica via config plugin y no editando android/ a mano. Agrega un
// bloque android { lint { ... } } al final de app/build.gradle (reabrir el
// bloque android es Groovy valido y evita ediciones fragiles dentro del bloque).
// ---------------------------------------------------------------------------

const SNIPPET = `
// --- Nospi: desactivar lint en release (plugins/withDisableReleaseLint.js) ---
android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
`;

module.exports = function withDisableReleaseLint(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        'withDisableReleaseLint: se esperaba app/build.gradle en Groovy'
      );
    }
    if (!cfg.modResults.contents.includes('Nospi: desactivar lint en release')) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};

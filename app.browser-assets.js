(function publishStarPaperBrowserAssets(global) {
  'use strict';

  const versionGroups = [
    ['1', [
      'app.public-pages.js',
      'app.boot-head.js',
      'app.boot-flags.js',
      'app.boot-body.js',
      'public-page-head.js',
      'public-page-theme.js',
      'app.shell.js',
      'assets/world-atlas/land-50m.json',
      'assets/vendor/fonts/star-paper-fonts.css',
      'assets/vendor/fonts/font-01-Wnz6HAc5bAfYB2Q7azYYmg8.woff2',
      'assets/vendor/fonts/font-02-Wnz6HAc5bAfYB2Q7YjYYmg8.woff2',
      'assets/vendor/fonts/font-03-Wnz6HAc5bAfYB2Q7aDYYmg8.woff2',
      'assets/vendor/fonts/font-04-Wnz6HAc5bAfYB2Q7ZjYY.woff2',
      'assets/vendor/fonts/font-05-H4cjBXOCl9bbnla_nHIq6quyoqOOag.woff2',
      'assets/vendor/fonts/font-06-H4cjBXOCl9bbnla_nHIq6qu7oqOOag.woff2',
      'assets/vendor/fonts/font-07-H4cjBXOCl9bbnla_nHIq6quwoqOOag.woff2',
      'assets/vendor/fonts/font-08-H4cjBXOCl9bbnla_nHIq6quxoqOOag.woff2',
      'assets/vendor/fonts/font-09-H4cjBXOCl9bbnla_nHIq6qu_oqM.woff2',
      'assets/vendor/fonts/font-10-H4clBXOCl9bbnla_nHIq4pu9uqc.woff2',
      'assets/vendor/fonts/font-11-H4clBXOCl9bbnla_nHIq65u9uqc.woff2',
      'assets/vendor/fonts/font-12-H4clBXOCl9bbnla_nHIq4Ju9uqc.woff2',
      'assets/vendor/fonts/font-13-H4clBXOCl9bbnla_nHIq4Zu9uqc.woff2',
      'assets/vendor/fonts/font-14-H4clBXOCl9bbnla_nHIq75u9.woff2',
      'assets/vendor/fonts/font-15-JTUSjIg1_i6t8kCHKm459WRhyzbi.woff2',
      'assets/vendor/fonts/font-16-JTUSjIg1_i6t8kCHKm459W1hyzbi.woff2',
      'assets/vendor/fonts/font-17-JTUSjIg1_i6t8kCHKm459WZhyzbi.woff2',
      'assets/vendor/fonts/font-18-JTUSjIg1_i6t8kCHKm459Wdhyzbi.woff2',
      'assets/vendor/fonts/font-19-JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
      'assets/vendor/fonts/font-20-V8mDoQDjQSkFtoMM3T6r8E7mPb54C-s0.woff2',
      'assets/vendor/fonts/font-21-V8mDoQDjQSkFtoMM3T6r8E7mPb94C-s0.woff2',
      'assets/vendor/fonts/font-22-V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2',
      'assets/vendor/fonts/font-23-i7dPIFZifjKcF5UAWdDRYE58RWq7.woff2',
      'assets/vendor/fonts/font-24-i7dPIFZifjKcF5UAWdDRYE98RWq7.woff2',
      'assets/vendor/fonts/font-25-i7dPIFZifjKcF5UAWdDRYEF8RQ.woff2',
      'assets/vendor/fonts/font-26-i7dMIFZifjKcF5UAWdDRaPpZUFqaHjyV.woff2',
      'assets/vendor/fonts/font-27-i7dMIFZifjKcF5UAWdDRaPpZUFuaHjyV.woff2',
      'assets/vendor/fonts/font-28-i7dMIFZifjKcF5UAWdDRaPpZUFWaHg.woff2',
      'assets/vendor/phosphor-icons/regular/style.css',
      'assets/vendor/phosphor-icons/regular/Phosphor.svg',
      'assets/vendor/phosphor-icons/regular/Phosphor.ttf',
      'assets/vendor/phosphor-icons/regular/Phosphor.woff',
      'assets/vendor/phosphor-icons/regular/Phosphor.woff2',
      'assets/vendor/phosphor-icons/fill/style.css',
      'assets/vendor/phosphor-icons/fill/Phosphor-Fill.svg',
      'assets/vendor/phosphor-icons/fill/Phosphor-Fill.ttf',
      'assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff',
      'assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff2',
      'assets/vendor/phosphor-icons/duotone/style.css',
      'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.svg',
      'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.ttf',
      'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff',
      'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff2',
      'assets/vendor/three/three.module.js',
      'assets/vendor/three/OrbitControls.js',
      'assets/vendor/topojson-client/topojson-client.esm.js',
      'assets/vendor/supabase/supabase.min.js'
    ]],
    ['2', ['app.todayboard.js']],
    ['10', ['app.browser-assets.js']],
    ['3', [
      'app.root-shell.js',
      'assets/landing/notebook-board-desktop.webp',
      'assets/landing/notebook-board-mobile.webp',
      'star_paper_logo_pack/star_paper_32.png',
      'star_paper_logo_pack/star_paper_64.png',
      'star_paper_logo_pack/star_paper_128.png',
      'star_paper_logo_pack/star_paper_256.png',
      'star_paper_logo_pack/star_paper_512.png',
      'star_paper_logo_pack/star_paper_1024.png',
      'star_paper_logo_pack/star_paper_transparent.png',
      'star_paper_logo_pack/star_paper_black.png',
      'star_paper_logo_pack/star_paper_white.png'
    ]],
    ['4', ['app.premium.js']],
    ['5', ['app.tasks.js']],
    ['8', ['app.actions.js', 'styles.premium.css']],
    ['10', ['app.migrations.js']],
    ['12', ['styles.shell.css']],
    ['14', ['app.globe.js']],
    ['19', ['app.handcraft.js', 'app.reports.js']],
    ['21', ['star-paper-tokens.css']],
    ['24', ['manifest.json']],
    ['33', ['styles.handcraft.css']],
    ['56', ['styles.css']],
    ['87', ['supabase.js']],
    ['141', ['app.js']],
    ['182', ['sw.js']]
  ];

  const assetVersions = {};
  for (let groupIndex = 0; groupIndex < versionGroups.length; groupIndex += 1) {
    const version = versionGroups[groupIndex][0];
    const paths = versionGroups[groupIndex][1];
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
      assetVersions[paths[pathIndex]] = version;
    }
  }

  const assetIntegrity = Object.freeze({
    'assets/vendor/fonts/font-01-Wnz6HAc5bAfYB2Q7azYYmg8.woff2': 'sha384-P5ef8GJEFRsBrRPx76/i6Ct9/g5/bDKcG5Dy/h2WcxBOaYgcV9z9g9PSqQhPpyBv',
    'assets/vendor/fonts/font-02-Wnz6HAc5bAfYB2Q7YjYYmg8.woff2': 'sha384-XgTXFo3rOlG3mmcsdfoFRekQmNYvbdnuP0P7Zl7L/3Gh3wEPx50BEPEq3BJEq0lS',
    'assets/vendor/fonts/font-03-Wnz6HAc5bAfYB2Q7aDYYmg8.woff2': 'sha384-pkJ+AFeza3iJiWDPnPOA4MlEnxPM5Ii/iyZTMPQpEr1M6VWl62JIEugjqu9ZNO7r',
    'assets/vendor/fonts/font-04-Wnz6HAc5bAfYB2Q7ZjYY.woff2': 'sha384-zTs28LYHNJGq7O5RMR6wpdYF5MKNokhWq60X/0D7Ac4kbsnAE3cAp/rFbCgJx8LP',
    'assets/vendor/fonts/font-05-H4cjBXOCl9bbnla_nHIq6quyoqOOag.woff2': 'sha384-sc4+rVlSEZikrYk/6NH+o0zYrj1nA0YvCU5OvswYrpmg2USPEvfPfqUL6F5SSt5y',
    'assets/vendor/fonts/font-06-H4cjBXOCl9bbnla_nHIq6qu7oqOOag.woff2': 'sha384-oKgNZP+r93dLy0eYGweagRixKrIaBAUehTjB/cWUeqwBve6a2HvRmit/LsxjWCqK',
    'assets/vendor/fonts/font-07-H4cjBXOCl9bbnla_nHIq6quwoqOOag.woff2': 'sha384-Y94vOSOfBlSMI7yzy2TnFF8SM89Wq5gggfx5V0OfjzrzT5EOAdaxQ7Ct8KquawOS',
    'assets/vendor/fonts/font-08-H4cjBXOCl9bbnla_nHIq6quxoqOOag.woff2': 'sha384-44It6Zeh5+MY0xOzB7mWQJIWJDSCIeydoK3WsmYOLd3CnGgA8RhgywwDaYAAFtOK',
    'assets/vendor/fonts/font-09-H4cjBXOCl9bbnla_nHIq6qu_oqM.woff2': 'sha384-e8mPq2xFza73ftLY/Ae6i5CmPKVGf128XZC1WidEUwxIOQqs/luCBYJYwFCaNKa+',
    'assets/vendor/fonts/font-10-H4clBXOCl9bbnla_nHIq4pu9uqc.woff2': 'sha384-sQ7sB1ifluF5RY0bN/+keaLf3p+UUWERPLqqgiC37WBF3/dgaxFiqRpYp3RXIHbz',
    'assets/vendor/fonts/font-11-H4clBXOCl9bbnla_nHIq65u9uqc.woff2': 'sha384-lFPowZi34SWcQZFbXBvJqPVTtu3/OMCFrhjsKJrVKeuEBX1KGsmkFsZ9dLegg0DV',
    'assets/vendor/fonts/font-12-H4clBXOCl9bbnla_nHIq4Ju9uqc.woff2': 'sha384-4jLVnN6YeFw0nRjLA20w+m+u/knuKGt90q4lmid9pxzpcCqRyvdjbjiVxecPhfub',
    'assets/vendor/fonts/font-13-H4clBXOCl9bbnla_nHIq4Zu9uqc.woff2': 'sha384-Twd4mLn6SvYTGlLOUWPcH7jsP6E74k0pvjUy+uGpyRsFwbAbO6Mio0VHuPQHxxYo',
    'assets/vendor/fonts/font-14-H4clBXOCl9bbnla_nHIq75u9.woff2': 'sha384-+++IDOndqdgS0NYyDENy7Ta2+JMWmkMHRJ0bGECixYUcDeR6+Tgu2XYVPxWBnSzA',
    'assets/vendor/fonts/font-15-JTUSjIg1_i6t8kCHKm459WRhyzbi.woff2': 'sha384-1Oxk2WI4UaitpGi4CGIIyd3h2d+Ipm/Q34ZKe7pFUkLyVjyOhTmpis8/56xVj8VY',
    'assets/vendor/fonts/font-16-JTUSjIg1_i6t8kCHKm459W1hyzbi.woff2': 'sha384-QzkyW21+hY6DIEtXF0xXt2lmL7RwUtpSK/caADXkt28AQsodAz6mooq8oWj53WFq',
    'assets/vendor/fonts/font-17-JTUSjIg1_i6t8kCHKm459WZhyzbi.woff2': 'sha384-V6AGKqI/9xY1nZLrY56nsAcoyHZftM7vgblkoYMD9qffo1iLttSbK3cHE5YnJmaV',
    'assets/vendor/fonts/font-18-JTUSjIg1_i6t8kCHKm459Wdhyzbi.woff2': 'sha384-CX2CoiR0NItIvjTaEveq2lersU/fMaPIuE/UEYmSfiOO58jyKjjHipUxLfk4d1Np',
    'assets/vendor/fonts/font-19-JTUSjIg1_i6t8kCHKm459Wlhyw.woff2': 'sha384-lGFTHKzvmP62D/QO8gRsAAL6GuwtJjdVOjBWlwz8cTtcPVmTKLlg7CAjDiZnMyK2',
    'assets/vendor/fonts/font-20-V8mDoQDjQSkFtoMM3T6r8E7mPb54C-s0.woff2': 'sha384-mnz/tT4HpkIMwv6M2b1hC1TOAoItwLAR97PwFQnOwzQplxL3M2EOTM15N+JQe2e6',
    'assets/vendor/fonts/font-21-V8mDoQDjQSkFtoMM3T6r8E7mPb94C-s0.woff2': 'sha384-pfXgxFzpO9ikTCbPzbYqL7ZT41jx4+WxzPypqQTlIdFkwrkLyP7wn+Ud0dNmATFv',
    'assets/vendor/fonts/font-22-V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2': 'sha384-bFyCnQmP7dzdczmuaRhRu9VULfsqiMtFsiHv7/FBcJIjF1yOWpNedOO2AvXF0RfE',
    'assets/vendor/fonts/font-23-i7dPIFZifjKcF5UAWdDRYE58RWq7.woff2': 'sha384-BrWU+ShJGQNs6ZYaD9dETfdtHP7p1O5400rR1rbBn3SokziQa9uvmYDA4p7Z1wpF',
    'assets/vendor/fonts/font-24-i7dPIFZifjKcF5UAWdDRYE98RWq7.woff2': 'sha384-6hD0487Yvn+LA+CgpLbStUrlehPA+CjterX48HAliuI61cQOI2d4/TcoL7Mer12U',
    'assets/vendor/fonts/font-25-i7dPIFZifjKcF5UAWdDRYEF8RQ.woff2': 'sha384-can5HUE7rC0X9oOVLtqWVp+b441owXpyWZhWLdnm27xGcAcAj4p4FzaCqXOFkGlr',
    'assets/vendor/fonts/font-26-i7dMIFZifjKcF5UAWdDRaPpZUFqaHjyV.woff2': 'sha384-/L0IULQNc73b7dH/qsZG2nPbwyCYyveSoTSNTi2ITMkZ/p88vnwqmDxu6aAmYewt',
    'assets/vendor/fonts/font-27-i7dMIFZifjKcF5UAWdDRaPpZUFuaHjyV.woff2': 'sha384-RzejdsvHSU75DCotEPCVMyLVfON+nLUp9z+lFjSyqPKP3fYZbQ/7smmtvVXQ83d0',
    'assets/vendor/fonts/font-28-i7dMIFZifjKcF5UAWdDRaPpZUFWaHg.woff2': 'sha384-WU9tsEFwACEKof/fUfswbZe74GcFTauuwwvuQTC5RylxZcsiwY5JCJx4oDnG3Q05',
    'assets/vendor/fonts/star-paper-fonts.css': 'sha384-t4wmKe7PuhXm94yHvXcZCsj3T5zJo/MSxa/VZxlPwhvKlLWfKnQ26VViKlhhafPq',
    'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.svg': 'sha384-T6W32bC4O5tdBf9uKhVa55TGC1CnyULuWPPDsQpG2TdlswMBUL9Q+TcTdbnhyWLl',
    'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.ttf': 'sha384-GG4k6qn0KeQ04Z3SWf4SiV/h/qFSpkqt5gGlcuEvomBNKRXbOTNz/EpMSxKrwvqg',
    'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff': 'sha384-53M2kxy2gYZ5SbLdCQsQspopvpb6dF9Sm2YxTkyomVZC31IigYjskxqBLC99CFwg',
    'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff2': 'sha384-L/sX3UOUsMec3rLRAKAMQvA3W54YORbIjty0fHK9sFiiJP0OB2EWuZCGvcl5J+aQ',
    'assets/vendor/phosphor-icons/duotone/style.css': 'sha384-tr4FEGylkbMC+JwA3FygXvPM5v3fQs4HxFVRJ5q3G7My0VA8InJOvbs4K2DiO9A9',
    'assets/vendor/phosphor-icons/fill/Phosphor-Fill.svg': 'sha384-JCUe32zqoFORiY53jpcF3AKqkOEQn3ida7s0jtKPIkEkk4l7By+SnbR7emH/HuFH',
    'assets/vendor/phosphor-icons/fill/Phosphor-Fill.ttf': 'sha384-E5kclZlPw/9dWkQ3gtagXfdi5efoWMiqbl0HaE0E/UhPbt8VZ2SqhmnE0J/9YvGf',
    'assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff': 'sha384-5rO48e2gFKlYavAXCDjbZmMrI/Mv6gRB2uME7Bb8o7ZW5WJQDRIuvEiMDkZYdlO8',
    'assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff2': 'sha384-2OXNCWFbm32rM41wUHyURyGC/RgegH0wT0OvZNqWWDxiKhwkm+PiUkn8ejkf2nCJ',
    'assets/vendor/phosphor-icons/fill/style.css': 'sha384-l9s4ZI9yKUemY9QfXs5eYWtz4qht6FQAePHsh+wa1DuPUShSIHHPDhVbS4dZ2H3h',
    'assets/vendor/phosphor-icons/regular/Phosphor.svg': 'sha384-pvjnpGbmEEYgJURk1WG886WkH74oLodMT5Bw8pzoJSHFvkBGmL64CtDHu3ylvcZr',
    'assets/vendor/phosphor-icons/regular/Phosphor.ttf': 'sha384-eTwfcd0n7+Mf9ZtBS1bCFm/o5kBvHUHB49udVxDWJnWM6hAI8vBanXDkwnZoag7/',
    'assets/vendor/phosphor-icons/regular/Phosphor.woff': 'sha384-rFcu5PeosQ9vGE8rFFvsjEDU0lyCkW0vW/VDwjV0bGxYXAHWKnJCNeEqmlTEEyjE',
    'assets/vendor/phosphor-icons/regular/Phosphor.woff2': 'sha384-m+KpvLpX1Z9u15CUi7ufA3tQoODb7pNrYUWh5CDi1bej2N/yEq9p/GApOosSDfPQ',
    'assets/vendor/phosphor-icons/regular/style.css': 'sha384-dHSMQqnwmlotmEIitaE+e1kuhc61kwyNCRN4FK1SVwsJwnNbLjZvOQXdo8YZijg3',
    'assets/vendor/three/OrbitControls.js': 'sha384-9ARkq6u238/D+0NF0Ffr9QEp5rJxTgjvtTM3C4GaemdEasTzxR4XsHq2ty9yN/gZ',
    'assets/vendor/three/three.module.js': 'sha384-GY5FqjttLCFRt/McQbyaVdCk2O1IQtOeX8Py6NfD89BIAsIyJFRl4UgSXrk2vXAk',
    'assets/vendor/topojson-client/topojson-client.esm.js': 'sha384-g9qzod68SznNKO92TeZZCaahSrwK8XHoddw9zDBgXBgAFJCrKc3/OZBH9dGqw/qo',
    'assets/vendor/supabase/supabase.min.js': 'sha384-dzQgxMPp/h+N0t5qDf6Bp516wKZr3pXgGMpA7/ZM6tiWkqYo90N060L03dxnZ8Tf'
  });

  const externalScripts = Object.freeze({
    sentry: Object.freeze({
      src: 'https://browser.sentry-cdn.com/8.53.0/bundle.min.js',
      crossOrigin: 'anonymous',
      integrity: 'sha384-DYUttCOEZIXGrLRphM/xGDsps+AQ8eKYHK5X6mWt6fBm9zqil2Y9zNm0wedLxd0j'
    }),
    chart: Object.freeze({
      src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
      crossOrigin: 'anonymous',
      integrity: 'sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g'
    }),
    jspdf: Object.freeze({
      src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      crossOrigin: 'anonymous',
      integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    })
  });

  const runtimeScriptPaths = Object.freeze({
    supabase: 'assets/vendor/supabase/supabase.min.js'
  });

  function stripQueryAndHash(value) {
    return String(value || '').split('#')[0].split('?')[0];
  }

  function normalizeKey(path) {
    return stripQueryAndHash(path)
      .replace(/\\/g, '/')
      .replace(/^(?:\.\/)+/, '')
      .replace(/^\/+/, '');
  }

  function version(path) {
    const key = normalizeKey(path);
    const value = assetVersions[key];
    if (!value) throw new Error('Missing Star Paper browser asset version: ' + key);
    return value;
  }

  function url(path) {
    const source = String(path || '');
    const hashIndex = source.indexOf('#');
    const hash = hashIndex === -1 ? '' : source.slice(hashIndex);
    const beforeHash = hashIndex === -1 ? source : source.slice(0, hashIndex);
    const base = beforeHash.split('?')[0];
    return base + '?v=' + version(path) + hash;
  }

  function integrityFor(path) {
    return assetIntegrity[normalizeKey(path)] || '';
  }

  function external(name) {
    return externalScripts[name] || null;
  }

  function runtimeScript(name) {
    const path = runtimeScriptPaths[name];
    if (!path) return null;
    return Object.freeze({
      src: url(path),
      integrity: integrityFor(path),
      crossOrigin: ''
    });
  }

  const appShell = Object.freeze([
    './index.html',
    './how-it-works.html',
    './proof.html',
    './testimonials.html',
    url('./styles.css'),
    url('./styles.premium.css'),
    url('./styles.shell.css'),
    url('./styles.handcraft.css'),
    url('./star-paper-tokens.css'),
    url('./assets/vendor/fonts/star-paper-fonts.css'),
    url('./assets/vendor/fonts/font-01-Wnz6HAc5bAfYB2Q7azYYmg8.woff2'),
    url('./assets/vendor/fonts/font-02-Wnz6HAc5bAfYB2Q7YjYYmg8.woff2'),
    url('./assets/vendor/fonts/font-03-Wnz6HAc5bAfYB2Q7aDYYmg8.woff2'),
    url('./assets/vendor/fonts/font-04-Wnz6HAc5bAfYB2Q7ZjYY.woff2'),
    url('./assets/vendor/fonts/font-05-H4cjBXOCl9bbnla_nHIq6quyoqOOag.woff2'),
    url('./assets/vendor/fonts/font-06-H4cjBXOCl9bbnla_nHIq6qu7oqOOag.woff2'),
    url('./assets/vendor/fonts/font-07-H4cjBXOCl9bbnla_nHIq6quwoqOOag.woff2'),
    url('./assets/vendor/fonts/font-08-H4cjBXOCl9bbnla_nHIq6quxoqOOag.woff2'),
    url('./assets/vendor/fonts/font-09-H4cjBXOCl9bbnla_nHIq6qu_oqM.woff2'),
    url('./assets/vendor/fonts/font-10-H4clBXOCl9bbnla_nHIq4pu9uqc.woff2'),
    url('./assets/vendor/fonts/font-11-H4clBXOCl9bbnla_nHIq65u9uqc.woff2'),
    url('./assets/vendor/fonts/font-12-H4clBXOCl9bbnla_nHIq4Ju9uqc.woff2'),
    url('./assets/vendor/fonts/font-13-H4clBXOCl9bbnla_nHIq4Zu9uqc.woff2'),
    url('./assets/vendor/fonts/font-14-H4clBXOCl9bbnla_nHIq75u9.woff2'),
    url('./assets/vendor/fonts/font-15-JTUSjIg1_i6t8kCHKm459WRhyzbi.woff2'),
    url('./assets/vendor/fonts/font-16-JTUSjIg1_i6t8kCHKm459W1hyzbi.woff2'),
    url('./assets/vendor/fonts/font-17-JTUSjIg1_i6t8kCHKm459WZhyzbi.woff2'),
    url('./assets/vendor/fonts/font-18-JTUSjIg1_i6t8kCHKm459Wdhyzbi.woff2'),
    url('./assets/vendor/fonts/font-19-JTUSjIg1_i6t8kCHKm459Wlhyw.woff2'),
    url('./assets/vendor/fonts/font-20-V8mDoQDjQSkFtoMM3T6r8E7mPb54C-s0.woff2'),
    url('./assets/vendor/fonts/font-21-V8mDoQDjQSkFtoMM3T6r8E7mPb94C-s0.woff2'),
    url('./assets/vendor/fonts/font-22-V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2'),
    url('./assets/vendor/fonts/font-23-i7dPIFZifjKcF5UAWdDRYE58RWq7.woff2'),
    url('./assets/vendor/fonts/font-24-i7dPIFZifjKcF5UAWdDRYE98RWq7.woff2'),
    url('./assets/vendor/fonts/font-25-i7dPIFZifjKcF5UAWdDRYEF8RQ.woff2'),
    url('./assets/vendor/fonts/font-26-i7dMIFZifjKcF5UAWdDRaPpZUFqaHjyV.woff2'),
    url('./assets/vendor/fonts/font-27-i7dMIFZifjKcF5UAWdDRaPpZUFuaHjyV.woff2'),
    url('./assets/vendor/fonts/font-28-i7dMIFZifjKcF5UAWdDRaPpZUFWaHg.woff2'),
    url('./assets/vendor/phosphor-icons/regular/style.css'),
    url('./assets/vendor/phosphor-icons/regular/Phosphor.woff2'),
    url('./assets/vendor/phosphor-icons/fill/style.css'),
    url('./assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff2'),
    url('./assets/vendor/phosphor-icons/duotone/style.css'),
    url('./assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff2'),
    url('./assets/vendor/three/three.module.js'),
    url('./assets/vendor/three/OrbitControls.js'),
    url('./assets/vendor/topojson-client/topojson-client.esm.js'),
    url('./assets/vendor/supabase/supabase.min.js'),
    url('./app.browser-assets.js'),
    url('./app.public-pages.js'),
    url('./app.boot-head.js'),
    url('./app.boot-flags.js'),
    url('./app.boot-body.js'),
    url('./public-page-head.js'),
    url('./public-page-theme.js'),
    url('./app.root-shell.js'),
    url('./supabase.js'),
    url('./app.migrations.js'),
    url('./app.actions.js'),
    url('./app.todayboard.js'),
    url('./app.tasks.js'),
    url('./app.reports.js'),
    url('./app.js'),
    url('./app.handcraft.js'),
    url('./app.globe.js'),
    url('./app.premium.js'),
    url('./app.shell.js'),
    url('/assets/world-atlas/land-50m.json'),
    url('/assets/landing/notebook-board-desktop.webp'),
    url('/assets/landing/notebook-board-mobile.webp'),
    url('/manifest.json'),
    url('/star_paper_logo_pack/star_paper_32.png'),
    url('/star_paper_logo_pack/star_paper_64.png'),
    url('/star_paper_logo_pack/star_paper_128.png'),
    url('/star_paper_logo_pack/star_paper_256.png'),
    url('/star_paper_logo_pack/star_paper_512.png'),
    url('/star_paper_logo_pack/star_paper_1024.png'),
    url('/star_paper_logo_pack/star_paper_transparent.png'),
    url('/star_paper_logo_pack/star_paper_black.png'),
    url('/star_paper_logo_pack/star_paper_white.png')
  ]);

  global.SP_BROWSER_ASSETS = Object.freeze({
    versions: Object.freeze(assetVersions),
    integrity: assetIntegrity,
    externalScripts,
    runtimeScriptPaths,
    selfHostedRuntimeAssets: Object.freeze(Object.keys(assetIntegrity)),
    appShell,
    version,
    url,
    integrityFor,
    runtimeScript,
    external
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window));

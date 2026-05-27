// PS-20 — ESLint dependency-layer rules.
//
// Enforces the layered architecture documented in long_term_strategy.md §1.2:
//   - `ocr/`      — pure OCR logic; may only depend on `core/`
//   - `core/`     — pure utilities + shared domain; may NOT import `features/`
//   - `features/` — feature folders; one feature may NOT import another
//
// Implementation: `eslint-plugin-boundaries` classifies every source file
// into a layer (`ocr`, `core`, `feature`, `components`, `navigation`,
// `hooks`, `media`) based on its path under `src/`, and the `element-types`
// rule declares which layers each layer may import from.
//
// Run with `npm run lint`. No CI gate yet — this is a developer-side guardrail.

module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: { browser: true, node: true, es2022: true, jest: true },
  globals: { __DEV__: 'readonly' },
  plugins: ['import', 'boundaries'],
  settings: {
    'import/resolver': {
      'babel-module': { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
    },
    // Each element captures one feature folder so the feature/X → feature/Y
    // ban can be expressed via `disallow: { from: 'feature', to: 'feature' }`
    // without a per-folder enumeration. The boundaries plugin compares the
    // captured `${capture[0]}` (feature name) and treats same-name as
    // intra-feature (allowed), different-name as cross-feature (banned).
    'boundaries/elements': [
      { type: 'core',       pattern: 'src/core/**/*' },
      { type: 'ocr',        pattern: 'src/ocr/**/*' },
      { type: 'components', pattern: 'src/components/**/*' },
      { type: 'media',      pattern: 'src/media/**/*' },
      { type: 'navigation', pattern: 'src/navigation/**/*' },
      { type: 'hooks',      pattern: 'src/hooks/**/*' },
      { type: 'db',         pattern: 'src/db/**/*' },
      { type: 'analytics',  pattern: 'src/analytics/**/*' },
      { type: 'maintenance',pattern: 'src/maintenance/**/*' },
      { type: 'feature',    pattern: 'src/features/*',         capture: ['name'] },
      { type: 'feature',    pattern: 'src/features/*/**/*',    capture: ['name'] },
    ],
    'boundaries/ignore': ['__tests__/**/*', 'metro.config.js', 'babel.config.js'],
  },
  ignorePatterns: [
    'android/',
    'ios/',
    'node_modules/',
    'dist/',
    '__tests__/',
  ],
  rules: {
    'boundaries/element-types': ['error', {
      default: 'allow',
      rules: [
        // ocr/ may only reach core/. No features, no components, no navigation.
        {
          from:    'ocr',
          disallow: ['feature', 'components', 'navigation', 'hooks', 'media', 'analytics', 'maintenance', 'db'],
        },
        // core/ must not reach features/ (cycle prevention) or layers above.
        {
          from:    'core',
          disallow: ['feature', 'ocr', 'components', 'navigation', 'hooks', 'media', 'analytics', 'maintenance', 'db'],
        },
        // analytics/ uses db/ + core/ + ocr/ but must NOT pull in features.
        {
          from:    'analytics',
          disallow: ['feature', 'components', 'navigation', 'hooks'],
        },
        // features/X may NOT import features/Y. Same feature name is fine
        // (intra-feature). `boundaries/element-types` evaluates the capture
        // values: when both from + to are `feature` AND their `name`
        // captures differ, the import is disallowed.
        {
          from:    [['feature', { name: '${name}' }]],
          allow:   [['feature', { name: '${name}' }]],
          // Any other feature (different name) falls through to default —
          // but default is 'allow' globally. Use the `from`/`disallow`
          // pair below to lock the cross-feature case explicitly.
        },
        {
          from:     [['feature', { name: '${from.name}' }]],
          disallow: [['feature', { name: '!${from.name}' }]],
          message:  'features/X may not import from features/Y (lift the shared logic into core/).',
        },
      ],
    }],
  },
};

// PS-19 — Jest configuration for Drift.
//
// Two test modes:
//   - default ("jest-expo" preset)  → React Native components + JSX
//   - "node"   project              → pure-node tests using `node:sqlite`
//                                     for repo/trigger/analytics fixtures.
//
// The pure-node project lets schema/trigger/inflation tests run WITHOUT
// spinning up expo-sqlite (which requires a native Android/iOS host).
// React Native component tests live under __tests__/components/ and run
// under jest-expo's transformer.

module.exports = {
  projects: [
    {
      displayName: 'rn',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/__tests__/components/**/*.test.{js,jsx,ts,tsx}'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-clone-referenced-element|@react-native-community/.*|@react-native-async-storage/.*|@testing-library/.*))',
      ],
    },
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/__tests__/triggers/**/*.test.js',
        '<rootDir>/__tests__/analytics/**/*.test.js',
        '<rootDir>/__tests__/ocr/**/*.test.js',
      ],
      transform: {},
    },
  ],
};

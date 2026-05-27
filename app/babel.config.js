module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@core': './src/core',
            '@features': './src/features',
            '@ocr': './src/ocr',
            '@components': './src/components',
            '@media': './src/media',
          },
        },
      ],
    ],
  };
};

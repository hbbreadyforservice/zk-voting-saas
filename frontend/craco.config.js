const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve.fallback = {
        buffer: require.resolve('buffer'),
        assert: require.resolve('assert'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
        fs: false,
        net: false,
        tls: false,
        os: false,
        path: false,
      };
      config.resolve.alias = {
        ...config.resolve.alias,
        'process/browser': require.resolve('process/browser.js'),
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser.js',
        })
      );
      return config;
    },
  },
};

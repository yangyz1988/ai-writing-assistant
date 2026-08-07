const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

const normalizeMembershipApiUrl = (value) => {
  if (!value) return '';
  const url = new URL(value);
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('MEMBERSHIP_API_BASE_URL must use HTTPS (localhost HTTP is allowed)');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MEMBERSHIP_API_BASE_URL must be an origin without credentials, path, query, or hash');
  }
  return url.origin;
};

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const membershipApiBaseUrl = normalizeMembershipApiUrl(process.env.MEMBERSHIP_API_BASE_URL || '');
  
  return {
    entry: {
      popup: './src/popup/index.tsx',
      content: './src/content/index.ts',
      background: './src/background/index.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          oneOf: [
            {
              resourceQuery: /inline/,
              use: ['to-string-loader', 'css-loader'],
            },
            {
              use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      new webpack.DefinePlugin({
        __MEMBERSHIP_API_BASE_URL__: JSON.stringify(membershipApiBaseUrl),
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'manifest.json',
            to: 'manifest.json',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              if (membershipApiBaseUrl) {
                manifest.host_permissions = [
                  ...new Set([...(manifest.host_permissions || []), `${membershipApiBaseUrl}/*`]),
                ];
              }
              return JSON.stringify(manifest, null, 2);
            },
          },
          { from: 'icons', to: 'icons', noErrorOnMissing: true },
        ],
      }),
    ],
    devtool: isProduction ? false : 'inline-source-map',
  };
};

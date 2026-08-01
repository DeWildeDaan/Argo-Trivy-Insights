const path = require('path');

const extensionName = 'trivy-insights';

module.exports = {
  entry: './src/index.tsx',
  output: {
    // Argo CD only loads files matching ^extension(.*)\.js$ from /tmp/extensions
    filename: `extension-${extensionName}.js`,
    path: path.resolve(__dirname, 'dist', 'resources'),
    libraryTarget: 'window',
    library: ['tmp', 'extensions'],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  // React must NOT be bundled - Argo CD provides it as a global.
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
  },
};

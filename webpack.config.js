const
  path = require('path');

module.exports = (env) => {
  const mode = env.dev ? 'development' : 'production';
  const filename = env.dev ? 'stickerbook.combined.js' : 'stickerbook.min.js';

  return {
    entry: './index.js',
    mode: mode,
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: filename,
      library: 'stickerbook'
    }
  };
};
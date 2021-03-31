const browserify = require('browserify');
const gulp = require('gulp');
const source = require('vinyl-source-stream');
const streamify = require('gulp-streamify');
const uglify = require('gulp-uglify-es').default;
const exorcist = require('exorcist');

module.exports = (entryPoint, outputFilename, outputDestinations, debug) => {
  // default options for debug mode
  debug = (debug === true);

  let inProcessBundle = browserify(entryPoint, {
    debug: debug
  })
    .transform('babelify')
    .bundle()
    .pipe(exorcist('dist/' + outputFilename + '.map'))
    .pipe(source(outputFilename));

  if (!debug) {
    inProcessBundle = inProcessBundle.pipe(streamify(uglify()));
  }

  outputDestinations.forEach((destination) => {
    inProcessBundle = inProcessBundle.pipe(gulp.dest(destination));
  });

  return inProcessBundle;
};

/**
 * Utility function to decide if two points are far enough apart to add a new image
 *
 * @param {Object} currentPoint - a Fabric.Point representing the current point
 * @param {Object} lastPoint - a Fabric.Point representing the last point we added an image
 * @param {number} tolerance - number of pixels we should allow between images' centers
 *
 * @return {Boolean} true if point is far enough to add a new image, false
 * otherwise
 */
const _isPointFarEnough = (currentPoint, lastPoint, tolerance) => {
  // calculate euclidean distance between two points
  // https://en.wikipedia.org/wiki/Euclidean_distance#Two_dimensions
  const deltaX = lastPoint.x - currentPoint.x;
  const deltaY = lastPoint.y - currentPoint.y;

  return (deltaX * deltaX + deltaY * deltaY) > (tolerance * tolerance);
};

const PatternBrush = fabric.util.createClass(fabric.BaseBrush, {
  /**
   * initialize pattern brush
   *
   * @param {Object} canvas - a Fabric.Canvas instance
   * @param {Object} options The options for the pattern brush
   * @return {undefined}
   */
  initialize: function (canvas, options) {
    this.canvas = canvas;
    this.points = [];
    this.images = [];
    this.placedImages = [];
    this._lastPoint = null;
    this._imgIndex = 0;

    this.setImages(options.images);

    // NOTE: in the future, this can be configurable.
    this._distanceTolerance = 100;
  },

  /**
   * Async method, loads image urls into internal cached images for placement
   *
   * @param {Object[]} imageUrls - an array of image urls for the pattern
   * @return {Object} a promise, which resolves when all images are created
   */
  setImages: function (imageUrls) {
    this.imageUrls = imageUrls;
    const imgPromises = imageUrls.map((url) => new Promise((resolve) => {
      fabric.Image.fromURL(url, (img) => {
        resolve(img);
      });
    }));
    const loadingPromise = Promise.all(imgPromises).then((images) => {
      this.images = images;
      return true;
    });
    this.loadingPromise = loadingPromise;
    return loadingPromise;
  },

  /**
   * Handler for the end of a drawing action. Saves drawn images to canvas as
   * a group, resets internal state
   *
   * @return {undefined}
   */
  onMouseUp: function () {
    const canvas = this.canvas;

    canvas.renderOnAddRemove = false;
    const imageGroup = new fabric.Group(this.placedImages);
    this.placedImages.forEach((img) => {
      this.canvas.remove(img);
    });
    this.canvas.add(imageGroup);
    imageGroup.selectable = false;
    canvas.renderOnAddRemove = true;

    canvas.clearContext(canvas.contextTop);
    canvas.renderAll();

    // reset internal state
    this.points = [];
    this.placedImages = [];
    this._lastPoint = null;

    // hack to avoid double events
    if (imageGroup._objects.length > 0) {
      this.canvas.fire('path:created', {path: imageGroup});
    }
  },

  /**
   * Handler for the beginning of a drawing action. Wait for internal loading to
   * complete, then create an image at the origin and record the first point
   *
   * @param {Object} point - Fabric.Point instance representing beginning of
   * drawing path
   * @return {undefined}
   */
  onMouseDown: function (point) {
    this._lastImagePoint = point;
    this._recordPoint(point);
    return this.loadingPromise.then(() => {
      this._createImage(point);
    });
  },

  /**
   * Handler for drawing continuation. Determines if the point is far enough along
   * to add the next image, adds if so.
   *
   * @param {Object} point - Fabric.Point instance representing current point of
   * drawing path
   * @return {undefined}
   */
  onMouseMove: function (point) {
    const farEnough = _isPointFarEnough(
      point,
      this._lastImagePoint,
      this._distanceTolerance
    );
    if (farEnough) {
      this._createImage(point);
      this._lastImagePoint = point;
    }
    this._recordPoint(point);
  },

  /**
   * Add point to internal records
   *
   * @param {Object} point - Fabric.Point instance
   * @return {undefined}
   */
  _recordPoint: function (point) {
    this._lastPoint = point;
    this.points.push(point);
  },

  /**
   * get internal index of the current image we should draw
   *
   * @return {number} current image index
   */
  _getCurrentImgIndex: function () {
    return this._imgIndex;
  },

  /**
   * get internal index of the next image we should draw, after the current one
   *
   * @return {number} next image index
   */
  _getNextImgIndex: function () {
    return ((this._imgIndex + 1) > (this.images.length - 1)) ?
      0 :
      this._imgIndex + 1;
  },

  /**
   * get internal index of the last image we drew
   *
   * @return {number} last image index
   */
  _getLastImgIndex: function () {
    return ((this._imgIndex - 1) < 0) ?
      this.images.length - 1 :
      this._imgIndex - 1;
  },

  /**
   * Add current image to canvas at the given point
   *
   * @param {Object} point - Fabric.Point for image placement
   * @return {undefined}
   */
  _createImage: function (point) {
    const imgIndex = this._getCurrentImgIndex();
    const cachedImage = this.images[imgIndex];
    cachedImage.clone((img) => {
      var scaleFactor = this.width / img.width;
      var displayHeight = img.height * scaleFactor;

      // center and scale
      img.scaleX *= scaleFactor;
      img.scaleY *= scaleFactor;
      img.left = point.x - this.width / 2;
      img.top = point.y - displayHeight / 2;
      img.setCoords();

      this.placedImages.push(img);
      this.canvas.add(img);
    });

    this._imgIndex = this._getNextImgIndex();
  }
});

module.exports = PatternBrush;

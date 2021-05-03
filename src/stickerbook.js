const validate = require('./validation/validate');
const schemaStickerbook = require('./validation/stickerbook.json');
const schemaPattern = require('./validation/pattern-brush.json');
const schemaBitmap = require('./validation/bitmap-brush.json');
const schemaBitmapEraser = require('./validation/bitmap-brush.json');
const fabric = require('fabric').fabric;
const BitmapBrush = require('./brushes/bitmap-brush');
const BitmapEraserBrush = require('./brushes/bitmap-eraser-brush');
const FillBrush = require('./brushes/fill-brush');
const BackgroundManager = require('./background-manager');
const MarkerBrush = require('./brushes/marker-brush');
const PatternBrush = require('./brushes/pattern-brush');
const PencilEraserBrush = require('./brushes/pencil-eraser-brush');
const TextboxPad = require('./objects/TextboxPad').default;
const AudioSticker = require('./objects/AudioSticker').default;
const {
  disableSelectabilityHandler,
  mouseDownHandler,
  mouseUpHandler,
  recordObjectAddition,
  recordPropertyChange
} = require('./event-handlers');
const {calculateInnerDimensions} = require('./util');
const HistoryManager = require('./history-manager');
const {BaseBrush, CircleBrush, PencilBrush, SprayBrush} = fabric;
const schema = {
  stickerbook: schemaStickerbook,
  pattern: schemaPattern,
  bitmap: schemaBitmap,
  'bitmap-eraser': schemaBitmapEraser
};
class Stickerbook {
  /**
   * Construct new stickerbook
   * @param {Object} config - configuration options (see docs)
   * @returns {Object} Stickerbook
   */
  constructor(config) {
    Object.defineProperty(this, 'lockConfiguration', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: config.lockConfiguration !== false
    });

    // assign default to the config, if it's missing
    const configWithDefaults = this._applyDefaultConfigs(config);

    this.availableBrushes = {
      bitmap: BitmapBrush,
      'bitmap-eraser': BitmapEraserBrush,
      circle: CircleBrush,
      eraser: PencilEraserBrush,
      marker: MarkerBrush,
      pattern: PatternBrush,
      pencil: PencilBrush,
      spray: SprayBrush,
      fill: FillBrush
    };

    this._validateConfig(configWithDefaults);

    // apply any extra available brushes
    if (typeof configWithDefaults.brush.custom !== 'undefined') {
      Object.assign(configWithDefaults, configWithDefaults.brush.custom);
    }

    this._config = configWithDefaults;

    this.state = {
      brush: configWithDefaults?.brush?.enabled?.[0] ?? 'pencil',
      brushWidth: configWithDefaults?.brush?.widths?.[0] ?? 1,
      brushConfig: {},
      color: configWithDefaults?.brush?.colors?.[0] ?? '#000000',
      drawing: true,
      sticker: null,
      historyIndex: null
    };

    this.containerElement = configWithDefaults.container;

    // the background canvas
    this.backgroundManager = new BackgroundManager(this.containerElement);

    // fabric requires us to explicitly set and manage height and width.
    // (http://stackoverflow.com/questions/10581460)
    this._canvas = this._initializeFabricCanvas(this.containerElement);

    this.historyManager = new HistoryManager(this._canvas);
    this._canvas.on('object:added', (event) => recordObjectAddition(this.historyManager, event));
    this._canvas.on('object:modified', (event) => recordPropertyChange(this.historyManager, event));

    if (this._config.background && this._config.background.default) {
      this.setBackground(this._config.background.default);
    }

    this._updateCanvasState();

    // responsive logic
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);

    // mark destroyed state
    this.isDestroyed = false;

    return this;
  }

  /**
   * Applies defaults to a specified config
   * @param {Object} config The passed config object
   * @return {Object} An updated config object that has stickerbook config defaults set on it
   */
  _applyDefaultConfigs(config) {
    const background = Object.assign({
      enabled: [],
      default: null
    }, config.background);

    const defaults = {
      mobileEnabled: true,
      useDefaultEventHandlers: false
    };

    return Object.assign({}, defaults, config, {
      background
    });
  }

  /**
   * Initizalizes a configured Fabric.Canvas object within DOM containing element
   * @param {Object} containerElement - DOM element to build canvas within
   *
   * @returns {Object} Fabric.Canvas
   */
  _initializeFabricCanvas(containerElement) {
    const canvasElement = fabric.document.createElement('canvas');
    containerElement.appendChild(canvasElement);

    const dimensions = calculateInnerDimensions(containerElement);
    const canvas = new fabric.Canvas(
      canvasElement, {
        width: dimensions.width,
        height: dimensions.height,
        enableRetinaScaling: false,
        selection: false  // no group selection
      }
    );

    // more opinionated handlers, these can be deactivated by implementors
    if (this._config.useDefaultEventHandlers) {
      canvas.on('mouse:down', mouseDownHandler.bind(this));
      canvas.on('mouse:up', mouseUpHandler.bind(this));
    }

    // listen for objects to be added, so we can disable things from being selectable
    canvas.on('object:added', disableSelectabilityHandler.bind(this));

    return canvas;
  }

  /**
   * Steps canvas back one step in history, if possible
   *
   * this method is asynchronous, because we need to give Fabric time to
   * re-render images
   *
   * @returns {Object} Promise, which resolves to the Stickerbook
   */
  undo() {
    return this.historyManager.undo().then(() => this);
  }

  /**
   * Steps canvas forward one step in history, if possible
   *
   * @returns {Object} Promise, which resolves to the Stickerbook
   */
  redo() {
    return this.historyManager.redo().then(() => this);
  }

  /**
   * Convenience function to update internal state and trigger update to external
   * canvas object state
   * @param {Object} newState - Stickerbook.state keys/values to update
   *
   * @returns {Object} Stickerbook
   */
  _setState(newState) {
    this.state = Object.assign(this.state, newState);
    this._updateCanvasState();
  }

  /**
   * Updates fabric Canvas to match internal `state`
   *
   * @returns {Object} Stickerbook
   */
  _updateCanvasState() {
    const BrushClass = this.availableBrushes[this.state.brush];
    this._canvas.freeDrawingBrush = new BrushClass(this._canvas, this.state.brushConfig);

    this._canvas.freeDrawingBrush.color = this.state.color;
    this._canvas.freeDrawingBrush.width = this.state.brushWidth;
    this._canvas.isDrawingMode = this.state.drawing;

    // set background image on container
    this.backgroundManager.setImageSrc(this.state.backgroundImage);
    this.backgroundManager.render();

    return this;
  }

  /**
   * Mutates canvas and contained objects in response to resize event
   * @param {Object} evt - window.resize event
   *
   * @returns {Object} Stickerbook
   */
  resize() {
    // theoretically, fabric supports setting CSS dimensions directly
    // (http://fabricjs.com/docs/fabric.Canvas.html#setDimensions)
    // however, using that mechanism seems to result in undesireable
    // scaling behavior: https://github.com/kangax/fabric.js/issues/1270

    const originalDimensions = {
      width: this._canvas.width,
      height: this._canvas.height
    };

    const newDimensions = calculateInnerDimensions(this.containerElement);

    this._repositionObjects(originalDimensions, newDimensions);

    this.backgroundManager.resize();
    this._canvas.setDimensions(newDimensions);

    return this;
  }

  _repositionObjects(originalDimensions, newDimensions) {
    var scaleFactor = newDimensions.width / originalDimensions.width;

    this._canvas.getObjects().forEach((object) => {
      object.scaleX *= scaleFactor;
      object.scaleY *= scaleFactor;
      object.left *= scaleFactor;
      object.top *= scaleFactor;
    });
  }

  /**
   * Validate config object.
   * @param {Object} config - configuration options
   *
   * @returns {Boolean} true if confguration is valid
   */
  _validateConfig(config) {
    validate(schema.stickerbook, config);

    if (typeof config.brush.custom === 'undefined') {
      return true;
    }

    Object.keys(config.brush.custom).forEach((key) => {
      if (config.brush.custom[key].prototype instanceof BaseBrush) {
        return;
      }

      // this entry is not an actual fabric brush
      throw new Error(`Custom brush "${key}" is not an instance of fabric.BaseBrush`);
    });

    return true;
  }

  /**
   * Set active brush for painting.
   * @param {string} brushName - name of the brush to set active
   * @param {Object} brushConfig - name of the brush to set active
   * @param {Object.string} brushConfig.patternUrl - name of the brush to set active
   *
   * @returns {Object} Stickerbook
   */
  setBrush(brushName, brushConfig) {
    if (this._config.brush.enabled.indexOf(brushName) === -1) {
      throw new Error(brushName + ' is not a permitted brush');
    }

    if (Object.keys(this.availableBrushes).indexOf(brushName) === -1) {
      throw new Error(brushName + ' is an unknown brush type');
    }

    const newState = {
      brush: brushName,
      drawing: true
    };

    if (brushConfig) {
      newState.brushConfig = brushConfig;

      // if there are validation rules for the brush's configuration, run a quick check
      if (typeof schema[brushName] !== 'undefined') {
        validate(schema[brushName], brushConfig);
      }
    }

    return this._setState(newState);
  }

  /**
   * Set active brush width for painting.
   * @param {number} pixels - width in pixels for the brush
   *
   * @returns {Object} Stickerbook
   */
  setBrushWidth(pixels) {
    if (this.lockConfiguration && this._config.brush.widths.indexOf(pixels) === -1) {
      throw new Error(pixels + ' is not a permitted brush width');
    }

    return this._setState({
      brushWidth: pixels,
      drawing: true
    });
  }

  /**
   * Set active color for painting.
   * @param {string} color - hex code of color
   *
   * @returns {Object} Stickerbook
   */
  setColor(color) {
    if (this.lockConfiguration && this._config.brush.colors.indexOf(color) === -1) {
      throw new Error(color + ' is not a permitted color');
    }

    return this._setState({
      color: color,
      drawing: true
    });
  }

  /**
   * Set sticker for placing. Note that this method is asynchronous because fabric will have to do
   * a network call to load the image.
   * @param {string} stickerUrl - URL of image for sticker use
   * @param {string} audioUrl - URL of audio for sticker use
   *
   * @returns {Promise<Stickerbook>} A promise that resolves to the stickerbook when the image has
   *                                 loaded and is ready
   */
  setSticker(stickerUrl, audioUrl) {
    if (this.lockConfiguration && this._config.stickers.enabled.indexOf(stickerUrl) === -1) {
      throw new Error(stickerUrl + ' is not a permitted sticker');
    }

    return new Promise((resolve) => {
      const
        callback = (img) => {
          img.filters?.push(new fabric.Image.filters.Resize());
          this._setState({
            sticker: img,
            drawing: false,
            _stickerAdded: false
          });

          resolve(this);
        };

      if (audioUrl) {
        AudioSticker.fromURL({
          image: stickerUrl,
          audio: audioUrl
        }, callback);
      } else if (stickerUrl.indexOf('.mp4') >= 0) { // TODO: make a better check here.
        const
          videoElement = document.createElement('video'),
          sourceElement = document.createElement('source');
        
        videoElement.appendChild(sourceElement);
        sourceElement.type = `video/mp4`;
        videoElement.addEventListener('loadedmetadata', () => {
          videoElement.width = videoElement.videoWidth;
          videoElement.height = videoElement.videoHeight;
          callback(new fabric.Image(videoElement, {
            backgroundColor: '#000000',
            originX: 'center',
            originY: 'center',
            objectCaching: false
          }));
        });
        videoElement.addEventListener('canplay', () => {
          videoElement.play();
        });
        videoElement.crossOrigin = "Anonymous";
        sourceElement.crossOrigin = "Anonymous";
        sourceElement.src = stickerUrl;
        videoElement.load();
      } else {
        fabric.Image.fromURL(stickerUrl, callback);
      }
    });
  }

  setPan() {
    throw new Error('not yet implemented: Stickerbook.setPan()');
  }

  setZoom() {
    throw new Error('not yet implemented: Stickerbook.setZoom()');
  }

  clear() {
    this._canvas.clear();
  }

  /**
   * Get a list of all available colors, as hex codes
   *
   * @returns {Object[]} array of hex code strings
   */
  getAvailableColors() {
    return this._config?.brush?.colors;
  }

  /**
   * Get a list of all available sticker images, as urls
   *
   * @returns {Object[]} array of sticker image urls
   */
  getAvailableStickers() {
    return this._config.stickers.enabled;
  }

  /**
   * Set background image of canvas
   * @param {string|null} imageUrl - url to image for background, or null to remove
   * the background
   *
   * @returns {Object} stickerbook
   */
  setBackground(imageUrl) {
    if (!imageUrl) {
      this.clearBackground();
      return this;
    }

    if (!this._config.background || !(this._config.background.enabled instanceof Array)) {
      return this;
    }

    const backgroundImageIsEnabled = this._config.background.enabled.indexOf(imageUrl) > -1;

    if (!backgroundImageIsEnabled) {
      throw new Error(`${imageUrl} is not a permitted background`);
    }

    this._setState({
      backgroundImage: imageUrl
    });

    return this;
  }

  /**
   * Removes any background image for the stickerbook
   *
   * @return {Object} stickerbook
   */
  clearBackground() {
    this._setState({
      backgroundImage: null
    });

    return this;
  }

  /**
   * Get background image of canvas
   *
   * @returns {string} url for background image
   */
  getBackground() {
    return this.state.backgroundImage;
  }

  /**
   * Deselects any selected items
   * @return {Object} stickerbook
   */
  deselectAll() {
    this._canvas.discardActiveObject().renderAll();
    return this;
  }

  /**
   * Exports the stickerbook to a base64 encoded PNG, mimicking the native canvas methods
   *
   * @returns {string} A base64 string with the composited image in it
   */
  toDataURL() {
    return this.getThumbnail().toDataURL();
  }

  /**
   * Exports an image of the stickerbook as a canvas element. If dimensions are provided,
   * it is scaled to fit. If the aspect ratio is different, the image is cropped to fit
   * without stretching.
   * 
   * @param {number} width - Sets the width of the thumbnail image.
   * @param {number} height - Sets the height of the thumbnail image.
   * @returns {string} A base64 string with the composited image in it
   */
  getThumbnail(width, height) {
    const
      sourceWidth = this._canvas.lowerCanvasEl.width,
      sourceHeight = this._canvas.lowerCanvasEl.height,
      destinationWidth = width || sourceWidth,
      destinationHeight = height || sourceHeight,
      scaleWidth = destinationWidth / sourceWidth,
      scaleHeight = destinationHeight / sourceHeight,
      scale = Math.max(scaleWidth, scaleHeight),
      scaledWidth = scale * sourceWidth,
      scaledHeight = scale * sourceHeight,
      offsetX = (destinationWidth - scaledWidth) / 2,
      offsetY = (destinationHeight - scaledHeight) / 2;
    // deselect anything before exporting so we don't see scaling handles in the exported image
    this.deselectAll();

    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = destinationWidth;
    dummyCanvas.height = destinationHeight;
    const dummyContext = dummyCanvas.getContext('2d');

    dummyContext.drawImage(this.backgroundManager._canvas, 0, 0, sourceWidth, sourceHeight, offsetX, offsetY, scaledWidth, scaledHeight);
    dummyContext.drawImage(this._canvas.lowerCanvasEl, 0, 0, sourceWidth, sourceHeight, offsetX, offsetY, scaledWidth, scaledHeight);

    return dummyCanvas;
  }
  
  /**
   * Register a callback on an event
   *
   * @param {string} eventName - name of event to listen for
   * @param {function} handler - callback for event listener
   *
   * @return {Object} stickerbook
   */
  on(eventName, handler) {
    this._canvas.on(eventName, handler);
    return this;
  }

  /**
   * Deregister a callback on an event
   *
   * @param {string} eventName - name of event
   * @param {function} handler - callback to remove
   *
   * @return {Object} stickerbook
   */
  off(eventName, handler) {
    this._canvas.off(eventName, handler);
    return this;
  }

  /**
   * Get topmost sticker (usually the most recently added)
   *
   * @return {Object|null} either the topmost sticker object, or null if there
   * are no stickers
   */
  getTopSticker() {
    const objects = this._canvas.getObjects();
    // fabric appends to its objects, so the top object is the furthest to
    // the right
    for (let i = objects.length - 1; i >= 0; i--) {
      if (typeof objects[i]._element !== 'undefined') {
        return objects[i];
      }
    }
    return null;
  }

  /**
   * Get active object
   *
   * @return {Object|null} either the active object, or null if there
   * is no active object
   */
   getActiveObject() {
    return this._canvas.getActiveObject() || null;
  }

  /**
   * Places the current selected sticker programmatically on the canvas
   * @param {Object} options An object with options for the placement
   * @param {Number} options.x The x position at which to place the sticker
   * @param {Number} options.y The y position at which to place the sticker
   * @param {Number} options.xScale The x scale at which to place the sticker, defaults to 1
   * @param {Number} options.yScale The y scale at which to place the sticker, defaults to 1
   * @param {Number} options.rotation How much to rotate the image clockwise in degrees, defaults to
   *                                  0
   * @returns {Promise} A promise that resolves to the stickerbook once the image is placed
   */
  placeSticker(options) {
    var defaults = this._config.stickers.defaults;
    if (this._config.stickers.defaults) {
      options.x = options.x || defaults.x;
      options.y = options.y || defaults.y;
      options.xScale = options.xScale || defaults.xScale;
      options.yScale = options.yScale || defaults.yScale;
      options.rotation = options.rotation || defaults.rotation;
    }

    options.xScale = options.xScale || 1;
    options.yScale = options.yScale || 1;
    options.rotation = options.rotation || 0;

    if (typeof options.x === 'undefined' || typeof options.y === 'undefined') {
      throw new Error('To place a sticker an x and y must be provided if there is no default');
    }

    // add the sticker to the internal fabric canvas and reposition
    this.state.sticker.set({
      left: options.x,
      top: options.y,
      scaleX: options.xScale,
      scaleY: options.yScale,
      angle: options.rotation,
      perPixelTargetFind: true
    });
    this.state.sticker.setCoords();
    this._canvas.add(this.state.sticker);

    // if there are any sticker control configs, apply those styles
    if (this._config.stickers.controls) {
      let hasBorders = this._config.stickers.controls.hasBorders;
      if (typeof hasBorders === 'undefined') {
        hasBorders = true;
      }
      this.state.sticker.set({
        transparentCorners: false,
        cornerSize: this._config.stickers.controls.cornerSize,
        cornerColor: this._config.stickers.controls.cornerColor,
        hasBorders: hasBorders
      });
    }

    // make this the only active sticker
    this._canvas.setActiveObject(this.state.sticker);

    // update state
    this._setState({
      _stickerAdded: true
    });

    // Update scaling lock values
    requestAnimationFrame(() => {
      this.state.sticker.lockScalingX = false;
      this.state.sticker.lockScalingY = false;
    });

    // re-render
    return this.triggerRender();
  }

  /**
   * Set text object for placing.
   * @param {string} text - The text to be rendered.
   * @param {object} style - key/value pairs describing style to apply to text.
   * @param {string} type - Whether text is editable ("input" [default]), or not ("text"), or a textbox ("textbox").
   * @returns {Promise<Stickerbook>} A promise that resolves to the stickerbook when the text is ready
   */
   setText(text, style, type = 'input') {
    if (this.lockConfiguration && this._config.text.enabled.indexOf(text) === -1) {
      throw new Error(`${text} is not permitted text`);
    }

    return new Promise((resolve) => {
      const Text = type === 'text' ? fabric.Text : type === 'textbox' ? TextboxPad : fabric.IText;
      const textObj = new Text(text, style);
      this._setState({
        text: textObj,
        drawing: false,
        _textAdded: false
      });

      resolve(this);
    });
  }

  /**
   * Place text object.
   *
   * @returns A promise that resolves to the stickerbook once the text is placed
   */
  placeText(options) {
    const
      textObj = this.state.text,
      textConfig = this._config.text,
      controls = textConfig?.controls,
      defaults = textConfig?.defaults;

    if (defaults) {
      options.x = options.x || defaults.x;
      options.y = options.y || defaults.y;
      options.xScale = options.xScale || defaults.xScale;
      options.yScale = options.yScale || defaults.yScale;
      options.rotation = options.rotation || defaults.rotation;
    }

    options.xScale = options.xScale || 1;
    options.yScale = options.yScale || 1;
    options.rotation = options.rotation || 0;

    if (typeof options.x === 'undefined' || typeof options.y === 'undefined') {
      throw new Error('To place text an x and y must be provided if there is no default');
    }

    textObj.set({
      left: options.x,
      top: options.y,
      scaleX: options.xScale,
      scaleY: options.yScale,
      angle: options.rotation,
      perPixelTargetFind: true
    });
    textObj.setCoords();
    this._canvas.add(textObj);

    // if there are any text control configs, apply those styles
    if (controls) {
      let hasBorders = controls.hasBorders;
      if (typeof hasBorders === 'undefined') {
        hasBorders = true;
      }
      textObj.set({
        transparentCorners: false,
        cornerSize: controls.cornerSize,
        cornerColor: controls.cornerColor,
        hasBorders: hasBorders
      });
    }

    this._canvas.setActiveObject(textObj);

    // update state
    this._setState({
      _textAdded: true
    });

    // re-render
    return this.triggerRender();
  }
  
  /**
   * Trigger a canvas render cycle
   * This is useful for low-level manipulation of objects
   *
   * @return {Object} stickerbook
   */
  triggerRender() {
    this._canvas.renderAll();
    return this;
  }

  /**
   * Destroys the stickerbook, removing global event listeners and dom elements created by the
   * sticker book
   * @return {undefined}
   */
  destroy() {
    window.removeEventListener('resize', this.resize);
    this._canvas.dispose();
    delete this._canvas;
    delete this.backgroundManager;
    while (this.containerElement.firstChild) {
      this.containerElement.removeChild(this.containerElement.firstChild);
    }
    this.isDestroyed = true;
  }
}

module.exports = Stickerbook;

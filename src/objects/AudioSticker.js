const AudioSticker = fabric.AudioSticker = fabric.util.createClass(fabric.Image, {
  type: 'AudioSticker',

  initialize: function(image, audio, options) {
    this.callSuper('initialize', image, options);

    this.audio = audio;

    this.playableAudio = new Audio(audio);

    this.on('mousedown', function(e) { 
      console.log(this.audio);
      if (this.playable) {
        this.playableAudio.play();
      }
    });
  },

  toObject: function (...args) {
    return fabric.util.object.extend(this.callSuper('toObject', ...args), {
      audio: this.audio,
      playable: this.playable
    });
  }
});

AudioSticker.fromURL = function(url, audioUrl, callback, imgOptions) {
  fabric.util.loadImage(url, function(img, isError) {
    callback && callback(new AudioSticker(img, audioUrl, imgOptions), isError);
  }, null, imgOptions && imgOptions.crossOrigin);
};

AudioSticker.fromObject = function (object, callback, forceAsync) {
  fabric.util.loadImage(object.src, function(img, error) {
    if (error) {
      callback && callback(null, error);
      return;
    }
    fabric.Image.prototype._initFilters.call(object, object.filters, function(filters) {
      object.filters = filters || [];
      fabric.Image.prototype._initFilters.call(object, [object.resizeFilter], function(resizeFilters) {
        object.resizeFilter = resizeFilters[0];
        callback(new AudioSticker(img, object.audio, object));
      });
    });
  }, null, object.crossOrigin);
};

export default AudioSticker;

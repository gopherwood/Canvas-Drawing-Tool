import {fabric} from 'fabric';
import PLAY_BUTTON from '../images/play-button.svg';

const
  loadedAudio = {},
  loadImages = (images, imgOptions, callback) => {
    const
      whenReady = () => {
        for (const key in images) {
          if (!loadedImages[key]) {
            return;
          }
        }

        callback(loadedImages, isError);
      },
      loadedImages = {};
    let isError = null;

    for (const key in images) {
      const image = images[key];

      fabric.util.loadImage(image, function (img, err) {
        isError = isError || err;
        loadedImages[key] = img;
        whenReady();
      }, null, imgOptions && imgOptions.crossOrigin);
    }
  },
  AudioSticker = fabric.AudioSticker = fabric.util.createClass(fabric.Group, {
  type: 'AudioSticker',

  initialize: function({image, audio, playButton}, options = {}) {
    const
      {crossOrigin} = options,
      playButtonImage = new fabric.Image(playButton, {
        crossOrigin
      }),
      icon = new fabric.Image(image, {
        crossOrigin
      }),
      audioElement = loadedAudio[audio] = loadedAudio[audio] || new Audio(audio);
    
    this.audio = audio;
    this.image = image.src;
    this.playButton = playButton.src;
    

    playButtonImage.on('mousedown', function(e) { 
      console.log(`Playing ${this.audio}`);
      audioElement.play();
    });

    playButtonImage.scaleX = playButtonImage.scaleY = 1 / 8;
    playButtonImage.top = icon.width - playButtonImage.width / 8;
    playButtonImage.left = icon.height - playButtonImage.height / 8;

    this.callSuper('initialize', [
      icon,
      playButtonImage
    ], fabric.util.object.extend(options, {
      subTargetCheck: true,
      selectable: true,
      hasControls: true,
      hasBorders: true
    }));
  },

  toObject: function (...args) {
    const group = this.callSuper('toObject', ...args);

    delete group.objects;

    return fabric.util.object.extend(group, {
      audio: this.audio,
      image: this.image,
      playButton: this.playButton
    });
  }
});

AudioSticker.fromURL = function({image, audio, playButton = PLAY_BUTTON}, callback, imgOptions) {
  loadImages({
    image,
    playButton
  }, imgOptions, ({image, playButton}, isError) => {
    callback && callback(new AudioSticker({
      image,
      audio,
      playButton
    }, imgOptions), isError);
  });
};

AudioSticker.fromObject = function (object, callback, forceAsync) {
  const {image, audio, playButton, crossOrigin} = object;

  loadImages({
    image,
    playButton
  }, {
    crossOrigin
  }, ({image, playButton}, isError) => {
    fabric.Image.prototype._initFilters.call(object, object.filters, function(filters) {
      object.filters = filters || [];
      fabric.Image.prototype._initFilters.call(object, [object.resizeFilter], function(resizeFilters) {
        object.resizeFilter = resizeFilters[0];
        callback && callback(new AudioSticker({
          image,
          audio,
          playButton
        }, object), isError);
      });
    });
  });
};

export default AudioSticker;

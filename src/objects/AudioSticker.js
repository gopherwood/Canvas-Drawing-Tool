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

  initialize: function({image, audio, playButton, start = 0, end = -1}, options = {}) {
    const
      key = `${audio}${start}${end !== -1 ? '-' + end : ''}`,
      {crossOrigin} = options,
      playButtonImage = new fabric.Image(playButton, {
        crossOrigin
      }),
      icon = new fabric.Image(image, {
        crossOrigin
      }),
      audioElement = loadedAudio[key] = loadedAudio[key] || new Audio(audio);
    
    this.audio = audio;
    this.image = image.src;
    this.playButton = playButton.src;
    this.start = start;
    this.end = end;

    if (start > 0) {
      audioElement.addEventListener('play', () => {
        if (audioElement.currentTime < start) {
          audioElement.currentTime = start;
        }
      });
    }
    if (end > start) {
      audioElement.addEventListener('timeupdate', () => {
        if (audioElement.currentTime >= end) {
          audioElement.currentTime = start;
          audioElement.pause();
        }
      });
    }

    playButtonImage.on('mousedown', function(e) { 
      console.log(`Playing ${this.audio}`);
      audioElement.play();
    });

    playButtonImage.scaleX = playButtonImage.scaleY = (icon.width / 3) / playButtonImage.width;
    playButtonImage.top = icon.width - playButtonImage.width * playButtonImage.scaleX;
    playButtonImage.left = icon.height - playButtonImage.height * playButtonImage.scaleY;

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
      playButton: this.playButton,
      start: this.start,
      end: this.end
    });
  }
});

AudioSticker.fromURL = function({image, audio, playButton = PLAY_BUTTON, start, end}, callback, imgOptions) {
  loadImages({
    image,
    playButton
  }, imgOptions, ({image, playButton}, isError) => {
    callback && callback(new AudioSticker({
      image,
      audio,
      playButton,
      start,
      end
    }, imgOptions), isError);
  });
};

AudioSticker.fromObject = function (object, callback, forceAsync) {
  const {image, audio, playButton, start, end, crossOrigin} = object;

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
          playButton,
          start,
          end
        }, object), isError);
      });
    });
  });
};

export default AudioSticker;

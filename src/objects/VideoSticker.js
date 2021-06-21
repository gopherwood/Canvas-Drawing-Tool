import {fabric} from 'fabric';
import PLAY_BUTTON from '../images/play-button.svg';

const
  loadedVideo = {},
  getVideo = (path, start = 0, end = -1, callback) => {
    const
      key = `${path}${start}${end !== -1 ? '-' + end : ''}`;
    let videoElement = loadedVideo[key];

    if (videoElement) {
      callback(videoElement);
    } else {
      const
        stopper = () => {
          videoElement.removeEventListener('play', stopper);
          videoElement.pause();
          callback(videoElement);
        };
      
      videoElement = loadedVideo[key] = document.createElement('video');
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement.width = videoElement.videoWidth;
        videoElement.height = videoElement.videoHeight;
      });
      videoElement.addEventListener('canplay', () => {
        videoElement.play();
      });
      videoElement.addEventListener('play', stopper);
      videoElement.crossOrigin = "Anonymous";
      videoElement.src = path;
      videoElement.load();
    }

    return videoElement;
  },
  loadImages = (images, start, end, imgOptions, callback) => {
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

      if (key === 'video') {
        getVideo(image, start, end, (video) => {
          loadedImages[key] = video;
          whenReady();
        });
      } else {
        fabric.util.loadImage(image, function (img, err) {
          isError = isError || err;
          loadedImages[key] = img;
          whenReady();
        }, null, imgOptions && imgOptions.crossOrigin);
      }
    }
  },
  VideoSticker = fabric.VideoSticker = fabric.util.createClass(fabric.Group, {
    type: 'VideoSticker',

    initialize: function({video, playButton, start = 0, end = -1}, options = {}) {
      const
        {crossOrigin} = options,
        playButtonImage = new fabric.Image(playButton, {
          crossOrigin
        }),
        videoObject = new fabric.Image(video, {
          backgroundColor: '#000000',
          originX: 'center',
          originY: 'center',
          objectCaching: false
        });
      
      this.video = video.src;
      this.playButton = playButton.src;
      this.start = start;
      this.end = end;

      if (start > 0) {
        video.addEventListener('play', () => {
          if (video.currentTime < start) {
            video.currentTime = start;
          }
        });
      }
      if (end > start) {
        video.addEventListener('timeupdate', () => {
          if (video.currentTime >= end) {
            video.currentTime = start;
            video.pause();
          }
        });
      }
  
      playButtonImage.on('mousedown', function(e) {
        if (video.ended || video.paused) {
          console.log(`Playing ${this.video}`);
          video.play();
        }
      });
      videoObject.on('mousedown', function(e) {
        if (!video.ended && !video.paused) {
          console.log(`Pausing ${this.video}`);
          video.pause();
        }
      });
      video.addEventListener('play', () => {
        playButtonImage.visible = false;
      });
      video.addEventListener('pause', () => {
        playButtonImage.visible = true;
      });
      video.addEventListener('ended', () => {
        playButtonImage.visible = true;
      });

      playButtonImage.scaleX = playButtonImage.scaleY = (videoObject.width >> 3) / playButtonImage.width;
      playButtonImage.left = -playButtonImage.width >> 1;
      playButtonImage.top = -playButtonImage.height >> 1;

      this.callSuper('initialize', [
        videoObject,
        playButtonImage
      ], fabric.util.object.extend(options, {
        subTargetCheck: true,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        objectCaching: false
      }));
    },

    toObject: function (...args) {
      const group = this.callSuper('toObject', ...args);

      delete group.objects;

      return fabric.util.object.extend(group, {
        video: this.video,
        playButton: this.playButton,
        start: this.start,
        end: this.end
      });
    }
  });

VideoSticker.fromURL = function({video, playButton = PLAY_BUTTON, start, end}, callback, imgOptions) {
  loadImages({
    video,
    playButton
  }, start, end, imgOptions, ({video, playButton}, isError) => {
    callback && callback(new VideoSticker({
      video,
      playButton,
      start,
      end
    }, imgOptions), isError);
  });
};

VideoSticker.fromObject = function (object, callback, forceAsync) {
  const {video, playButton, start, end, crossOrigin} = object;

  loadImages({
    video,
    playButton
  }, start, end, {
    crossOrigin
  }, ({video, playButton}, isError) => {
    fabric.Image.prototype._initFilters.call(object, object.filters, function(filters) {
      object.filters = filters || [];
      fabric.Image.prototype._initFilters.call(object, [object.resizeFilter], function(resizeFilters) {
        object.resizeFilter = resizeFilters[0];
        callback && callback(new VideoSticker({
          video,
          playButton,
          start,
          end
        }, object), isError);
      });
    });
  });
};

export default VideoSticker;

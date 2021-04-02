const mouseDownHandler = function (evt) {
  if (!this.state.drawing) {
    if (this.state.sticker) {
      if (!this.state._stickerAdded) {
        return this.placeSticker(this._canvas.getPointer(evt.e));
      }
    } else if (this.state.text) {
      if (!this.state._textAdded) {
        return this.placeText(this._canvas.getPointer(evt.e));
      }
    }
  }

  return this;
};

const mouseUpHandler = function () {
  const config = this._config.stickerControls || {};
  const noBorder = config.cornerSize === 0 || !config.hasBorders;
  if (this.state._stickerAdded && this.state.sticker.active && noBorder) {
    this._canvas.setCursor('move');
  }

  return this;
};

const disableSelectabilityHandler = function (evt) {
  if ((evt.target instanceof fabric.Image) || (evt.target instanceof fabric.IText) || (evt.target instanceof fabric.Text)) {
    return;
  }

  // if the object isn't an image, then it'll be freehand drawing of some sort. Make that item not
  // selectable
  evt.target.selectable = false;
  evt.target.hasControls = false;
  evt.target.hasBorders = false;
  evt.target.active = false;
  this.triggerRender();
};

/**
 * Event handler to track when a new object is added to the fabric canvas
 * @param {HistoryManager} historyManager The history manager to track the change in
 * @param {Event} fabricEvent An object with a target property, which is a fabric.Object
 * @return {void}
 */
const recordObjectAddition = function (historyManager, fabricEvent) {
  // During a redo, the HistoryManager will automatically perform the canvas.add for us. We don't
  // want to track history for this addition if it's a redo, because it'll cause duplicates in the
  // stack
  var serializedTarget = JSON.stringify(fabricEvent.target);
  var objectAlreadyInHistory = historyManager.history
    .reduce((a, b) => a.concat(b), []) // flatten the array
    .filter((historyEvent) => historyEvent.type === 'add') // only get add events
    .some((historyEvent) => historyEvent.data === serializedTarget); // target is already there?

  if (objectAlreadyInHistory) {
    return;
  }

  historyManager.pushNewFabricObject(fabricEvent.target);
};

/**
 * Helper function to find the previous value of a particular property on a fabric.Object by
 * trawling through past history
 *
 * @param {HistoryManager} historyManager The history manager, so we can look at changesets
 * @param {fabric.Object} fabricObject The fabric object to check history for
 * @param {String} propertyName The property name to look for a change for
 * @returns {String|Number} The previous value of the property
 */
const lastPropertyValue = function (historyManager, fabricObject, propertyName) {
  const flattenedHistory = historyManager.history.reduce((a, b) => a.concat(b), []);
  for (let i = flattenedHistory.length - 1; i >= 0; i--) {
    const historyEvent = flattenedHistory[i];
    if (historyEvent.type === 'add' && historyEvent.objectId === fabricObject.stickerbookObjectId) {
      return JSON.parse(historyEvent.data)[propertyName];
    } else if (historyEvent.type === 'change' && historyEvent.data.property === propertyName) {
      return historyEvent.data.newValue;
    }
  }
  return null;
};

/**
 * Handler to capture a property change on a fabric object, and store in history
 *
 * @param {HistoryManager} historyManager The history manager, for tracking changes
 * @param {Event} fabricEvent An object with a target property, which is a fabric.Object
 * @returns {void}
 */
const recordPropertyChange = function (historyManager, fabricEvent) {
  const propertyNames = ['text', 'scaleX', 'scaleY', 'globalCompositeOperation', 'angle', 'left', 'top'];
  const objectIndex = historyManager.canvas.getObjects().indexOf(fabricEvent.target);
  const propertyDeltas = [];
  
  propertyNames.forEach(function (property) {
    var oldValue = lastPropertyValue(historyManager, fabricEvent.target, property);
    var newValue = fabricEvent.target[property];
    if (oldValue !== newValue) {
      propertyDeltas.push({
        property,
        objectIndex,
        oldValue,
        newValue
      });
    }
  });
  historyManager.pushPropertyChanges(propertyDeltas);
};

module.exports = {
  disableSelectabilityHandler: disableSelectabilityHandler,
  mouseDownHandler: mouseDownHandler,
  mouseUpHandler: mouseUpHandler,
  recordObjectAddition: recordObjectAddition,
  recordPropertyChange: recordPropertyChange
};

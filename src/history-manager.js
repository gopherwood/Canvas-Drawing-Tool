/**
 * Helper class for managing a state stack of changes made to the canvas. Stores deltas to save
 * space
 */
class HistoryManager {
  /**
   * Creates a new history manager, with a canvas to monitor
   * @param {fabric.Canvas} canvas The canvas to monitor
   */
  constructor(canvas) {
    this.history = [];
    this.historyIndex = -1;
    this.canvas = canvas;
    this.objectIdCounter = 1;
    this.currentlyEditingHistory = false;
  }

  /**
   * Tracks a new object addition to the canvas, assigning it an id for later lookups
   * @param {fabric.Object} fabricObject A fabric object (Path, Image, etc.)
   * @returns {void}
   */
   pushNewFabricObject(fabricObject) {
    if (this.currentlyEditingHistory) { // prevent recording adds that are already in place.
      return;
    }

    // if there is any history after this point in time, nuke it.
    if(this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    fabricObject.stickerbookObjectId = this.objectIdCounter;

    this.history.push([{
      type: 'add',
      data: JSON.stringify(fabricObject),
      stickerbookObjectId: this.objectIdCounter
    }]);
    this.historyIndex++;
    this.objectIdCounter++;
  }

  /**
   * Tracks an object removed from the canvas
   * @param {fabric.Object} fabricObject A fabric object (Path, Image, etc.)
   * @returns {void}
   */
   deleteFabricObject(fabricObject) {
    if (this.currentlyEditingHistory) { // prevent recording deletes that are already in place.
      return;
    }

    // if there is any history after this point in time, nuke it.
    if(this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push([{
      type: 'remove',
      data: JSON.stringify(fabricObject),
      stickerbookObjectId: fabricObject.stickerbookObjectId
    }]);
    this.historyIndex++;
  }

  /**
   * Tracks a single property change to an object
   * @param {String} property The property name that changed (scaleX, top, angle, etc.)
   * @param {Number} stickerbookObjectId The id in the display list that denotes which object changed
   * @param {Number|String} oldValue The previous value of the property
   * @param {Number|String} newValue The new value of the property
   * @returns {void}
   */
  pushPropertyChange(property, stickerbookObjectId, oldValue, newValue) {
    this.pushPropertyChanges([{ property, stickerbookObjectId, oldValue, newValue }]);
  }

  /**
   * Batch tracks a set of changes so that they can be grouped together
   *
   * @param {Array} changes An array of changes, with a property, stickerbookObjectId, oldValue, and
   *                        newValue keys
   * @returns {void}
   */
  pushPropertyChanges(changes) {
    // blow away any changes after this one
    if(this.historyIndex > -1) {
      this.history.splice(this.historyIndex + 1);
    }

    // perform a quick validation
    var isValid = changes.every(change => {
      return change.stickerbookObjectId !== undefined && change.property !== undefined
        && change.oldValue !== undefined && change.newValue !== undefined;
    });

    if(!isValid) {
      throw new Error('Changes passed are not valid');
    }

    var historyEvents = changes.map(change => {
      return { type: 'change', data: change };
    });
    this.history.push(historyEvents);
    this.historyIndex++;
  }

  /**
   * Reverses the last change that was made to the canvas. If an object was added, the object is
   * removed. If a property was changed, that change is reversed
   *
   * @return {Promise} A promise the resolves when all changes are finished applying
   */
  undo() {
    // bail early if there's nothing left to undo
    if(this.historyIndex === -1) {
      return Promise.resolve(this);
    }

    // un-applies a single change in the history array (add or a delete)
    const processChange = currentChange => {
      return new Promise((resolve, reject) => {
        if (currentChange.type === 'add') {
          const objects = this.canvas.getObjects();

          // if the change is an add, find the item and remove it
          for (let i = 0; i < objects.length; i++) {
            if (objects[i].stickerbookObjectId === currentChange.stickerbookObjectId) {
              this.currentlyEditingHistory = true; // prevent recording removals that are already in place.
              this.canvas.remove(objects[i]);
              this.currentlyEditingHistory = false;
              break;
            }
          }
          resolve(this);
        } else if (currentChange.type === 'change') {
          // if it's a property change, find the object and set the property
          var object = this.getObjectByStickerbookObjectId(currentChange.data.stickerbookObjectId);
          if (object === null) {
            var message = `Attempted to retrieve object "${currentChange.data.stickerbookObjectId}" but it's not there.`;
            reject(new Error(message));
            return;
          }

          object.set(currentChange.data.property, currentChange.data.oldValue);
          object.setCoords();
          resolve(this);
        } else if (currentChange.type === 'remove') {
          // if it's a removal, re-hydrate the fabric instance and add back to the canvas
          var parsed = JSON.parse(currentChange.data);
          fabric.util.enlivenObjects([parsed], results => {
            if(results.length < 1) {
              reject(this);
              return;
            }
            results[0].stickerbookObjectId = currentChange.stickerbookObjectId;
            this.currentlyEditingHistory = true; // prevent recording adds that are already in place.
            this.canvas.add(results[0]);
            this.currentlyEditingHistory = false;
            resolve(this);
          });
        } else {
          reject(new Error(`Invalid history type: "${currentChange.type}".`));
        }
      });
    };

    // process every change in this changeset, then back history up AND re-render
    var promises = this.history[this.historyIndex].map(processChange);
    return Promise.all(promises).then(() => {
      this.historyIndex--;
      this.canvas.renderAll();
      return;
    });
  }

  /**
   * Reapplies a change that was previously undid, including re-adding an object that was removed
   * and setting properties back to their next value they were set to
   *
   * @return {Promise} A promise that resolves when all changes are finished applying
   */
  redo() {
    // bail early if we can't redo anything
    if(this.historyIndex >= this.history.length - 1) {
      return Promise.resolve();
    }

    // function to redo a single history event
    const processChange = newChange => {
      return new Promise((resolve, reject) => {
        if(newChange.type === 'add') {
          // if it's an add, re-hydrate the fabric instance and add back to the canvas
          var parsed = JSON.parse(newChange.data);
          fabric.util.enlivenObjects([parsed], results => {
            if(results.length < 1) {
              reject(this);
              return;
            }
            results[0].stickerbookObjectId = newChange.stickerbookObjectId;
            this.currentlyEditingHistory = true; // prevent recording adds that are already in place.
            this.canvas.add(results[0]);
            this.currentlyEditingHistory = false;
            resolve(this);
          });
        } else if (newChange.type === 'change') {
          // if it's a property change, set the property to the new value
          var object = this.getObjectByStickerbookObjectId(newChange.data.stickerbookObjectId);
          if (object === null) {
            var message = `Attempted to retrieve object "${newChange.data.stickerbookObjectId}" but it's not there.`;
            reject(new Error(message));
            return;
          }

          object.set(newChange.data.property, newChange.data.newValue);
          object.setCoords();
          resolve(this);
        } else if (newChange.type === 'remove') {
          const objects = this.canvas.getObjects();

          // if the change is a removal, find the item and remove it
          for (let i = 0; i < objects.length; i++) {
            if (objects[i].stickerbookObjectId === newChange.stickerbookObjectId) {
              this.currentlyEditingHistory = true; // prevent recording removals that are already in place.
              this.canvas.remove(objects[i]);
              this.currentlyEditingHistory = false;
              break;
            }
          }
          resolve(this);
        } else {
          reject(new Error(`Invalid history type: "${newChange.type}".`));
        }
      });
    };

    // process each changeset, then move history forward and re-render
    var promises = this.history[this.historyIndex + 1].map(processChange);
    return Promise.all(promises).then(() => {
      this.historyIndex++;
      this.canvas.renderAll();
      return this;
    });
  }

  /**
   * Returns an object's stickerbook id, and gives it one if it doesn't have one.
   * @param {fabric.Object} fabriceObject The object to retrieve an id from.
   * @returns {Number} The fabric object's stickerbook id.
   */
  getStickerbookObjectId (fabricObject) {
    if (typeof fabricObject.stickerbookObjectId === 'undefined') {
      fabricObject.stickerbookObjectId = this.objectIdCounter;
      this.objectIdCounter += 1;
    }

    return fabricObject.stickerbookObjectId;
  }

  /**
   * Returns an object by its stickerbook id.
   * @param {Number} id The stickerbook id for the object to find.
   * @returns {fabric.Object} The fabric object.
   */
  getObjectByStickerbookObjectId (id) {
    const objects = this.canvas.getObjects();

    for (let i = 0; i < objects.length; i++) {
      if (objects[i].stickerbookObjectId === id) {
        return objects[i];
      }
    }

    return null;
  }
}

module.exports = HistoryManager;

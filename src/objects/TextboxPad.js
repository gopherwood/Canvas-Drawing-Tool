const TextboxPad = fabric.TextboxPad = fabric.util.createClass(fabric.Textbox, {
  type: 'TextboxPad',

  initialize: function(text, options) {
    if (typeof text === 'object' && typeof options === 'undefined') { // reviver breaks.
      options = text;
      text = options.text;
    }
    this.callSuper('initialize', text, options);
  },

  _renderBackground: function (ctx) {
    if (!this.backgroundColor) {
      return;
    } else {
      const dim = this._getNonTransformedDimensions();
      ctx.fillStyle = this.backgroundColor;

      ctx.fillRect(
        -dim.x / 2 - this.padding,
        -dim.y / 2 - this.padding,
        dim.x + this.padding * 2,
        dim.y + this.padding * 2
      );
      // if there is background color no other shadows
      // should be casted
      this._removeShadow(ctx);
    }
  },

  toObject: function (...args) {
    return fabric.util.object.extend(this.callSuper('toObject', ...args), {
      padding: this.padding
    });
  }
});

fabric.TextboxPad.fromObject = function (object, callback, forceAsync) {
  return fabric.Object._fromObject('TextboxPad', object, callback, forceAsync);
};

export default TextboxPad;

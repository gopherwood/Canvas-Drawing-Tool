export default fabric.util.createClass(fabric.Textbox, {
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
  }
});
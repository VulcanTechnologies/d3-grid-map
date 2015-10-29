var Layer = function(options) {
  this.options = options || {};
  this.options.strokeColor = this.options.strokeColor || 'rgba(100,100,100,.8)';
  this.options.fillColor = this.options.fillColor ||  'rgba(237,178,48,1)';
  if (this.options.zIndex === undefined) {
    // zIndex of 0 is valid
    this.options.zIndex = 1;
  }
  if (!this.options.hasOwnProperty('renderOnAnimate')) {
    this.options.renderOnAnimate = true;
  }
};

module.exports = Layer;

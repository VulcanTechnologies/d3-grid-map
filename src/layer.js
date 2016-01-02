// IE 10 shim
if(window.CanvasPixelArray) {
    CanvasPixelArray.prototype.set = function(arr) {
        var l=this.length, i=0;
        for(;i<l;i++) {
            this[i] = arr[i];
        }
    };
}

var Layer = function(gridMap, options) {

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
  this.visible = true;

  var canvas = gridMap.container
    .append('canvas');

  canvas
    .style('position', 'absolute')
    .style('top', '0px')
    .style('left', '0px')
    .attr('width', gridMap.width)
    .attr('height', gridMap.height)
    .attr('z-index', this.options.zIndex)
    .data([this.options.zIndex]); // for layer sorting

  var context = canvas.node().getContext('2d');

  this.resize = function(width, height) {
    canvas.attr('width', width);
    canvas.attr('height', height);
  };

  this.remove = function() {
    canvas.remove();
  };

  this.renderGridToCanvas = function(grid, indexMap) {

    var image = context.getImageData(0, 0, gridMap.width, gridMap.height);
    var buf = null;
    if (image.data.buffer) {
      // modern browsers can access the buffer directly
      buf = image.data.buffer;
    } else {
      // make a new one
      buf = new ArrayBuffer(image.data.length);
    }

    var imageData = new Uint32Array(buf);

    for (var i=0, lim=indexMap.length; i<lim; i++) {
      imageData[i] = grid.data[indexMap[i]];
    }

    if (!image.data.buffer) {
      // old browsers
      var buf8 = new Uint8ClampedArray(buf);
      image.data.set(buf8);
    }
    context.putImageData(image, 0, 0);
  };

  this.drawGrid = function(grid) {
    var indexMap = grid.getIndexMap(gridMap);
    this.renderGridToCanvas(this.grid, indexMap);
  };

  this.drawGeoJSONLayer = function() {

    context.beginPath();

    if (this.simplified) {
      gridMap.simplifyingPath.context(context)(this.json);
    } else {
      gridMap.path.context(context)(this.json);
    }
    context.strokeStyle = this.options.strokeColor;
    context.lineWidth = 0.5;
    context.stroke();

    context.fillStyle = this.options.fillColor;
    context.fill();
  };

  this.clear = function() {
    context.clearRect(0, 0, gridMap.width, gridMap.height);
  };

  this.setVisible = function(visible) {
    this.visible = visible;
    canvas.style('display', visible ? 'block' : 'none');
  };
  this.hide = function() {this.setVisible(false); };
  this.show = function() {this.setVisible(true); };

  this.draw = function() {

    this.clear();

    if (this.grid) {
      this.drawGrid(this.grid);
    } else if (this.json) {
        this.drawGeoJSONLayer();
    }
  };
};

module.exports = Layer;

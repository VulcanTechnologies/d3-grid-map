var Legend = function(options) {
  /**
    * Create a legend which shows the color scale in options.colorScale for
    * the 6 values [0,0.2,0.4,0.6,0.8,1.0]
    * Pass in the canvas context on which to draw as
    * options.context.
    * var legend = new Legend({context: ctx});
    * Then draw the legend
    * legend.draw()
    */
  var ctx = options.context;
  var width = options.width || 150;
  var height = options.height || 30;
  var cornerOffset = options.cornerOffset || {x: 5, y: 20};
  var margin = options.margin || 5;

  this.complementaryColor = function(color) {
    // not really complementary color, just a color which
    // contrasts with color
    function rotate(x) {
      return (x+127)%255;
    }
    var complement = d3.rgb(rotate(color.r), rotate(color.g), rotate(color.b));
    return complement;
  };

  this.xy = function() {
    // returns corner point of legend wrt/ canvas
    return {
      x: ctx.canvas.clientWidth - width - cornerOffset.x,
      y: ctx.canvas.clientHeight - height - cornerOffset.y
    };
  };
  this.draw = function(value) {
    /**
      * Draws legend on context.
      */
    var xy = this.xy();

    var stops = [
      {x: 0, label: '0.0'},
      {x: 51, label: '0.2'},
      {x: 102, label: '0.4'},
      {x: 153, label: '0.6'},
      {x: 204, label: '0.8'},
      {x: 255, label: '1.0'}
    ];
    var stopWidth = (width - 2*margin) / stops.length;

    ctx.save();
    ctx.translate(xy.x, xy.y);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, width, height);

    var font = '8px Helvetica';
    ctx.font = font;

    for (var i=0; i<stops.length; i++) {
      var stop = stops[i];
      var color = d3.rgb(options.colorScale(stop.x));
      ctx.fillStyle = color;
      ctx.fillRect(i*stopWidth + margin, margin, stopWidth, height - 2*margin);

      ctx.fillStyle = this.complementaryColor(color);
      ctx.fillText(stop.label, (i+0.5)*stopWidth, height/2 + 2);
    }
    ctx.restore();
  };

  this.highlight = function(value) {
    /**
      * highlight value position (0-1) on the legend
      */
    ctx.save();
    var xy = this.xy();
    ctx.translate(xy.x+margin, xy.y+margin);
    var color = d3.rgb(options.colorScale(value*255));
    ctx.strokeStyle = this.complementaryColor(color);
    var xPosition = (width - 2*margin) * value;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xPosition, 0);
    ctx.lineTo(xPosition, height-2*margin);
    ctx.stroke();
    ctx.restore();
  };

};

module.exports = Legend;

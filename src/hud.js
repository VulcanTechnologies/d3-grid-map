var HUD = function(gridMap) {
  // this.container = gridMap.container;

  var options = gridMap.options.hud || {};

  var canvas = gridMap.container
    .append('canvas')
    .style('position', 'absolute')
    .style('top', '0px')
    .style('left', '0px')
    .style('z-index', '2');

  var context = canvas.node().getContext('2d');
  this.context = context;

  this.path = d3.geo.path()
    .projection(gridMap.projection)
    .context(this.context);

  this.resize = function(width, height) {
    canvas.attr('width', width);
    canvas.attr('height', height);
  },

  this.update = function(cellId, coords, cellValue) {
    var coordFormat = d3.format(' >+7.3f');

    var fontSize = options.fontSize || 30;
    var verticalOffset = options.verticalOffset || 10;
    var fontColor = options.fontColor || 'white';
    var fontFace = options.fontFace || 'monospace';

    var font = fontSize + 'px ' + fontFace;
    var h = fontSize + verticalOffset;
    var gradient = context.createLinearGradient(0, 0, 0, h);

    var width = gridMap.width;
    var height = gridMap.height;

    gradient.addColorStop(0, 'rgba(0,0,0,0.0)');
    gradient.addColorStop(1, 'rgba(0,0,0,1.0)');

    context.clearRect(0, 0, width, height);

    context.save();
    context.translate(0, height-(h));

    context.fillStyle = gradient;
    context.fillRect(0, 0, width, h);

    var s = [
      'cell:',
      cellId,
      '(',
      coordFormat(coords[0]),
      '°,',
      coordFormat(coords[1]),
      '°)',
      ].join('');

    if (cellValue !== undefined) {
      s += ' value: ' + d3.format('.4e')(cellValue);
    }

    context.font = font;
    context.fillStyle = fontColor;
    context.fillText(s, 0, h - verticalOffset);

    context.restore();

    // draw highlight box around hovered cell
    var feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [gridMap.getGrid().cellIdToCoordinates(cellId)]
      },
    };

    context.beginPath();
    context.strokeStyle = 'white';
    context.lineWidth = 2;
    this.path(feature);
    context.stroke();

  };

};

module.exports = HUD;

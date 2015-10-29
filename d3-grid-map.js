(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Grid = require('./grid.js');

var Data = {
  arrayBufferToGeoJSON: function(buff) {
    // given an ArrayBuffer buff containing data in
    // packed binary format, returns GeoJSON

    // The packed binary format is expected to be
    // a sequence of Uint32 elements in which the most
    // significant byte is the cell value and the
    // lowest 3 bytes represent the cell ID.

    var geojson = {
      type: 'FeatureCollection',
      features: [],
      _cache: {} // for quickly locating a feature by id
    };

    var typedArray = new Uint32Array(buff);

    for (var i=0; i<typedArray.length; i++) {
      var packed = typedArray[i];
      var cellId = packed & 0xfffff;
      // unpack most significant byte, the data value.
      // note the triple arrow, which fills in 0s instead of 1s.
      var value = packed >>> 24;
      var coordinates = this.cellIdToCoordinates(cellId);
      var feature = {
         type: 'Feature',
         id: i,
         geometry: {
             type: 'Polygon',
             coordinates: [coordinates]
         },
         properties: {
          cellId: cellId,
          value: value
        }
      };
      geojson.features.push(feature);
      geojson._cache[cellId] = feature;
    }
    return geojson;
  },

  arrayBufferToGrid: function(buff, gridSize, colorScale) {
    // given an ArrayBuffer buff containing data in
    // packed binary format, returns a Grid

    // The packed binary format is expected to be
    // a sequence of Uint32 elements in which the most
    // significant byte is the cell value and the
    // lowest 3 bytes represent the cell ID.

    var w = gridSize[1];
    var h = gridSize[0];

    var data = new Uint8ClampedArray(w*h*4);

    var typedArray = new Uint32Array(buff);

    var rawData = [];

    for (var i=0; i<typedArray.length; i++) {
      var packed = typedArray[i];
      var cellId = (packed & 0xfffff);
      var idx = cellId << 2;
      // unpack most significant byte, the data value.
      // note the triple arrow, which fills in 0s instead of 1s.
      var value = packed >>> 24;

      var color = d3.rgb(colorScale(value));
      var alpha = 255;

      data[idx+0] = color.r;
      data[idx+1] = color.g;
      data[idx+2] = color.b;
      data[idx+3] = alpha;

      rawData[cellId] = value;
    }
    return new Grid(data, gridSize, rawData);
  },

  uInt8ArrayToGeoJSON: function(array) {
    // given a UInt8ClampedArray containing data in
    // RGBA format, returns GeoJSON

    // The format is expected to be
    // a sequence of Uint8 elements representing RGBA
    // values for each cell from cell ID 1 to the final cell ID,
    // in column first order.

    var geojson = {
       type: "FeatureCollection",
       features: []
    };

    for (var i=0; i<array.length; i+=4) {
      var cell_id = i/4 + 1;
      var r = array[i];
      var g = array[i+1];
      var b = array[i+2];
      var a = array[i+3];

      if (r === 0 && g === 0 && b === 0 && a === 0) {
        continue;
      }
      var coordinates = this.cellIdToCoordinates(cell_id);

      var feature = {
         type: 'Feature',
         id: i,
         geometry: {
             type: 'Polygon',
             coordinates: [coordinates]
         },
         properties: {
          rgba: [r,g,b,a]
        }
      };
      geojson.features.push(feature);
    }

    return geojson;
  }
};

module.exports = Data;

},{"./grid.js":2}],2:[function(require,module,exports){
var Grid = function(data, gridSize, rawData) {
  // represents a gridded data set.  rawData should be an object
  // mapping cellId to cell value
  this.data = data;
  this.rows = gridSize[1];
  this.cols = gridSize[0];
  this.rawData = rawData;

  this.cellCache = [];

  this.getCell = function(cellId) {
    // return value if the grid contains a nonzero alpha channel from
    // (RGBA) values

    if (this.rawData) {
      return this.rawData[cellId];
    }
  };

  this.cellIdToLonLat = function(cellId) {
    /**
     * given a cellId, returns an array containing the [lon,lat] of the
     * upper left corner  points
     * @param {Number} cellId
     * @return {Array} coordinates
     */

    var _id = cellId - 1;
    var lon = -180 + (_id % this.cols)/this.cols * this.rows;
    var lat = 90 - (~~(_id / this.cols)) * (180 / this.rows);
    return [lon, lat];
  };

  this.coordinatesToCellId = function(coords) {
    var lon = coords[0];
    var lat = coords[1];

    var row = ~~(this.rows - (lat + 90) / 180  * this.rows);
    var col = ~~((lon + 180) / 360  * this.cols);

    var cellId = row * this.cols + col + 1;
    return cellId;
  };

  this.cellIdToCoordinates = function(cellId) {
    /**
     * given a cellId, returns an array of arrays containing the [lon,lat] of the corner
     * points
     * @param {Number} cellId
     * @param {Grid} grid to query, optional
     * @return {Array} coordinates
     */

    if (this.cellCache[cellId]) {
      return this.cellCache[cellId];
    }

    rows = this.rows;
    cols = this.cols;

    var xSize = 360 / cols;
    var ySize = 180 / rows;

    var lonLat = this.cellIdToLonLat(cellId);
    var coordinates = [
      lonLat,
      [lonLat[0] + xSize, lonLat[1]],
      [lonLat[0] + xSize, lonLat[1] - ySize],
      [lonLat[0], lonLat[1] - ySize],
      lonLat
    ];
    this.cellCache[cellId] = coordinates;
    return coordinates;
  };

};

module.exports = Grid;

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
var Grid = require('./grid.js');
var HUD = require('./hud.js');
var Layer = require('./layer.js');
var Legend = require('./legend.js');
var DataImport = require('./data-import.js');

try {
  /* fake it for IE10 */
  new Uint8ClampedArray();
} catch (e) {
  window.Uint8ClampedArray = Uint8Array;
}

var defaultColorScale = d3.scale.quantize()
  .domain([0,255])
  .range(["#a50026","#d73027","#f46d43","#fdae61","#fee08b","#d9ef8b","#a6d96a","#66bd63","#1a9850","#006837"]);

var GridMap = function(container, options) {
  var self = this;

  this.rotateLatitude = 0.0;
  this.rotateLongitude = 0.0;

  this.container = d3.select(container);
  var graticule = d3.geo.graticule()();

  var rect = this.container.node().getBoundingClientRect();
  this.width = rect.width | 0;
  this.height = rect.height | 0;

  this.layers = [];
  this.options = options || {};

  this.seaColor = this.options.seaColor || 'rgba(21,98,180,.8)';
  this.graticuleColor = this.options.graticuleColor || 'rgba(255,255,255,.3)';

  self.area = 1; // minimum area threshold for simplification

  var simplify = d3.geo.transform({
    point: function(x, y, z) {
      if (z >= self.area) {
        this.stream.point(x, y);
      }
    }
  });

  this.dispatch = d3.geo.GridMap.dispatch; //singleton

  this.projection = this.options.projection || d3.geo.aitoff();
  this.projection
    .translate([this.width/2, this.height/2])
    .clipExtent([[0, 0], [self.width, self.height]])
    .precision(0.1);

  this.canvas = this.container
    .append('canvas')
    .style('position', 'absolute')
    .style('top', '0px')
    .style('left', '0px');

  this.context = this.canvas.node().getContext('2d');

  var hud = new HUD(this);

  this.colorScale = this.options.colorScale || defaultColorScale;

  if (!this.options.zoomLevels) {
    this.options.zoomLevels = [1, 2, 4, 8];
  }

  if (this.options.legend) {
    this.options.context = hud.context;
    this.options.colorScale = this.colorScale;
    this.legend = new Legend(this.options);
    this.legend.draw();
  }

  this.simplifyingPath = d3.geo.path()
    .projection({stream: function(s) {return simplify.stream(self.projection.stream(s));}})
    .context(this.context);

  this.path = d3.geo.path()
    .projection(this.projection)
    .context(this.context);

  this.init = function() {
    this.initEvents();
    this.resize();
  };

  this.getGrid = function() {
    /**
     * returns 'the' grid
     */

    // FIXME: is picking the first grid good enough?
    var grid = null;
    for (var i=0; i < this.layers.length; i++) {
      if (this.layers[i].grid) {
        return this.layers[i].grid;
      }
    }
  };

  this.onMouseMove = function() {
    if (!self.options.onCellHover && !self.options.hud) {
      return;
    }
    var coords = self.projection.invert(d3.mouse(this));

    if (!coords) {
      return;
    }
    var cellId = null;
    var cell = null;

    var grid = self.getGrid();

    if (grid && coords[0] && coords[1] && coords[0] > -180 && coords[0] < 180 && coords[1] > -90 && coords[1] < 90) {
      cellId = grid.coordinatesToCellId(coords);
      cell = grid.getCell(cellId);
      if (cell) {
        if (self.options.onCellHover) {
          self.options.onCellHover(cell, cellId);
        }
      }
    }
    var normalizedValue = cell / 255;
    if (hud && cellId) {
      hud.update(cellId, coords, normalizedValue);
    }
    if (self.legend) {
      self.legend.draw();
      self.legend.highlight(normalizedValue);
    }
  };

  this.initEvents = function() {

    var scale = 150;
    var drag = d3.behavior.drag()
      .on('dragstart', function () {
      })
      .on('drag', function () {
        self.rotateLongitude += 100 * d3.event.dx / scale;
        self.rotateLatitude -= 100 * d3.event.dy / scale;
        self.projection.rotate([self.rotateLongitude, self.rotateLatitude]);
        self.drawAnimation();
      })
      .on('dragend', function () {
        self.draw();
      });

    if (!self.options.disableMouseZoom) {
      var zoom = d3.behavior.zoom()
        .on('zoomstart', function() {
        })
        .on('zoomend', function() {
          self.draw();
        })
        .on('zoom', function(d) {
          scale = d3.event.scale;
          self.area = 20000 / scale / scale;
          self.projection.scale(scale);
          self.drawAnimation();
        })
        .scale(scale)
        .scaleExtent([0, 4000]);

      this.container.call(zoom);
    }

    this.container.call(drag);

    this.container.on('mousemove', self.onMouseMove);
    // set up dispatcher to allow multiple GridMaps to resize
    d3.select(window).on('resize', d3.geo.GridMap.dispatch.resize);
    d3.geo.GridMap.dispatch.on('resize.' + self.container.attr('id'), function() {self.resize();});
  };

  this.drawWorld = function() {
    this.context.clearRect(0, 0, this.width, this.height);

    //draw world background (the sea)
    this.context.beginPath();
    this.path({type: 'Sphere'});
    this.context.fillStyle = this.seaColor;
    this.context.fill();
  };

  this.drawGeoJSONLayer = function(layer) {

    self.context.beginPath();

    if (layer.simplified) {
      self.simplifyingPath(layer.json);
    } else {
      self.path(layer.json);
    }
    self.context.strokeStyle = layer.options.strokeColor;
    self.context.lineWidth = 0.5;
    self.context.stroke();

    self.context.fillStyle = layer.options.fillColor;
    self.context.fill();
  };

  this.drawGrid = function(grid) {

    var image = this.context.getImageData(0, 0, this.width, this.height);
    var imageData = image.data;

    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        var p = this.projection.invert([x, y]);

        if (!p) {
          continue;
        }

        var λ = p[0];
        var φ = p[1];

        if (!(λ <= 180 && λ >= -180 && φ <= 90 && φ >= -90)) {
          continue;
        }
        var i = (x + this.width * y) * 4;

        // Add 1 because cell IDs are defined to be 1-based instead
        // of our 0-based arrays.
        var q = ~~((~~((90 - φ) / 180 * grid.rows) * grid.cols + (180 + λ) / 360 * grid.cols + 1.0));

        if (grid.data[q*4+3] === 0) {
          // skip where alpha is 0;
          continue;
        }
        imageData[i] = grid.data[q*4];
        imageData[i+1] = grid.data[q*4+1];
        imageData[i+2] = grid.data[q*4+2];
        imageData[i+3] = grid.data[q*4+3];
      }
    }
    self.context.putImageData(image, 0, 0);
  };

  this.drawGraticule = function() {
    this.context.beginPath();
    this.path(graticule);
    this.context.closePath();
    this.context.lineWidth = 1;
    this.context.strokeStyle = this.graticuleColor;
    this.context.stroke();
  };

  this.drawLayers = function (animating) {
    for (var i = 0; i < self.layers.length; i++) {
      var layer = self.layers[i];
      var doRender = !animating || layer.options.renderOnAnimate;
      if (doRender) {
        if (layer.grid) {
          self.drawGrid(layer.grid);
        } else if (layer.json) {
          if (layer.json.type === 'Topology') {
            self.drawTopoJSONLayer(layer);
          } else {
            self.drawGeoJSONLayer(layer);
          }
        }
      }
    }
  };

  this._draw = function() {

    self.dispatch.drawStart();

    self.drawWorld();
    self.drawLayers();
    self.drawGraticule();

    self.dispatch.drawEnd();
  };

  this.drawAnimation = function () {
    var animating = true;

    self.drawWorld();
    self.drawLayers(animating);
    self.drawGraticule();
  };

  var debounce = function(fn, timeout) {
    var timeoutID = -1;
    return function() {
      if (timeoutID > -1) {
        window.clearTimeout(timeoutID);
      }
      timeoutID = window.setTimeout(fn, timeout);
    };
  };

  self.draw = debounce(self._draw, 500);

  this._resize = function() {

    console.log('resizing ', self);
    var rect = self.container.node().getBoundingClientRect();
    self.width = rect.width | 0;
    self.height = rect.height | 0;

    self.canvas.attr('width', self.width);
    self.canvas.attr('height', self.height);

    if (hud) {
      hud.resize(self.width, self.height);
    }

    self.projection
      .translate([self.width/2, self.height/2])
      .clipExtent([[0, 0], [self.width, self.height]]);

    self.draw();
  };

  this.resize = debounce(self._resize, 200);

  this.panToCentroid = function(geojson) {
    var centroid = d3.geo.centroid(geojson);
    var rotation = this.projection.rotate();
    rotation[0] = -centroid[0]; // note the '-'
    this.projection.rotate(rotation);
  };

  this.addLayer = function(data, options) {
    /**
      * adds data to the map. The type is introspected,
      * it cant be a Uint8Array (full grid of RGBA values),
      * ArrayBuffer (GridMap packed binary format), geojson,
      * or topojson.

      * options (optional):
      *   zIndex - specifies layer stacking order
      *   fillColor - fill color for vector layers
      *   strokeColor - stroke color for vector layers
      */
    var layer = new Layer(options);

    if (data.constructor === ArrayBuffer) {
      var grid = DataImport.arrayBufferToGrid(data, options.gridSize, self.colorScale);
      layer.grid = grid;
    } else if (data.constructor === Uint8Array || data.constructor === Uint8ClampedArray) {
      var grid = new Grid(data, options.gridSize);
      layer.grid = grid;
    } else {
      // assume JSON
      if (data.type === 'Topology') {
        // it is topojson, convert it
        var topojsonObject = (options && options.topojsonObject) || data.objects[Object.keys(data.objects)[0]];
        data = topojson.feature(topojson.presimplify(data), topojsonObject);
        layer.simplified = true;
      }
      layer.json = data;
    }
    self.layers.push(layer);
    self.layers.sort(function(a,b) {return a.options.zIndex-b.options.zIndex;});
    self.draw();

    return layer;
  };

  this.removeLayer = function(layer) {
    /**
      * removes layer from the map.
      * It can be a Layer object, or an index to
      * the internal layers array.
      */
    if (typeof(layer) === 'number') {
      self.layers.splice(layer,1);
    } else {
      for (var i=0; i<self.layers.length; i++) {
        if (self.layers[i] === layer) {
          self.layers.splice(i,1);
        }
      }
    }
  };

  this.zoomTo = function (newScale) {
    self.area = 20000 / newScale / newScale;
    self.projection.scale(newScale);
    self.draw();
  };

  this.zoomIn = function() {
    self.options.zoomLevels.sort(function(a, b) {
      return a-b;
    });

    var currentZoom = self.projection.scale();
    for (var i = 0; i < self.options.zoomLevels.length; i++) {
      if (self.options.zoomLevels[i] * 150 > currentZoom) {
        self.zoomTo(self.options.zoomLevels[i] * 150);
        return;
      }
    }
  };

  this.zoomOut = function() {
    self.options.zoomLevels.sort(function(a, b) {
      return a-b;
    });

    var currentZoom = self.projection.scale();
    for (var i = self.options.zoomLevels.length - 1; i >= 0; i--) {
      if (self.options.zoomLevels[i] * 150 < currentZoom) {
        self.zoomTo(self.options.zoomLevels[i] * 150);
        return;
      }
    }
  };

  this.init();
};

window.d3.geo.GridMap = GridMap;
window.d3.geo.GridMap.dispatch = d3.geo.GridMap.dispatch || d3.dispatch('drawStart', 'drawEnd', 'resize');

},{"./data-import.js":1,"./grid.js":2,"./hud.js":3,"./layer.js":5,"./legend.js":6}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}]},{},[4]);

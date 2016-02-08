(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Grid = require('./grid.js');
var Utils = require('./utils.js');

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

  packedBinaryArrayBufferToGrid: function(buff, gridSize, colorScale) {
    // given an ArrayBuffer buff containing data in
    // packed binary format, returns a Grid

    // The packed binary format is expected to be
    // a sequence of Uint32 elements in which the most
    // significant byte is the cell value and the
    // lowest 3 bytes represent the cell ID.

    // this method is being deprecated

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

  arrayToGrid: function(rawData, gridSize, colorScale) {
    // given an array containing a 1 dimensional
    // sequence of 32 bit floats, returns a Grid

    var w = gridSize[1];
    var h = gridSize[0];

    var colorData = new Uint32Array(w*h);

    var colorScaleType = typeof(colorScale(0));

    for (var i=0, len=rawData.length; i<len; i++) {
      var value = rawData[i];
      if(value != value) { // cheaper isNaN
        continue;
      }
      var color = colorScale(value);
      if (colorScaleType === 'string') {
        // colorScale returned a color string
        // instead of a packed 32 bit int
        color = Utils.colorStringToUint32(color);
      }

      colorData[i] = color;
    }

    return new Grid(colorData, gridSize, rawData);
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

},{"./grid.js":2,"./utils.js":7}],2:[function(require,module,exports){
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

  this.screenCoordinatesToGridIndex = function(coords, projection) {
    /**
      * Returns the index of grid.data which corresponds to the screen coordinates
      * given projection.
      *
      * @param {Array} coords [x,y]
      * @param {Projection} d3.geo.projection
      * @param {Grid} grid
      * @return {Number} index in grid.data
      */

    var p = projection.invert(coords);

    if (!p) {
      return;
    }

    var λ = p[0];
    var φ = p[1];

    if (!(λ <= 180 && λ >= -180 && φ <= 90 && φ >= -90)) {
      return;
    }

    // Add 1 because cell IDs are defined to be 1-based instead
    // of our 0-based arrays.
    var index = ~~((~~((90 - φ) / 180 * this.rows) * this.cols + (180 + λ) / 360 * this.cols + 1.0));

    return index;
  };

  this.getIndexMap = function(gridMap) {
    var cacheKey = [
      gridMap.projection.rotate().slice(0,2).join('-'),
      gridMap.projection.scale(),
      gridMap.width,
      gridMap.height
    ].join('-');

    var indexMap = null;
    var cache = gridMap; // do something better for caching
    if (cache.indexMapCache && cache.indexMapCache[cacheKey]) {
      indexMap = cache.indexMapCache[cacheKey];
    } else {
      indexMap = new Uint32Array(gridMap.height * gridMap.width);

      var w = gridMap.width;
      var h = gridMap.height;
      for (var i = 0, lim = h*w; i<lim; i++) {
        indexMap[i] = this.screenCoordinatesToGridIndex([i%w, i/w], gridMap.projection);
      }

      cache.indexMapCache = {};
      cache.indexMapCache[cacheKey] = indexMap;
    }
    return indexMap;
  };

};

module.exports = Grid;

},{}],3:[function(require,module,exports){
var HUD = function(gridMap) {
  // this.container = gridMap.container;

  var options = gridMap.options.hud || {};

  var canvas = gridMap.container
    .append('canvas');

  canvas
    .style('position', 'absolute')
    .style('top', '0px')
    .style('left', '0px')
    .data([Number.MAX_VALUE]); // top z-index

  var context = canvas.node().getContext('2d');
  this.context = context;

  var graticule = gridMap.options.graticule || d3.geo.graticule()()

  this.resize = function(width, height) {
    canvas.attr('width', width);
    canvas.attr('height', height);
  };

  this.drawGraticule = function() {
    context.beginPath();
    gridMap.path.context(context)(graticule);
    context.closePath();
    context.lineWidth = gridMap.graticuleWidth;
    context.strokeStyle = gridMap.graticuleColor;
    context.stroke();
  };

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

    this.drawGraticule();

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
    gridMap.path.context(context)(feature);
    context.stroke();

  };

  this.draw = function() {
    context.clearRect(0, 0, gridMap.width, gridMap.height);
    this.drawGraticule();
  };

};

module.exports = HUD;

},{}],4:[function(require,module,exports){
var DataImport = require('./data-import.js');
var Grid = require('./grid.js');
var HUD = require('./hud.js');
var Layer = require('./layer.js');
var Legend = require('./legend.js');
var Utils = require('./utils.js');

try {
  /* fake it for IE10 */
  new Uint8ClampedArray();
} catch (e) {
  window.Uint8ClampedArray = Uint8Array;
}

var defaultColorScale = d3.scale.linear()
  .domain([0,255])
  .range(["#a50026","#d73027","#f46d43","#fdae61","#fee08b","#d9ef8b","#a6d96a","#66bd63","#1a9850","#006837"]);

var GridMap = function(container, options) {
  var self = this;

  this.container = d3.select(container);

  var rect = this.container.node().getBoundingClientRect();
  this.width = rect.width | 0;
  this.height = rect.height | 0;

  this.layers = [];
  this.options = options || {};

  this.seaColor = this.options.seaColor || 'rgba(21,98,180,.8)';
  this.graticuleColor = this.options.graticuleColor || 'rgba(255,255,255,.3)';
  this.graticuleWidth = this.options.graticuleWidth || 1;

  var rotateLatitude = -this.options.latitude || 0;
  var rotateLongitude = -this.options.longitude || 0;
  var scale = this.options.scale || 150;
  self.area = 1; // minimum area threshold for simplification

  this.dispatch = d3.geo.GridMap.dispatch; //singleton

  this.projection = this.options.projection || d3.geo.aitoff();
  this.projection
    .translate([this.width/2, this.height/2])
    .clipExtent([[0, 0], [self.width, self.height]])
    .scale(scale)
    .rotate([rotateLongitude, rotateLatitude]);

  this.canvas = this.container
    .append('canvas')
    .style('position', 'absolute')
    .style('top', '0px')
    .style('left', '0px');

  this.canvas.data([0]); // bind z-index to data() for layer ordering. base canvas is 0

  this.context = this.canvas.node().getContext('2d');

  var simplify = d3.geo.transform({
    point: function(x, y, z) {
      if (z >= self.area) {
        this.stream.point(x, y);
      }
    }
  });

  this.simplifyingPath = d3.geo.path()
    .projection({
      stream: function(s) {return simplify.stream(self.projection.stream(s));}
    });

  this.path = d3.geo.path()
    .projection(this.projection);

  var hud = new HUD(this, options.hud);

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

  this.init = function() {
    this.initEvents();
    this.resize();
  };

  this.getGrid = function() {
    /**
     * returns the first visible grid, or an array of grids if more than one
     */

    var grids = [];
    for (var i=0; i < this.layers.length; i++) {
      if (this.layers[i].grid && this.layers[i].visible) {
        grids.push(this.layers[i].grid);
      }
    }
    if (grids.length === 1) {
      return grids[0];
    } else if (grids.length > 0) {
      return grids;
    }
  };

  this.onMouseMove = function() {
    if (!self.options.onCellHover && !self.options.hud && !self.options.onMouseMove) {
      return;
    }
    var coords = self.projection.invert(d3.mouse(this));
    if (self.options.onMouseMove) {
      self.options.onMouseMove(coords);
    }

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
    if (options.hud && cellId) {
      hud.update(cellId, coords, cell);
    }
    if (self.legend) {
      self.legend.draw();
      self.legend.highlight(cell);
    }
  };

  this.initEvents = function() {

    var drag = d3.behavior.drag()
      .on('dragstart', function () {
      })
      .on('drag', function () {
        rotateLongitude += 100 * d3.event.dx / scale;
        rotateLatitude -= 100 * d3.event.dy / scale;
        self.projection.rotate([rotateLongitude, rotateLatitude]);
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
    this.path.context(this.context)({type: 'Sphere'});
    this.context.fillStyle = this.seaColor;
    this.context.fill();
  };

  this.drawLayers = function (animating) {
    for (var i = 0; i < self.layers.length; i++) {
      var layer = self.layers[i];
      var doRender = !animating || layer.options.renderOnAnimate;
      if (doRender) {
        layer.draw();
      } else {
        layer.clear();
      }
    }
  };

  this._draw = function() {

    self.dispatch.drawStart();

    self.drawWorld();
    self.drawLayers();
    hud.draw();
    self.dispatch.drawEnd();
  };

  this.drawAnimation = function () {
    var animating = true;

    self.drawWorld();
    self.drawLayers(animating);
    hud.draw();
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

    var rect = self.container.node().getBoundingClientRect();
    self.width = rect.width | 0;
    self.height = rect.height | 0;

    self.canvas.attr('width', self.width);
    self.canvas.attr('height', self.height);

    for (var i=0; i<self.layers.length; i++ ) {
      self.layers[i].resize(self.width, self.height);
    }

    self.projection
      .translate([self.width/2, self.height/2])
      .clipExtent([[0, 0], [self.width, self.height]]);

    hud.resize(self.width, self.height);
    self.draw();
  };

  this.resize = debounce(self._resize, 200);

  this.panToCentroid = function(geojson) {
    var centroid = d3.geo.centroid(geojson).map(Math.round);
    var rotation = this.projection.rotate().map(Math.round);
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
      *   colorScale - colorScale to use for this layer
      *   draw - whether to redraw GridMap immediately. Default: true
      */
    var layer = new Layer(self, options);

    // duck type check to see if it's a (typed) array or object
    if (data.BYTES_PER_ELEMENT) {
      var colorScale = (options && options.colorScale) || self.colorScale;
      if (options.colorScaleDiscrete) {
        // preprocess for performance, helpful with a lot of layers
        colorScale.range(colorScale.range().map(Utils.colorStringToUint32));
      }
      layer.grid = DataImport.arrayToGrid(data, options.gridSize, colorScale);

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
    this.container.selectAll('canvas').sort();

    if (options && (options.renderOnAdd || options.renderOnAdd == undefined)) {
      self.draw();
    }

    return layer;
  };

  this.removeLayer = function(layer) {
    /**
      * removes layer from the map.
      * It can be a Layer object, or an index to
      * the internal layers array.
      */

    if (typeof(layer) === 'number') {
      layer = self.layers.splice(layer,1)[0];
    } else {
      for (var i=0; i<self.layers.length; i++) {
        if (self.layers[i] === layer) {
          self.layers.splice(i,1);
        }
      }
    }
    layer.remove();
    return layer;
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

},{"./data-import.js":1,"./grid.js":2,"./hud.js":3,"./layer.js":5,"./legend.js":6,"./utils.js":7}],5:[function(require,module,exports){
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
  this.options.strokeWidth = this.options.strokeWidth || 0.5;
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

    var image = context.createImageData(gridMap.width, gridMap.height);

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
    context.lineWidth = this.options.strokeWidth;
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

},{}],7:[function(require,module,exports){

var Utils = {

  colorStringToUint32: function(colorString) {
    // given a colorString handleable by d3.rgb ("#ffffff"),
    // converts it to a 32 bit integer which can
    // be inserted in canvas array.
    var rgb = d3.rgb(colorString);
    return (255 << 24)   |
            (rgb.b << 16) |
            (rgb.g << 8)  |
            rgb.r;
  }

};

module.exports = Utils;

},{}]},{},[4]);

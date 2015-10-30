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

  var rotateLatitude = 0;
  var rotateLongitude = 0;

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
        rotateLongitude += (100 * d3.event.dx / scale);
        rotateLatitude -= (100 * d3.event.dy / scale);
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

  this.screenCoordinatesToGridIndex = function(coords, projection, grid) {
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
    var index = ~~((~~((90 - φ) / 180 * grid.rows) * grid.cols + (180 + λ) / 360 * grid.cols + 1.0));

    return index;
  };

  this.renderGridToCanvas = function(grid, indexMap) {

    var image = this.context.getImageData(0, 0, this.width, this.height);
    var imageData = image.data;

    for (var i=0; i<indexMap.length; i++) {
      var imageIndexT4 = i*4;
      var gridIndexT4 = indexMap[i]*4;

      if (grid.data[gridIndexT4+3] === 0) {
        // skip where alpha is 0;
        continue;
      }
      imageData[imageIndexT4] = grid.data[gridIndexT4];
      imageData[imageIndexT4++] = grid.data[gridIndexT4++];
      imageData[imageIndexT4++] = grid.data[gridIndexT4++];
      imageData[imageIndexT4++] = grid.data[gridIndexT4++];
    }

    self.context.putImageData(image, 0, 0);
  };

  this.drawGrid = function(grid) {
    var indexMap = [];
    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        var imageIndex = (x + this.width * y);
        var gridIndex = this.screenCoordinatesToGridIndex([x,y], self.projection, grid);
        indexMap[imageIndex] = gridIndex;
      }
    }
    this.renderGridToCanvas(grid, indexMap);
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

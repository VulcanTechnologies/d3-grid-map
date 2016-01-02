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

  self.initialPosition = true;
  var rect = this.container.node().getBoundingClientRect();
  this.width = rect.width | 0;
  this.height = rect.height | 0;

  this.layers = [];
  this.options = options || {};

  this.seaColor = options.seaColor || 'rgba(21,98,180,.8)';
  this.graticuleColor = options.graticuleColor || 'rgba(255,255,255,.3)';

  var rotateLatitude = -options.latitude || 0;
  var rotateLongitude = -options.longitude || 0;
  var scale = options.scale || 150;
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
        self.initialPosition = false;
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
          self.initialPosition = false;
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
    if (data.reverse) {
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
        // data = topojson.feature(data, topojsonObject);
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

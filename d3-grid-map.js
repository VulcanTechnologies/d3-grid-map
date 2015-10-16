/* global d3 */
/* global topojson */

(function(){
  'use strict';

  try {
    /* fake it for IE10 */
    new Uint8ClampedArray();
  } catch (e) {
    window.Uint8ClampedArray = Uint8Array;
  }

  var defaultColorScale = d3.scale.quantize()
    .domain([0,255])
    .range(["#a50026","#d73027","#f46d43","#fdae61","#fee08b","#d9ef8b","#a6d96a","#66bd63","#1a9850","#006837"]);

  var Grid = function(data, gridSize, rawData) {
    // represents a gridded data set.  rawData should be an object
    // mapping cellId to cell value
    this.data = data;
    this.rows = gridSize[1];
    this.cols = gridSize[0];
    this.rawData = rawData;
  };

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

  var GridMap = function(container, options) {
    var self = this;

    this.rotateLatitude = 0.0;
    this.rotateLongitude = 0.0;

    this.container = d3.select(container);

    var rect = this.container.node().getBoundingClientRect();
    this.width = rect.width | 0;
    this.height = rect.height | 0;

    this.grids = [];
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

    this.hud = this.container
      .append('canvas')
      .style('position', 'absolute')
      .style('top', '0px')
      .style('left', '0px')
      .style('z-index', '2');

    this.context = this.canvas.node().getContext('2d');
    this.hudContext = this.hud.node().getContext('2d');

    this.colorScale = this.options.colorScale || defaultColorScale;

    if (!this.options.zoomLevels) {
      this.options.zoomLevels = [1, 2, 4, 8];
    }

    this.simplifyingPath = d3.geo.path()
      .projection({stream: function(s) {return simplify.stream(self.projection.stream(s));}})
      .context(this.context);

    this.path = d3.geo.path()
      .projection(this.projection)
      .context(this.context);

    this.hudPath = d3.geo.path()
      .projection(this.projection)
      .context(this.hudContext);

    this.init = function() {
      this.initEvents();
      this.resize();
    };

    this.getCell = function(cellId) {
      // return value if we have a grid and the grid contains a nonzero alpha channel from
      // (RGBA) values
      var grid = this.getGrid();

      if (grid && grid.rawData) {
        return grid.rawData[cellId];
      }
    };

    this.cellIdToLonLat = function(cellId, grid) {
      /**
       * given a cellId, returns an array containing the [lon,lat] of the
       * upper left corner  points
       * @param {Number} cellId
       * @return {Array} coordinates
       */

      var rows = 360;
      var cols = 720;
      if (grid) {
        rows = grid.rows;
        cols = grid.cols;
      }
      var _id = cellId - 1;
      var lon = -180 + (_id % cols)/cols * rows;
      var lat = 90 - (~~(_id / cols)) * (180 / rows);
      return [lon, lat];
    };

    this.cellCache = [];

    this.cellIdToCoordinates = function(cellId, grid) {
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

      var rows = 360;
      var cols = 720;
      if (grid) {
        rows = grid.rows;
        cols = grid.cols;
      }
      var xSize = 360 / cols;
      var ySize = 180 / rows;

      var lonLat = this.cellIdToLonLat(cellId, grid);
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

    this.coordinatesToCellId = function(coords) {
      var lon = coords[0];
      var lat = coords[1];

      var grid = this.getGrid();

      var rows = grid.rows;
      var cols = grid.cols;

      var row = ~~(rows - (lat + 90) / 180  * rows);
      var col = ~~((lon + 180) / 360  * cols);

      var cellId = row * cols + col + 1;
      return cellId;
    };

    this.updateHUD = function(cellId, coords, cell) {
      var coordFormat = d3.format(' >+7.3f');

      var fontSize = self.options.hud.fontSize || 30;
      var verticalOffset = self.options.hud.verticalOffset || 10;
      var fontColor = self.options.hud.fontColor || 'white';
      var fontFace = self.options.hud.fontFace || 'monospace';

      var font = fontSize + 'px ' + fontFace;
      var h = fontSize + verticalOffset;
      var gradient = self.hudContext.createLinearGradient(0,self.height-h,0,self.height);
      gradient.addColorStop(0, 'rgba(0,0,0,0.0)');
      gradient.addColorStop(1, 'rgba(0,0,0,1.0)');

      self.hudContext.clearRect(0, 0, self.width, self.height);
      self.hudContext.fillStyle = gradient;
      self.hudContext.fillRect(0,self.height-(h), self.width, self.height);

      var s = '';

      s = 'cell: ' + cellId + ' ( ' + coordFormat(coords[0]) + '°,' + coordFormat(coords[1]) + '° )';

      var coordinates = self.cellIdToCoordinates(cellId, self.grids[0]);

      var feature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
      };

      if (cell !== undefined) {
        s += ' value: ' + cell;
      }

      self.hudContext.font = font;
      self.hudContext.fillStyle = fontColor;
      self.hudContext.fillText(s, 0, self.height - verticalOffset);

      self.hudContext.beginPath();
      self.hudContext.strokeStyle = 'white';
      self.hudContext.lineWidth = 2;
      self.hudPath(feature);
      self.hudContext.stroke();
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

      if (coords[0] && coords[1] && coords[0] > -180 && coords[0] < 180 && coords[1] > -90 && coords[1] < 90) {
        cellId = self.coordinatesToCellId(coords);
        cell = self.getCell(cellId);
        if (cell) {
          if (self.options.onCellHover) {
            self.options.onCellHover(cell, cellId);
          }
        }
      }
      if (self.options.hud && cellId) {
        self.updateHUD(cellId, coords, cell);
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

    var graticule = d3.geo.graticule()();

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

    var debounceLock = false;

    var debounce = function(fn, timeout) {
      var timeoutID = -1;
      return function() {
        if (debounceLock) {
          console.log('debounce contention');
          return;
        }
        debounceLock = true;
        if (timeoutID > -1) {
          window.clearTimeout(timeoutID);
        }
        timeoutID = window.setTimeout(fn, timeout);
        debounceLock = false;
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

      self.hud.attr('width', self.width);
      self.hud.attr('height', self.height);

      self.projection
        .translate([self.width/2, self.height/2])
        .clipExtent([[0, 0], [self.width, self.height]]);

      self.draw();
    };

    this.resize = debounce(self._resize, 200);

    this.panToCentroid = function() {
      console.debug('panToCentroid needs updating');
      return;
      var centroid = d3.geo.centroid(this.geojson);
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
        var grid = this.arrayBufferToGrid(data, options.gridSize);
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

    this.uInt8ArrayToGeoJSON = function(array) {
      console.debug('uInt8ArrayToGeoJSON is deprecated. Use setData');

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
    };

    this.arrayBufferToGrid = function(buff, gridSize) {
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

        var color = d3.rgb(self.colorScale(value));
        var alpha = 255;

        data[idx+0] = color.r;
        data[idx+1] = color.g;
        data[idx+2] = color.b;
        data[idx+3] = alpha;

        rawData[cellId] = value;
      }
      return new Grid(data, gridSize, rawData);
    };

    this.arrayBufferToGeoJSON = function(buff) {
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

  d3.geo.GridMap = GridMap;
  d3.geo.GridMap.dispatch = d3.geo.GridMap.dispatch || d3.dispatch('drawStart', 'drawEnd', 'resize');

})();

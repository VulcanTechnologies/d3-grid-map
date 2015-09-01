/* global d3 */
/* global topojson */

(function(){
  'use strict';

  var defaultColorScale = d3.scale.quantize()
    .domain([0,255])
    .range(["#a50026","#d73027","#f46d43","#fdae61","#fee08b","#d9ef8b","#a6d96a","#66bd63","#1a9850","#006837"]);
    // RdYlGn[10]

  var worldGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: null
        }
      }
    ]
  };

  worldGeoJSON.features[0].geometry.coordinates = [
    d3.range(-179.9999,179.9999).map(function(x) {return [x, 89.9999];}),
    d3.range(89.9999,-89.9999,-1).map(function(x) {return [179.9999, x];}),
    d3.range(179.9999,-179.9999,-1).map(function(x) {return [x, -89.9999];}),
    d3.range(-89.9999,89.9999).map(function(x) {return [-179.9999, x];}
  )];

  var Grid = function(data, gridSize, bbox) {
    // represents a gridded data set.  Unless bbox is supplied,
    // it's assumed to have global coverage
    this.data = data;
    this.rows = gridSize[1];
    this.cols = gridSize[0];
    this.bbox = bbox; // optional, currently unused
  };

  var Layer = function(options) {
    this.zIndex = options ? options.zIndex : 1;
    this.options = options || {strokeColor: 'rgba(100,100,100,.8)', fillColor: 'rgba(237,178,48,1)'};
    this.geojson = null;
    this.grid = null;
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

    this.options = options;

    this.seaColor = options.seaColor || 'rgba(21,98,180,.8)';
    this.graticuleColor = options.graticuleColor || 'rgba(255,255,255,.3)';

    self.area = 1; // minimum area threshold for simplification

    var simplify = d3.geo.transform({
      point: function(x, y, z) {
        if (z >= self.area) {
          this.stream.point(x, y);
        }
      }
    });

    this.projection = options.projection || d3.geo.aitoff();
    this.projection
      .translate([this.width/2, this.height/2])
      .scale(this.width/6)
      .clipExtent([[0, 0], [self.width, self.height]])
      .precision(0.1);

    this.canvas = this.container
      .append('canvas')
      .style('position', 'absolute')
      .style('top', '0px')
      .style('left', '0px')
      .attr('width', self.width)
      .attr('height', self.height);

    this.hud = this.container
      .append('canvas')
      .style('position', 'absolute')
      .style('top', '0px')
      .style('left', '0px')
      .style('z-index', '2')
      .attr('width', self.width)
      .attr('height', self.height);

    this.context = this.canvas.node().getContext('2d');
    this.hudContext = this.hud.node().getContext('2d');

    this.colorScale = options.colorScale || defaultColorScale;

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
    };

    this.destroy = function() {
      this.canvas.remove();
      this.hudCanvas.remove();
      this.grids = [];
      this.geojson = null;
    };

    this.getCell = function(cellId) {
      // return value if we have a grid and the grid contains a nonzero alpha channel from
      // (RGBA) values
      var grid = this.getGrid();

      if (grid && grid.data[cellId*4 + 3]) {
        return grid.data[cellId*4];
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
      gradient.addColorStop(0, 'rgba(0,0,0,0.0');
      gradient.addColorStop(1, 'rgba(0,0,0,1.0');

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
            self.options.onCellHover(cell);
          }
        }
      }
      if (self.options.hud && cellId) {
        self.updateHUD(cellId, coords, cell);
      }
    }
    this.initEvents = function() {

      var scale = 150;
      var drag = d3.behavior.drag()
        .on('dragstart', function () {
        })
        .on('drag', function () {
          self.rotateLongitude += 100 * d3.event.dx / zoom.scale();
          self.rotateLatitude -= 100 * d3.event.dy / zoom.scale();
          self.projection.rotate([self.rotateLongitude, self.rotateLatitude]);
          self.drawWorld();
          self.drawGeoJSONLayers();
          self.drawGraticule();
          self.draw();
        })
        .on('dragend', function () {
          self.draw();
        });

      var zoom = d3.behavior.zoom()
        .on('zoomstart', function() {
        })
        .on('zoomend', function() {
          self.draw();
        })
        .on('zoom', function(d) {
          if (zoom.scale() >= 2000 || zoom.scale() <= self.width/6) {
            return;
          }
          scale = d3.event.scale;
          self.area = 20000 / scale / scale;
          self.projection.scale(scale);
          self.drawWorld();
          self.drawGeoJSONLayers();
          self.drawGraticule();
          self.draw();
        })
        .scale(this.width/6)
        .scaleExtent([this.width/6, 2000]);

      this.container.call(drag);
      this.container.call(zoom);

      this.container.on('mousemove', self.onMouseMove);
      d3.select(window).on('resize', self.resize);
    };

    var graticule = d3.geo.graticule()();

    this.drawWorld = function() {
      this.context.clearRect(0, 0, this.width, this.height);

      //draw world background (the sea)
      this.context.beginPath();
      this.path(worldGeoJSON);
      this.context.closePath();
      this.context.fillStyle = this.seaColor;
      this.context.fill();
    };

    this.drawGeoJSONLayer = function(layer) {

      self.context.beginPath();
      self.simplifyingPath(layer.geojson);
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

          if (λ > 180 || λ < -180 || φ > 90 || φ < -90) {
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

    this.drawGeoJSONLayers = function() {
      for (var i=0; i<self.layers.length; i++) {
        var layer = self.layers[i];
        if (layer.geojson) {
          self.drawGeoJSONLayer(layer);
        }
      }
    };

    this.dispatch = d3.dispatch('drawStart', 'drawEnd');

    this._draw = function() {

      /**
        * clears the canvas,
        * draws the background
        * draws data layers
        * draws graticule
        */

      self.dispatch.drawStart();

      self.drawWorld();

      for (var i=0; i<self.layers.length; i++) {
        var layer = self.layers[i];

        if (layer.geojson) {
          self.drawGeoJSONLayer(layer);
        } else if (layer.grid) {
          self.drawGrid(layer.grid);
        }
      }

      self.drawGraticule();

      self.dispatch.drawEnd();
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
      self.width = parseInt(self.container.style('width'), 10);
      self.canvas.attr('width', self.width);
      self.hud.attr('width', self.width);
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

    this.setData = function(data, options) {
      var layer = new Layer(options);

      if (data.constructor === ArrayBuffer) {
        var grid = this.arrayBufferToGrid(data, options.gridSize);
        layer.grid = grid;
      } else if (data.constructor === Uint8ClampedArray) {
        var grid = new Grid(data, options.gridSize);
        layer.grid = grid;
      } else {
        // assume GeoJSON
        if (data.type === 'Topology') {
          // it is topojson
          topojson.presimplify(data);
          // FIXME: this isn't good.  hardcoded assuming only countries data
          // and immediately converting topojson to geojson.
          data = topojson.feature(data, data.objects.countries);
        }
        layer.geojson = data;
      }
      self.layers.push(layer);
      self.draw();
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

      for (var i=0; i<typedArray.length; i++) {
        var packed = typedArray[i];
        var cellId = (packed & 0xfffff) << 2;
        // unpack most significant byte, the data value.
        // note the triple arrow, which fills in 0s instead of 1s.
        var value = packed >>> 24;

        var color = d3.rgb(self.colorScale(value));
        var alpha = 255;

        data[cellId+0] = color.r;
        data[cellId+1] = color.g;
        data[cellId+2] = color.b;
        data[cellId+3] = alpha;
      }
      return new Grid(data, gridSize);
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

    this.init();
  };

  d3.geo.GridMap = GridMap;

})();

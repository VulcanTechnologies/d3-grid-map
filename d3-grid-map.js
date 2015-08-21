/* global d3 */
/* global topojson */

(function(){
  'use strict';

  var defaultColorScale = d3.scale.quantize()
    .domain([0,255])
    .range(['#f00', '#c01', '#a02', '#303', '#404', '#505','#606','#707','#808',
    '#909','#a0a','#b0b','#c0c','#d0d','#e0e', '#f00']);

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

  function _cellIdToLonLat(id, rows, cols) {
      var _id = id-1;
      var lon = -180 + (_id % cols)/cols * rows ;
      var lat = 90 - (~~(_id / cols)) * (180 / rows);
      return [lon, lat];
  }

  function cellIdToCoordinates(gridSize) {

    var rows = gridSize[1];
    var cols = gridSize[0];
    var x_size = 0.5; // this.gridCols / 360;
    var y_size = 0.5; //this.gridRows / 180;

    var array = [];
    for (var i=1; i<=rows * cols; i++) {
        var lonLat = _cellIdToLonLat(i, rows, cols);
        var coordinates = [
          lonLat,
          [lonLat[0] + x_size, lonLat[1]],
          [lonLat[0] + x_size, lonLat[1]-y_size],
          [lonLat[0], lonLat[1]-y_size],
          lonLat
        ];
        array[i] = coordinates;
    }
    return array;
  }

  var GridMap = function(container, gridSize, options) {
    var self = this;

    this.rotate_latitude = 0.0;
    this.rotate_longitude = 0.0;

    this.gridCols = gridSize[0];
    this.gridRows = gridSize[1];

    this.container = d3.select(container);

    var rect = this.container.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.options = options;

    this.landColor = options.landColor || 'rgba(237,178,48,1)';
    this.seaColor = options.seaColor || 'rgba(21,98,180,.8)';
    this.landOutlineColor = options.landOutlineColor || 'rgba(100,100,100,.8)';
    this.graticuleColor = options.graticuleColor || 'rgba(100,100,100,.3)';
    this.geoJsonColor = options.geoJsonColor || 'rgba(0,0,0,1)';

    self.area = 1; // minimum area threshold for simplification

    var simplify = d3.geo.transform({
      point: function(x, y, z) {
        if (z >= self.area) {
          this.stream.point(x, y);
        }
      }
    });

    this.projection = options.projection || d3.geo.mollweide();
    this.projection
      .translate([this.width/2, this.height/2])
      .scale(this.width/6)
      .clipExtent([[0, 0], [self.width, self.height]])
      .precision(0.1);

    this.margin = options.margin || {top: 10, right: 10, bottom: 10, left: 10};

    topojson.presimplify(options.countries);

    this.canvas = this.container
      .append('canvas')
      .style('position', 'absolute')
      .datum(topojson.feature(options.countries, options.countries.objects.countries))
      .attr('width', this.width)
      .attr('height', this.height);

    this.hud = this.container
      .append('canvas')
      .style('position', 'absolute')
      .attr('width', this.width)
      .attr('height', this.height);

    this.context = this.canvas.node().getContext('2d');
    this.hud_context = this.hud.node().getContext('2d');
    this.colorScale = options.colorScale || defaultColorScale;

    this.simplifyingPath = d3.geo.path()
      .projection({stream: function(s) {return simplify.stream(self.projection.stream(s));}})
      .context(this.context);

    this.path = d3.geo.path()
      .projection(this.projection)
      .context(this.context);

    this.init = function() {
      this.cellIdToCoordinates = cellIdToCoordinates(gridSize);
      this.initEvents();
      d3.select(window).on('resize', this.resize.bind(this));
      this.draw();
    };

    this.destroy = function() {
      this.canvas.remove();
    };

    this.coordinatesToCellId = function(coords) {
      var lon = coords[0];
      var lat = coords[1];

      var row = ~~(this.gridRows - (lat + 90) / 180  * this.gridRows);
      var col = ~~((lon + 180) / 360  * this.gridCols);

      var cellId = row * this.gridCols + col + 1;
      return cellId;
    };

    this.initEvents = function() {

      var scale = 150;
      var drag = d3.behavior.drag()
        .on('dragstart', function () {
        })
        .on('drag', function () {
          self.rotate_longitude += 100 * d3.event.dx / zoom.scale();
          self.rotate_latitude -= 100 * d3.event.dy / zoom.scale();
          self.projection.rotate([self.rotate_longitude, self.rotate_latitude]);
          self.drawWorld();
        })
        .on('dragend', function () {
          self.debouncedDraw();
        });

      var zoom = d3.behavior.zoom()
        .on('zoomstart', function() {
        })
        .on('zoomend', function() {
          self.debouncedDraw();
        })
        .on('zoom', function(d) {
          if (zoom.scale() >= 2000 || zoom.scale() <= self.width/6) {
            return;
          }
          scale = d3.event.scale;
          self.area = 20000 / scale / scale;
          self.projection.scale(scale);
          self.drawWorld();
        })
        .scale(this.width/6)
        .scaleExtent([this.width/6, 2000]);

      this.container.call(drag);
      this.container.call(zoom);

      if (this.options.hud) {
        var coordFormat = d3.format(' >+8.3f');

        var fontSize = self.options.hud.fontSize || 30;
        var verticalOffset = self.options.hud.verticalOffset || 10;
        var fontColor = self.options.hud.fontColor || 'white';
        var fontFace = self.options.hud.fontFace || 'monospace';

        var font = fontSize + 'px ' + fontFace;
        var h = fontSize + verticalOffset;
        var gradient = self.hud_context.createLinearGradient(0,self.height-h,0,self.height);
        gradient.addColorStop(0, 'rgba(0,0,0,0.0');
        gradient.addColorStop(1, 'rgba(0,0,0,1.0');

        this.container.on('mousemove', function() {
          self.hud_context.clearRect(0,self.height-(h), self.width, self.height);
          self.hud_context.fillStyle = gradient;
          self.hud_context.fillRect(0,self.height-(h), self.width, self.height);

          var s = '';
          var coords = self.projection.invert(d3.mouse(this));
          if (coords[0] && coords[1] && coords[0] > -180 && coords[0] < 180 && coords[1] > -90 && coords[1] < 90) {
            var cellId = self.coordinatesToCellId(coords);
            s = 'cell ID: ' + cellId + ' ( ' + coordFormat(coords[0]) + '°,' + coordFormat(coords[1]) + '° )';
            self.hud_context.font = font;
            self.hud_context.fillStyle = fontColor;
            self.hud_context.fillText(s, 0, self.height - verticalOffset);
          }
        });
      }
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

      // draw countries
      this.context.beginPath();
      this.canvas.each(this.simplifyingPath);
      this.context.closePath();
      this.context.strokeStyle = this.landOutlineColor;
      this.context.lineWidth = 1;
      this.context.stroke();
      this.context.fillStyle = this.landColor;
      this.context.fill();

      // overlay graticule
      this.context.beginPath();
      this.path(graticule);
      this.context.closePath();
      this.context.lineWidth = 1;
      this.context.strokeStyle = this.graticuleColor;
      this.context.stroke();

    };

    this.draw = function(_geojson) {
      if (_geojson) {
        self.geojson = _geojson;
      }

      self.drawWorld();

      self.context.beginPath();
      self.path(self.geojson);
      self.context.strokeStyle = self.geoJsonColor;
      self.context.lineWidth = 0.5;
      self.context.stroke();

      if (self.geojson && self.geojson.features) {
        self.geojson.features.forEach(function(feature){
          var color = null;
          if (feature.properties.rgba) {
            color = 'rgba(' + feature.properties.rgba.join(',') + ')';
          } else {
            color = self.colorScale(feature.properties.value);
          }
          self.context.beginPath();
          self.path(feature);
          self.context.strokeStyle = self.geoJsonColor;
          self.context.lineWidth = 0.5;
          self.context.stroke();
          self.context.fillStyle = color;
          self.context.fill();
        });
      }
    };

    var debounce = function(fn, timeout) {
      var timeoutID = -1;
      return function() {
        if (timeoutID > -1) {
          window.clearTimeout(timeoutID);
          console.debug('debouncing');
        }
        timeoutID = window.setTimeout(fn, timeout);
      };
    };

    self.debouncedDraw = debounce(self.draw, 200);

    this.resize = function() {
      this.width = parseInt(this.container.style('width'), 10);
      this.width = this.width - this.margin.left - this.margin.right;
      this.canvas.attr('width', this.width);
      this.hud.attr('width', this.width);
      this.projection
        .translate([this.width/2, this.height/2])
        .clipExtent([[0, 0], [this.width, this.height]]);
      this.draw();
    };

    this.setData = function(data) {
      if (data.constructor === ArrayBuffer) {
        this.setDataArrayBuffer(data);
      } else if (data.constructor === UInt8ClampedArray) {
        this.setDataUnsparseTypedArray(data);
      } else {
        // assume GeoJSON
        this.setDataGeoJSON(data);
      }
    };

    this.setDataUnsparseTypedArray = function (data) {
      this.geojson = this.uInt8ArrayToGeoJSON(data);
      this.draw();
    };
    this.setDataArrayBuffer = function (data) {
      this.geojson = this.arrayBufferToGeoJSON(data);
      this.draw();
    };
    this.setDataGeoJSON = function (data) {
      this.geojson = data;
      this.draw();
    };

    this.uInt8ArrayToGeoJSON = function(array) {
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
        var coordinates = this.cellIdToCoordinates[cell_id];

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

    this.arrayBufferToGeoJSON = function(buff) {
      // given an ArrayBuffer buff containing data in
      // packed binary format, returns GeoJSON

      // The packed binary format is expected to be
      // a sequence of Uint32 elements in which the most
      // significant byte is the cell value and the
      // lowest 3 bytes represent the cell ID.

      var geojson = {
         type: 'FeatureCollection',
         features: []
      };

      var typedArray = new Uint32Array(buff);
      for (var i=0; i<typedArray.length; i++) {
        var packed = typedArray[i];
        var cell_id = packed & 0xfffff;
        var abundance = packed >> 24;
        var coordinates = this.cellIdToCoordinates[cell_id];

        var feature = {
           type: 'Feature',
           id: i,
           geometry: {
               type: 'Polygon',
               coordinates: [coordinates]
           },
           properties: {value: abundance }
        };
        geojson.features.push(feature);
      }
      return geojson;
    };

    this.init();
  };

  d3.geo.GridMap = GridMap;

})();

/* global d3 */
/* global topojson */

(function(){
  'use strict';

  var GridMap = {
    width: null,
    height: null,
    grid_rows: null,
    grid_cols: null,
    countries: null,
    canvas: null,
    context: null,
    margin: null,
    projection: null,
    graticule: d3.geo.graticule(),
    geojson: null,
    rotate_longitude: 0,
    rotate_latitude: 0,
    path: null,
    container: null,
  };
  d3.geo.GridMap = GridMap;

  var defaultColorScale = d3.scale.quantize()
    .domain([0,255])
    .range(['#000', '#101', '#202', '#303', '#404', '#505','#606','#707','#808',
    '#909','#a0a','#b0b','#c0c','#d0d','#e0e', '#f00']);

  GridMap.initEvents = function() {

    var self = this;
    var scale = 150;
    var drag = d3.behavior.drag()
      .on('dragstart', function () {
        this.cache = self.geojson;
        self.geojson = {features:[]};
      })
      .on('drag', function () {
        self.rotate_longitude += 100 * d3.event.dx / zoom.scale();
        self.rotate_latitude -= 100 * d3.event.dy / zoom.scale();
        self.projection.rotate([self.rotate_longitude, self.rotate_latitude]);
        self.draw();
      })
      .on('dragend', function () {
        self.geojson = this.cache;
        self.draw();
      });

    var zoom = d3.behavior.zoom()
      .on('zoomstart', function() {
        this.cache = self.geojson;
        self.geojson = {features:[]};
      })
      .on('zoomend', function() {
        self.geojson = this.cache;
        self.draw();
      })
      .on('zoom', function(d) {
        scale = d3.event.scale;
        self.area = 20000 / scale / scale;
        self.projection.scale(scale);
        self.draw();
      })
      .scale(this.width/6)
      .scaleExtent([this.width/6, 1000]);

    this.container.call(drag);
    this.container.call(zoom);

  };

  GridMap.init = function (_container, gridSize, options) {

    var self = this;
    this.grid_cols = gridSize[0];
    this.grid_rows = gridSize[1];

    this.container = d3.select(_container);
    var rect = this.container.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.landColor = options.landColor || 'rgba(237,178,48,1)';
    this.seaColor = options.seaColor || 'rgba(21,98,180,.8)';

    var translate = [this.width/2, this.height/2];
    self.area = 1; // minimum area threshold for simplification

    var clip = d3.geo.clipExtent()
        .extent([[-self.width/4, -self.height/4], [self.width/4, self.height/4]]);

    var simplify = d3.geo.transform({
      point: function(x, y, z) {
        if (z >= self.area) {
          this.stream.point(x, y);
        }
      }
    });

    this.projection = options.projection ||
      d3.geo.mollweide()
        .translate(translate)
        .scale(this.width/6)
        .clipExtent([[0, 0], [self.width, self.height]])
        .precision(0.1);

    this.margin = options.margin || {top: 10, right: 10, bottom: 10, left: 10};

    topojson.presimplify(options.countries);

    this.canvas = this.container.append('canvas')
      .datum(topojson.feature(options.countries, options.countries.objects.countries))
      .attr('width', this.width)
      .attr('height', this.height);

    this.context = this.canvas.node().getContext('2d');
    this.colorScale = options.colorScale || defaultColorScale;

    this.path = d3.geo.path()
      .projection({stream: function(s) {return simplify.stream(clip.stream(self.projection.stream(s)));}})
      .context(this.context);

    this.graticulePath = d3.geo.path()
      .projection(this.projection)
      .context(this.context);

    this.initCellIdToCoordinates();
    this.initEvents();
    // d3.select(window).on('resize', this.resize);

    self.draw();
  };

  GridMap.worldGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-180, 90],
              [180, 90],
              [180, -90],
              [-180, -89.9999], // sea doesn't draw if this is -90. get right up on it.
              [-180, 90],
            ]]
          }
        }
      ]
    };

  GridMap.drawWorld = function() {
    // draw world background (the sea)
    this.context.beginPath();
    this.graticulePath(this.worldGeoJSON);
    this.context.fillStyle = this.seaColor;
    this.context.fill();

    // draw countries
    this.context.beginPath();
    this.canvas.each(this.path);
    this.context.strokeStyle = 'rgba(100,100,100,.8)';
    this.context.lineWidth = 1;
    this.context.fillStyle = this.landColor;
    this.context.fill();
    this.context.stroke();

    // overlay graticule.  Requires it's own path so
    // it won't get clipped/simplified
    this.context.beginPath();
    this.graticulePath(this.graticule());
    this.context.lineWidth = 1;
    this.context.strokeStyle = 'rgba(100,100,100,.3)';
    this.context.stroke();
  };

  GridMap.draw = function(_geojson) {
    if (_geojson) {
      this.geojson = _geojson;
    }

    this.context.clearRect(0, 0, this.width, this.height);
    this.drawWorld();

    var self = this;
    if (this.geojson && this.geojson.features) {
      this.geojson.features.forEach(function(feature){
        var color = null;
        if (feature.properties.rgba) {
          color = 'rgba(' + feature.properties.rgba.join(',') + ')';
        } else {
          color = self.scale(feature.properties.value);
        }
        self.context.beginPath();
        self.path(feature);
        self.context.fillStyle = color;
        self.context.fill();
      });
    }
  };

  GridMap.resize = function() {
    this.width = parseInt(this.container.node().style('width'), 10);
    this.width = this.width - this.margin.left - this.margin.right;
    d3.select('canvas').attr('width', this.width);
    this.draw();
  };

  GridMap.setDataUnsparseTypedArray = function (data) {
    this.geojson = this.uInt8ArrayToGeoJSON(data);
    this.draw();
  };
  GridMap.setDataArrayBuffer = function (data) {
    this.geojson = this.arrayBufferToGeoJSON(data);
    this.draw();
  };
  GridMap.setDataGeoJSON = function (data) {
    this.geojson = data;
    this.draw();
  };

  GridMap.uInt8ArrayToGeoJSON = function(array) {
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

  GridMap.arrayBufferToGeoJSON = function(buff) {
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

  GridMap._cellIdToLonLat = function(id) {
      id--;
      var lon = -180 + (id % 720)/720.0 * 360 ;
      var lat = 90 - ~~(id / 720)/2;
      return [lon, lat];
  };

  GridMap.cellIdToCoordinates = [null];

  GridMap.initCellIdToCoordinates = function() {

    var x_size = 0.5; // this.grid_cols / 360;
    var y_size = 0.5; //this.grid_rows / 180;
    for (var i=1; i<=this.grid_rows * this.grid_cols; i++) {
        var lonLat = this._cellIdToLonLat(i);
        var coordinates = [
          lonLat,
          [lonLat[0] + x_size, lonLat[1]],
          [lonLat[0] + x_size, lonLat[1]-y_size],
          [lonLat[0], lonLat[1]-y_size],
          lonLat
        ];
        this.cellIdToCoordinates[i] = coordinates;
    }
  };

})();

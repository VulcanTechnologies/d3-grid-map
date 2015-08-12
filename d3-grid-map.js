(function(){

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


  var defaultScale = d3.scale.quantize()
    .domain([0,255])
    .range(['#000', '#101', '#202', '#303', '#404', '#505','#606','#707','#808',
    '#909','#a0a','#b0b','#c0c','#d0d','#e0e', '#f00']);

  GridMap.init = function (_container, gridSize, options) {
    this.grid_cols = gridSize[0];
    this.grid_rows = gridSize[1];

    this.container = d3.select(_container);
    var rect = this.container.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.countries = options.countries;
    this.projection = options.projection || d3.geo.mollweide();
    this.margin = options.margin || {top: 30, right: 10, bottom: 30, left: 10};

    this.projection.translate([this.width/2, this.height/2]);
    this.projection.scale(this.width/6);
    this.canvas = this.container.append("canvas")
      .attr('width', this.width)
      .attr('height', this.height);

    this.scale = options.scale || defaultScale;

    var self = this;
    var drag = d3.behavior.drag();
    drag
      .on('dragstart', function (d) {
        this.cache = self.geojson;
        self.geojson = {features:[]};
      })
      .on('drag', function (d) {
        self.rotate_longitude += d3.event.dx;
        self.rotate_latitude -= d3.event.dy;
        self.projection.rotate([self.rotate_longitude, self.rotate_latitude]);
        self.draw();
      })
      .on('dragend', function (d) {
        self.geojson = this.cache;
        self.draw();
      });

    var zoom = d3.behavior.zoom();
    zoom
      .on('zoom', function(d) {
        self.projection.scale(d3.event.scale);
        self.draw();
      })
      .scale(this.width/6);

    this.container.call(drag);
    this.container.call(zoom);

    this.context = this.canvas.node().getContext("2d");
    this.path = d3.geo.path()
      .projection(this.projection)
      .context(this.context);

    this.initCellIdToCoordinates();

    d3.select(window).on('resize', this.resize);
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

  GridMap.resize = function() {
    width = parseInt(container.style('width'), 10);
    width = width - margin.left - margin.right;
    d3.select('canvas').attr('width', width);
    change();
  };

  GridMap.arrayBufferToGeoJSON = function(array) {
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

      var coordinates = this.cellIdToCoordinates[cell_id];

      var feature = {
         type: "Feature",
         id: i,
         geometry: {
             type: "Polygon",
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
    var v = new DataView(buff);

    var geojson = {
       type: "FeatureCollection",
       features: []
    };

    var typedArray = new Uint32Array(buff);
    for (var i=0; i<typedArray.length; i++) {
      var packed = typedArray[i];
      var cell_id = packed & 0xfffff;
      var abundance = packed >> 24;

      var coordinates = this.cellIdToCoordinates[cell_id];

      var feature = {
         type: "Feature",
         id: i,
         geometry: {
             type: "Polygon",
             coordinates: [coordinates]
         },
         properties: {value: abundance }
      };
      geojson.features.push(feature);
    }

    return geojson;
  };

  GridMap.drawWorld = function() {
      this.context.beginPath();
      this.path(topojson.feature(this.countries, this.countries.objects.countries_110m));
      this.context.strokeStyle = '#000';
      this.context.fillStyle = 'rgba(17,180,240,.5)';
      this.context.fill();
      this.context.stroke();
      this.context.beginPath();
      this.path(this.graticule());
      this.context.lineWidth = 0.5;
      this.context.strokeStyle = 'rgba(0,0,0,.3)';
      this.context.stroke();
  };

  GridMap.draw = function(_geojson) {
    if (_geojson) {
      this.geojson = _geojson;
    }

    this.context.clearRect(0, 0, this.width, this.height);
    this.drawWorld();

    var gm = this;
    this.geojson.features.forEach(function(feature){
      var color = null;
      if (feature.properties.rgba) {
        color = 'rgba(' + rgba.join(',') + ')';
      } else {
        color = gm.scale(feature.properties.value);
      }
      gm.context.beginPath();
      gm.path(feature);
      gm.context.fillStyle = color;
      gm.context.fill();
    });
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

  d3.geo.GridMap = GridMap;

})();

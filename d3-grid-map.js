(function(){

  var GridMap = {
    width: null,
    height: null,
    grid_rows: null,
    grid_cols: null,
    grid: null,
    countries: null,
    canvas: null,
    context: null,
    margin: null,
    projection: null, // d3.geo.mollweide(),
    graticule: d3.geo.graticule(),
    geojson: null,
    run: false,
    rotate_longitude: 0,
    rotate_latitude: 0,
    path: null,
    cache: null,
    container: null,
  };


  GridMap.scale = d3.scale.quantize()
    .domain([0,255])
    .range(['#00f', '#10e', '#20d', '#30c', '#40b', '#50a','#609','#708','#807',
    '#906','#a05','#b04','#c03','#d02','#e01', '#f00']);

  GridMap.init = function (_container, gridSize, options) {
    this.grid_cols = gridSize[0];
    this.grid_rows = gridSize[1];

    this.container = d3.select(_container);
    var rect = this.container.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.countries = options.countries;
    this.projection = options.projection || d3.geo.molleweide();
    this.margin = options.margin || {top: 30, right: 10, bottom: 30, left: 10};

    this.projection.translate([this.width/2, this.height/2]);
    this.projection.scale(this.width/6);
    this.canvas = this.container.append("canvas")
      .attr('width', this.width)
      .attr('height', this.height);

    var self = this;
    var drag = d3.behavior.drag();
    drag
      .on('dragstart', function (d) {
        this.cache = this.geojson;
        this.geojson = {features:[]};
      })
      .on('drag', function (d) {
        self.rotate_longitude += d3.event.dx;
        self.rotate_latitude -= d3.event.dy;
        self.projection.rotate([self.rotate_longitude, self.rotate_latitude]);
        self.draw();
      })
      .on('dragend', function (d) {
        this.geojson = this.cache;
        this.draw();
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

  GridMap.setData = function (data) {
    // this.grid = grid;
    if (data.byteLength >= 0) {
      // ArrayBuffer
      this.geojson = this.buff2GeoJSON(data);
    }
    this.draw();
  };

  GridMap.resize = function() {
    width = parseInt(container.style('width'), 10);
    width = width - margin.left - margin.right;
    d3.select('canvas').attr('width', width);
    change();
  };

  GridMap.buff2GeoJSON = function(buff) {
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
         properties: {abundance: abundance }
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
      var color = gm.scale(feature.properties.value);
      console.log(feature);
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

  d3.geo.gridmap = GridMap;

})();

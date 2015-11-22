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

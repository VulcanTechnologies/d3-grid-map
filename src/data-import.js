var Grid = require('./grid.js');

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

  float32ArrayToGrid: function(rawData, gridSize, colorScale) {
    // given an ArrayBuffer buff containing a 1 dimensional
    // sequence of 32 bit floats, returns a Grid

    var w = gridSize[1];
    var h = gridSize[0];

    var colorData = new Uint32Array(w*h);

    for (var i=0, len=rawData.length; i<len; i++) {
      var value = rawData[i];
      if(isNaN(value)) {
        continue;
      }
      // var color = d3.rgb(colorScale(value));
      // var colorInt = (255 << 24) |
      //                      (color.b << 16) |
      //                      (color.g << 8) |
      //                      color.r;

      colorData[i] = colorScale(value);

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

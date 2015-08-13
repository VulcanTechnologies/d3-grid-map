d3-grid-map
===========
D3 gridded data set mapper

This package will create a geographic map using D3 in the container of your choosing, 
which will plot a gridded global data set passed to it.

Country outlines are drawn from the included countries.topojson data.

Usage
=====
Pass a DOM container selector string, the grid size, and optional arguments to
d3.geo.GridMap.init()

The data for the grid can be set by one of several methods:

    // given an ArrayBuffer buff containing data in
    // packed binary format, returns GeoJSON

    // The packed binary format is expected to be
    // a sequence of Uint32 elements in which the most
    // significant byte is the cell value and the
    // lowest 3 bytes represent the cell ID.
    GridMap.setDataArrayBufferToGeoJSON(buffer)

    // given a UInt8ClampedArray containing data in
    // RGBA format, returns GeoJSON

    // The format is expected to be
    // a sequence of Uint8 elements representing RGBA
    // values for each cell from cell ID 1 to the final cell ID,
    // in column first order.
    GridMap.setDataUnsparseTypedArray(data)

    // if data is already in geojson:
    GridMap.setDataGeoJSON(geojson) 


Example
=====
d3.json('data/countries.topojson', function(error, countries) {
  var options = {
    countries: countries
  };
  var gridSize = [720, 360];

  var map = d3.geo.GridMap;

  map.init('#gridmap', gridSize, options);

  map.setDataArrayBuffer(data);
});

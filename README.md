d3-grid-map
===========
D3 gridded data set mapper

This package will create a geographic map using D3 in the container of your choosing,
which will plot a gridded global data set passed to it.

Country outlines can be drawn from the included countries.topojson data.

Usage
=====
Pass a DOM container selector string and optional arguments to
d3.geo.GridMap to initiale a GridMap object, then add data sets
via its setData() method.

The data can be in several forms, all handled by setData:

    var map = new d3.geo.GridMap('#container');

    // an ArrayBuffer buff containing data in
    // packed binary format

    // The packed binary format is expected to be
    // a sequence of Uint32 elements in which the most
    // significant byte is the cell value and the
    // lowest 3 bytes represent the cell ID.
    map.setData(buffer, {gridSize: [10, 10]});

    // a UInt8ClampedArray containing data in
    // RGBA format

    // The format is expected to be
    // a sequence of Uint8 elements representing RGBA
    // values for each cell from cell ID 1 to the final cell ID,
    // in column first order.
    map.setData(data,  {gridSize: [10, 10]});

    // a geojson or topojson object:
    map.setData(geojson);

The order of addition affects the rendering order.

Example
=====
    d3.json('data/countries.topojson', function(error, countries) {

      var gridSize = [720, 360];

      var options = {
        hud: {
          fontSize: 20,
          fontColor: 'white',
          verticalOffset: 5
        },
        projection: d3.geo.aitoff(),
        onCellHover: function(feature) { console.debug('hovering over ', feature);}
      };

      var map = d3.geo.GridMap('#container', options);

      map.setData(countries);

      map.setData(data, {gridSize: gridSize});
    });

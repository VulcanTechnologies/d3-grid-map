d3-grid-map
===========
D3 gridded data set mapper

[See demo](http://vulcantechnologies.github.io/d3-grid-map/)

This package will draw a geographic map on an html5 canvas using D3 in the container of your choosing.
Gridded and vector data layers can be added to the returned map object using its addLayer method.

For instance, land outlines can be drawn from the included countries.topojson data.

Usage
=====
Pass a DOM container selector string and optional arguments to
d3.geo.GridMap to initialize a GridMap object, then add data sets
via its addLayer() method.

The data can be in several forms, all handled by addLayer:

    var map = new d3.geo.GridMap('#container');

    // an ArrayBuffer buff containing data in
    // packed binary format

    // The packed binary format is expected to be
    // a sequence of Uint32 elements in which the most
    // significant byte is the cell value and the
    // lowest 3 bytes represent the cell ID.
    var layer1 = map.addLayer(buffer, {gridSize: [10, 10]});

    // a UInt8ClampedArray containing data in
    // RGBA format

    // The format is expected to be
    // a sequence of Uint8 elements representing RGBA
    // values for each cell from cell ID 1 to the final cell ID,
    // in column first order.
    var layer2 = map.addLayer(data,  {gridSize: [10, 10]});

    // a geojson or topojson object:
    var layer3 = map.addLayer(geojson);

Options
=======
map.addLayer(data, options)

options:
 - zIndex - higher numbers will be stacked on top of lower numbers

Example
=======
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

      map.addLayer(countries, {zIndex: 1});

      map.addLayer(data, {gridSize: gridSize, zIndex: 2});
    });

Development
===========

install dependencies with

    npm install
    bower install

Then build with

    make

To start up an autoreloading development server on the demo index.html:

    make develop

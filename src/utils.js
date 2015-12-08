
var Utils = {

  colorStringToUint32: function(colorString) {
    // given a colorString handleable by d3.rgb ("#ffffff"),
    // converts it to a 32 bit integer which can
    // be inserted in canvas array.
    var rgb = d3.rgb(colorString);
    return (255 << 24)   |
            (rgb.b << 16) |
            (rgb.g << 8)  |
            rgb.r;
  }

};

module.exports = Utils;

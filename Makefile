all:
	browserify src/index.js -o d3-grid-map.js
	browserify src/index.js -g uglifyify  -o d3-grid-map.min.js

develop:
	beefy src/index.js:d3-grid-map.js --live --open

clean:
	rm d3-grid-map.js d3-grid-map.min.js

# Textures of the home page's descent

Public-domain NASA imagery, resized for the web (see `web/src/components/home/DescentScene.tsx`):

- `earth-day.jpg`: NASA Visible Earth, Blue Marble Next Generation (NASA Goddard Space Flight Center).
- `earth-night.jpg`: NASA Earth Observatory, Earth at Night (Black Marble).
- `earth-clouds.jpg`, `earth-water.jpg`: Blue Marble cloud and water masks.
- `moon.jpg`, `moon-bump.jpg`: NASA Scientific Visualization Studio, CGI Moon Kit (LRO LROC colour and LOLA elevation).

Copied from the example images of the MIT-licensed `three-globe` and `globe.gl` npm packages
(Vasco Asturiano), which redistribute these NASA maps; NASA's own hosts were not reachable when this
was built. `moon-still.jpg` and `earth-still.jpg` one folder up are the Moon and Earth cut from a still of
the scene, for the first paint and for browsers without WebGL; the page places them where the words leave room.

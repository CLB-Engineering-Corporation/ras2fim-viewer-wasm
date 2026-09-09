/* Per-deployment settings. This is the one file that differs between a local
   preview and a published release, so it stays small and free of logic. */
window.FIMCFG = {
  manifest: "manifest.json",

  /* Where the depth COGs are tiled from.

     In production this is a same-origin path -- "/fim-tiles" -- proxied by nginx
     to TiTiler, which is what keeps it free of CORS and safe under HTTPS.

     In local preview the tile server is a second port, and the host has to be
     the one that served THIS page, not a literal. A hardcoded "127.0.0.1:8102"
     works only when the browser is on the same machine as the server: opened
     from a phone or another workstation it points the viewer at their own
     loopback, and the page loads with every vector layer present and no depth
     grid at all -- a failure that looks like missing data rather than a bad URL. */
  rasterTileBase: location.protocol + "//" + location.hostname + ":8102",

  initialCenter: [-97.23, 30.09],
  initialZoom: 9.5
};

/* Optional public endpoints. Keep both empty in local builds; never place secrets here. */
window.PATENTEB_CONFIG = Object.assign({
  videoManifestEndpoint: '',
  edgeTtsEndpoint: ''
}, window.PATENTEB_CONFIG || {});

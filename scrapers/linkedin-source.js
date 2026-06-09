// scrapers/linkedin-source.js
/**
 * LinkedIn jobs source: builds the Bright Data discover input matrix and
 * normalizes returned records into the posting shape the scoring modules use.
 */

/**
 * Build the Bright Data discover-by-keyword input array:
 * cartesian product of (discovery_archetypes' keywords) × locations.
 * Provenance keys (_archetype, _locationLabel) are attached for normalization
 * and MUST be stripped before sending to Bright Data (see toApiInput).
 * @param {object} config - parsed linkedin-queries.yml
 * @returns {Array<object>}
 */
export function buildInputs(config) {
  const { defaults = {}, locations = [], discovery_archetypes = [], archetypes = {} } = config;
  const inputs = [];
  for (const archKey of discovery_archetypes) {
    const keywords = archetypes[archKey]?.keywords || [];
    for (const keyword of keywords) {
      for (const loc of locations) {
        inputs.push({
          location: loc.location || '',
          keyword,
          country: defaults.country || '',
          time_range: defaults.time_range || '',
          job_type: loc.job_type || '',
          experience_level: defaults.experience_level || '',
          remote: loc.remote || '',
          company: '',
          location_radius: '',
          _archetype: archKey,
          _locationLabel: loc.label || '',
        });
      }
    }
  }
  return inputs;
}

/**
 * Strip provenance keys (underscore-prefixed) so the object matches the
 * exact Bright Data input schema.
 * @param {object} input
 * @returns {object}
 */
export function toApiInput(input) {
  const clean = {};
  for (const [k, v] of Object.entries(input)) {
    if (!k.startsWith('_')) clean[k] = v;
  }
  return clean;
}

/**
 * Split an array into chunks of size n.
 * @param {Array} arr
 * @param {number} n
 * @returns {Array<Array>}
 */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

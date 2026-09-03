/**
 * Location targeting.
 *
 * Locations come from `GET /geo_lookup/search` and are referenced by id on
 * `campaign.targeting.locations.include`. A campaign supports up to 2,500.
 *
 * The endpoint takes `q` and `limit` and nothing else — there is no entity-type
 * filter, no country filter and no cursor. Anything that looks like one in the
 * UI would be a control that silently does nothing.
 */
export interface GeoLocationResult {
  id: string;
  name: string;
  /** e.g. country / region / city / postal_code. Free-form in the spec. */
  type: string;
  /** Fully qualified, e.g. "Mumbai, Maharashtra, India". */
  canonical_name: string;
  country_code: string;
  region_code: string | null;
  parent_id: string | null;
  parent_country: string | null;
}

/**
 * `/geo_lookup/search` does NOT use the standard `{ object, data }` list
 * envelope that the rest of the API uses. It returns its own shape.
 */
export interface GeoSearchResponse {
  query: string;
  count: number;
  results: GeoLocationResult[];
}

/**
 * Location targeting.
 *
 * Locations come from `GET /geo_lookup/search` and are referenced by id on
 * `campaign.targeting.locations.include`. A campaign supports up to 2,500.
 */
export interface GeoLocationResult {
  id: string;
  name: string;
  type: "country" | "region" | "dma" | (string & {});
  country_code?: string;
  region_code?: string;
}

export interface GeoSearchResponse {
  object: string;
  data: GeoLocationResult[];
  has_more?: boolean;
}

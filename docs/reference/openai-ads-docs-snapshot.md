# Ads — full documentation

> Single-file Markdown export of the Ads docs for creating ads from static creatives or product feeds in ChatGPT and measuring website conversions.

Curated index: https://developers.openai.com/ads/llms.txt

# Overview

The Advertiser API lets you manage ad campaigns, ad groups, ads, files, and
reporting from one API. It supports CRUD-like functions with standard JSON content types.

## Authentication

Issue an API key in the Settings tab of [Ads Manager](https://ads.openai.com).
Each key is scoped to one ad account.

Pass the key as a bearer token on every request:

```bash
Authorization: Bearer $OPENAI_ADS_API_KEY
```

The Ads API works in the context of one ad account. API partners should use
  the key associated with the client account they are configuring. See [API
  Partner Setup](https://developers.openai.com/ads/api-partner-setup). To request partner access, [contact
  us](https://openai.com/advertisers/).

## Endpoints

| Resource                  | Use for                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Ad Account                | Update and retrieve metadata for the current ad account.                                   |
| Campaigns                 | Create, list, retrieve, update, and change campaign state.                                 |
| Ad Groups                 | Create, list, retrieve, update, and change ad group state.                                 |
| Ads                       | Create, list, retrieve, update, and change ad state.                                       |
| Insights                  | Retrieve performance data across ad account, campaign, ad group, and ad scopes.            |
| Files                     | Upload creative assets for use in ads.                                                     |
| Audiences                 | Create, add to, remove from, replace, merge, list, retrieve, and archive custom audiences. |
| [Bulk API](https://developers.openai.com/ads/bulk-api) | Create or update campaigns, ad groups, and ads in an asynchronous job.                     |
| Product Feeds             | Use a merchant catalog to create product-feed campaigns.                                   |
| Conversions               | Create pixels, server-side keys, and conversion event settings when enabled.               |

Every resource belongs to the ad account associated with the API key. OpenAI
must enable programmatic brand updates and conversion management for the
account. Contact your OpenAI partner representative if these operations are not
available for the account.

Use the [Quickstart](https://developers.openai.com/ads/api-quickstart) for a minimal end-to-end workflow, or go
directly to the [API Reference](https://developers.openai.com/ads/api-reference/authentication). API partners
can start with [API Partner Setup](https://developers.openai.com/ads/api-partner-setup). To advertise
from a merchant catalog, see [Product Feeds](https://developers.openai.com/ads/product-feeds).
To target customer or prospect lists, see
[Custom Audiences](https://developers.openai.com/ads/custom-audiences).

## Object statuses

For an ad to show to users, the ad and its parent ad group and campaign all
have to be enabled. The ad also has to be reviewed. Reviews typically take only
a few minutes. Monitor the status with the `review_status` field.

## Rate limits

The Advertiser API enforces limits by both ad account and IP address:

| Scope        | Limit                     |
| ------------ | ------------------------- |
| Per endpoint | 600 requests per minute   |
| Overall      | 1,200 requests per minute |

Requests must stay within both the ad-account and IP-address limits.

Bulk job creation has a separate limit of 10 requests per 10 seconds for each
ad account. See [Bulk API limits](https://developers.openai.com/ads/bulk-api#limits-and-retries).

## OpenAPI spec

[{"Download the OpenAPI spec"}](https://developers.openai.com/ads/openapi.json)

## Changelog

### August 25th, 2026

- Added custom audience Add, Remove, Replace, and Merge operations, automatic identifier matching, and support for small and empty exclusion-only audiences. See [Custom Audiences](https://developers.openai.com/ads/custom-audiences).

### July 16th, 2026

- Added support for passing the Pixel browser reference as `events[].user.obref` in [Conversions API](https://developers.openai.com/ads/conversions-api) requests.

### June 16th, 2026

- Added conversion-optimized campaign bidding with `bidding_type: "conversions"` and one standard conversion event setting.

### June 11th, 2026

- Added segmented insights for product, country, and device breakdowns, plus zero-impression product expansion.

### June 3rd, 2026

- Added location targeting support, including `/geo_lookup/search` and campaign `targeting.locations.include` for country, region, and DMA location IDs.
- Added conversion setup and reporting endpoints for API keys, pixels, event settings, and conversion insights.

### v1

- Published the initial API version.

---

# API Partner Setup

API partners can use the Ads API to configure measurement and campaign
resources for client accounts. Use the API key associated with the client ad
account for every request in this guide.

## Before you begin

You need:

- An Ads API key for the client ad account.
- Access to the client's website and brand assets.
- A server-side secret manager for the Ads API key and any Conversions API keys you create.

Send requests to `https://api.ads.openai.com/v1`. Store the account's Ads API
key in `OPENAI_ADS_API_KEY` for the examples in this guide.

Brand updates, pixel management, and Conversions API key creation must be
enabled for the client account. If a brand update returns `403`, or
`/conversions/pixels` or `/conversions/api_keys` returns `404` with `Not found`,
contact your OpenAI partner representative. A `Client data source not found`
response means an event setting references a source that does not exist in the
current ad account.

Conversion-optimized campaigns must also be enabled for the client account. If
campaign creation returns `403` with `Conversion bidding is not enabled`,
contact your OpenAI partner representative.

## 1. Confirm account access

Use `GET /ad_account` to verify that the key is associated with the intended
client account:

```bash
curl -X GET "https://api.ads.openai.com/v1/ad_account" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "id": "adacct_123",
  "name": "Acme Ads",
  "url": "https://www.acme.example",
  "preview_url": null,
  "status": "active",
  "timezone": "America/New_York",
  "currency_code": "USD",
  "review": {
    "status": "approved"
  }
}
```

Check the account name, URL, time zone, and currency before you create campaign
resources. Contact your OpenAI partner representative if the account details or
API access are incorrect.

<a id="2-add-a-brand-favicon"></a>

## 2. Add a brand icon

An account cannot serve ads until its brand review is approved. If
`review.reason` is `missing_favicon`, upload and assign a brand icon before you
create active campaign resources.

First, upload an image with `purpose` set to `account_favicon`. The image must be
at least 128 × 128 pixels. You can pass the client's website URL and let the API
resolve a suitable icon:

```bash
curl -X POST "https://api.ads.openai.com/v1/upload" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://www.acme.example",
    "purpose": "account_favicon"
  }'
```

Save the returned `file_id`, then assign it to the account:

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_account/brand" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "favicon_file_id": "file_123"
  }'
```

The brand update starts a review. Poll `GET /ad_account` until `review.status`
is `approved`. If the status is `rejected`, use `review.reason` to correct the
brand metadata before you activate a campaign.

## 3. Configure conversions

Create conversion resources before you instrument the client's site.

First, create a web pixel:

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/pixels" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme website",
    "client_type": "web"
  }'
```

Save both returned identifiers. Use `id` when you create an event setting and
use `pixel_id` when you send conversion events.

```json
{
  "id": "clidsrc_123",
  "client_type": "web",
  "name": "Acme website",
  "pixel_id": "134534..."
}
```

Web pixels created through the Ads API automatically use [automatic advanced
matching](https://developers.openai.com/ads/measurement-pixel#automatic-advanced-matching).

Next, create a server-side Conversions API key:

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/api_keys" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme production conversions"
  }'
```

Store the returned `api_key` in a server-side secret manager. Use this key only
to send conversion events; do not expose it in browser code.

Finally, define the conversion event you want to measure or optimize for:

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/event_settings" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Purchases",
    "event_type": "order_created",
    "attribution_window_days": 30,
    "source_ids": ["clidsrc_123"]
  }'
```

Save the returned event setting `id`. For endpoint fields and responses, see
[Conversion Setup](https://developers.openai.com/ads/api-reference/conversion-setup). To implement event
delivery, use the [JavaScript Pixel](https://developers.openai.com/ads/measurement-pixel), the
[Conversions API](https://developers.openai.com/ads/conversions-api), or both with shared event IDs for
deduplication.

When you send conversion events on behalf of a client, include the same
`integration_source` identifier on every request. See [Identify partner
integrations](https://developers.openai.com/ads/conversions-api#identify-partner-integrations) for the
request format and naming requirements.

## 4. Create campaigns and ads

Follow the [Quickstart](https://developers.openai.com/ads/api-quickstart) to create a campaign, ad
group, creative asset, and ad in the correct order. For partner setup, create
the campaign as `paused` instead of `active`, then activate it after all child
resources are ready.

To create a conversion-optimized campaign (oCPC), set `bidding_type` to
`conversions` and pass exactly one event setting ID. For the bidding model,
prerequisites, and reporting guidance, see [Conversion-Optimized
Campaigns](https://developers.openai.com/ads/conversion-optimized-campaigns).

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme purchases",
    "status": "paused",
    "budget": {
      "lifetime_spend_limit_micros": 250000000
    },
    "bidding_type": "conversions",
    "conversion_event_setting_ids": ["ces_123"]
  }'
```

The event setting must be active, belong to the current ad account, connect to
one active conversion source, and use an event from [Supported
Events](https://developers.openai.com/ads/supported-events), such as `order_created`, `lead_created`, or
`registration_completed`. Custom events cannot be optimization goals.
For product-feed campaigns in open beta, use the same campaign endpoint and add
`mode: "product_feed"` and the linked `product_feed_id`. You cannot change the
campaign objective or selected conversion event after creation.

Next, create each ad group with `billing_event_type` set to `click`. For an
oCPC campaign, `max_bid_micros` is the CPA bid; for example, `100000000` is a
$100.00 CPA bid for a USD account.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "US English",
    "status": "active",
    "bidding_config": {
      "billing_event_type": "click",
      "max_bid_micros": 100000000
    }
  }'
```

Create campaigns as `paused` while you add and validate their ad groups and ads.
Activate the campaign only after all child resources are ready.

## Next steps

- [Authentication](https://developers.openai.com/ads/api-reference/authentication)
- [Ad Account](https://developers.openai.com/ads/api-reference/ad-account)
- [Conversion Setup](https://developers.openai.com/ads/api-reference/conversion-setup)
- [Campaigns](https://developers.openai.com/ads/api-reference/campaigns)
- [Ad Groups](https://developers.openai.com/ads/api-reference/ad-groups)
- [Ads](https://developers.openai.com/ads/api-reference/ads)
- [Files](https://developers.openai.com/ads/api-reference/files)
- [Insights](https://developers.openai.com/ads/api-reference/insights)

---

# Quickstart

The Ads API can programmatically create ad campaigns and monitor your results. This guide covers the minimal implementation to get an ad live, and check your results.

## Ad Structure

Ads live inside an Ad Group, and Ad Groups live inside a Campaign. Campaigns and Ad Groups define your budget and targeting, while Ads host your Ad's title, description and images.

## 1. Confirm access to your ad account

Issue an API key in the Settings tab of your [Ads Manager](https://ads.openai.com) account. See the [authentication reference](https://developers.openai.com/ads/api-reference/authentication) for more info.

Call `GET /ad_account` to confirm that your bearer token works and that
you are using the right account:

```bash
curl -X GET "https://api.ads.openai.com/v1/ad_account" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Accept: application/json"
```

Response:

```json
{
  "id": "adacct_123",
  "name": "Acme Ads",
  "url": "https://www.acme.example",
  "preview_url": null,
  "status": "active",
  "timezone": "UTC",
  "currency_code": "USD",
  "review": {
    "status": "approved"
  }
}
```

## 2. Upload a creative asset

Upload a remote image and store the returned `file_id`. You'll use it when
you create the ad.

```bash
curl -X POST "https://api.ads.openai.com/v1/upload" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/assets/workspace-planner-card.png"
  }'
```

Response:

```json
{
  "file_id": "file_901"
}
```

If you already have a local file, the same endpoint also accepts
`multipart/form-data`.

## 3. Create a campaign

Create the top-level campaign first. Save the returned campaign ID for the next
step.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spring launch",
    "status": "active",
    "budget": {
      "lifetime_spend_limit_micros": 25000000
    }
  }'
```

Response:

```json
{
  "id": "cmpn_101",
  "created_at": 1735689600,
  "status": "active",
  "bidding_type": "impressions",
  "budget": {
    "lifetime_spend_limit_micros": 25000000
  },
  "conversion_event_setting_ids": [],
  "description": null,
  "end_time": null,
  "mode": null,
  "name": "Spring launch",
  "start_time": null,
  "targeting": {},
  "updated_at": 1735689600
}
```

## 4. Create an ad group

Create an ad group inside the campaign. Save the returned ad group ID for the
ad creation step.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "US English",
    "status": "active",
    "context_hints": ["productivity", "team collaboration"],
    "bidding_config": {
      "billing_event_type": "impression",
      "max_bid_micros": 60000
    }
  }'
```

Response:

```json
{
  "id": "adgrp_301",
  "created_at": 1735689700,
  "updated_at": 1735689700,
  "name": "US English",
  "description": null,
  "context_hints": ["productivity", "team collaboration"],
  "status": "active",
  "bidding_config": {
    "billing_event_type": "impression",
    "max_bid_micros": 60000
  }
}
```

## 5. Create an ad

Create the ad with a `chat_card` creative and attach the uploaded asset by
`file_id`.

```bash
curl -X POST "https://api.ads.openai.com/v1/ads" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ad_group_id": "adgrp_301",
    "name": "Planner launch card",
    "status": "active",
    "creative": {
      "type": "chat_card",
      "title": "Try the new workspace planner",
      "body": "Coordinate tasks, docs, and meetings in one place.",
      "target_url": "https://example.com/workspace-planner",
      "file_id": "file_901"
    }
  }'
```

Response:

```json
{
  "id": "ad_501",
  "name": "Planner launch card",
  "created_at": 1735689800,
  "updated_at": 1735689800,
  "creative": {
    "type": "chat_card",
    "title": "Try the new workspace planner",
    "body": "Coordinate tasks, docs, and meetings in one place.",
    "file_id": "file_901",
    "image_url": "https://cdn.openai.com/ads/file_901.png",
    "target_url": "https://example.com/workspace-planner"
  },
  "status": "active",
  "review_status": "in_review"
}
```

## 6. Retrieve insights

Once the ad is serving, retrieve performance data from the ad-level insights
endpoint.

```bash
curl -sS -G "https://api.ads.openai.com/v1/ads/ad_501/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "time_granularity=daily" \
  --data-urlencode "limit=7"
```

```json
{
  "object": "list",
  "count": 1,
  "data": [
    {
      "id": "start=1775088000:end=1775174400:entity_id=ad_501",
      "readable_time": "2026-04-02",
      "timezone": "UTC",
      "impressions": 15548,
      "clicks": 312,
      "spend": 42.75,
      "start_time": 1775088000,
      "end_time": 1775174400
    }
  ],
  "first_id": "start=1775088000:end=1775174400:entity_id=ad_501",
  "last_id": "start=1775088000:end=1775174400:entity_id=ad_501",
  "has_more": false
}
```

## Next steps

Once the basic flow works, use the full reference for each part of the
integration:

- [Authentication](https://developers.openai.com/ads/api-reference/authentication)
- [Ad Account](https://developers.openai.com/ads/api-reference/ad-account)
- [Campaigns](https://developers.openai.com/ads/api-reference/campaigns)
- [Ad Groups](https://developers.openai.com/ads/api-reference/ad-groups)
- [Ads](https://developers.openai.com/ads/api-reference/ads)
- [Campaign Targeting](https://developers.openai.com/ads/campaign-targeting)
- [Product Feeds](https://developers.openai.com/ads/product-feeds)
- [Insights](https://developers.openai.com/ads/api-reference/insights)
- [Files](https://developers.openai.com/ads/api-reference/files)

---

# Ad Account

## Update account brand metadata

Set the account name or favicon and start a new brand review.
At least one of `name` or `favicon_file_id` is required.
This operation must be enabled for the ad account. If it returns `403`, contact
your OpenAI partner representative.

`POST /ad_account/brand`

| Field             | Type   | Required | Notes                                               |
| ----------------- | ------ | -------- | --------------------------------------------------- |
| `name`            | string | No       | Updated account display name.                       |
| `favicon_file_id` | string | No       | File ID uploaded with `purpose: "account_favicon"`. |

Upload the favicon with the [file endpoint](https://developers.openai.com/ads/api-reference/files#upload-an-account-favicon),
then assign it to the account:

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_account/brand" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "favicon_file_id": "file_123"
  }'
```

The response includes the updated account. Poll `GET /ad_account` until
`review.status` is `approved`. An account with any other review status cannot
serve ads.

## Get ad account metadata

Fetch metadata for the current ad account.

`GET /ad_account`

This endpoint takes no request body or query parameters.

```bash
curl -X GET "https://api.ads.openai.com/v1/ad_account" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "id": "adacct_123",
  "name": "Acme Ads",
  "url": "https://www.acme.example",
  "preview_url": null,
  "status": "active",
  "timezone": "UTC",
  "currency_code": "USD",
  "review": {
    "status": "approved"
  }
}
```

The response includes:

- `id` for the ad account
- `name` for the display name
- `url` for the primary destination
- `preview_url` for the favicon preview URL when one is available
- `status` when an account status is available
- `timezone` for the ad account timezone
- `currency_code` for the account currency
- `review` for the account's brand review status

---

# Ad Groups

## List ad groups

List ad groups for a campaign.

`GET /ad_groups`

| Parameter     | Type    | Required | Notes                              |
| ------------- | ------- | -------- | ---------------------------------- |
| `campaign_id` | string  | Yes      | Parent campaign ID.                |
| `limit`       | integer | No       | Between `1` and `500`. Default 20. |
| `after`       | string  | No       | Cursor for the next page.          |
| `before`      | string  | No       | Cursor for the previous page.      |
| `order`       | string  | No       | `asc` or `desc`.                   |

```bash
curl -X GET "https://api.ads.openai.com/v1/ad_groups?campaign_id=cmpn_101&limit=10" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "adgrp_301",
      "created_at": 1735689700,
      "updated_at": 1735776100,
      "name": "US English",
      "description": "Primary English-speaking audience.",
      "context_hints": ["productivity", "team collaboration"],
      "status": "active",
      "bidding_config": {
        "billing_event_type": "impression",
        "max_bid_micros": 60000
      }
    }
  ],
  "first_id": "adgrp_301",
  "last_id": "adgrp_301",
  "has_more": false
}
```

## Create an ad group

Create an ad group for a campaign.

`POST /ad_groups`

| Field                                                                    | Type     | Required              | Notes                                                                               |
| ------------------------------------------------------------------------ | -------- | --------------------- | ----------------------------------------------------------------------------------- |
| `campaign_id`                                                            | string   | Yes                   | Parent campaign ID.                                                                 |
| `name`                                                                   | string   | Yes                   | `3` to `1000` chars and must include a non-space character.                         |
| `description`                                                            | string   | No                    | Ad group description.                                                               |
| `context_hints`                                                          | string[] | No                    | Free-form audience or placement hints.                                              |
| `status`                                                                 | string   | Yes                   | `active` or `paused`.                                                               |
| `bidding_config.billing_event_type`                                      | string   | Yes                   | `impression` for impression campaigns; `click` for click and conversion campaigns.  |
| `bidding_config.max_bid_micros`                                          | integer  | Yes                   | Minimum `1`; the maximum depends on campaign bidding type and account currency.     |
| `bidding_config.custom_audience_bid_multipliers`                         | object[] | No                    | Bid adjustments for ready audiences eligible for bid multipliers.                   |
| `bidding_config.custom_audience_bid_multipliers[].custom_audience_id`    | string   | Yes, in each item     | An audience returned by `GET /custom_audiences?intended_use=bid_multiplier`.        |
| `bidding_config.custom_audience_bid_multipliers[].bid_multiplier_micros` | integer  | Yes, in each item     | `100000` to `10000000`, representing 0.1× to 10×.                                   |
| `product_set`                                                            | object   | No                    | Inherits the campaign's feed when omitted. Include only to specify product filters. |
| `product_set.product_feed_id`                                            | string   | Yes, in `product_set` | Must match the campaign's product feed.                                             |
| `product_set.filters`                                                    | object[] | No                    | Product filters. Don't repeat the same field within one product set.                |
| `product_set.filters[].field`                                            | string   | Yes, in each filter   | Feed attribute to filter.                                                           |
| `product_set.filters[].operator`                                         | string   | Yes, in each filter   | `in`, `gt`, `gte`, `lt`, or `lte`.                                                  |
| `product_set.filters[].values`                                           | string[] | Yes, in each filter   | Match values. Send numeric comparison values as strings, such as `"4.5"`.           |

### Field notes

To adjust bids for matched customers without changing campaign eligibility,
see [Custom Audiences](https://developers.openai.com/ads/custom-audiences#adjust-bids-for-an-audience).

Small audiences can be eligible for campaign exclusion without meeting the
minimum size for bid adjustments. Don't infer bid eligibility from `ready`
status or a matched-count range. The server validates eligibility when you
save the ad group.

Product-set filters support `title`, `body`, `item_id`, `offer_id`, `price`,
`target_url`, `image_url`, `product_category`, `brand`, `seller_name`,
`external_seller_id`, `star_rating`, `condition`, and `age_group`. Use `gt`,
`gte`, `lt`, and `lte` only with `price` or `star_rating`.

Context hints provide extra information on when you think your ads might be useful, and help guide when they appear. Provide a list of descriptions or keywords for when the product or service might be useful to show.

Micros are millionths of the main currency unit, for example, dollars. The
`max_bid_micros` field is per event, so a $60 CPM ($0.06 per impression) is
passed as `60000` to the API. Currency fields respect your ad account's default
currency.

For a conversion-optimized campaign (oCPC), set
`bidding_config.billing_event_type` to `click`. `max_bid_micros` is the CPA
bid even though the billing event is a click. For example, `100000000` is a
$100.00 CPA bid for a USD account. For a product-feed oCPC campaign in open
beta, use the same `POST /ad_groups` endpoint. The ad group automatically
inherits the campaign's product feed. Include `product_set` only when you want
to specify product filters; its `product_feed_id` must match the campaign's
feed. For the full setup and reporting workflow, see
[Conversion-Optimized Campaigns](https://developers.openai.com/ads/conversion-optimized-campaigns) and
[Product Feeds](https://developers.openai.com/ads/product-feeds).

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "US English",
    "description": "Primary English-speaking audience.",
    "context_hints": ["productivity", "team collaboration"],
    "status": "active",
    "bidding_config": {
      "billing_event_type": "impression",
      "max_bid_micros": 60000
    }
  }'
```

## Retrieve an ad group

Fetch one ad group by ID.

`GET /ad_groups/{ad_group_id}`

```bash
curl -X GET "https://api.ads.openai.com/v1/ad_groups/adgrp_301" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

## Update an ad group

Update an ad group with `POST`.

`POST /ad_groups/{ad_group_id}`

All fields are optional on update. `description` can be set to `null` to clear
it. If you include `bidding_config`, send the full object. `status` accepts
`active`, `paused`, or `archived`. For a product-feed campaign, include the full
`product_set` object to change the feed or its filters. Retrieve the ad group
after the update if you need the resulting `product_set`; the immediate update
response can omit it.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups/adgrp_301" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "context_hints": ["productivity", "workflow automation"],
    "status": "paused",
    "bidding_config": {
      "billing_event_type": "impression",
      "max_bid_micros": 75000
    }
  }'
```

## Change state with dedicated actions

The Ads API also exposes explicit state transitions. Paused ad groups won't deliver ads to customers. Only archive objects you have no further use for, as archiving isn't reversible.

- `POST /ad_groups/{ad_group_id}/activate`
- `POST /ad_groups/{ad_group_id}/pause`
- `POST /ad_groups/{ad_group_id}/archive`

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups/adgrp_301/archive" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "id": "adgrp_301",
  "created_at": 1735689700,
  "updated_at": 1735948800,
  "name": "US English",
  "description": "Primary English-speaking audience.",
  "context_hints": ["productivity", "team collaboration"],
  "status": "archived",
  "bidding_config": {
    "billing_event_type": "impression",
    "max_bid_micros": 60000
  }
}
```

---

# Ads

## List ads

List ads for an ad group.

`GET /ads`

| Parameter     | Type    | Required | Notes                              |
| ------------- | ------- | -------- | ---------------------------------- |
| `ad_group_id` | string  | Yes      | Parent ad group ID.                |
| `limit`       | integer | No       | Between `1` and `500`. Default 20. |
| `after`       | string  | No       | Cursor for the next page.          |
| `before`      | string  | No       | Cursor for the previous page.      |
| `order`       | string  | No       | `asc` or `desc`.                   |

```bash
curl -X GET "https://api.ads.openai.com/v1/ads?ad_group_id=adgrp_301&limit=10" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "ad_501",
      "name": "Planner launch card",
      "created_at": 1735689800,
      "updated_at": 1735776200,
      "creative": {
        "type": "chat_card",
        "title": "Try the new workspace planner",
        "body": "Coordinate tasks, docs, and meetings in one place.",
        "file_id": "file_901",
        "image_url": "https://cdn.openai.com/ads/file_901.png",
        "target_url": "https://example.com/workspace-planner"
      },
      "status": "active",
      "review_status": "approved"
    }
  ],
  "first_id": "ad_501",
  "last_id": "ad_501",
  "has_more": false
}
```

## Create an ad

Create an ad for an ad group.

`POST /ads`

| Field                 | Type   | Required        | Notes                                                                                                         |
| --------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `ad_group_id`         | string | Yes             | Parent ad group ID.                                                                                           |
| `name`                | string | Yes             | `3` to `1000` chars and must include a non-space character. Used for organization, is not shown to end users. |
| `creative.type`       | string | Yes             | `chat_card` or `product_ad_template`. See [Product Feeds](https://developers.openai.com/ads/product-feeds).                                |
| `creative.title`      | string | Yes             | `3` to `50` chars.                                                                                            |
| `creative.body`       | string | Yes             | Maximum `100` chars.                                                                                          |
| `creative.price`      | string | No              | Price text or `{{product.price}}` for a product-ad template.                                                  |
| `creative.target_url` | string | For `chat_card` | Destination URL. A product-ad template receives it from the selected feed item.                               |
| `creative.file_id`    | string | For `chat_card` | File returned by `POST /upload`. A product-ad template receives its image from the selected feed item.        |
| `status`              | string | Yes             | `active` or `paused`.                                                                                         |

```bash
curl -X POST "https://api.ads.openai.com/v1/ads" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ad_group_id": "adgrp_301",
    "name": "Planner launch card",
    "status": "active",
    "creative": {
      "type": "chat_card",
      "title": "Try the new workspace planner",
      "body": "Coordinate tasks, docs, and meetings in one place.",
      "target_url": "https://example.com/workspace-planner",
      "file_id": "file_901"
    }
  }'
```

### Product-ad templates

A product-feed ad group can contain at most one non-archived
`product_ad_template` ad. Product-ad templates receive their image and
destination URL from the selected feed item, so they don't require
`creative.file_id` or `creative.target_url`.

Follow the [product feeds guide](https://developers.openai.com/ads/product-feeds) for the complete campaign,
product-set, and template workflow.

## Retrieve an ad

Fetch one ad by ID.

`GET /ads/{ad_id}`

```bash
curl -X GET "https://api.ads.openai.com/v1/ads/ad_501" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

## Update an ad

Update an ad with `POST`.

`POST /ads/{ad_id}`

All fields are optional on update. If you include `creative`, send the full
creative object. `status` accepts `active`, `paused`, or `archived`.

```bash
curl -X POST "https://api.ads.openai.com/v1/ads/ad_501" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Planner launch card v2",
    "status": "paused",
    "creative": {
      "type": "chat_card",
      "title": "Plan work faster",
      "body": "Bring tasks, docs, and meetings together.",
      "target_url": "https://example.com/workspace-planner",
      "file_id": "file_901"
    }
  }'
```

## Review status

Every returned ad object includes `review_status`, which can be:

- `in_review`
- `rejected`
- `approved`

If your ad has been rejected, it violates one of our [ads policies](https://openai.com/policies/ad-policies/). Please edit your ad for it to be re-reviewed.

## Preview an ad

Preview an existing ad by ID. The preview expires 24 hours after creation.

`POST /ads/{ad_id}/preview`

```bash
curl -X POST "https://api.ads.openai.com/v1/ads/ad_501/preview" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

## Change state with dedicated actions

The Ads API also exposes explicit state transitions. Paused ads won't deliver to customers. Only archive objects you have no further use for, as archiving isn't reversible.

- `POST /ads/{ad_id}/activate`
- `POST /ads/{ad_id}/pause`
- `POST /ads/{ad_id}/archive`

```bash
curl -X POST "https://api.ads.openai.com/v1/ads/ad_501/pause" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "id": "ad_501",
  "name": "Planner launch card",
  "created_at": 1735689800,
  "updated_at": 1736035200,
  "creative": {
    "type": "chat_card",
    "title": "Try the new workspace planner",
    "body": "Coordinate tasks, docs, and meetings in one place.",
    "file_id": "file_901",
    "image_url": "https://cdn.openai.com/ads/file_901.png",
    "target_url": "https://example.com/workspace-planner"
  },
  "status": "paused",
  "review_status": "approved"
}
```

---

# Authentication

## Base URL

Send Ads API requests to:

```text
https://api.ads.openai.com/v1
```

## Authorization

The OpenAPI spec defines a bearer security scheme. Pass your Ads API key on
every request:

| Header          | Value                        |
| --------------- | ---------------------------- |
| `Authorization` | `Bearer $OPENAI_ADS_API_KEY` |

Each Ads API key is scoped to one ad account. API partners should use the key
associated with the client account they are configuring.

## Request formats

Most Ads API endpoints accept `application/json`. The upload endpoint supports
two request formats:

- `application/json` with an `image_url`
- `multipart/form-data` with a binary `file`

## Example request

Use `GET /ad_account` to confirm that your bearer token works.

```bash
curl -X GET "https://api.ads.openai.com/v1/ad_account" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Accept: application/json"
```

```json
{
  "id": "adacct_123",
  "name": "Acme Ads",
  "url": "https://www.acme.example",
  "preview_url": null,
  "status": "active",
  "timezone": "UTC",
  "currency_code": "USD",
  "review": {
    "status": "approved"
  }
}
```

---

# Campaigns

## List campaigns

List campaigns in the current ad account.

`GET /campaigns`

| Parameter | Type    | Required | Notes                              |
| --------- | ------- | -------- | ---------------------------------- |
| `limit`   | integer | No       | Between `1` and `500`. Default 20. |
| `after`   | string  | No       | Cursor for the next page.          |
| `before`  | string  | No       | Cursor for the previous page.      |
| `order`   | string  | No       | `asc` or `desc`.                   |

```bash
curl -X GET "https://api.ads.openai.com/v1/campaigns?limit=20&order=desc" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "cmpn_101",
      "created_at": 1735689600,
      "status": "active",
      "bidding_type": "impressions",
      "budget": {
        "lifetime_spend_limit_micros": 25000000
      },
      "conversion_event_setting_ids": [],
      "description": "Promote the new productivity bundle.",
      "end_time": 1738368000,
      "mode": null,
      "name": "Spring launch",
      "start_time": 1735689600,
      "targeting": {},
      "updated_at": 1735776000
    }
  ],
  "first_id": "cmpn_101",
  "last_id": "cmpn_101",
  "has_more": false
}
```

## Create a campaign

Create a campaign for the current ad account. The Ads belonging to a campaign will only show between the defined start and end time, and only in the locations specified in campaign targeting.

For region and DMA targeting, see [Campaign Targeting](https://developers.openai.com/ads/campaign-targeting).

### Defaults

If you omit `start_time`, the campaign will begin delivering immediately. If you omit location targeting, the campaign can target all available locations.

Note that time and currency fields will respect your account-set timezone and currency defaults.

`POST /campaigns`

| Field                                     | Type     | Required | Notes                                                                              |
| ----------------------------------------- | -------- | -------- | ---------------------------------------------------------------------------------- |
| `name`                                    | string   | Yes      | `3` to `1000` chars and must include a non-space character.                        |
| `description`                             | string   | No       | Campaign description.                                                              |
| `start_time`                              | integer  | No       | Unix timestamp between `946684800` and `4102444800`.                               |
| `end_time`                                | integer  | No       | Unix timestamp between `946684800` and `4102444800`.                               |
| `status`                                  | string   | Yes      | `active` or `paused`.                                                              |
| `budget.lifetime_spend_limit_micros`      | integer  | Yes      | Minimum `1000000`.                                                                 |
| `mode`                                    | string   | No       | Set to `product_feed` to create a [product-feed campaign](https://developers.openai.com/ads/product-feeds).     |
| `bidding_type`                            | string   | No       | `impressions`, `clicks`, or `conversions`. Defaults to `impressions`.              |
| `conversion_event_setting_ids`            | string[] | No       | For `conversions`, exactly one active standard event setting ID from this account. |
| `targeting.locations.include`             | object[] | No       | Included location IDs.                                                             |
| `targeting.custom_audiences.ids`          | string[] | No       | Ready audience IDs eligible for inclusion.                                         |
| `targeting.excluded_custom_audiences.ids` | string[] | No       | Ready audience IDs eligible for exclusion, including small audiences.              |

See [Custom Audiences](https://developers.openai.com/ads/custom-audiences#include-or-exclude-audiences-in-a-campaign)
for audience matching, exclusions, and minimum-size requirements.

Check audiences with `GET /custom_audiences?intended_use=inclusion` or
`intended_use=exclusion` before using them. A ready small or empty audience can
be excluded, but it isn't automatically eligible for inclusion. If you include
and exclude audiences, the remaining population must still meet the minimum.
For an exclusion-only campaign, omit `targeting.custom_audiences`.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spring launch",
    "description": "Promote the new productivity bundle.",
    "start_time": 1735689600,
    "end_time": 1738368000,
    "status": "active",
    "budget": {
      "lifetime_spend_limit_micros": 25000000
    },
    "targeting": {
      "locations": {
        "include": [{ "id": "2000043" }, { "id": "3000194" }]
      }
    }
  }'
```

```json
{
  "id": "cmpn_101",
  "created_at": 1735689600,
  "updated_at": 1735689600,
  "name": "Spring launch",
  "description": "Promote the new productivity bundle.",
  "status": "active",
  "start_time": 1735689600,
  "end_time": 1738368000,
  "budget": {
    "lifetime_spend_limit_micros": 25000000
  },
  "bidding_type": "impressions",
  "targeting": {
    "locations": {
      "include": [
        {
          "id": "2000043",
          "type": "region",
          "country_code": "US",
          "name": "California",
          "region_code": "US-CA"
        },
        {
          "id": "3000194",
          "type": "dma",
          "country_code": "US",
          "name": "San Francisco - Oakland - San Jose",
          "region_code": "807"
        }
      ]
    }
  }
}
```

### Create a conversion-optimized campaign

To use oCPC, set `bidding_type` to `conversions` and pass exactly one active
standard conversion event setting from the current ad account. The event
setting must connect to one active conversion source. Custom event settings
cannot be optimization goals.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme purchases",
    "status": "paused",
    "budget": {
      "lifetime_spend_limit_micros": 250000000
    },
    "bidding_type": "conversions",
    "conversion_event_setting_ids": ["ces_123"]
  }'
```

Conversion bidding must be enabled for the ad account. Product-feed campaigns
can use oCPC during the open beta. Use the same endpoint, set `mode` to
`product_feed`, and include the linked `product_feed_id`. You cannot change the
campaign objective or selected conversion event after creation. For the complete
setup flow, including the required ad-group bid configuration, see
[Conversion-Optimized Campaigns](https://developers.openai.com/ads/conversion-optimized-campaigns),
[Product Feeds](https://developers.openai.com/ads/product-feeds), and [API Partner
Setup](https://developers.openai.com/ads/api-partner-setup).

## Retrieve a campaign

Fetch one campaign by ID.

`GET /campaigns/{campaign_id}`

```bash
curl -X GET "https://api.ads.openai.com/v1/campaigns/cmpn_101" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

## Update a campaign

Update a campaign with `POST`, not `PATCH` or `PUT`.

`POST /campaigns/{campaign_id}`

All fields are optional on update. If you include `budget`, send the full
budget object. `description`, `start_time`, `end_time`, and `targeting` can be
set to `null` to clear them. `status` accepts `active`, `paused`, or
`archived`. You cannot update `bidding_type`. For a conversion-optimized
campaign, you also cannot update `conversion_event_setting_ids`.

Audience eligibility is validated again when you save targeting. A concurrent
membership update can return `409 custom_audience_mutation_conflict` without
applying the campaign edit. Wait for the audience operation to finish, retrieve
the current settings, and retry the intended edit if it is still appropriate.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns/cmpn_101" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated launch window and budget.",
    "status": "paused",
    "budget": {
      "lifetime_spend_limit_micros": 30000000
    }
  }'
```

## Change state with dedicated actions

The Ads API also exposes explicit state transitions. Each endpoint returns the
updated campaign object. Paused campaigns won't deliver ads to customers. Only archive objects you have no further use for, as archiving isn't reversible.

- `POST /campaigns/{campaign_id}/activate`
- `POST /campaigns/{campaign_id}/pause`
- `POST /campaigns/{campaign_id}/archive`

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns/cmpn_101/pause" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "id": "cmpn_101",
  "created_at": 1735689600,
  "updated_at": 1735862400,
  "name": "Spring launch",
  "description": "Promote the new productivity bundle.",
  "status": "paused",
  "start_time": 1735689600,
  "end_time": 1738368000,
  "budget": {
    "lifetime_spend_limit_micros": 25000000
  },
  "bidding_type": "impressions"
}
```

---

# Conversion Setup

Use the Ads API to configure conversion measurement for the current ad account.
These endpoints create the resources that the JavaScript Pixel and Conversions
API use to send events.

Pixel management and Conversions API key creation must be enabled for the ad
account. If `/conversions/pixels` or `/conversions/api_keys` returns `404` with
`Not found`, contact your OpenAI partner representative. A `Client data source
not found` response from event-setting creation means that `source_ids`
references a source that does not exist in the current ad account.

## Create a pixel

Create a web conversion source and its Pixel ID.

`POST /conversions/pixels`

| Field         | Type   | Required | Notes                                          |
| ------------- | ------ | -------- | ---------------------------------------------- |
| `name`        | string | Yes      | A descriptive name from 3 to 1,000 characters. |
| `client_type` | string | Yes      | Use `web`.                                     |

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/pixels" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme website",
    "client_type": "web"
  }'
```

```json
{
  "id": "clidsrc_123",
  "client_type": "web",
  "name": "Acme website",
  "pixel_id": "134534..."
}
```

Use `id` as a `source_ids` value when you create an event setting. Use
`pixel_id` to initialize the JavaScript Pixel and when you send Conversions API
events. Web pixels created by this endpoint automatically use [automatic
advanced matching](https://developers.openai.com/ads/measurement-pixel#automatic-advanced-matching).

## Check recent Pixel events

Use the conversion event stream while testing a [JavaScript Pixel](https://developers.openai.com/ads/measurement-pixel)
integration. It returns up to 50 conversion events received from the Pixel SDK
during the previous 15 minutes.

> **Note:** The conversion event stream is available only to enabled accounts.
> If this endpoint returns `404` with `Not found`, contact your OpenAI partner
> representative.

`GET /conversions/events`

| Parameter | Type   | Required | Notes                                |
| --------- | ------ | -------- | ------------------------------------ |
| `pid`     | string | Yes      | Pixel ID returned by pixel creation. |

```bash
curl -X GET "https://api.ads.openai.com/v1/conversions/events?pid=<PIXEL-ID>" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "object": "list",
  "data": [
    {
      "action_source": "web",
      "api_channel": "pixel_sdk",
      "custom_event_name": null,
      "data_source_id": "cds_123",
      "event_data_json": "{\"type\":\"customer_action\"}",
      "event_timestamp_ms": 1787082318902,
      "event_type": "registration_completed",
      "received_at_ms": 1787082320225
    }
  ]
}
```

Use this endpoint to confirm that recent browser events reached OpenAI, not for
attribution or reporting. Use conversion insights for attributed conversion
totals. If more than 50 events arrive during the window, the response includes
only the 50 most recent events.

## Create a Conversions API key

Create a key that can send server-side events for the current ad account.

`POST /conversions/api_keys`

| Field  | Type   | Required | Notes                                          |
| ------ | ------ | -------- | ---------------------------------------------- |
| `name` | string | Yes      | A descriptive name from 3 to 1,000 characters. |

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/api_keys" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme production conversions"
  }'
```

```json
{
  "name": "Acme production conversions",
  "api_key": "<CONVERSIONS_API_KEY>"
}
```

> **Caution:** Store the returned key in a server-side secret manager. Never
> place it in browser code, client-visible environment variables, logs, or
> source control.

## Create an event setting

Create a conversion definition and connect it to one conversion source.

`POST /conversions/event_settings`

| Field                     | Type     | Required | Notes                                                        |
| ------------------------- | -------- | -------- | ------------------------------------------------------------ |
| `name`                    | string   | Yes      | Display name for the conversion.                             |
| `event_type`              | string   | Yes      | A [supported event](https://developers.openai.com/ads/supported-events), or `custom`.     |
| `custom_event_name`       | string   | Depends  | Required when `event_type` is `custom`.                      |
| `attribution_window_days` | integer  | Yes      | Use `30`.                                                    |
| `source_ids`              | string[] | Yes      | Exactly one conversion source ID returned by pixel creation. |

```bash
curl -X POST "https://api.ads.openai.com/v1/conversions/event_settings" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Purchases",
    "event_type": "order_created",
    "attribution_window_days": 30,
    "source_ids": ["clidsrc_123"]
  }'
```

```json
{
  "id": "ces_123",
  "name": "Purchases",
  "event_type": "order_created",
  "custom_event_name": null,
  "attribution_window_days": 30,
  "ad_account_id": "adacct_123",
  "source_ids": ["clidsrc_123"],
  "sources": [
    {
      "id": "clidsrc_123",
      "name": "Acme website"
    }
  ],
  "campaigns": [],
  "archived": false,
  "version": 1
}
```

## List event settings

List conversion definitions for the current ad account.

`GET /conversions/event_settings`

| Parameter | Type    | Required | Notes                         |
| --------- | ------- | -------- | ----------------------------- |
| `limit`   | integer | No       | Between `1` and `500`.        |
| `after`   | string  | No       | Cursor for the next page.     |
| `before`  | string  | No       | Cursor for the previous page. |
| `order`   | string  | No       | `asc` or `desc`.              |

```bash
curl -X GET "https://api.ads.openai.com/v1/conversions/event_settings?limit=20&order=desc" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

## Send events

After setup, use the returned Pixel ID and Conversions API key to implement
[server-side event delivery](https://developers.openai.com/ads/conversions-api). For browser measurement,
use the [JavaScript Pixel](https://developers.openai.com/ads/measurement-pixel). If both sources send the
same event, use a shared event ID so OpenAI processes it only once.

---

# Files

## Upload from an image URL

Upload a remote image with JSON and receive a reusable `file_id`.

`POST /upload`

```bash
curl -X POST "https://api.ads.openai.com/v1/upload" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/assets/workspace-planner-card.png"
  }'
```

```json
{
  "file_id": "file_901"
}
```

## Upload a binary file

The same endpoint also accepts `multipart/form-data` with a binary file.

```bash
curl -X POST "https://api.ads.openai.com/v1/upload" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -F "file=@workspace-planner-card.png"
```

## Upload a custom audience file

Upload a UTF-8 CSV or TXT customer list with the dedicated `POST /uploads`
endpoint. Set `purpose` to `custom_audience` and save the returned `file_id`:

```bash
curl -X POST "https://api.ads.openai.com/v1/uploads" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -F "file=@audience.csv;type=text/csv" \
  -F "purpose=custom_audience"
```

Use the file ID, original filename, MIME type, and exact file size to
[create a custom audience](https://developers.openai.com/ads/custom-audiences#create-the-custom-audience).
You can also use an uploaded file to
[add, remove, or replace audience members](https://developers.openai.com/ads/custom-audiences#add-or-remove-using-a-file).
CSV files can combine email, phone, GAID, and hashed identifier columns when the
audience request sets `identifier_resolution` to `auto`. See
[audience file requirements](https://developers.openai.com/ads/custom-audiences#prepare-an-audience-file).

## Upload an account `favicon`

Set `purpose` to `account_favicon` when you upload an image for account brand
review. The image must be at least 128 × 128 pixels.

The API can resolve an icon from the client's website:

```bash
curl -X POST "https://api.ads.openai.com/v1/upload" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://www.acme.example",
    "purpose": "account_favicon"
  }'
```

To upload a local image, send `purpose` as a multipart form field:

```bash
curl -X POST "https://api.ads.openai.com/v1/upload" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -F "purpose=account_favicon" \
  -F "file=@acme-favicon.png"
```

Assign the returned `file_id` with
[`POST /ad_account/brand`](https://developers.openai.com/ads/api-reference/ad-account#update-account-brand-metadata).

## Use the uploaded file in an ad

Pass the returned `file_id` when you create or update an ad creative.

`POST /ads`

```bash
curl -X POST "https://api.ads.openai.com/v1/ads" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ad_group_id": "adgrp_301",
    "name": "Planner launch card",
    "status": "active",
    "creative": {
      "type": "chat_card",
      "title": "Try the new workspace planner",
      "body": "Coordinate tasks, docs, and meetings in one place.",
      "target_url": "https://example.com/workspace-planner",
      "file_id": "file_901"
    }
  }'
```

---

# Insights

## Endpoints

Use one of the four `GET` endpoints for general delivery insights. Each returns
the same top-level response shape, with IDs, metadata, and metrics appropriate
to its scope.

- `GET /ad_account/insights`
- `GET /campaigns/{campaign_id}/insights`
- `GET /ad_groups/{ad_group_id}/insights`
- `GET /ads/{ad_id}/insights`

Use `POST /conversions/insights` for attributed conversion totals.

## Conversion insights

Authorized `POST /conversions/insights` responses include `conversions`,
`click_through_conversions`, and `view_through_conversions`. `conversions` is
always equal to `click_through_conversions`; view-through conversions are a
separate, supplemental metric and are not added to that total.

Click-through attribution follows the applicable configured click window.
View-through reporting availability is independent of the advertiser's
configured click window, and view-through attribution uses a fixed one-day
window after an eligible ad impression. When a conversion is eligible for both,
the click takes precedence.

View-through conversions are for reporting only. CPA, post-click CVR, bidding,
billing, and conversion optimization remain click-through-based. In Ads
Manager, view-through conversion reporting is available at the campaign level
for accounts with this reporting available.

### Campaign example

```bash
curl -sS -X POST "https://api.ads.openai.com/v1/conversions/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{
    "aggregation_level": "campaign",
    "time_ranges": ["{\"type\":\"unix_range\",\"start\":\"1738368000\",\"end\":\"1738454400\"}"],
    "entity_ids": ["campaign_1"]
  }'
```

Representative response:

```json
{
  "object": "list",
  "data": [
    {
      "entity_id": "campaign_1",
      "conversions": 7,
      "click_through_conversions": 7,
      "view_through_conversions": 3
    }
  ],
  "count": 1
}
```

## Terminology

| Term                             | Values                                                                                                                                                                                                                                                                                                                                                                                              | Meaning                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{aggregation_level}`            | `ad_account`, `campaign`, `ad_group`, `ad`                                                                                                                                                                                                                                                                                                                                                          | Public row entities. The endpoint sets scope; `aggregation_level` chooses the row entity inside that scope.                                                                                                                                                                                                                                                                                                 |
| `time_granularity`               | `hourly`, `daily`, `monthly`, `none`                                                                                                                                                                                                                                                                                                                                                                | Bucket size. `none` returns one bucket for the full requested window.                                                                                                                                                                                                                                                                                                                                       |
| `segments[]`                     | `product`, `country`, `device`                                                                                                                                                                                                                                                                                                                                                                      | Optional extra breakdown dimension. `{segment}` below means the requested segment value.                                                                                                                                                                                                                                                                                                                    |
| `{entity}`                       | The row `{aggregation_level}` or requested `{segment}`                                                                                                                                                                                                                                                                                                                                              | Entity named in `override_segment_group_order[]`. Use it when requesting grouped metrics in a segmented request.                                                                                                                                                                                                                                                                                            |
| `{metric}`                       | `impressions`, `clicks`, `spend`, `ctr`, `cpc`, `cpm`                                                                                                                                                                                                                                                                                                                                               | Aggregated numeric fields.                                                                                                                                                                                                                                                                                                                                                                                  |
| `{aggregation_level}.id`         | `ad_account.id`, `campaign.id`, `ad_group.id`, `ad.id`                                                                                                                                                                                                                                                                                                                                              | Canonical aggregation-level ID fields. They are valid when that aggregation level is present in the row.                                                                                                                                                                                                                                                                                                    |
| `{aggregation_level}.{metric}`   | `campaign.impressions`, `ad.clicks`, `ad_group.spend`                                                                                                                                                                                                                                                                                                                                               | Metric for the row aggregation level. For default rows, use `{aggregation_level}.{metric}`. In segmented requests, grouped metrics can name the entity or segment in `override_segment_group_order[]`.                                                                                                                                                                                                      |
| `{aggregation_level}.{metadata}` | `ad_account.name`, `ad_account.url`, `ad_account.budget.lifetime`, `ad_account.budget.daily`; `campaign.name`, `campaign.description`, `campaign.status`, `campaign.start_time`, `campaign.end_time`, `campaign.budget.lifetime`, `campaign.budget.daily`; `ad_group.name`, `ad_group.description`, `ad_group.status`; `ad.title`, `ad.copy`, `ad.link`, `ad.name`, `ad.status`, `ad.review_status` | Canonical aggregation-level metadata fields. They are valid when that aggregation level is present in the row.                                                                                                                                                                                                                                                                                              |
| `{segment}.{metric}`             | `product.impressions`, `country.clicks`, `device.spend`                                                                                                                                                                                                                                                                                                                                             | Metric for the requested segment group. Valid only when the matching `segments[]` value is present.                                                                                                                                                                                                                                                                                                         |
| `{segment}.{metadata}`           | `product.feed_id`, `product.item_id`, `product.title`, `product.description`, `product.body`, `product.target_url`, `product.image_url`, `product.brand`, `product.seller_name`, `product.price`, `product.availability`; `country.name`; `device.type`                                                                                                                                             | Canonical segment metadata fields. Valid only when the matching `segments[]` value is present.                                                                                                                                                                                                                                                                                                              |
| `metadata.{field}`               | `metadata.readable_time`, `metadata.timezone`                                                                                                                                                                                                                                                                                                                                                       | Report metadata. The response returns flat keys such as `readable_time` and `timezone`.                                                                                                                                                                                                                                                                                                                     |
| `{product}.{id}`                 | `product.feed_id`, `product.item_id`, `product.feed_item_id`                                                                                                                                                                                                                                                                                                                                        | Use `product.feed_id` and `product.item_id` to project identity. Use `product.feed_item_id` only in `filters[]` for an exact feed/item pair.                                                                                                                                                                                                                                                                |
| `filters[].operator`             | `IN`, `GREATER_THAN`, `LESS_THAN`                                                                                                                                                                                                                                                                                                                                                                   | Filter operators. `IN` is for equality-style filters. `GREATER_THAN` and `LESS_THAN` are for numeric thresholds.                                                                                                                                                                                                                                                                                            |
| `sort[].direction`               | `asc`, `desc`                                                                                                                                                                                                                                                                                                                                                                                       | Sort order.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sort[].field`                   | `{aggregation_level}.{metric}`; `{entity}.{metric}` for a segmented request; `{aggregation_level}.id`; sortable `{aggregation_level}.{metadata}`; sortable `{segment}.{metadata}`                                                                                                                                                                                                                   | Canonical sort keys. The field must be valid for the current row shape.                                                                                                                                                                                                                                                                                                                                     |
| `includes[]`                     | `zero_impression_items`, `zero_impression_products`                                                                                                                                                                                                                                                                                                                                                 | Optional zero-row expansions. See [Includes](#includes) for when each value works.                                                                                                                                                                                                                                                                                                                          |
| `time_ranges[].type`             | `unix_range`, `hour_range`, `date_range`                                                                                                                                                                                                                                                                                                                                                            | Time-range object type. `unix_range` uses `start` and `end` Unix seconds. `hour_range` uses local `since` and `until` values in `YYYY-MM-DDTHH`. `date_range` uses local `since` and inclusive `until` values in `YYYY-MM-DD`; `until` normalizes to the following local midnight. `hour_range` and `date_range` can include an IANA time zone in `timezone`; otherwise, they use the ad account time zone. |

## Request parameters

All query parameters are optional.

| Parameter                      | Type       | Value shape                        | Rules                                                                                                                                                                                                                                |
| ------------------------------ | ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `time_granularity`             | `string`   | One `time_granularity` value       | Default `daily`. See [Terminology](#terminology) for bucket behavior.                                                                                                                                                                |
| `aggregation_level`            | `string`   | One public `{aggregation_level}`   | Set the row entity inside the endpoint scope. Each endpoint supports its own entity level and lower levels in the hierarchy `ad_account` > `campaign` > `ad_group` > `ad`.                                                           |
| `time_ranges`                  | `string[]` | One JSON-encoded time-range object | Restrict the report window. Include at least one bound. Bounds must be within the past 5 years and cannot be in the future. The API normalizes them to valid full-hour boundaries.                                                   |
| `fields`                       | `string[]` | Repeated canonical field names     | Project selected fields; this changes returned columns, not row grouping. When omitted, the `fields` parameter defaults to `impressions`, includes `readable_time` for bucketed results, and includes the row entity's default name. |
| `filters`                      | `string[]` | JSON-encoded filter objects        | Restrict which rows survive. See [Filters](#filters).                                                                                                                                                                                |
| `sort`                         | `string[]` | JSON-encoded sort objects          | Order rows before pagination. See [Sorts](#sorts).                                                                                                                                                                                   |
| `segments`                     | `string[]` | At most one `{segment}`            | Add one extra breakdown dimension. See [Segments](#segments).                                                                                                                                                                        |
| `override_segment_group_order` | `string[]` | Row entity plus requested segment  | Change grouped metric meaning by reordering groups. See [Segments](#segments).                                                                                                                                                       |
| `includes`                     | `string[]` | At most one include value          | Expand results with supported zero rows. See [Includes](#includes).                                                                                                                                                                  |
| `limit`                        | `integer`  | `1` through `2000`                 | Default `20`. Caps rows returned in one page after filters and sorting are applied.                                                                                                                                                  |
| `before`                       | `string`   | Previous-page cursor               | Page backward through the current row order. Send only one cursor at a time; use the previous page's `first_id`.                                                                                                                     |
| `after`                        | `string`   | Next-page cursor                   | Page forward through the current row order. Send only one cursor at a time; use the previous page's `last_id`.                                                                                                                       |

`fields[]` uses canonical names, but many response fields serialize as flat
wire keys, such as `campaign.id` to `campaign_id`,
`metadata.readable_time` to `readable_time`, and `product.feed_id` to
`product_feed_id`.

### Filters

| Parameter            | Value shape                                                | Rules                                                                                                                                                                                                    | Example                                                        |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `filters[]`          | JSON-encoded objects with `field`, `operator`, `value`     | Repeat `filters[]` to combine filters with `AND`.                                                                                                                                                        | `{"field":"campaign.id","operator":"IN","value":["cmpn_101"]}` |
| `filters[].field`    | One canonical field name from [Terminology](#terminology)  | The field must be valid for the current row shape. Use `product.feed_item_id` only for an exact feed/item pair filter with JSON-string `IN` values shaped like `{"feed_id":"feed_1","item_id":"sku_1"}`. | `campaign.id` or `ad.clicks`                                   |
| `filters[].operator` | `IN`, `GREATER_THAN`, `LESS_THAN`                          | Use `IN` for resource, segment, or metadata equality. Use `GREATER_THAN` or `LESS_THAN` for numeric metadata or grouped metric thresholds.                                                               | `IN` or `GREATER_THAN`                                         |
| `filters[].value`    | An array of strings or a number, depending on the operator | The value shape must match the operator.                                                                                                                                                                 | `["cmpn_101"]` or `10`                                         |

### Sorts

| Parameter          | Value shape                                             | Rules                                           | Example                                    |
| ------------------ | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `sort[]`           | JSON-encoded objects                                    | Repeat `sort[]` with `field` and `direction`.   | `{"field":"ad.clicks","direction":"desc"}` |
| `sort[].field`     | One canonical sort key from [Terminology](#terminology) | Use a sort key valid for the current row shape. | `ad.clicks` or `product.title`             |
| `sort[].direction` | One `sort[].direction` value                            | Use `asc` or `desc`.                            | `desc`                                     |

### Segments

#### Segment rules

| Parameter                        | Rules                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `segments[]`                     | Add one optional breakdown dimension for enabled ad accounts.                           |
| `time_granularity`               | Segmented requests support `none`, `daily`, and `monthly`.                              |
| Segment fields                   | Use `{segment}.{metadata}` only when that segment is requested.                         |
| `override_segment_group_order[]` | Include the row's `aggregation_level` and the requested segment exactly once, in order. |

#### Product example

| Goal                 | Request shape                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Product breakdown    | Add `segments[]=product` to an `ad_account`, `campaign`, `ad_group`, or `ad` aggregation level.           |
| Product fields       | Project `product.*` fields from [Terminology](#terminology).                                              |
| Product-first rows   | Set `override_segment_group_order[]=product`, then `override_segment_group_order[]=<aggregation_level>`.  |
| Zero-impression rows | Add `includes[]=zero_impression_products`; see [Includes](#includes) for required order and availability. |

### Includes

`includes[]` expands the result set with supported zero-metric rows. It does
not change endpoint scope or `aggregation_level`.

| Include                    | Works when                                                                                                                                                                                                                                         | Adds                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `zero_impression_items`    | Default entity grouping only: do not send `segments[]`.                                                                                                                                                                                            | Entity rows that had zero impressions in the requested window.             |
| `zero_impression_products` | Product reporting only: the ad account has product segments and zero-impression products enabled, `segments[]=product`, `override_segment_group_order[]=product` first, and any `filters[]` use only product fields, entity ID fields, or metrics. | Configured product rows that had zero impressions in the requested window. |

## Examples



This request scopes to one ad account, groups rows by campaign, and returns one
bucket per day. Because `aggregation_level=campaign`, each data row has a
`campaign_id` instead of an `ad_id`.

```bash
curl -sS -G "https://api.ads.openai.com/v1/ad_account/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode 'time_granularity=daily' \
  --data-urlencode 'aggregation_level=campaign' \
  --data-urlencode 'fields[]=metadata.readable_time' \
  --data-urlencode 'fields[]=campaign.id' \
  --data-urlencode 'fields[]=campaign.name' \
  --data-urlencode 'fields[]=campaign.clicks' \
  --data-urlencode 'fields[]=campaign.impressions' \
  --data-urlencode 'fields[]=campaign.spend' \
  --data-urlencode 'time_ranges[]={"type":"unix_range","start":1777075200,"end":1777248000}'
```

Representative response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "start=1777075200:end=1777161600:entity_id=cmpn_101",
      "start_time": 1777075200,
      "end_time": 1777161600,
      "readable_time": "2026-04-25",
      "campaign_id": "cmpn_101",
      "campaign_name": "Spring launch",
      "impressions": 1200,
      "clicks": 36,
      "spend": 18.42
    },
    {
      "id": "start=1777161600:end=1777248000:entity_id=cmpn_101",
      "start_time": 1777161600,
      "end_time": 1777248000,
      "readable_time": "2026-04-26",
      "campaign_id": "cmpn_101",
      "campaign_name": "Spring launch",
      "impressions": 980,
      "clicks": 29,
      "spend": 14.86
    }
  ],
  "count": 2,
  "first_id": "start=1777075200:end=1777161600:entity_id=cmpn_101",
  "last_id": "start=1777161600:end=1777248000:entity_id=cmpn_101",
  "has_more": false
}
```





This uses the same ad-account scope as the previous example, but changes
`aggregation_level` from `campaign` to `ad`. The result now has one row per ad
per day, so campaign totals can fan out into multiple ad rows.

```bash
curl -sS -G "https://api.ads.openai.com/v1/ad_account/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode 'time_granularity=daily' \
  --data-urlencode 'aggregation_level=ad' \
  --data-urlencode 'fields[]=metadata.readable_time' \
  --data-urlencode 'fields[]=campaign.id' \
  --data-urlencode 'fields[]=ad.id' \
  --data-urlencode 'fields[]=ad.name' \
  --data-urlencode 'fields[]=ad.clicks' \
  --data-urlencode 'fields[]=ad.impressions' \
  --data-urlencode 'time_ranges[]={"type":"unix_range","start":1777075200,"end":1777161600}'
```

Representative response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "start=1777075200:end=1777161600:entity_id=ad_501",
      "start_time": 1777075200,
      "end_time": 1777161600,
      "readable_time": "2026-04-25",
      "campaign_id": "cmpn_101",
      "ad_id": "ad_501",
      "ad_name": "Blue shoes",
      "impressions": 700,
      "clicks": 22
    },
    {
      "id": "start=1777075200:end=1777161600:entity_id=ad_502",
      "start_time": 1777075200,
      "end_time": 1777161600,
      "readable_time": "2026-04-25",
      "campaign_id": "cmpn_101",
      "ad_id": "ad_502",
      "ad_name": "Red shoes",
      "impressions": 500,
      "clicks": 14
    }
  ],
  "count": 2,
  "first_id": "start=1777075200:end=1777161600:entity_id=ad_501",
  "last_id": "start=1777075200:end=1777161600:entity_id=ad_502",
  "has_more": false
}
```





`filters[]` removes rows that do not match `campaign.id`. `sort[]` ranks the
remaining ads by clicks, and `limit=1` keeps only the top row on the page.

```bash
curl -sS -G "https://api.ads.openai.com/v1/ad_account/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode 'time_granularity=none' \
  --data-urlencode 'aggregation_level=ad' \
  --data-urlencode 'filters[]={"field":"campaign.id","operator":"IN","value":["cmpn_101"]}' \
  --data-urlencode 'sort[]={"field":"ad.clicks","direction":"desc"}' \
  --data-urlencode 'limit=1' \
  --data-urlencode 'fields[]=campaign.id' \
  --data-urlencode 'fields[]=ad.id' \
  --data-urlencode 'fields[]=ad.name' \
  --data-urlencode 'fields[]=ad.clicks' \
  --data-urlencode 'fields[]=ad.impressions' \
  --data-urlencode 'time_ranges[]={"type":"unix_range","start":1777075200,"end":1777680000}'
```

Representative response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "start=1777075200:end=1777680000:entity_id=ad_501:sort=clicks.desc:sort_values=126",
      "start_time": 1777075200,
      "end_time": 1777680000,
      "campaign_id": "cmpn_101",
      "ad_id": "ad_501",
      "ad_name": "Blue shoes",
      "impressions": 4200,
      "clicks": 126
    }
  ],
  "count": 1,
  "first_id": "start=1777075200:end=1777680000:entity_id=ad_501:sort=clicks.desc:sort_values=126",
  "last_id": "start=1777075200:end=1777680000:entity_id=ad_501:sort=clicks.desc:sort_values=126",
  "has_more": true
}
```





For ad accounts with segmented insights and zero-impression product expansion
enabled, use a product segment when you need product rows within the selected
entity level. This request groups products first, then the ad account, so the
response can include one configured product row even when that product had zero
impressions.

Synthetic zero-product rows omit unavailable metric fields from the response.

```bash
curl -sS -G "https://api.ads.openai.com/v1/ad_account/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode 'time_granularity=daily' \
  --data-urlencode 'aggregation_level=ad_account' \
  --data-urlencode 'segments[]=product' \
  --data-urlencode 'override_segment_group_order[]=product' \
  --data-urlencode 'override_segment_group_order[]=ad_account' \
  --data-urlencode 'includes[]=zero_impression_products' \
  --data-urlencode 'fields[]=product.feed_id' \
  --data-urlencode 'fields[]=product.item_id' \
  --data-urlencode 'fields[]=product.title' \
  --data-urlencode 'fields[]=product.impressions' \
  --data-urlencode 'fields[]=product.clicks' \
  --data-urlencode 'time_ranges[]={"type":"unix_range","start":1777075200,"end":1777161600}'
```

Representative response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "start=1777075200:end=1777161600:entity_id=v2ad_account_id%3Dadacct_123%7Cproduct_feed_id%3Dfeed_1%7Citem_id%3Dsku_1",
      "start_time": 1777075200,
      "end_time": 1777161600,
      "product_feed_id": "feed_1",
      "item_id": "sku_1",
      "product_title": "Blue shoes",
      "product_impressions": 240,
      "product_clicks": 9
    },
    {
      "id": "start=1777075200:end=1777161600:entity_id=v2ad_account_id%3D%3Cnull%3E%7Cproduct_feed_id%3Dfeed_1%7Citem_id%3Dsku_2",
      "start_time": 1777075200,
      "end_time": 1777161600,
      "product_feed_id": "feed_1",
      "item_id": "sku_2",
      "product_title": "Green shoes"
    }
  ],
  "count": 2,
  "first_id": "start=1777075200:end=1777161600:entity_id=v2ad_account_id%3Dadacct_123%7Cproduct_feed_id%3Dfeed_1%7Citem_id%3Dsku_1",
  "last_id": "start=1777075200:end=1777161600:entity_id=v2ad_account_id%3D%3Cnull%3E%7Cproduct_feed_id%3Dfeed_1%7Citem_id%3Dsku_2",
  "has_more": false
}
```

---

# Bulk API

The Bulk API creates or updates campaigns, ad groups, and ads in a single
asynchronous job. Submit up to 1,000 operations, poll the job, and inspect the
result of each operation.

The Bulk API is in limited preview and is enabled per ad account. It isn't
  included in the downloadable OpenAPI spec. If a bulk endpoint returns `404`,
  contact your OpenAI account team to confirm access for the account associated
  with your Ads API key.

## Submit a bulk job

Create a campaign, ad group, and ad in one request. The example creates paused
resources so you can verify them before delivery starts.

`POST /bulk_mutation_jobs`

```bash
curl -X POST "https://api.ads.openai.com/v1/bulk_mutation_jobs" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: spring-launch-job-001" \
  -d '{
    "validate_only": false,
    "partial_failure": true,
    "operations": [
      {
        "operation_id": "create-campaign",
        "type": "campaign.create",
        "idempotency_key": "campaign-spring-launch",
        "input": {
          "name": "Spring launch",
          "max_budget_micros": 100000000,
          "billing_event_type": "impression",
          "budget_type": "lifetime",
          "status": "paused"
        }
      },
      {
        "operation_id": "create-ad-group",
        "type": "ad_group.create",
        "idempotency_key": "ad-group-prospecting",
        "input": {
          "campaign_idempotency_key": "campaign-spring-launch",
          "name": "Prospecting",
          "context_hints": ["shoes", "spring fashion"],
          "status": "paused"
        }
      },
      {
        "operation_id": "create-ad",
        "type": "ad.create",
        "idempotency_key": "ad-prospecting-1",
        "input": {
          "campaign_idempotency_key": "campaign-spring-launch",
          "ad_group_idempotency_key": "ad-group-prospecting",
          "title": "Fresh shoes",
          "body": "Find your next pair",
          "target_url": "https://example.com/shoes",
          "source_image_url": "https://developers.openai.com/showcase/openai-imagegen-demo.png",
          "status": "paused"
        }
      }
    ]
  }'
```

The API returns `202 Accepted` with a job ID:

```json
{
  "id": "blkmtnjob_6a2b773d47b481908aa6078025a64ad3",
  "status": "pending",
  "operation_count": 3,
  "created_at": 1784304000,
  "completed_at": null
}
```

Use the Ads API key from the Settings tab in [Ads Manager](https://ads.openai.com).
Each key works with one ad account, so don't add an `OpenAI-Ad-Account` header
when using an API key.

### Request fields

| Field             | Type     | Required | Description                                                                                               |
| ----------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `operations`      | object[] | Yes      | Between `1` and `1,000` create or update operations.                                                      |
| `validate_only`   | boolean  | No       | Validates request fields and dependencies without changing ad resources when `true`. Defaults to `false`. |
| `partial_failure` | boolean  | No       | Continues independent operations after an error when `true`. Defaults to `true`.                          |

Set `partial_failure` to `false` to skip later operations after an operation
fails. This setting doesn't roll back operations that already completed.

Validation-only jobs don't guarantee that operations can complete successfully.
They don't check update-target existence, image fetching, entity limits, or
other write-time errors.

The optional `Idempotency-Key` header makes it safe to retry an uncertain
request with the same body. Reusing the header with a different body returns an
error. To rerun a `failed` or `partially_failed` job, submit the same body with
a new request-level key. Successful creates are reused.

## Supported operations

Each entry in `operations` must include a unique `operation_id`, an operation
`type`, and an `input` object. Create operations require a unique
`idempotency_key`. Update operations require `target_resource_id` and at least
one input field.

| Type              | Required input                                                                                            | Other supported input                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `campaign.create` | `name`, `max_budget_micros`                                                                               | `billing_event_type`, `budget_type`, `status`, `target_countries`, `location_ids`                             |
| `campaign.update` | At least one supported field                                                                              | `name`, `description`, `status`, `max_budget_micros`, `budget_type`, `start_time`, `end_time`, `location_ids` |
| `ad_group.create` | `campaign_idempotency_key`, `name`                                                                        | `context_hints`, `exclusion_hints`, `max_bid_micros`, `max_cpm_bid_micros`, `status`                          |
| `ad_group.update` | At least one supported field                                                                              | `name`, `description`, `status`, `context_hints`, `exclusion_hints`, `max_bid_micros`, `max_cpm_bid_micros`   |
| `ad.create`       | `campaign_idempotency_key`, `ad_group_idempotency_key`, `title`, `body`, `target_url`, `source_image_url` | `status`                                                                                                      |
| `ad.update`       | At least one supported field                                                                              | `name`, `status`, `creative`                                                                                  |

Create operations can refer to parents created in the same job. Set
`campaign_idempotency_key` to the campaign operation's `idempotency_key`, and
set `ad_group_idempotency_key` to the ad group operation's `idempotency_key`.
The campaign reference on `ad.create` must match the campaign reference on
its parent `ad_group.create` operation.

You can mix create and update operations in one job. Updates can target only
resources that exist when you submit the job, so you can't update a resource
created in the same job. Update each resource only once in a job.

Create statuses are `active` or `paused`; update statuses also support
`archived`. `campaign.create` defaults to an impression-billed, lifetime,
paused campaign. Its budget must be at least `1000000` currency micros.

Ad-group bids must match the parent campaign's billing event. Provide only one
of `max_bid_micros` for clicks or `max_cpm_bid_micros` for impressions; CPM
requires account access. Campaign and ad-group names allow `3` to `1,000`
characters. Ad titles allow `3` to `50`, bodies allow up to `100`, and URLs
allow up to `2,048` characters. Campaigns support up to `2,500` location IDs,
and ad groups support up to `2,000` context hints. See
[Campaign Targeting](https://developers.openai.com/ads/campaign-targeting) for location IDs.

When updating an ad creative, include `title`, `body`, `target_url`, and
`file_id`. For example, pause an existing ad:

```json
{
  "operations": [
    {
      "operation_id": "pause-ad",
      "type": "ad.update",
      "target_resource_id": "ad_501",
      "input": {
        "status": "paused"
      }
    }
  ]
}
```

## Retrieve a job

Poll the job ID returned by the create request until the job reaches a
terminal status.

`GET /bulk_mutation_jobs/{job_id}`

```bash
curl -X GET \
  "https://api.ads.openai.com/v1/bulk_mutation_jobs/blkmtnjob_6a2b773d47b481908aa6078025a64ad3" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

| Status             | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `pending`          | The job is waiting to run.                                                   |
| `in_progress`      | The job is processing operations.                                            |
| `completed`        | All operations completed successfully.                                       |
| `partially_failed` | At least one operation succeeded and another returned `failed` or `skipped`. |
| `failed`           | No operations succeeded. Inspect the operation results for details.          |

`completed`, `partially_failed`, and `failed` are terminal statuses.

## List operation results

Retrieve the result of each operation after submitting a job.

`GET /bulk_mutation_jobs/{job_id}/operations`

Set `limit` to between `1` and `100` results per page. It defaults to `100`.

```bash
curl -X GET \
  "https://api.ads.openai.com/v1/bulk_mutation_jobs/blkmtnjob_6a2b773d47b481908aa6078025a64ad3/operations?limit=100" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

```json
{
  "object": "list",
  "data": [
    {
      "operation_id": "create-ad",
      "type": "ad.create",
      "status": "created",
      "resource_id": "ad_501",
      "submitted_version_id": "adver_501",
      "error_code": null,
      "error": null,
      "retryable": null,
      "retry_after_seconds": null
    }
  ],
  "has_more": false,
  "complete": true,
  "error": null
}
```

Use `has_more` and the last returned `operation_id` to request the next page
with `after`. Pagination cursors are only available after `complete` is `true`.
While a job is running, the endpoint can return an incomplete snapshot of the
results collected so far.

Each operation result includes its `operation_id`, `type`, status, and error
fields that can be `null`. `failed` results can populate `error_code`, `error`,
`retryable`, and `retry_after_seconds`. The top-level `error` field describes a
job-level error when present. `submitted_version_id` is `null` for campaign
and ad-group creates.

| Status      | Meaning                                                                               |
| ----------- | ------------------------------------------------------------------------------------- |
| `created`   | The create operation succeeded.                                                       |
| `updated`   | The update operation succeeded.                                                       |
| `validated` | The operation passed request and dependency validation in a validation-only job.      |
| `failed`    | The operation returned an error. Use the retry fields for next steps.                 |
| `skipped`   | The operation didn't run because a dependency or earlier operation returned an error. |

## Limits and retries

Bulk jobs have the following default limits:

| Limit                               | Value                          |
| ----------------------------------- | ------------------------------ |
| Operations per job                  | `1,000`                        |
| Request body size                   | `16 MiB`                       |
| Serialized operation size           | `512 KiB`                      |
| Create requests per ad account      | `10` requests per `10` seconds |
| Operation results per page          | `100`                          |
| Self-serve campaigns per ad account | `5,000` non-archived campaigns |
| Self-serve ad groups per ad account | `5,000` non-archived ad groups |
| Self-serve ads per ad account       | `5,000` active or paused ads   |

Keep `operation_id` and create-operation `idempotency_key` values unique
within a job. Each value can contain up to `255` characters. If a result's
`retryable` field is `true`, wait for `retry_after_seconds` when provided
before submitting the same body in a new job. Reuse the original
create-operation `idempotency_key` values when retrying that request.

---

# Campaign Targeting

Use campaign targeting to control where your ads can deliver. OpenAI Ads supports
country, region, and DMA targeting. Look up the locations you want, copy their
location IDs, then pass those IDs when you create or update a campaign.

If you do not provide location targeting, the campaign can target all available
locations.

## Available locations

Use the geo lookup API when you want to search for current targetable locations.
The response returns the location `id`, display `name`, `canonical_name`,
`country_code`, `type`, and `region_code`.

```bash
curl -G "https://api.ads.openai.com/v1/geo_lookup/search" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "q=San Francisco" \
  --data-urlencode "limit=5"
```

```json
{
  "count": 1,
  "query": "San Francisco",
  "results": [
    {
      "id": "3000194",
      "type": "dma",
      "canonical_name": "San Francisco - Oakland - San Jose, United States",
      "country_code": "US",
      "name": "San Francisco - Oakland - San Jose",
      "region_code": "807"
    }
  ]
}
```

You can also download the current location catalog as a CSV:

[{"Download OpenAI Ads locations"}](https://developers.openai.com/ads/openai-geotargets.csv)

## Campaign creation

Create a campaign with `targeting.locations.include`. Each item only needs the
location `id`; the API expands the saved campaign with the matching location
details.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: campaign-targeting-example-1" \
  -d '{
    "name": "West Coast launch",
    "status": "paused",
    "budget": {
      "lifetime_spend_limit_micros": 25000000
    },
    "bidding_type": "clicks",
    "targeting": {
      "locations": {
        "include": [
          { "id": "2000043" },
          { "id": "3000194" },
          { "id": "3000001" }
        ]
      }
    }
  }'
```

In this example:

| Location ID | Meaning                                           | Type     |
| ----------- | ------------------------------------------------- | -------- |
| `2000043`   | California, United States                         | `region` |
| `3000194`   | San Francisco - Oakland - San Jose, United States | `dma`    |
| `3000001`   | New York, United States                           | `dma`    |

Use `status: "paused"` while you are validating campaign setup. Switch the
campaign to `active` when the campaign, ad groups, and ads are ready to serve.

---

# Conversion-Optimized Campaigns

Use a conversion-optimized cost-per-click (oCPC) campaign when you want to
optimize delivery toward one tracked conversion event while continuing to pay
for valid clicks. In the Ads API, oCPC uses `bidding_type: "conversions"`.

oCPC is in open beta for both standard and product-feed campaigns. Use the
  same campaign and ad-group endpoints to optimize for conversions while
  continuing to pay per valid click.

Choose the campaign goal that matches the outcome you want:

| Goal                 | Best for                       | How you pay                         | What delivery optimizes for                                  |
| -------------------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| `impressions` (CPM)  | Reach and awareness            | Per 1,000 impressions               | Broad delivery at scale                                      |
| `clicks` (CPC)       | Engagement and traffic         | Per valid click                     | Clicks from people likely to engage                          |
| `conversions` (oCPC) | A tracked action after a click | Per valid click, not per conversion | Clicks more likely to lead to your selected conversion event |

## Before you begin

Before you create an oCPC campaign, make sure:

- The ad account supports conversion bidding. If campaign creation
  returns `403` with `Conversion bidding is not enabled`, contact your OpenAI
  partner representative.
- You have set up conversion tracking with the [JavaScript
  Pixel](https://developers.openai.com/ads/measurement-pixel), the [Conversions API](https://developers.openai.com/ads/conversions-api),
  or both. The Conversions API is a more reliable tracking source than the
  pixel alone.
- You have exactly one active [standard conversion
  event](https://developers.openai.com/ads/supported-events) to use as the optimization goal. Custom events
  cannot be oCPC optimization goals.
- The conversion event setting belongs to the current ad account and connects
  to one active conversion source.

Product-feed conversion bidding is available in open beta. Each oCPC campaign
uses one selected conversion event, and you cannot change the goal or event
after campaign creation.

## Create a conversion-optimized campaign

Create the campaign as `paused` while you add and check its ad groups and ads.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme purchases",
    "status": "paused",
    "budget": {
      "lifetime_spend_limit_micros": 250000000
    },
    "bidding_type": "conversions",
    "conversion_event_setting_ids": ["ces_123"]
  }'
```

Replace `ces_123` with the active conversion event setting ID that represents
your goal, such as `order_created`, `lead_created`, or
`registration_completed`. See [Conversion
Setup](https://developers.openai.com/ads/api-reference/conversion-setup) to create and manage event
settings.

For a product-feed campaign, use the same `POST /campaigns` endpoint. Include
`mode: "product_feed"`, the ID of a product feed linked to the ad account, and
the same conversion bidding fields:

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Running shoes catalog purchases",
    "status": "paused",
    "mode": "product_feed",
    "product_feed_id": "product_feed_123",
    "budget": {
      "lifetime_spend_limit_micros": 250000000
    },
    "bidding_type": "conversions",
    "conversion_event_setting_ids": ["ces_123"]
  }'
```

Create each child ad group with `billing_event_type` set to `click`. For an
oCPC campaign, `max_bid_micros` is the CPA bid even though billing uses valid
clicks. For example, `100000000` is a $100.00 CPA bid for a USD account.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "US English",
    "status": "active",
    "bidding_config": {
      "billing_event_type": "click",
      "max_bid_micros": 100000000
    }
  }'
```

For a product-feed campaign, the ad group automatically inherits the campaign's
product feed. Include `product_set` only when you want to specify product
filters; its `product_feed_id` must match the campaign's feed. See
[Product Feeds](https://developers.openai.com/ads/product-feeds) for the complete product-feed campaign,
ad-group, and product-ad template workflow.

Create ads as you normally would, then activate the campaign after all child
resources are ready. For the complete resource-creation sequence, see the
[Quickstart](https://developers.openai.com/ads/api-quickstart). For all campaign and ad-group fields, see
[Campaigns](https://developers.openai.com/ads/api-reference/campaigns) and [Ad
Groups](https://developers.openai.com/ads/api-reference/ad-groups).

## Understand delivery and billing

oCPC uses your selected conversion event together with ad quality, relevance,
click likelihood, and conversion likelihood to favor clicks that are more
likely to lead to that event. The CPA bid controls how the campaign competes
for those outcomes.

Billing does not change to pay per conversion. OpenAI charges you only when a
valid click occurs, and the auction determines the actual CPC. Treat the CPA
bid as an optimization input, not as a conversion charge.

## Review and improve performance

In Ads Manager, review impressions, clicks, conversions, spend, click-through
rate (CTR), and average CPC together. Because oCPC optimizes toward the
selected event, conversions are the primary outcome to review. You can
calculate cost per conversion by dividing spend by conversions.

Use the [Insights endpoints](https://developers.openai.com/ads/api-reference/insights) to retrieve delivery
metrics such as impressions, clicks, spend, CTR, and CPC.

To improve performance:

- Choose the standard conversion event that best represents your campaign goal.
- Keep conversion tracking healthy. Incomplete or incorrectly configured tracking can
  make reporting and optimization less effective.
- Use a conversion event with enough volume to evaluate performance.
- Align ad copy with user intent and the selected conversion goal.
- Review enough volume before making large changes to bids, budgets, or
  creative.

## Common questions

### Supported events

An oCPC campaign supports exactly one active standard conversion event setting.
Custom event settings are not supported as optimization goals. See [Supported
Events](https://developers.openai.com/ads/supported-events) for the standard event names.

### Changing an existing campaign

No. You cannot change an existing CPM or CPC campaign to oCPC. Create a new
campaign with `bidding_type: "conversions"`.

### Changing the selected conversion event

No. You cannot change the campaign goal or selected conversion event after
creation. Create a new campaign to optimize toward a different event.

### Billing

No. oCPC optimizes delivery toward the selected conversion event, but billing
still uses valid clicks.

### Product-feed campaigns

Yes. Product-feed oCPC is available in open beta. Set
`mode` to `product_feed`, include the linked `product_feed_id`, and set
`bidding_type` to `conversions` when creating the campaign. Create its ad group
with `billing_event_type: "click"`. The ad group inherits the campaign's feed;
include `product_set` only when you want to specify product filters.

## Next steps

- [Set up conversion measurement](https://developers.openai.com/ads/api-reference/conversion-setup)
- [Send browser events with the JavaScript Pixel](https://developers.openai.com/ads/measurement-pixel)
- [Send server-side events with the Conversions API](https://developers.openai.com/ads/conversions-api)
- [Create campaigns](https://developers.openai.com/ads/api-reference/campaigns)
- [Create ad groups](https://developers.openai.com/ads/api-reference/ad-groups)
- [Create product-feed campaigns](https://developers.openai.com/ads/product-feeds)
- [Query insights](https://developers.openai.com/ads/api-reference/insights)

---

# Conversions API

The Conversions API is a more reliable tracking source than the pixel alone. Use the Conversions API when possible for more accurate insights.

## Send events

Send events to the Conversions API from your server only.

```bash
curl -X POST "https://bzr.openai.com/v1/events?pid=<PIXEL-ID>" \
  -H "Authorization: Bearer <API-KEY>" \
  -H "Content-Type: application/json" \
  --data '{
    "validate_only": false,
    "events": []
  }'
```

You can provision a Pixel ID and Conversions API key from the conversions tab in Ads Manager. Approved API partners can use the Ads API key associated with a client account to provision both resources with the [conversion setup endpoints](https://developers.openai.com/ads/api-reference/conversion-setup).

| Value                | Required | Description                                              |
| -------------------- | -------- | -------------------------------------------------------- |
| `pid`                | Yes      | Your Pixel ID.                                           |
| `validate_only`      | No       | Validates events without saving them when `true`.        |
| `integration_source` | No       | Stable identifier for the integration sending the batch. |
| `events`             | Yes      | The events to send.                                      |

The API accepts batches of up to 1,000 events. If one event in the batch fails,
the full batch fails.

For app lifecycle events, use the Pixel ID from an existing web data source.
Send `app_installed` and `app_opened` from your server with `action_source`
set to `mobile_app`. Native mobile SDK setup and mobile data sources are not
currently supported.

## Web-event attribution reporting

Web events support click-through attribution and, when available for your
account, view-through attribution. Click-through attribution uses the applicable
configured click window. View-through conversions use a fixed one-day window
after an eligible ad impression. Whether view-through reporting is available
does not depend on your configured click window. If a conversion is eligible
for both, the click takes precedence.

View-through attribution does not use a separate request or event field. Ads
Manager reports view-through conversions as a separate, campaign-level metric.
They are not included in `Conversions`, which remains the click-through
conversion total. CPA, post-click CVR, bidding, billing, and conversion
optimization also remain click-through-based. App lifecycle events and mobile
measurement integrations remain click-through-based.

## Identify partner integrations

If you send events on behalf of advertisers, include `integration_source` at
the top level of every Conversions API request. Mobile measurement partners
and other integrations should use the same stable identifier on every request,
such as `acme_measurement` or `example_analytics`. The value applies to every
event in the batch.

For example, a measurement partner can identify itself when sending an app
install event:

```json
{
  "integration_source": "acme_measurement",
  "events": [
    {
      "id": "app_installed_123",
      "type": "app_installed",
      "timestamp_ms": <TIMESTAMP_MS>,
      "action_source": "mobile_app",
      "data": {
        "type": "customer_action"
      }
    }
  ]
}
```

Replace `<TIMESTAMP_MS>` with the event timestamp in milliseconds.

Use 1–64 ASCII characters. Start with a letter or digit, and use only letters,
digits, periods (`.`), underscores (`_`), or hyphens (`-`). The API trims
whitespace and converts the value to lowercase before validation.

Use `integration_source` to identify the integration sending the request. This
field does not affect authentication or authorization.

## Event structure

Each event includes the event metadata and a `data` object.

```json
{
  "id": "order_12345",
  "type": "order_created",
  "timestamp_ms": 1773892800000,
  "oppref": "oppref_abc",
  "source_url": "https://shop.example.com/checkout/confirmation",
  "action_source": "web",
  "user": {
    "obref": "123e4567-e89b-42d3-a456-426614174000",
    "emails_sha256": [
      "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"
    ],
    "external_ids_sha256": [
      "18f69bcd2f9cc9c38195e722b2a5590429840ea5090971d2256e026926e55fa1"
    ],
    "countries": ["US"],
    "cities": ["San Francisco"],
    "postal_codes": ["94107"],
    "ip_address": "203.0.113.1",
    "user_agent": "Mozilla/5.0"
  },
  "data": {
    "type": "contents"
  }
}
```

{/* Intentionally omit `oppcref` from public documentation. Do not add it to this field table without Ads product approval. */}

| Field               | Required | Description                                                                                                                                                                                                                                                                         |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | Yes      | A non-empty string that identifies the event. Reuse the same ID when retrying or sending the same conversion through another integration.                                                                                                                                           |
| `type`              | Yes      | Use `appointment_scheduled`, `checkout_started`, `contents_viewed`, `custom`, `items_added`, `lead_created`, `order_created`, `page_viewed`, `registration_completed`, `subscription_created`, or `trial_started`. Native app events also support `app_installed` and `app_opened`. |
| `timestamp_ms`      | Yes      | Event time as an integer Unix timestamp in milliseconds. The timestamp must be within the last 7 days and no more than 10 minutes in the future.                                                                                                                                    |
| `custom_event_name` | Depends  | Required when `type` is `custom`. Use 1–64 letters, digits, underscores, or hyphens; start and end with a letter or digit. The name cannot match a standard event name. The API converts it to lowercase.                                                                           |
| `oppref`            | No       | An opaque, OpenAI-provided attribution identifier. Pass the original string without modification.                                                                                                                                                                                   |
| `source_url`        | Depends  | Required for web events when `action_source` is `web`; optional for native app events. Use a URL with a scheme and host, such as `https://shop.example.com/checkout`.                                                                                                               |
| `action_source`     | Depends  | Use `web`, `mobile_app`, `offline`, `physical_store`, `phone_call`, `email`, or `other`. The value must be `mobile_app` for `app_installed` and `app_opened` events.                                                                                                                |
| `user`              | No       | An object containing optional conversion-matching fields. See [Send user data](#send-user-data).                                                                                                                                                                                    |
| `opt_out`           | No       | Use `true` to opt the event out of future user-level personalization, or `false` for the default behavior.                                                                                                                                                                          |
| `data`              | Yes      | An object describing the conversion. Its `type` field must match the data shape required for the event name (see [Supported Events](https://developers.openai.com/ads/supported-events)) and use one of the event data shapes below.                                                                             |

See [Supported Events](https://developers.openai.com/ads/supported-events) for event names and data shapes.

Unlike the pixel, the API does not capture `oppref` for you. Capture the value
yourself and pass it with the server event when it is available to support click
matching. View-through attribution does not require a separate request or
event field.

### Event data

Each `events[].data` object supports the following fields. The available fields
depend on its `type`.

| Field                     | Required | Description                                                                                                                                                                   |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                    | Yes      | Use `contents`, `customer_action`, `plan_enrollment`, or `custom`, as required by the event type. The `app_installed` and `app_opened` event types require `customer_action`. |
| `amount`                  | No       | The event-level monetary value as an integer in the currency's standard minor unit. For example, use `4200` for $42.00 with `currency: "USD"`.                                |
| `currency`                | Depends  | Required when `amount` is present. Use a valid three-letter ISO 4217 currency code, such as `USD`, `EUR`, or `JPY`; the API converts values to uppercase.                     |
| `contents`                | No       | An array of item objects. Available when `data.type` is `contents`, `plan_enrollment`, or `custom`; not available for `customer_action`.                                      |
| `contents[].id`           | No       | A string containing your internal product, item, or content identifier.                                                                                                       |
| `contents[].group_id`     | No       | A string identifying the product group or parent item.                                                                                                                        |
| `contents[].name`         | No       | A string containing the item's display name.                                                                                                                                  |
| `contents[].content_type` | No       | A string describing the item category, such as `product`, `plan`, or `page`.                                                                                                  |
| `contents[].quantity`     | No       | The item quantity as an integer.                                                                                                                                              |
| `contents[].amount`       | No       | The item-level monetary value as an integer in the currency's standard minor unit.                                                                                            |
| `contents[].currency`     | No       | A valid three-letter ISO 4217 currency code for the item, such as `USD`, `EUR`, or `JPY`.                                                                                     |
| `contents[].variant_dict` | No       | An object whose keys and values are strings, such as `{"size": "medium", "color": "blue"}`.                                                                                   |
| `plan_id`                 | No       | A string identifying your subscription or trial plan. Available when `data.type` is `plan_enrollment` or `custom`.                                                            |
| `<custom_field>`          | No       | A custom property available only when `data.type` is `custom`. Values can be strings, numbers, boolean values, objects, arrays, or `null`.                                    |

## Send user data

Add an optional `user` object to each event to improve conversion matching. The
object is event-scoped, so put it inside each entry in `events`, not at the
request root.

Every field in the `user` object is optional. Include only the fields you have
for the user.

### Normalize identifiers before hashing

Normalize each identifier as follows:

- Email address: trim leading and trailing whitespace and convert the value to
  lowercase.
- Phone number: keep the country calling code. Remove all whitespace,
  parentheses, periods, and hyphens, then remove a leading `+` and any
  leading zeroes. Hash the resulting 8–15 digits. For example,
  `+1 (415) 555-2671` becomes `14155552671`.
- External ID: trim leading and trailing whitespace. Preserve case and all
  other characters.
- First and last name: convert the value to lowercase and remove all whitespace
  and ASCII punctuation. Apart from converting to lowercase, preserve non-ASCII characters;
  don't strip accents or transliterate. For example, `O'Connor` becomes
  `oconnor`, and `José` becomes `josé`.

The normalized value is the exact string to encode and hash:

| Identifier   | Input               | Normalized value |
| ------------ | ------------------- | ---------------- |
| Phone number | `+1 (415) 555-2671` | `14155552671`    |
| First name   | `Mary Jane`         | `maryjane`       |
| Last name    | `O'Connor`          | `oconnor`        |
| First name   | `José`              | `josé`           |

Encode each normalized value as UTF-8, compute its SHA-256 digest, and send the
digest as a lowercase, 64-character hexadecimal string. Don't send raw email
addresses, phone numbers, external IDs, first names, or last names. Send
geographic values as raw strings.

### User object example

Place this object inside an event at `events[].user`:

```json
{
  "obref": "123e4567-e89b-42d3-a456-426614174000",
  "phone_numbers_sha256": [
    "758fbf68945f21c416814c539ab578876c8d98fb69e6da692def92cd52417fe0"
  ],
  "emails_sha256": [
    "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"
  ],
  "external_ids_sha256": [
    "18f69bcd2f9cc9c38195e722b2a5590429840ea5090971d2256e026926e55fa1"
  ],
  "first_names_sha256": [
    "fdee430d40bd57deeac186cd9790033d0f06f909a8806e7ce6e717ab7c7d5029"
  ],
  "last_names_sha256": [
    "fb1e7ec987523d2cb9e022cec1d6ae7c99dc46edfae4fe51254025fe4bea571f"
  ],
  "regions": ["California"],
  "postal_codes": ["94107"],
  "cities": ["San Francisco"],
  "countries": ["US"],
  "android_advertising_id": "38400000-8cf0-11bd-b23e-10b96e40000d",
  "ip_address": "203.0.113.1",
  "user_agent": "Mozilla/5.0"
}
```

Use the plural list fields below. For each list, the API uses the first three
valid, unique values in the order provided. It ignores additional values without
rejecting the event or request.

| Field                    | Type           | Description                                                                                                                    |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `phone_numbers_sha256`   | `list[string]` | SHA-256 hashes of 8–15 digits after removing a leading `+`, leading zeroes, whitespace, parentheses, periods, and hyphens.     |
| `emails_sha256`          | `list[string]` | SHA-256 hashes of normalized email addresses.                                                                                  |
| `external_ids_sha256`    | `list[string]` | SHA-256 hashes of stable, pseudonymous customer identifiers from your system.                                                  |
| `first_names_sha256`     | `list[string]` | SHA-256 hashes of lowercase first names after removing whitespace and ASCII punctuation; non-ASCII characters are preserved.   |
| `last_names_sha256`      | `list[string]` | SHA-256 hashes of lowercase last names after removing whitespace and ASCII punctuation; non-ASCII characters are preserved.    |
| `regions`                | `list[string]` | Raw region values. The API trims whitespace, converts values to lowercase, and limits each normalized value to 128 characters. |
| `postal_codes`           | `list[string]` | Raw postal or ZIP codes. Use letters, numbers, spaces, or hyphens; each normalized value can contain up to 32 characters.      |
| `cities`                 | `list[string]` | Raw city names. The API trims whitespace, converts values to lowercase, and limits each normalized value to 128 characters.    |
| `countries`              | `list[string]` | Raw two-letter country codes, such as `US`.                                                                                    |
| `android_advertising_id` | `string`       | Raw Android Google Advertising ID (GAID) in UUID format. Available only through the Conversions API.                           |
| `obref`                  | `string`       | Opaque browser reference from the Pixel's `__obref` cookie. Pass it without hashing.                                           |
| `ip_address`             | `string`       | Valid IPv4 or IPv6 address.                                                                                                    |
| `user_agent`             | `string`       | Non-empty user agent string from the client that generated the event.                                                          |

`android_advertising_id` supports Android GAID only; IDFA is not supported. You
can send a GAID with any `action_source`. The API ignores all-zero advertising
IDs without rejecting the event.

For hybrid Pixel and Conversions API integrations, read the `__obref`
first-party cookie in the browser, send it to your server, and include it
unchanged as `events[].user.obref` when available. Send a non-blank string.
Before collecting or forwarding the cookie, follow your site's measurement
consent requirements. If the user revokes consent, stop sending it. Unlike
`oppref`, which is an event-level field, `obref` belongs inside `user`.

## Example event

```bash
curl -X POST "https://bzr.openai.com/v1/events?pid=<PIXEL-ID>" \
  -H "Authorization: Bearer <API-KEY>" \
  -H "Content-Type: application/json" \
  --data '{
    "validate_only": false,
    "events": [
      {
        "id": "order_12345",
        "type": "order_created",
        "timestamp_ms": 1773892800000,
        "oppref": "oppref_abc",
        "source_url": "https://shop.example.com/checkout/confirmation",
        "action_source": "web",
        "user": {
          "obref": "123e4567-e89b-42d3-a456-426614174000",
          "emails_sha256": [
            "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514"
          ],
          "external_ids_sha256": [
            "18f69bcd2f9cc9c38195e722b2a5590429840ea5090971d2256e026926e55fa1"
          ],
          "countries": ["US"],
          "cities": ["San Francisco"],
          "postal_codes": ["94107"],
          "ip_address": "203.0.113.1",
          "user_agent": "Mozilla/5.0"
        },
        "data": {
          "type": "contents",
          "amount": 2599,
          "currency": "USD",
          "contents": [
            {
              "id": "sku_123",
              "name": "Starter bundle",
              "content_type": "product",
              "quantity": 1
            }
          ]
        }
      }
    ]
  }'
```

## App lifecycle events

App lifecycle events use the `customer_action` data shape and require
`action_source` to be `mobile_app`.

### App installed

```json
{
  "id": "app_installed_123",
  "type": "app_installed",
  "timestamp_ms": <TIMESTAMP_MS>,
  "action_source": "mobile_app",
  "data": {
    "type": "customer_action"
  }
}
```

### App opened

```json
{
  "id": "app_opened_123",
  "type": "app_opened",
  "timestamp_ms": <TIMESTAMP_MS>,
  "action_source": "mobile_app",
  "data": {
    "type": "customer_action"
  }
}
```

{/* vale Vale.Spelling = NO */}

## Deduplicate browser and server events

{/* vale Vale.Spelling = YES */}

If you send the same conversion from the pixel and the Conversions API, reuse
the same value as the API `id` and pixel `event_id`. Send both events with the
same Pixel ID. For custom events, use the same `custom_event_name` on both sides
as well. Deduplication uses your Pixel ID, `event_name`, and `id`. OpenAI uses
the first event it receives for a matching key and ignores later duplicates.

---

# Custom Audiences

Custom audiences let you use customer or prospect lists to control who can see
your ads. Create an audience from a file or start with an empty audience, then
add or remove customers as your list changes. You can also replace the full
list or merge existing audiences into a new audience.

Custom audiences are not supported for campaigns targeting the European
  Economic Area (EEA) or Switzerland, where personalized ads are not yet
  available.

Before you begin, create an Ads API key in the **Settings** tab of
[Ads Manager](https://ads.openai.com). Store the key as
`OPENAI_ADS_API_KEY` and send it as a bearer token. Each key can access only
the audiences associated with its ad account.

Only upload first-party audience data that you have the right to use for ads.
Don't upload broker-sourced data. Before uploading, confirm that your use
complies with required rights, notices, consents, permissions, legal bases, and
the [Ad Tools Terms](https://openai.com/policies/ad-tools-terms/), and get
privacy or legal approval for your use case.

All examples use the `https://api.ads.openai.com/v1` base URL. Replace the
example resource IDs with IDs from your account. For each new membership
operation, generate a unique `Idempotency-Key` and keep it with the original
request so you can retry safely.

## Choose an operation

Choose the operation that matches the change in your customer list:

| Goal    | Input                                          | Result                                            |
| ------- | ---------------------------------------------- | ------------------------------------------------- |
| Create  | Uploaded file, or a name without a file        | A new audience ID.                                |
| Add     | Inline identifiers or an uploaded file         | Add matched users to the same audience.           |
| Remove  | Inline identifiers or an uploaded file         | Remove matched users from the same audience.      |
| Replace | Uploaded file containing the full desired list | Replace membership while keeping the audience ID. |
| Merge   | 2 to 64 existing audience IDs                  | A new, independent union audience.                |

Use inline requests for small updates and files for bulk changes. Both are
asynchronous: accepting a request doesn't mean processing has finished.

Small audiences, including empty audiences, can be used for **exclusion** once
they are ready. Inclusion and bid adjustments still require enough matched
users. Check [eligibility for the intended use](#check-eligibility-for-the-intended-use)
before attaching an audience to a campaign or ad group.

## Prepare an audience file

Create a UTF-8 CSV or TXT file no larger than 500 MB (500,000,000 bytes).
A UTF-8 BOM is accepted. Use `text/csv` for CSV files and `text/plain` for TXT
files.

A TXT file contains one identifier per line, without a header, and uses the
`identifier_type` you specify in the request. A CSV file must include an
identifier header. These identifier formats are supported:

| Identifier type       | CSV header            | Format                                                                                |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `email`               | `email`               | An email address containing one `@`. The API trims it and converts it to lowercase.   |
| `phone`               | `phone_number`        | A phone number in E.164 format, including `+` and the country code.                   |
| `email_sha256`        | `email_sha256`        | The 64-character SHA-256 hexadecimal digest of the normalized email address.          |
| `phone_number_sha256` | `phone_number_sha256` | The 64-character SHA-256 hexadecimal digest of the normalized E.164 telephone number. |
| `gaid`                | `gaid`                | A nonzero, hyphenated Google Advertising ID. The API normalizes and hashes it.        |

For example, an email audience CSV can contain:

```text
email
alex@example.com
jamie@example.com
sam@example.com
```

Before hashing an email, trim surrounding whitespace and convert it to
lowercase. Before hashing a phone number, normalize it to E.164, including the
leading `+` and country code. Hash the UTF-8 value without a trailing newline
and send the 64-character hexadecimal digest, not Base64. Don't remove email
dots or plus tags.

GAIDs must be raw, nonzero, hyphenated UUIDs, such as
`38400000-8cf0-11bd-b23e-10b96e40000d`. The API trims surrounding whitespace,
converts them to lowercase, and hashes them internally. Don't prehash GAIDs.

### Combine identifier types in one CSV

Set `identifier_resolution` to `auto` when creating or updating an audience
from a CSV that combines email, phone, GAID, and hashed identifiers:

```csv
email,phone_number,email_sha256,phone_number_sha256,gaid
alex@example.com,+12025550123,,,
,,057a0fff4c78ae3e14236c36b611061cbdd54ccd72a34b23f77d7a8c4bca4963,,
,,,1a2d415d4fef1dfafe57e0d98af15bbad8cc4bd8ca8ac66e89f2e0ef3941d500,
,,,,38400000-8cf0-11bd-b23e-10b96e40000d
```

Leave unused cells empty. Each populated identifier cell is a matching
candidate; a row doesn't require every identifier to match the same user.
OpenAI counts each matched user once, so different identifiers can represent
one audience member. Don't repeat a consumed identifier column in the header.

Use `identifier_resolution: "auto"` with file-based Create, Add, Remove, or
Replace. Without it, use a single identifier type and specify that type in
`identifier_type`; this single-type processing path accepts up to 5,000,000
identifiers. Automatic resolution supports larger files within the same
500 MB upload limit.

## Upload the audience file

Upload the CSV or TXT file to `POST /uploads`. Set the multipart `purpose` field
to `custom_audience`:

```bash
curl -X POST "https://api.ads.openai.com/v1/uploads" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -F "file=@audience.csv;type=text/csv" \
  -F "purpose=custom_audience"
```

The response contains the file ID:

```json
{
  "file_id": "oaisdmntci_123"
}
```

Save the `file_id`, the original filename, the file's MIME type, and the exact
file size in bytes. You must provide these values when you create an audience
from a file. Use the upload promptly; don't treat its file ID as permanent
storage.

## Create the custom audience

Send the uploaded file details to `POST /custom_audiences`:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High-value customers",
    "description": "Customers eligible for the summer campaign",
    "file_id": "oaisdmntci_123",
    "identifier_type": "email",
    "filename": "audience.csv",
    "mimetype": "text/csv",
    "file_size": 123456
  }'
```

| Field                   | Required          | Description                                                        |
| ----------------------- | ----------------- | ------------------------------------------------------------------ |
| `name`                  | Yes               | Audience name containing at least three characters.                |
| `description`           | No                | A description of the audience.                                     |
| `file_id`               | For file creation | The file ID returned by `POST /uploads`.                           |
| `identifier_type`       | No                | `email`, `phone`, `email_sha256`, `phone_number_sha256`, `gaid`.   |
| `identifier_resolution` | No                | Set to `auto` for automatic resolution of CSV identifier columns.  |
| `filename`              | With `file_id`    | The uploaded filename, including its `.csv` or `.txt` extension.   |
| `mimetype`              | With `file_id`    | The uploaded file's MIME type, such as `text/csv` or `text/plain`. |
| `file_size`             | With `file_id`    | The exact file size in bytes, from `1` through `500000000`.        |

If you omit `identifier_type`, the API defaults to `email`. For a single-type
file, set the type explicitly. For a mixed-column CSV, add
`"identifier_resolution": "auto"` to the request.

The API returns the new audience and starts processing the uploaded file:

```json
{
  "id": "caud_123",
  "created_at": 1783962000,
  "updated_at": 1783962000,
  "name": "High-value customers",
  "description": "Customers eligible for the summer campaign",
  "status": "processing",
  "hash_spec_version": "custom_audience_join_hash_v1",
  "uploaded_identifier_count_range": "none",
  "matched_identifier_count_range": "none",
  "matched_user_count_range": "none",
  "invalid_identifier_count_range": "none",
  "membership_revision": 0
}
```

### Create an empty audience

To build a list incrementally, create an empty audience without uploading a
placeholder file:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Recent purchasers",
    "description": "Exclude recent purchasers from acquisition campaigns"
  }'
```

Omit `file_id`, `filename`, `mimetype`, `file_size`, and
`identifier_resolution`. Don't upload a zero-byte file. Save the returned
audience ID and wait for it to be `ready` before adding members or using it
for exclusion. An empty exclusion audience doesn't exclude anyone until
members are added.

Create returns an audience object, not a membership operation. Don't assume
it has the Add/Remove replay contract. If the creation response is lost,
check the account's audience list before creating another audience.

## Check processing status

Retrieve the audience with `GET /custom_audiences/{custom_audience_id}`:

```bash
curl "https://api.ads.openai.com/v1/custom_audiences/caud_123" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

Check the audience periodically until preparation finishes. Processing time
depends on input size and the operation. `ready` means preparation succeeded;
it doesn't mean the audience is eligible for every use.

| Status                   | Meaning                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `upload_pending`         | The uploaded file is waiting for processing to begin.                                 |
| `processing`             | The file is being processed and the audience isn't ready to use.                      |
| `rockset_ingest_pending` | Processed identifiers are waiting to be ingested.                                     |
| `publishing`             | The audience is being prepared for targeting and bidding.                             |
| `ready`                  | Processing succeeded. Check eligibility for exclusion, inclusion, or bid adjustments. |
| `too_small`              | The audience didn't meet the size policy applied when it was processed.               |
| `failed`                 | Processing failed. Check the file format, identifier type, and file limits.           |
| `archived`               | The audience is archived and can no longer be used.                                   |

The response returns identifier and matched-user counts as privacy-preserving
ranges, such as `under_25k`, `25k_100k`, `100k_500k`, `500k_1m`,
`1m_5m`, and `5m_plus`. `under_25k` includes empty matched audiences.
For matched counts, `none` means a count isn't available, not that it is zero.
Exact matched counts and individual membership results aren't exposed.

For finer reporting at or above 100,000 matched users, pass
`matched_count_granularity=granular` to a list or retrieve request. Counts
remain privacy-preserving ranges above 5,000,000, with wider ranges used for
larger audiences. Don't use a count range to decide targeting eligibility.

## Update audience membership

List and retrieve responses include `membership_revision`. Read the audience
before a change and pass that value as `expected_revision`. It is optional for
Add and Remove, and required for Replace. The revision values in the examples
are illustrative; use the value you just read.

Wait for each operation to finish before submitting the next dependent change.
After success, retrieve the audience again for its current revision. Don't
assume every request changes membership or increments the revision.

### Add or remove inline identifiers

Add and remove operations accept exactly one uploaded `file_id` or an
`identifiers` array. Each inline identifier includes its own `identifier_type`:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences/caud_123/add" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-add-001" \
  -d '{
    "expected_revision": 0,
    "identifiers": [
      {
        "identifier_type": "email",
        "identifier": "new.customer@example.com"
      },
      {
        "identifier_type": "gaid",
        "identifier": "38400000-8cf0-11bd-b23e-10b96e40000d"
      }
    ]
  }'
```

Inline entries can mix all five supported identifier types. Each entry has
its own type and value. Don't also send `file_id`.

Use the same request shape with `/remove` to remove customers, with a fresh
revision and a new key for the Remove operation:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences/caud_123/remove" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-remove-001" \
  -d '{
    "expected_revision": 1,
    "identifiers": [
      {"identifier_type": "email", "identifier": "new.customer@example.com"}
    ]
  }'
```

Add doesn't duplicate a user who is already a member. Remove doesn't change
membership for an absent user or permanently prevent a later Add. Unmatched
identifiers can leave membership unchanged.

Batches of up to 10,000 inline identifiers use the small-update path. Larger
inline batches use file-based processing; 10,000 is not a hard item-count
limit. The entire Add/Remove request body must fit within 16 MiB
(16,777,216 bytes), or the API returns `413`. Prefer files for bulk updates.

### Add or remove using a file

Upload the delta file with `purpose=custom_audience`, then call `/add` or
`/remove` with its `file_id` instead of `identifiers`:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences/caud_123/add" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-file-add-001" \
  -d '{
    "file_id": "oaisdmntci_456",
    "identifier_resolution": "auto",
    "expected_revision": 2
  }'
```

This example accepts a CSV with mixed identifier columns. For a single-type
file, you can send `identifier_type` instead of `identifier_resolution`.
Add/Remove use the filename, MIME type, and size saved with the upload; don't send
those metadata fields in the mutation body.

An Add file contains only customers to add. A Remove file contains only
customers to remove; members omitted from the file remain in the audience.
Use Replace when the file is a full snapshot of the desired membership.

### Replace the full list

Upload the complete desired audience, read the current membership revision,
then submit the file and revision to `/replace`:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences/caud_123/replace" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-replace-001" \
  -d '{
    "file_id": "oaisdmntci_789",
    "identifier_resolution": "auto",
    "expected_revision": 3
  }'
```

Replace requires `file_id` and a nonnegative `expected_revision`; it doesn't
accept inline identifiers. The audience keeps its ID and existing campaign
and ad-group references. The current membership stays available while the
replacement is prepared, then the new membership is published.

The audience can still show `ready` during replacement. Poll the returned
operation to determine when the replacement finishes, rather than relying on
audience status alone. Don't emulate replacement by removing every member
and adding them back.

### Merge audiences into a new list

Merge combines 2 to 64 distinct, ready audiences in the same ad account,
counting each matched user once. Wait for pending source updates to finish before merging:

```bash
curl -X POST "https://api.ads.openai.com/v1/custom_audiences/merge" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-merge-001" \
  -d '{
    "name": "All qualified customers",
    "custom_audience_ids": ["caud_source_1", "caud_source_2"]
  }'
```

The new audience is independent. The sources don't change, future source
updates don't propagate to the merged audience, and existing campaigns don't
automatically switch to the new ID. Poll the operation using the
`custom_audience_id` returned by Merge, not a source audience ID.

## Poll and recover membership operations

Use these endpoints for each membership change:

| Goal                      | Endpoint                                              | Required body fields           |
| ------------------------- | ----------------------------------------------------- | ------------------------------ |
| Add identifiers           | `POST /custom_audiences/{custom_audience_id}/add`     | `file_id` or `identifiers`     |
| Remove identifiers        | `POST /custom_audiences/{custom_audience_id}/remove`  | `file_id` or `identifiers`     |
| Replace all identifiers   | `POST /custom_audiences/{custom_audience_id}/replace` | `file_id`, `expected_revision` |
| Merge into a new audience | `POST /custom_audiences/merge`                        | `name`, `custom_audience_ids`  |

Every membership operation requires an `Idempotency-Key` header. Reuse the key
only to retry the same operation; retries return or resume the first accepted
input. Don't change the file, identifiers, or revision under an existing key:
a repeated key can return the original operation without checking the new
body. Save the original request, key, audience ID, and operation ID securely.

The response contains a privacy-safe operation object:

```json
{
  "operation_id": "caudop_123",
  "custom_audience_id": "caud_123",
  "operation": "add",
  "status": "processing"
}
```

Poll `GET /custom_audiences/{custom_audience_id}/operations/{operation_id}`
until `status` is `succeeded` or `failed`. The response exposes only the
operation ID, audience ID, operation type, and status; it doesn't return raw
identifiers, matching counts, or individual membership outcomes.

```bash
curl \
  "https://api.ads.openai.com/v1/custom_audiences/caud_123/operations/caudop_123" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

Handle these responses without starting duplicate work:

| Response                                            | What to do                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `processing`                                        | Continue polling with increasing delays.                                                                                                        |
| `succeeded`                                         | Retrieve the audience and its current revision before another change.                                                                           |
| `failed`                                            | Stop polling and reconcile the result before submitting another operation. Contact support with the operation ID if needed.                     |
| `409 custom_audience_operation_recovery_required`   | The Add/Remove was interrupted and may be partially applied. Resend the original POST with the same body and key, then poll the same operation. |
| `503 custom_audience_operation_unavailable`         | Status is temporarily unavailable. Retry the status request with increasing delays; don't assume failure.                                       |
| `409 custom_audience_mutation_conflict`             | Wait for competing work, retrieve the current state, and reconsider the intended change.                                                        |
| `409 custom_audience_replacement_revision_conflict` | Refresh the audience revision before submitting a new replacement.                                                                              |
| `429`                                               | Back off and retry, retaining the original key for an accepted mutation.                                                                        |

For a lost submission response, retry the original endpoint, body, and key.
An interrupted Add/Remove may have changed some membership already. Don't
use a new key, replay the entire job as new work, or submit an inverse update
to guess at recovery. If recovery can't continue, contact support with the
operation ID and request ID, without sending raw identifiers.

## Check eligibility for the intended use

Use-specific eligibility is separate from `status: "ready"`:

| Intended use     | Size requirement                                                                 |
| ---------------- | -------------------------------------------------------------------------------- |
| `exclusion`      | Ready small or empty audiences can be used. No minimum matched size is required. |
| `inclusion`      | The audience must meet the matched-user minimum.                                 |
| `bid_multiplier` | The audience must meet the matched-user minimum for bid adjustments.             |

For inclusion and bid adjustments, use 25,000 matched users as the public
planning threshold. Privacy safeguards can affect the exact boundary, and
uploading 25,000 identifiers doesn't guarantee enough matched users. Don't send an `exclusion_only` creation field: eligibility depends on how
you use the audience.

Request audiences eligible for the intended use:

```bash
curl -G "https://api.ads.openai.com/v1/custom_audiences" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "intended_use=exclusion" \
  --data-urlencode "custom_audience_ids[]=caud_123"
```

Use `inclusion` or `bid_multiplier` to check those uses. Repeat
`custom_audience_ids[]` for multiple IDs, or omit it to list eligible
audiences in the account. The response contains only eligible audiences and
a `policy_revision` token.

To recheck the selection, send that `policy_revision` with the intended use
and the selected IDs. If the API returns
`409 custom_audience_policy_revision_mismatch`, refresh without the old
token and review the selection again. `policy_revision` is not
`membership_revision` or a campaign-write parameter. The server validates
eligibility again when you save campaign or ad-group settings.

## Include or exclude audiences in a campaign

Use ready audiences eligible for the intended use in the campaign's `targeting`
object. Add audience IDs to
`custom_audiences.ids` to include matched users or
`excluded_custom_audiences.ids` to exclude them:

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-campaign-001" \
  -d '{
    "name": "High-value customer campaign",
    "description": "Campaign targeting selected customer audiences",
    "status": "paused",
    "bidding_type": "clicks",
    "budget": {
      "lifetime_spend_limit_micros": 300000000
    },
    "targeting": {
      "locations": {
        "countries": ["US"]
      },
      "custom_audiences": {
        "ids": ["caud_123"]
      },
      "excluded_custom_audiences": {
        "ids": ["caud_456"]
      }
    }
  }'
```

Audience inclusion and exclusion work as follows:

- Include audiences to deliver only to users who belong to at least one
  included audience.
- Exclude audiences to prevent delivery to users who belong to an excluded
  audience.
- If you use both, exclusions take precedence and the remaining audience must
  still meet the minimum size requirement.
- Don't include and exclude the same audience in a campaign.

For an exclusion-only campaign, omit `custom_audiences` and provide only
`excluded_custom_audiences`. A small exclusion audience doesn't need to meet
the inclusion minimum. If you combine inclusion and exclusion, the remaining
eligible audience must still meet the minimum.

The same fields apply to `POST /campaigns/{campaign_id}`. Preserve the other
targeting settings you want to keep when updating the targeting object.

For the remaining campaign parameters, see
[Campaigns](https://developers.openai.com/ads/api-reference/campaigns).

## Adjust bids for an audience

Add `custom_audience_bid_multipliers` to an ad group's `bidding_config` to
raise or lower the maximum bid for a ready audience eligible for
`intended_use=bid_multiplier`. Small exclusion audiences aren't automatically
eligible for bid adjustments. Bid multipliers don't change which users are
eligible to see a campaign.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: custom-audience-ad-group-001" \
  -d '{
    "campaign_id": "cmpn_123",
    "name": "High-value customers",
    "description": "Higher bid for selected customers",
    "status": "paused",
    "bidding_config": {
      "billing_event_type": "click",
      "max_bid_micros": 7500000,
      "custom_audience_bid_multipliers": [
        {
          "custom_audience_id": "caud_123",
          "bid_multiplier_micros": 2000000
        }
      ]
    }
  }'
```

Multipliers are expressed in millionths:

| `bid_multiplier_micros` | Bid multiplier |
| ----------------------- | -------------- |
| `100000`                | 0.1×           |
| `1000000`               | 1×             |
| `2000000`               | 2×             |
| `10000000`              | 10×            |

The supported range is `100000` through `10000000`. If a user matches multiple
configured audiences, the highest matching multiplier applies. For the
remaining ad group parameters, see [Ad Groups](https://developers.openai.com/ads/api-reference/ad-groups).

## Handle targeting safeguards and conflicts

Membership changes must preserve the size requirements of campaigns and bid
adjustments that reference the audience. For example, removing users from an
inclusion audience or adding users to an exclusion audience can make a
campaign's remaining eligible population too small. The API can reject the
change; using a file instead of inline identifiers doesn't bypass this check.

A campaign or ad-group update can conflict with an in-progress membership
change. `409 custom_audience_mutation_conflict` means that targeting update
wasn't applied. Wait for the membership operation to finish, retrieve the
current settings, and retry the intended edit if it is still appropriate.

## List and archive audiences

List the custom audiences associated with your API key's ad account:

```bash
curl -G "https://api.ads.openai.com/v1/custom_audiences" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "limit=20"
```

Use the membership operations above to update an audience. Archive an audience
only when you no longer need it:

```bash
curl -X POST \
  "https://api.ads.openai.com/v1/custom_audiences/caud_123/archive" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY"
```

Archiving is permanent. An archived audience can't be restored or used in
campaign targeting or bid adjustments.

---

# Delta Feeds API

The Delta Feeds API updates availability, titles, and prices for existing
variants in a linked product feed. Send only the products that changed instead
of uploading your entire catalog again.

Access to the Delta Feeds API is enabled per ad account. If a request returns
  `403` with `product_feed_api_disabled` or `product_feed_delta_api_disabled`,
  contact your OpenAI account team to confirm access.

## Before you begin

You need:

- An Ads API key from the ad account's **Settings** tab in
  [Ads Manager](https://ads.openai.com).
- A product feed linked to that ad account and its feed ID.
- An initial catalog already uploaded to the feed.
- The existing parent product and variant identifiers from that catalog.

The endpoint updates existing feed variants. It doesn't create feeds, upload
full catalogs, or add products that aren't already in the feed. See
[Product Feeds](https://developers.openai.com/ads/product-feeds) to set up the initial catalog.

## Update product variants

Send a `PATCH` request with each changed product and its affected variants.
You can update a variant's price, availability, or both.

`PATCH /feeds/{feed_id}/products`

```bash
curl -X PATCH \
  "https://api.ads.openai.com/v1/feeds/product_feed_123/products" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "id": "running-shoe-001",
        "variants": [
          {
            "id": "running-shoe-001-black-9",
            "availability": {
              "available": false
            }
          },
          {
            "id": "running-shoe-001-white-9",
            "title": "Running shoe - white, size 9",
            "price": {
              "amount": 8999,
              "currency": "USD"
            },
            "availability": {
              "status": "in_stock"
            }
          }
        ]
      }
    ]
  }'
```

The API returns `200 OK` with the feed ID and an acceptance result:

```json
{
  "id": "product_feed_123",
  "accepted": true
}
```

`accepted: true` means the update was accepted by feed processing. It doesn't
mean downstream indexing, ad eligibility, or serving has already updated. Check
the `accepted` value before treating the request as successful.

### Request fields

| Field                                | Type     | Required | Description                                                                                           |
| ------------------------------------ | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `products`                           | object[] | Yes      | One or more existing products to update.                                                              |
| `products[].id`                      | string   | Yes      | The parent product identifier from the existing catalog.                                              |
| `products[].variants`                | object[] | Yes      | One or more existing variants of the parent product.                                                  |
| `products[].variants[].id`           | string   | Yes      | The existing variant or item identifier from the catalog.                                             |
| `products[].variants[].title`        | string   | No       | Updated title for this variant.                                                                       |
| `products[].variants[].price`        | object   | No       | Updated price for this variant.                                                                       |
| `price.amount`                       | integer  | Yes      | Nonnegative price in minor units (`8999` means `$89.99` in `USD`).                                    |
| `price.currency`                     | string   | Yes      | Supported three-letter currency code, such as `USD`.                                                  |
| `products[].variants[].availability` | object   | No       | Updated availability for this variant.                                                                |
| `availability.available`             | boolean  | No       | `true` maps to `in_stock`; `false` maps to `out_of_stock`.                                            |
| `availability.status`                | string   | No       | Explicit availability, such as `in_stock` or `out_of_stock`. Overrides `available` when both are set. |

Both `products` and every `variants` array must contain at least one item.
Product and variant IDs must be nonempty. Don't include the same variant more
than once in a request.

Send the feed ID in the URL, the parent product ID in `products[].id`, and the
variant ID in `products[].variants[].id`. Don't send `shop_id`,
`scoped_offer_id`, or `target_country`; feed ownership, product identity, and
supported countries are resolved from the linked feed.

## Understand how changes are applied

The initial feed upload supplies the full product record. A delta request
changes only the specified fields on existing variants and preserves the
remaining catalog data.

After feed processing accepts an update, downstream systems apply the change
asynchronously. An out-of-stock product stops qualifying for delivery after the
change propagates. Marking a product in stock doesn't guarantee that it will
serve: the product, campaign, ad group, and ad must still meet normal
[serving requirements](https://developers.openai.com/ads/product-feeds#understand-serving-eligibility).

There is no completion timestamp or downstream processing result in the
acceptance response. Use your normal feed and campaign monitoring to verify the
result.

## Handle common errors

| Status | Cause                                                                                                      | Action                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `400`  | A required field is missing, a product or variant list is empty, or the request includes an unknown field. | Verify the request body and send only supported fields.                                       |
| `401`  | The Ads API key is missing or invalid.                                                                     | Use an active Ads API key in the `Authorization: Bearer` header.                              |
| `403`  | Feed API access is disabled or the account lacks permission to manage feed data.                           | Check account permissions and ask your OpenAI account team to confirm Delta Feeds API access. |
| `404`  | The feed doesn't exist or isn't linked to the ad account associated with the API key.                      | Confirm the feed ID and use the API key for the account that owns the feed.                   |

If the error code is `product_feed_api_disabled` or
`product_feed_delta_api_disabled`, access hasn't been enabled for the account.
Don't retry unchanged requests until access or the underlying request issue is
resolved.

## Next steps

- [Set up a product feed and product-feed campaign](https://developers.openai.com/ads/product-feeds).
- [Review Advertiser API authentication](https://developers.openai.com/ads/api-reference/authentication).
- [Understand Advertiser API access and limits](https://developers.openai.com/ads/api-overview).

---

# Image Tag

Use an image tag to send a website conversion when a page loads without
running JavaScript. Each image request sends one event.

Use the [JavaScript Pixel](https://developers.openai.com/ads/measurement-pixel) for events triggered by
clicks, form submissions, or other interactions after the page loads. Use the
[Conversions API](https://developers.openai.com/ads/conversions-api) when you can send the event from your
server.

## Install an image tag

Add a hidden 1 × 1 image to the `<body>` of the page where the event happens:

```html
<img
  src="https://bzr.openai.com/v1/sdk/events
?pid=<PIXEL-ID>
&event=page_viewed
&data[type]=contents"
  width="1"
  height="1"
  style="display:none"
  alt=""
/>
```

Replace `<PIXEL-ID>` with the Pixel ID from the conversions tab in Ads
Manager. Render the tag only after collecting any consent required for
measurement.

To use the image as a fallback for the JavaScript Pixel, put it inside a
`<noscript>` element in the page body. The tag then loads only when JavaScript
is unavailable:

```html
<noscript>
  <img
    src="https://bzr.openai.com/v1/sdk/events
?pid=<PIXEL-ID>
&event=page_viewed
&data[type]=contents"
    width="1"
    height="1"
    style="display:none"
    alt=""
  />
</noscript>
```

Don't use `<noscript>` for a standalone image-tag integration that should run
when the browser runs JavaScript.

## Add event data

Set `event` to a [supported event name](https://developers.openai.com/ads/supported-events) and set
`data[type]` to the event's documented data type. Prefix each event
data field with `data[...]`.

This example sends an `order_created` event with an amount, currency,
deduplication ID, and attribution identifier:

```html
<img
  src="https://bzr.openai.com/v1/sdk/events
?pid=<PIXEL-ID>
&event=order_created
&event_id=evt_01JX8M6K4Q7F9A2B3C5D6E7F8G
&oppref=<OPPREF>
&data[type]=contents
&data[amount]=2599
&data[currency]=USD"
  width="1"
  height="1"
  style="display:none"
  alt=""
/>
```

If an `oppref` value is available, replace `<OPPREF>` with that value. Otherwise,
remove the `oppref` parameter. The image tag doesn't capture or store `oppref`
for you.

All dynamic query values must be URL-encoded. For `data[contents]`, serialize
the contents array as JSON, then URL-encode the complete JSON value. Keep the
request small enough to fit within browser and server URL-length limits.

If you send the same conversion through the image tag and the Conversions API,
use the image tag's `event_id` value as the Conversions API event's `id`, and
use the same Pixel ID for both events. For custom events, also use the same
`custom_event_name`. See how to
[prevent duplicate browser and server events](https://developers.openai.com/ads/conversions-api#deduplicate-browser-and-server-events).

## Send a custom event

Use `event=custom` only when no standard event describes the conversion. A
custom event also requires `custom_event_name` and `data[type]=custom`:

```html
<img
  src="https://bzr.openai.com/v1/sdk/events
?pid=<PIXEL-ID>
&event=custom
&custom_event_name=quote_requested
&event_id=evt_01JX8M9T2V4W6Y8Z0A1B3C5D7E
&data[type]=custom
&data[plan_id]=enterprise"
  width="1"
  height="1"
  style="display:none"
  alt=""
/>
```

Custom event names must be 1 to 64 characters long, contain only letters,
numbers, underscores, or dashes, and start and end with a letter or number. A
custom event name can't match a standard event name. Use lowercase names for
consistency.

## Parameters

| Parameter           | Required | What to send                                                                                                   |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `pid`               | Yes      | Your Pixel ID.                                                                                                 |
| `event`             | Yes      | A [supported event name](https://developers.openai.com/ads/supported-events), or `custom`.                                                  |
| `custom_event_name` | Depends  | Required when `event=custom`. Omit it for standard events.                                                     |
| `event_id`          | No       | A unique deduplication ID. Reuse it only when retrying or sending the same conversion through another channel. |
| `oppref`            | No       | An OpenAI-provided privacy-preserving attribution identifier.                                                  |
| `data[type]`        | Yes      | The [data type](https://developers.openai.com/ads/supported-events#event-data-shapes) required by the event.                                |
| `data[<field>]`     | No       | Any field documented for the selected data type. OpenAI rejects unknown fields.                                |

Provide each parameter at most once. Amounts and quantities are integers. If
you include `data[amount]`, also include `data[currency]` as a three-letter ISO
4217 code such as `USD`.

## Test the request

Use a test Pixel ID when possible. This command sends a real `page_viewed`
event and prints the HTTP status and response content type:

```bash
curl --get --silent --show-error \
  --header "Referer: https://shop.example.com/pricing" \
  --data-urlencode "pid=<PIXEL-ID>" \
  --data-urlencode "event=page_viewed" \
  --data-urlencode "event_id=evt_image_tag_test_01" \
  --data-urlencode "data[type]=contents" \
  --output /dev/null \
  --write-out "%{http_code} %{content_type}\n" \
  "https://bzr.openai.com/v1/sdk/events"
```

An accepted request returns:

```text
200 image/gif
```

A `200` response confirms that OpenAI published the event to its ingestion
pipeline. It doesn't confirm completion of downstream event processing. In a
browser, use the Network panel to inspect the hidden image request and its
status.

## Limitations

- A static image tag loads with the page. It can't measure clicks, form
  submissions, or other interactions that happen later.
- Each request sends one event. The image tag doesn't batch events.
- GET requests have URL-length limits. Use the JavaScript Pixel or Conversions
  API for larger `contents` arrays or other large payloads.
- The image tag doesn't support a `user` object. Don't put personal data,
  secrets, session IDs, customer identifiers, or order identifiers in any
  query parameter.
- The image tag doesn't capture `oppref` automatically. Pass it only when your
  page-rendering system already has the value.

---

# Measurement Pixel

The ChatGPT Ads Measurement Pixel is a browser SDK for measuring website events
that can be attributed to ads in ChatGPT. Add the script to your site, initialize
it with your Pixel ID, and call `oaiq("measure", ...)` when a conversion happens.

If a page needs to measure conversions for more than one Pixel ID, see
[Configure more than one Pixel ID](https://developers.openai.com/ads/multiple-pixels).

## Attribution reporting

The same events support click-through attribution and, when available for your
account, view-through attribution. Click-through attribution uses the applicable
configured click window. View-through conversions use a fixed one-day window
after an eligible ad impression. Whether view-through reporting is available
does not depend on your configured click window. If a conversion is eligible
for both, the click takes precedence.

View-through reporting requires no changes to your Pixel integration or event
payload. Ads Manager reports view-through conversions as a separate,
campaign-level metric. They are not included in `Conversions`, which remains
the click-through conversion total. CPA, post-click CVR, bidding, billing, and
conversion optimization also remain click-through-based.

## Install the Measurement Pixel

Add the following snippet to the `<head>` section every page where you want to capture
conversions. Put the script near the top of your `<head>` to ensure early conversions aren't lost while other content loads.

```html
<script>
  (function (w, d, s, u) {
    if (w.oaiq) return;
    var q = function () {
      q.q.push(arguments);
    };
    q.q = [];
    w.oaiq = q;
    var js = d.createElement(s);
    js.async = true;
    js.src = u;
    var f = d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(js, f);
  })(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");

  oaiq("init", {
    pixelId: "<YOUR-PIXEL-ID>",
  });
</script>
```

`pixelId` is required. Create a new Pixel ID in the conversions tab of Ads Manager. `debug` is optional and logs SDK activity to the browser
console while you test your integration.

## Control measurement consent

If consent is required to track conversion events, use the Pixel's consent
feature. Set consent before initializing the Pixel:

```js
oaiq("consent", false);
oaiq("init", {
  pixelId: "<YOUR-PIXEL-ID>",
});

// Call this after the user grants measurement consent.
oaiq("consent", true);
```

The Pixel initializes consent to `true` by default unless you set it to `false`
or the Pixel finds a stored denial. When consent is `false`, the Pixel doesn't
send measurement-event pings. Setting it to `true` allows future measurement
events; blocked events aren't replayed.

## Configure a content security policy

If your site enforces a Content Security Policy (CSP), merge these sources into
your existing policy:

| Directive     | Source                      | Purpose                                      |
| ------------- | --------------------------- | -------------------------------------------- |
| `script-src`  | `https://bzrcdn.openai.com` | Load the Measurement Pixel SDK.              |
| `connect-src` | `https://bzr.openai.com`    | Send events with `fetch` or `sendBeacon`.    |
| `connect-src` | `https://bzrcdn.openai.com` | Fetch per-pixel configuration.               |
| `img-src`     | `https://bzr.openai.com`    | Send events with the image request fallback. |

For example, a policy that otherwise allows only same-origin resources and uses
a nonce would include:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<NONCE>' https://bzrcdn.openai.com; connect-src 'self' https://bzr.openai.com https://bzrcdn.openai.com; img-src 'self' https://bzr.openai.com;
```

Replace `<NONCE>` with a fresh nonce for each response and add the same value to
the installation snippet's opening tag: `<script nonce="<NONCE>">`. You can use
your site's existing hash-based CSP mechanism instead. Don't add `'unsafe-inline'`
solely for the Measurement Pixel. If your policy defines `script-src-elem`, add
the CDN source and your nonce or hash source to that directive as well.

## Send user data

Add an optional `user` object to `oaiq("init", ...)` to improve conversion
matching. User data is request-scoped, so don't add it to individual
`oaiq("measure", ...)` calls.

Every field in the `user` object is optional. Include only the fields you have
for the user.

### Normalize identifiers before hashing

Normalize each identifier as follows:

- Email address: trim leading and trailing whitespace and convert the value to
  lowercase.
- Phone number: keep the country calling code. Remove all whitespace,
  parentheses, periods, and hyphens, then remove a leading `+` and any
  leading zeroes. Hash the resulting 8–15 digits. For example,
  `+1 (415) 555-2671` becomes `14155552671`.
- External ID: trim leading and trailing whitespace. Preserve case and all
  other characters.
- First and last name: convert the value to lowercase and remove all whitespace
  and ASCII punctuation. Apart from converting to lowercase, preserve non-ASCII characters;
  don't strip accents or transliterate. For example, `O'Connor` becomes
  `oconnor`, and `José` becomes `josé`.

The normalized value is the exact string to encode and hash:

| Identifier   | Input               | Normalized value |
| ------------ | ------------------- | ---------------- |
| Phone number | `+1 (415) 555-2671` | `14155552671`    |
| First name   | `Mary Jane`         | `maryjane`       |
| Last name    | `O'Connor`          | `oconnor`        |
| First name   | `José`              | `josé`           |

Encode each normalized value as UTF-8, compute its SHA-256 digest, and send the
digest as a lowercase, 64-character hexadecimal string. Don't send raw email
addresses, phone numbers, external IDs, first names, or last names.

```js
oaiq("init", {
  user: {
    email_sha256:
      "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514",
    phone_number_sha256:
      "758fbf68945f21c416814c539ab578876c8d98fb69e6da692def92cd52417fe0",
    external_id_sha256:
      "73d83a078369bb4f0971b317aa7797a91cf5c0df1b62161c2e47d75c33ab5b6e",
    first_name_sha256:
      "fdee430d40bd57deeac186cd9790033d0f06f909a8806e7ce6e717ab7c7d5029",
    last_name_sha256:
      "fb1e7ec987523d2cb9e022cec1d6ae7c99dc46edfae4fe51254025fe4bea571f",
    country: "US",
    city: "San Francisco",
    region: "California",
    postal_code: "94107",
  },
});
```

If these values are available when the installation snippet runs, you can
instead include the same `user` object in the initial `oaiq("init", ...)` call
with your Pixel ID.

| Field                 | Description                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `email_sha256`        | SHA-256 hash of the email address after trimming whitespace and converting it to lowercase.                                   |
| `phone_number_sha256` | SHA-256 hash of 8–15 digits after removing a leading `+`, leading zeroes, whitespace, parentheses, periods, and hyphens.      |
| `external_id_sha256`  | SHA-256 hash of a stable, pseudonymous customer identifier from your system.                                                  |
| `first_name_sha256`   | SHA-256 hash of the lowercase first name after removing whitespace and ASCII punctuation; non-ASCII characters are preserved. |
| `last_name_sha256`    | SHA-256 hash of the lowercase last name after removing whitespace and ASCII punctuation; non-ASCII characters are preserved.  |
| `country`             | Two-letter ISO 3166-1 country code, such as `US`.                                                                             |
| `city`                | City name, with a maximum of 128 characters. OpenAI trims whitespace and converts it to lowercase.                            |
| `region`              | State, province, or region, with a maximum of 128 characters.                                                                 |
| `postal_code`         | Postal or ZIP code. Use letters, numbers, spaces, or hyphens, with a maximum of 32 characters.                                |

If user data becomes available after the first `init` call, such as after login,
call `init` again with the complete `user` object. When a page initializes only
one pixel, you can omit `pixelId` after the first successful initialization. If
a page initializes more than one pixel, always include the intended `pixelId`
when updating user data.

## Automatic advanced matching

Automatic advanced matching improves website conversion measurement by helping
match more conversions to your ads when a click identifier is unavailable.

When enabled, the OpenAI Pixel automatically detects supported customer
information from your website. The Pixel normalizes and securely hashes this
information in the browser using SHA-256 before including it with conversion
events. Raw customer information is not sent to OpenAI through automatic
advanced matching.

You do not need to manually pass customer information or make any changes to
your Pixel implementation.

## Send events

The Measurement Pixel does not support `app_installed` or `app_opened`.

Send these events server-side through the
[Conversions API](https://developers.openai.com/ads/conversions-api).
Use a standard event whenever one matches the action you want to measure.

Use a standard event whenever one matches the action you want to measure. For
example, send `order_created` when a purchase is completed:

```js
oaiq("measure", "order_created", {
  type: "contents",
  amount: 2599,
  currency: "USD",
});
```

A `measure` call accepts up to four arguments, in this order:

| Argument   | Required | What to send                                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| Command    | Yes      | The command `"measure"`.                                                                          |
| Event name | Yes      | A [supported event name](https://developers.openai.com/ads/supported-events), such as `order_created`, or `"custom"`.          |
| Event data | Yes      | An object whose `type` matches the event's [data shape](https://developers.openai.com/ads/supported-events#event-data-shapes). |
| Options    | Depends  | Optional for standard events. Required for custom events to pass `custom_event_name`.             |

The event name describes what happened. The event data object's `type` selects
the shape of the accompanying data. For example, `order_created` uses the
`contents` data type.

The options object supports these fields:

| Field               | When to use it                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `event_id`          | Set a unique ID to identify the same event sent from the browser and server.                         |
| `custom_event_name` | Name a custom event. This field is required for custom events and isn't supported for standard ones. |
| `opt_out`           | Set to `true` to opt out the event from future user-level personalization. Defaults to `false`.      |

### Send a custom event

Use a custom event only when none of the standard event names describe the
action. This is the smallest valid custom event:

```js
oaiq(
  "measure",
  "custom",
  { type: "custom" },
  { custom_event_name: "quote_requested" }
);
```

The three custom-event values serve different purposes:

- `"custom"` in the second position identifies this as a custom event.
- `{ type: "custom" }` selects the custom event data shape.
- `custom_event_name` gives the event its descriptive name.

You can add `plan_id`, `amount`, `currency`, or `contents` to the event data
object. Add `event_id` to the options object when you need browser and server
deduplication.

Custom event names must:

- Be 1 to 64 characters long.
- Contain only letters, numbers, underscores, or dashes.
- Start and end with a letter or number.
- Not match a standard event name.

Use lowercase names for consistency.

## Standard event examples

Use these examples as templates for common measurement patterns.

### Page and content views

```js
oaiq("measure", "page_viewed", {
  type: "contents",
  contents: [
    {
      id: "pricing",
      name: "Pricing page",
      content_type: "page",
    },
  ],
});

oaiq("measure", "contents_viewed", {
  type: "contents",
  contents: [
    {
      id: "sku_123",
      name: "Starter bundle",
      content_type: "product",
    },
  ],
});
```

### Commerce flow

Use the `contents` data shape for `items_added`, `checkout_started`, and
`order_created`.

```js
oaiq("measure", "items_added", {
  type: "contents",
  amount: 2599,
  currency: "USD",
  contents: [
    {
      id: "sku_123",
      name: "Starter bundle",
      content_type: "product",
      quantity: 1,
      amount: 2599,
      currency: "USD",
    },
  ],
});

oaiq("measure", "checkout_started", {
  type: "contents",
  amount: 2599,
  currency: "USD",
  contents: [
    {
      id: "sku_123",
      name: "Starter bundle",
      content_type: "product",
      quantity: 1,
    },
  ],
});

oaiq("measure", "order_created", {
  type: "contents",
  amount: 2599,
  currency: "USD",
  contents: [
    {
      id: "sku_123",
      name: "Starter bundle",
      content_type: "product",
      quantity: 1,
    },
  ],
});
```

### Lead generation and registration

Use the `customer_action` data shape for `lead_created`,
`registration_completed`, and `appointment_scheduled`.

```js
oaiq("measure", "lead_created", {
  type: "customer_action",
});

oaiq("measure", "registration_completed", {
  type: "customer_action",
});

oaiq("measure", "appointment_scheduled", {
  type: "customer_action",
  amount: 5000,
  currency: "USD",
});
```

### Subscription and trial events

Use the `plan_enrollment` data shape for `subscription_created` and
`trial_started`.

```js
oaiq("measure", "subscription_created", {
  type: "plan_enrollment",
  plan_id: "pro_monthly",
  amount: 2000,
  currency: "USD",
});

oaiq("measure", "trial_started", {
  type: "plan_enrollment",
  plan_id: "pro_trial",
});
```

{/* vale Vale.Spelling = NO */}

## Deduplicate browser and server events

{/* vale Vale.Spelling = YES */}

If you send the same conversion from both the Measurement Pixel and a
server-side integration, reuse the same `event_id` in both places.

```js
oaiq(
  "measure",
  "order_created",
  {
    type: "contents",
    amount: 2599,
    currency: "USD",
  },
  {
    event_id: "order_12345",
  }
);
```

When you need deduplication across browser and server events, generate the
`event_id` yourself and reuse it on the same pixel and server-sent event. For
custom events, keep the same `custom_event_name` on both sides as well.
Duplicate-event matching uses your Pixel ID, the event name, and `event_id`. For
custom events, `custom_event_name` replaces the standard event name in that
match. OpenAI uses the first event it receives for a matching key and ignores
later duplicates.

## What the SDK handles automatically

The Pixel handles several transport details for you:

- It captures `oppref` from the landing page URL, which is a privacy-preserving identifier
- It stores `oppref` in a first-party `__oppref` cookie so later page views can
  reuse it.
- It adds the current page origin as `source_url`.
- It timestamps each event and batches closely grouped `measure` calls.
- When automatic advanced matching is enabled, it detects supported customer
  information from your website, securely hashes it using SHA-256, and includes
  the resulting SHA-256 hash with conversion events.

No manual configuration of these details is necessary when using the pixel.

## Troubleshooting

- Keep `debug: true` while testing so you can inspect Pixel activity in the
  browser console.
- Use integer values for `amount` and `quantity`.
- Use only the documented fields inside `contents[]`.
- Always use the pixel on the browser. Do not call the server conversions API directly from page code.

---

# Multiple Pixel IDs

Use multiple Pixel IDs when the same website measures conversions for more than
one advertiser, brand, or integration partner. Install the
[JavaScript Pixel](https://developers.openai.com/ads/measurement-pixel) once, initialize each Pixel ID, and
choose whether to send each event to all pixels or only one.

## Initialize multiple pixels

Call `oaiq("init", ...)` for each Pixel ID:

```js
oaiq("init", { pixelId: "<PIXEL-ID-A>" });
oaiq("init", { pixelId: "<PIXEL-ID-B>" });
```

Load the SDK only once, and initialize each pixel before sending events to it.

## Send an event to every pixel

The `measure` command sends an event to every Pixel ID initialized at the time
of the call:

```js
oaiq("measure", "page_viewed", {
  type: "contents",
});
```

Both `<PIXEL-ID-A>` and `<PIXEL-ID-B>` receive the event. A pixel you initialize
later doesn't receive earlier events.

## Send an event to one pixel

Use `measureSingle` to send an event only to a specified Pixel ID:

```js
oaiq("measureSingle", "<PIXEL-ID-A>", "order_created", {
  type: "contents",
  amount: 2599,
  currency: "USD",
});
```

Only `<PIXEL-ID-A>` receives this event. `<PIXEL-ID-B>` doesn't receive it.

`measureSingle` accepts the same event data and optional event options as
`measure`, with the Pixel ID inserted before the event name:

```js
oaiq("measureSingle", pixelId, eventName, eventData, eventOptions);
```

Initialize the target Pixel ID before calling `measureSingle`. The SDK doesn't
send events for an unknown Pixel ID to another pixel.

For event names, event data, custom events, and event options, see
[Send events](https://developers.openai.com/ads/measurement-pixel#send-events).

---

# Product Feeds

A product feed is a merchant catalog that keeps product details such as titles,
descriptions, prices, availability, images, and destination URLs up to date.
Instead of creating a separate ad for every item, you connect the feed to a
campaign and let OpenAI select an eligible product when the ad serves.

## Understand the product-feed workflow

Each part of the Ads hierarchy has a different role:

| Part                | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| Product feed        | Supplies the merchant's current catalog.                                    |
| Campaign            | Sets the budget, schedule, targeting, and `product_feed` mode.              |
| Product set         | Selects one linked feed and optionally filters the products that can serve. |
| Product-ad template | Defines how values from the selected product appear in the ad.              |

For example, a product set can limit a shoe catalog to one brand. The product-ad
template can then fill its title, description, and price from whichever eligible
shoe is selected.

## Before you begin

You need:

- An ad account eligible to create ads.
- A product feed linked to that ad account.
- The feed ID shown in Ads Manager.
- An Ads API key issued from the ad account's **Settings** tab.

All API requests in this guide use the public Advertiser API and the
[standard bearer-token authentication](https://developers.openai.com/ads/api-reference/authentication).

## Set up the feed in Ads Manager

For product-feed Ads campaigns, use the **Feeds** area in [Ads
Manager](https://ads.openai.com) to create the feed connection and configure
its credentials. Upload the merchant catalog to the SFTP location shown there.

The public Advertiser API does not provide endpoints to create a feed
  connection, list linked feeds, or upload a catalog file. This Ads catalog
  transfer uses SFTP; `POST /upload` is only for static ad creative assets.

After the initial catalog upload, use the
[Delta Feeds API](https://developers.openai.com/ads/delta-feeds) to update availability or titles for
existing product variants without uploading the entire catalog again.

## Use the correct feed schema

OpenAI supports Google-compatible product data feeds.

The [stable product feed specification](https://developers.openai.com/commerce/specs/file-upload/products)
is the complete flat-file field reference. Its `Required` labels describe the
non-Ads feed requirement set. Ads product feeds use the same base schema and
add one per-product eligibility requirement.

| Feed type            | Required schema                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-Ads product feed | Include every field marked `Required` in the stable product feed specification. `is_ads_eligible` is optional; omit it or set it to `false` to keep the product out of Ads processing.                                |
| Ads product feed     | Include every base field marked `Required`, and set `is_ads_eligible` to `true` for every product that Ads should process. The legacy `is_eligible_ads` alias is accepted, but use the canonical field for new feeds. |

> **Important:** Use `is_ads_eligible`, not `is_ads_enabled`. Ads feed
> ingestion reads `is_ads_eligible` and the legacy `is_eligible_ads` alias;
> it does not read `is_ads_enabled`.

Keep the catalog current as products, prices, and availability change. Ads
eligibility is necessary, but it does not guarantee that a product will serve.

## Create a product-feed campaign

Create a campaign with `mode` set to `product_feed` and the ID of a feed linked
to your ad account. You cannot change the mode after creation.

oCPC is in open beta for both standard and product-feed campaigns. Use the
  same `POST /campaigns` and `POST /ad_groups` endpoints to create and manage
  conversion-optimized campaigns.

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Running shoes catalog",
    "status": "active",
    "mode": "product_feed",
    "product_feed_id": "product_feed_123",
    "budget": {
      "lifetime_spend_limit_micros": 25000000
    }
  }'
```

The response includes the campaign ID and `"mode": "product_feed"`. Save the
campaign ID for the next request.

See the [campaigns reference](https://developers.openai.com/ads/api-reference/campaigns) for scheduling,
targeting, budget, update, and state-control fields.

### Optimize a product-feed campaign for conversions

During the open beta, set `bidding_type` to `conversions`, include the linked
`product_feed_id`, and pass exactly one active standard conversion event
setting. Use the existing campaign endpoint:

```bash
curl -X POST "https://api.ads.openai.com/v1/campaigns" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Running shoes catalog purchases",
    "status": "paused",
    "mode": "product_feed",
    "product_feed_id": "product_feed_123",
    "budget": {
      "lifetime_spend_limit_micros": 250000000
    },
    "bidding_type": "conversions",
    "conversion_event_setting_ids": ["ces_123"]
  }'
```

Create the child ad group through the existing `POST /ad_groups` endpoint and
set `billing_event_type` to `click`. The ad group automatically inherits the
campaign's product feed:

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "Running shoes catalog purchases",
    "status": "active",
    "bidding_config": {
      "billing_event_type": "click",
      "max_bid_micros": 100000000
    }
  }'
```

The campaign optimizes for the selected conversion event, and you continue to
pay per valid click. See
[Conversion-Optimized Campaigns](https://developers.openai.com/ads/conversion-optimized-campaigns) for
conversion measurement prerequisites and bid configuration.

## Select products in an ad group

Product-feed ad groups automatically inherit the campaign's product feed.
Include `product_set` only when you want to specify product filters. Its
`product_feed_id` must match the campaign's feed.

Use `filters` to narrow which products can serve. Omit `product_set` to use all
eligible products in the campaign's feed.

The following example creates a regular, impression-billed product-feed ad
group and filters the catalog by brand. For an oCPC ad group, set
`billing_event_type` to `click` instead.

```bash
curl -X POST "https://api.ads.openai.com/v1/ad_groups" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "cmpn_101",
    "name": "Example Brand running shoes",
    "status": "active",
    "bidding_config": {
      "billing_event_type": "impression",
      "max_bid_micros": 60000
    },
    "product_set": {
      "product_feed_id": "product_feed_123",
      "filters": [
        {
          "field": "brand",
          "operator": "in",
          "values": ["Example Brand"]
        }
      ]
    }
  }'
```

The response includes the ad group ID and the resolved `product_set`. Save the
ad group ID for the ad request.

Each filter object must contain `field`, `operator`, and `values`. Supported
operators are `in`, `gt`, `gte`, `lt`, and `lte`. Send filter values as strings,
including numeric values such as `"4.5"`. Don't repeat the same field within one
product set.

See the [ad groups reference](https://developers.openai.com/ads/api-reference/ad-groups) for all fields and
update operations.

## Create the product-ad template

Create one `product_ad_template` creative in the ad group. OpenAI replaces the
template tokens with data from the product selected at serving time.

```bash
curl -X POST "https://api.ads.openai.com/v1/ads" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ad_group_id": "adgrp_301",
    "name": "Running shoe product template",
    "status": "active",
    "creative": {
      "type": "product_ad_template",
      "title": "{{product.title}}",
      "body": "{{product.body}}",
      "price": "{{product.price}}"
    }
  }'
```

The response includes the ad ID, `creative.type: "product_ad_template"`, and a
`review_status`. A product-feed ad group can contain at most one non-archived
product-ad template.

Unlike a `chat_card` creative, the product-ad template does not require
`file_id` or `target_url`; the selected feed item supplies its image and
destination URL. See the [ads reference](https://developers.openai.com/ads/api-reference/ads) for the full
creative contract and review states.

## Query product performance

Request the `product` segment from any public insights endpoint to break down
results by feed item. This example returns daily product impressions and clicks
for the ad account. Product-segmented insights are available for product-feed campaigns:

```bash
curl -sS -G "https://api.ads.openai.com/v1/ad_account/insights" \
  -H "Authorization: Bearer $OPENAI_ADS_API_KEY" \
  --data-urlencode "time_granularity=daily" \
  --data-urlencode "aggregation_level=ad_account" \
  --data-urlencode "segments[]=product" \
  --data-urlencode "fields[]=product.feed_id" \
  --data-urlencode "fields[]=product.item_id" \
  --data-urlencode "fields[]=product.title" \
  --data-urlencode "fields[]=product.impressions" \
  --data-urlencode "fields[]=product.clicks"
```

The response contains one row per product and time bucket. See the insights
reference for [filters](https://developers.openai.com/ads/api-reference/insights#filters),
[segments](https://developers.openai.com/ads/api-reference/insights#segments),
[includes](https://developers.openai.com/ads/api-reference/insights#includes), and complete
[examples](https://developers.openai.com/ads/api-reference/insights#examples).

## Product-feed API endpoints

Product-feed campaigns use the same public resources as other Ads campaigns.
All routes use the `https://api.ads.openai.com/v1` base URL and your Ads API
key.

| Resource       | Public endpoints                                                                                                                          | Product-feed use                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Feed updates   | `PATCH /feeds/{feed_id}/products`                                                                                                         | Update availability and titles for existing variants in a linked feed.     |
| Campaigns      | `POST /campaigns`, `GET /campaigns`, `GET /campaigns/{campaign_id}`, `POST /campaigns/{campaign_id}`                                      | Create and manage a campaign whose `mode` is `product_feed`.               |
| Campaign State | `POST /campaigns/{campaign_id}/activate`, `POST /campaigns/{campaign_id}/pause`, `POST /campaigns/{campaign_id}/archive`                  | Control whether the product-feed campaign can deliver.                     |
| Ad Groups      | `POST /ad_groups`, `GET /ad_groups?campaign_id={campaign_id}`, `GET /ad_groups/{ad_group_id}`, `POST /ad_groups/{ad_group_id}`            | Create and manage the feed selection and product filters in `product_set`. |
| Ad Group State | `POST /ad_groups/{ad_group_id}/activate`, `POST /ad_groups/{ad_group_id}/pause`, `POST /ad_groups/{ad_group_id}/archive`                  | Control whether the product set can deliver.                               |
| Ads            | `POST /ads`, `GET /ads?ad_group_id={ad_group_id}`, `GET /ads/{ad_id}`, `POST /ads/{ad_id}`                                                | Create and manage the `product_ad_template`.                               |
| Ad State       | `POST /ads/{ad_id}/activate`, `POST /ads/{ad_id}/pause`, `POST /ads/{ad_id}/archive`                                                      | Control whether the template can deliver.                                  |
| Insights       | `GET /ad_account/insights`, `GET /campaigns/{campaign_id}/insights`, `GET /ad_groups/{ad_group_id}/insights`, `GET /ads/{ad_id}/insights` | Query product-segmented delivery and performance.                          |

The Ads Manager feed-connection APIs and OpenAI's internal feed-processing and
debugging APIs are not part of the public Advertiser API.

## Understand serving eligibility

Uploading a feed does not automatically advertise every product. A product must
be marked Ads-eligible, remain available, contain usable product data, and pass
feed processing and review. The linked campaign, ad group, and ad must also be
active, funded, and otherwise eligible to serve.

The Ads system then selects eligible products, evaluates the resulting ads, and
runs them through the normal auction. Use product-segmented insights to verify
which products received impressions and clicks.

---

# Supported Events

## Supported event names

| Event name               | Data type         | Use for                                                            |
| ------------------------ | ----------------- | ------------------------------------------------------------------ |
| `app_installed`          | `customer_action` | A user installs an app.                                            |
| `app_opened`             | `customer_action` | A user opens an app.                                               |
| `appointment_scheduled`  | `customer_action` | A user books a meeting, demo, or consultation.                     |
| `checkout_started`       | `contents`        | A user starts checkout.                                            |
| `contents_viewed`        | `contents`        | A user views a product, listing, article, or other content unit.   |
| `custom`                 | `custom`          | A user-defined event that is not covered by the standard taxonomy. |
| `items_added`            | `contents`        | A user adds one or more items to a cart, bundle, or selection.     |
| `lead_created`           | `customer_action` | A user submits a lead form or requests contact.                    |
| `order_created`          | `contents`        | A purchase is completed.                                           |
| `page_viewed`            | `contents`        | A user lands on or views an important page.                        |
| `registration_completed` | `customer_action` | A user finishes an account or event registration flow.             |
| `subscription_created`   | `plan_enrollment` | A paid subscription starts.                                        |
| `trial_started`          | `plan_enrollment` | A free trial starts.                                               |

`app_installed` and `app_opened` are available through the Conversions API
only. Send them with `action_source` set to `mobile_app`. They are not
supported by the JavaScript Pixel currently.

Use `page_viewed` for page loads. Use `contents_viewed` when a user views a
specific product or content item, including interactions that happen after the
page has loaded.

## Event data shapes

All event data objects must include a `type` field that matches the event you
send. If you include an `amount`, also include a `currency`. Send monetary
values as integers in the standard ISO 4217 minor unit for the currency code
you provide, for example `12999` for $129.99 with `currency: "USD"`.

### `contents`

| Field      | Required | Type               | Notes                                                             |
| ---------- | -------- | ------------------ | ----------------------------------------------------------------- |
| `type`     | Yes      | string             | Must be `contents`.                                               |
| `amount`   | No       | integer            | Event-level monetary value in the currency's standard minor unit. |
| `currency` | Depends  | string             | Required when `amount` is present.                                |
| `contents` | No       | array of `Content` | Items associated with the event.                                  |

### `customer_action`

| Field      | Required | Type    | Notes                                                             |
| ---------- | -------- | ------- | ----------------------------------------------------------------- |
| `type`     | Yes      | string  | Must be `customer_action`.                                        |
| `amount`   | No       | integer | Event-level monetary value in the currency's standard minor unit. |
| `currency` | Depends  | string  | Required when `amount` is present.                                |

### `plan_enrollment`

| Field      | Required | Type               | Notes                                                             |
| ---------- | -------- | ------------------ | ----------------------------------------------------------------- |
| `type`     | Yes      | string             | Must be `plan_enrollment`.                                        |
| `plan_id`  | No       | string             | Your internal plan identifier.                                    |
| `amount`   | No       | integer            | Event-level monetary value in the currency's standard minor unit. |
| `currency` | Depends  | string             | Required when `amount` is present.                                |
| `contents` | No       | array of `Content` | Optional plan-related items.                                      |

### `custom`

| Field      | Required | Type               | Notes                                                             |
| ---------- | -------- | ------------------ | ----------------------------------------------------------------- |
| `type`     | Yes      | string             | Must be `custom`.                                                 |
| `plan_id`  | No       | string             | Optional plan identifier.                                         |
| `amount`   | No       | integer            | Event-level monetary value in the currency's standard minor unit. |
| `currency` | Depends  | string             | Required when `amount` is present.                                |
| `contents` | No       | array of `Content` | Optional items associated with the custom event.                  |

### `Content`

Use only these fields in each `contents[]` item. Fields marked as Conversions API
only are not supported by the JavaScript Pixel.

| Field          | Required | Type    | Notes                                                                                                                             |
| -------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | No       | string  | Your internal item identifier.                                                                                                    |
| `group_id`     | No       | string  | Conversions API only. Your product group or parent item identifier.                                                               |
| `name`         | No       | string  | Human-readable item name.                                                                                                         |
| `content_type` | No       | string  | Optional non-empty category such as `product`, `plan`, or `page`.                                                                 |
| `quantity`     | No       | integer | Quantity of the item. Use integers, not strings.                                                                                  |
| `amount`       | No       | integer | Item-level monetary value in the currency's standard minor unit.                                                                  |
| `currency`     | No       | string  | Include when you send an item-level `amount`, or rely on the event-level `currency` when one currency applies to the whole event. |
| `variant_dict` | No       | object  | Conversions API only. An object with string keys and values, such as `{"size": "medium", "color": "blue"}`.                       |

Use lowercase letters, numbers, underscores, or dashes in
`custom_event_name`. Keep the name between 1 and 64 characters, and do not
reuse one of the built-in event names.
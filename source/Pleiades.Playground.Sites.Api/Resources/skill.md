# Pleiades Sites API - Skill Guide

This guide helps AI agents answer where the machines of the Pleiades stack stand.

## Domain Overview

People enter **sites** and **placements** here; no machine sends them.

- A **site** is a place: a `company`, a plant (`name`) and its `halls`. Its `siteId` is the `{SiteId}` of the
  MQTT topics `sites/{SiteId}/...`, so values about the place (the weather, for example) share the key.
- A **placement** puts a machine on a site: `serialNumber`, `siteId`, `hall` (or null), `displayName` (or null)
  and `placedAt`, when it was put on that site (UTC). The `serialNumber` is the `{SerialNumber}` of the topics
  `machines/{SerialNumber}/...`. A machine stands on one site at most.

## Tools

- `sites_site_list` - every site with its halls.
- `sites_placement_list` - every machine on a site.

Both are read-only. Placing, moving and removing a machine are REST calls (`PUT` and `DELETE` on
`/placements/{serialNumber}`) that need the write permission `sites:write`; no tool writes.

## Recommended Workflows

### Where does a machine stand?
1. `sites_placement_list` - find the serial number; its `siteId` and `hall`.
2. `sites_site_list` - the company and plant of that `siteId`.

### Which machines stand at a site?
1. `sites_site_list` - find the `siteId`.
2. `sites_placement_list` - keep the entries with that `siteId`, grouped by `hall`.

### Which machines stand on no site?
A machine that sends values but has no placement stands on no site. The machines that send come from the
Timeseries API or from `genui_machine_list`; compare their serial numbers with `sites_placement_list`.

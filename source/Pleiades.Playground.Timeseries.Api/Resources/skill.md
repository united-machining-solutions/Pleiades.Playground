# Pleiades Timeseries API - Skill Guide

This guide helps AI agents effectively use the Timeseries API tools to query sensor time-series data from industrial machines.

## Domain Overview

The Timeseries API provides access to **high-frequency sensor data** stored in MongoDB time-series collections from Pleiades industrial machines. Data is organized by **topics** (MQTT-style hierarchical paths like `machines/9000-0001/sensors/temperature`). Topics identify specific sensors or signals on a machine.

## Data Types

### Base Unit Values (`timeseries_baseunit_query`)
Numeric time-series with a physical unit (BaseUnit enum: Meter, Newton, Celsius, etc.). These are the most common sensor signals — force, acceleration, temperature, position, velocity, etc.

### String Values (`timeseries_string_query`)
String time-series — status messages, machine states, identifiers that change over time.

### Boolean Values (`timeseries_boolean_query`)
Boolean time-series — on/off states, limit switches, digital signals.

## Core Concepts

### Topics
Topics are hierarchical paths identifying data sources (e.g. `machines/9000-0001/sensors/spindleSpeed`). Use `timeseries_topics_query` to discover available topics in a time range. Topics support the wildcard `*` (matches any sequence of characters).

### Downsampling
When `downsample=true`, the API reduces data points to the specified limit while preserving visual shape:
- **Base unit values**: LTTB (Largest Triangle Three Buckets) algorithm — preserves peaks and visual fidelity
- **String/Boolean values**: Every-Nth sampling

### Time Ranges
All queries require `startTime` and `stopTime` (ISO 8601). The time range is inclusive on both ends.

### Statistics
`timeseries_statistics_query` computes statistics (min, max, mean, std, median, count) for a topic over one or more time windows. All supplied windows are combined (union); the result is **one aggregate per matched topic**, computed across the union of the windows — not one result per window.

## Recommended Workflows

### Discover Available Data
1. `timeseries_topics_query` — find which topics have data in a time range
2. Topics are grouped: baseUnitTopics, stringTopics, booleanTopics

### Query Sensor Data
1. `timeseries_baseunit_query` — query numeric sensor data by topic and time range
2. Use `downsample=true` with a reasonable `limit` (e.g. 1000) for overview
3. Query without downsampling for full-resolution data

### Aggregate Over One or More Periods
1. `timeseries_statistics_query` — compute min/max/mean/std/median/count for a topic
2. Supplying multiple time windows analyzes their union (one combined aggregate per topic). To compare distinct periods separately, call the tool once per period.

### Investigate a Time Window
1. `timeseries_topics_query` — find active topics in the window
2. `timeseries_baseunit_query` — query relevant numeric signals
3. `timeseries_boolean_query` — check digital states during the period
4. `timeseries_string_query` — check status messages

## Query Tips
- Default limit is 10,000,000 points **for the whole query in raw mode** (`downsample=false`) - it
  is shared across every topic a wildcard matches, not applied per topic, and the sort is by timestamp
  across the whole match. A wildcard query that reaches the limit therefore truncates every series at
  the same instant, with nothing in the response saying so. Narrow the topic to avoid it.
- **`downsample=true` is the opposite, and on a wide wildcard it is the more expensive one**: the
  query then carries *no* limit at all, so everything in the time range is read, and `limit` becomes
  the target point count **per series**. `machines/*/sensors/*` with `limit=1000` and
  `downsample=true` reads the whole window and returns up to 1000 points for *each* matched signal -
  it is a way to shape the response, not a way to bound the query.
- Default timeout is 30 seconds. Increase for large time ranges.
- Sorting: `Ascending` (chronological) or `Descending` (most recent first). Default is Ascending.
- Topic paths use `/` separator. Use `*` as a wildcard (matches any sequence of characters).

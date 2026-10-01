# @linkora/search

Full-text search and ranking service for Linkora posts and creator profiles.

## Architecture & FTS Approach

The search service leverages PostgreSQL's native `tsvector` and `tsquery` full-text search engine:
1. **Indexing**: Text columns are tokenized and stemmed using PostgreSQL `to_tsvector('english', ...)`.
2. **Matching**: Queries are parsed into conjunctions or disjunctions via `to_tsquery('english', ...)`.
3. **Ranking**: Results are ranked by `ts_rank` combined with recency, engagement, and exact-match multipliers.

## Ranking Formula

```
Post Score = ts_rank * RecencyBoost * (1 + log10(1 + likes) * 0.1 + log10(1 + tips) * 0.15)
Profile Score = (ts_rank + 0.1) * ExactMatchBoost * (1 + log10(1 + reputation) * 0.05)
```

## Local Development & CI

```bash
# Run unit & integration tests
pnpm test

# Type-check
pnpm typecheck

# Lint
pnpm lint
```

# Task: Generate an ODCS v3 Data Catalog for MTGJSON Cards and Sets

## Context
I'm testing whether providing structured data documentation helps LLMs generate better Malloy semantic models. I need you to create a data catalog in Open Data Contract Standard (ODCS) v3 format based on the MTGJSON parquet files we loaded in Phase 1.

## ODCS v3 Format Reference
ODCS is a YAML-based standard for documenting data schemas. Here's the structure we need:
```yaml
apiVersion: v3.0.0
kind: DataContract
id: <uuid>
name: <dataset_name>
version: 1.0.0
status: active
description:
  purpose: <what this data is for>
  
schema:
  - name: <table_name>
    logicalType: object
    physicalType: table
    description: <table description>
    properties:
      - name: <column_name>
        businessName: <human-friendly name>
        logicalType: <string|integer|number|boolean|date|timestamp|array|object>
        physicalType: <actual type from parquet>
        description: <what this column means, business context>
        required: <true|false>
        primaryKey: <true|false>
        examples:
          - <example value 1>
          - <example value 2>
        tags: [<relevant tags>]
```

## Your Task

### Step 1: Review the schemas
Using the parquet files in `~/projects/malloy-mtg/data/`, inspect the full schema for both cards and sets tables. Note column names, types, and sample values.

### Step 2: Identify analytically-relevant columns
Not all 100+ columns are needed. Focus on columns that would be useful for analytics queries like:
- "What's the average mana value of mythic creatures?"
- "How many cards per set by rarity?"
- "Which sets have the most multicolor cards?"
- "What's the color distribution across card types?"

For **cards**, prioritize columns like:
- Identifiers (uuid, name, set code)
- Game mechanics (mana cost, mana value, colors, color identity, types, subtypes, supertypes)
- Card characteristics (rarity, power, toughness, loyalty, text, keywords)
- Legalities (format legality fields)
- Categorization (layout, side, frame effects)

For **sets**, prioritize columns like:
- Identifiers (code, name)
- Set characteristics (release date, set type, block, is_foil_only, is_online_only)
- Size metrics (base set size, total set size)

### Step 3: Generate the ODCS catalog
Create two ODCS YAML files:

1. `~/projects/malloy-mtg/catalog/cards.odcs.yaml`
2. `~/projects/malloy-mtg/catalog/sets.odcs.yaml`

For each column you include:
- Write a clear `description` explaining what it means in Magic: The Gathering context
- Provide a `businessName` that's human-readable
- Include 2-3 realistic `examples` from the actual data
- Add relevant `tags` (e.g., ['identifier'], ['game-mechanic'], ['categorization'])
- Note if it's a primary key or required field
- For array columns, indicate the element type in the description

### Step 4: Document relationships
In the cards catalog, note the foreign key relationship:
- `cards.setCode` → `sets.code`

### Step 5: Create a summary
After generating the catalogs, provide a summary:
- Total columns documented per table
- Columns intentionally excluded and why
- Any data quality observations (nulls, unexpected types, etc.)

## Output
- Two ODCS YAML files in `~/projects/malloy-mtg/catalog/`
- A brief summary of what was documented

## Notes
- Use your MTG domain knowledge to write descriptions that would help someone unfamiliar with the game understand the data
- Be specific about array fields — note what the array contains (e.g., "Array of color characters: W, U, B, R, G")
- For enum-like fields, list the valid values in the description or examples
- Keep descriptions concise but informative — these will be fed to an LLM as context
# Task: Generate Malloy Semantic Models from ODCS Data Catalog

## Context
I'm testing whether LLMs can auto-generate Malloy semantic models from documented schemas. In Phase 2, we created ODCS data catalogs for the MTGJSON cards and sets tables. Now I need you to generate Malloy source files based on those catalogs.

## Reference Materials

### ODCS Catalogs (your primary input)
- `catalog/cards.odcs.yaml`
- `catalog/sets.odcs.yaml`

### Parquet Data Files
- Located in `~/repos/Malloy\ Test\data/`

### Malloy Syntax Reference
Malloy is a semantic modeling and query language. Key concepts:

**Source Definition:**
```malloy
source: cards is duckdb.table('../data/cards.parquet') extend {
  primary_key: uuid
  
  -- Dimensions (attributes to group by)
  dimension: 
    card_name is name
    mana_value is manaValue
    is_multicolor is length(colors) > 1
  
  -- Measures (aggregations)
  measure:
    card_count is count()
    avg_mana_value is avg(manaValue)
    unique_cards is count(distinct name)
  
  -- Views (saved queries)
  view: by_rarity is {
    group_by: rarity
    aggregate: card_count, avg_mana_value
  }
}
```

**Joins:**
```malloy
source: cards is duckdb.table('../data/cards.parquet') extend {
  join_one: sets on setCode = sets.code
}
```

**Filtered Measures:**
```malloy
measure: 
  mythic_count is count() { where: rarity = 'mythic' }
  creature_count is count() { where: types ? 'Creature' }
```

**Nested Views:**
```malloy
view: sets_with_top_cards is {
  group_by: setCode
  aggregate: card_count
  nest: top_cards is {
    group_by: name, rarity
    aggregate: card_count
    limit: 5
  }
}
```

## Your Task

### Step 1: Read the ODCS catalogs
Load both catalog files and understand:
- Which columns are documented
- Their types, descriptions, and business context
- The relationship between cards and sets

### Step 2: Generate Malloy source files

Create the following files in `~/repos/Malloy Test/Malloy-source-files/`:

**1. `connections.malloy`**
Define the DuckDB connection and data paths.

**2. `sets.malloy`**
Source definition for sets including:
- Primary key
- Useful dimensions (rename columns to readable names where helpful)
- Basic measures (set_count, avg_set_size, etc.)
- 1-2 useful views

**3. `cards.malloy`**
Source definition for cards including:
- Import sets from sets.malloy
- Primary key
- Join to sets (join_one: sets on setCode = sets.code)
- Dimensions for key analytical attributes
- Computed dimensions where useful (e.g., is_multicolor, is_creature, color_count)
- Measures for common aggregations
- Filtered measures for common slices (by rarity, by color, by type)
- 3-5 views for common analysis patterns:
  - by_rarity
  - by_color
  - by_set
  - by_type
  - color_distribution (nested)

**4. `queries.malloy`**
Import cards and include 3-5 example queries that demonstrate the model works:
```malloy
import "cards.malloy"

-- Example: Card count by rarity
run: cards -> by_rarity

-- Example: Average mana value by color
run: cards -> {
  group_by: colors
  aggregate: card_count, avg_mana_value
}
```

### Step 3: Handle Malloy-specific considerations

- **Array columns**: Malloy can filter arrays with `?` operator (e.g., `colors ? 'W'` checks if W is in the array)
- **Column naming**: Use `is` to rename columns (e.g., `card_name is name`)
- **Null handling**: Be aware of nullable columns from the catalog
- **Type casting**: If needed, cast types explicitly

### Step 4: Add documentation comments

In each .malloy file, add comments that:
- Explain what the source/view represents
- Note any assumptions or limitations
- Reference the ODCS catalog as the source of truth for column definitions

Use `--` for single-line comments in Malloy.

### Step 5: Validate syntax

After generating the files, run a basic syntax check if possible:
- Ensure all referenced columns exist in the parquet files
- Ensure join keys match between tables
- Flag any potential issues

## Output Structure
~/repos/Malloy Test/Malloy-source-files/
├── connections.malloy
├── sets.malloy
├── cards.malloy
└── queries.malloy

## Success Criteria
The generated Malloy files should:
1. Be syntactically valid Malloy
2. Reference only columns that exist in the data
3. Have the join relationship correctly defined
4. Include useful dimensions, measures, and views for MTG analytics
5. Be well-commented for maintainability

## Notes
- Lean on the ODCS catalog for column descriptions — don't re-derive from the raw data
- If a column in the catalog seems useful but you're unsure how to model it in Malloy, add a comment noting the uncertainty
- Prefer explicit over clever — the goal is readable, maintainable models
- Remember: Malloy `view` = saved query (like a Looker Look), not a table
-- Up Migration
CREATE TABLE nutrasa.categories (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  parent_id uuid,
  slug text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL,
  CONSTRAINT categories_slug_key UNIQUE (slug),
  CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES nutrasa.categories (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT categories_parent_not_self_check CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT categories_slug_nonblank_check CHECK (slug ~ '[^[:space:]]'),
  CONSTRAINT categories_name_nonblank_check CHECK (name ~ '[^[:space:]]'),
  CONSTRAINT categories_sort_order_check CHECK (sort_order >= 0)
);

CREATE TABLE nutrasa.food_categories (
  food_id uuid NOT NULL,
  category_id uuid NOT NULL,
  is_primary boolean NOT NULL,
  PRIMARY KEY (food_id, category_id),
  CONSTRAINT food_categories_food_id_fkey FOREIGN KEY (food_id) REFERENCES nutrasa.foods (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT food_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES nutrasa.categories (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE
);

CREATE UNIQUE INDEX food_categories_one_primary_idx ON nutrasa.food_categories (food_id) WHERE is_primary;
CREATE INDEX food_categories_category_food_idx ON nutrasa.food_categories (category_id, food_id);

CREATE TABLE nutrasa.food_aliases (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  food_id uuid NOT NULL,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  locale text,
  CONSTRAINT food_aliases_food_normalized_alias_key UNIQUE (food_id, normalized_alias),
  CONSTRAINT food_aliases_food_id_fkey FOREIGN KEY (food_id) REFERENCES nutrasa.foods (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT NOT DEFERRABLE,
  CONSTRAINT food_aliases_alias_nonblank_check CHECK (alias ~ '[^[:space:]]'),
  CONSTRAINT food_aliases_normalized_alias_nonblank_check CHECK (normalized_alias ~ '[^[:space:]]'),
  CONSTRAINT food_aliases_locale_nonblank_check CHECK (locale IS NULL OR locale ~ '[^[:space:]]')
);

CREATE INDEX food_aliases_normalized_alias_idx ON nutrasa.food_aliases (normalized_alias);

-- Down Migration
DROP TABLE nutrasa.food_aliases;
DROP TABLE nutrasa.food_categories;
DROP TABLE nutrasa.categories;

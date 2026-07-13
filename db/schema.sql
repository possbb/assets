PRAGMA foreign_keys = ON;

-- Production/local-service upgrade schema. Amount fields use the currency's smallest unit.
CREATE TABLE party (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  party_type TEXT NOT NULL CHECK (party_type IN ('person', 'household', 'organization')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE institution (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution_type TEXT NOT NULL CHECK (institution_type IN ('bank', 'broker', 'insurer', 'government', 'other')),
  country_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  owner_party_id TEXT NOT NULL REFERENCES party(id),
  institution_id TEXT REFERENCES institution(id),
  display_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'deposit', 'investment', 'insurance', 'credit_card', 'loan', 'other')),
  currency_code TEXT NOT NULL DEFAULT 'CNY' CHECK (length(currency_code) = 3),
  liquidity_level TEXT NOT NULL CHECK (liquidity_level IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed', 'needs_review')),
  identifier_ciphertext BLOB,
  identifier_last4 TEXT,
  identifier_hmac TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE account_balance_snapshot (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id),
  as_of_date TEXT NOT NULL,
  balance_minor INTEGER NOT NULL,
  source_import_id TEXT,
  source_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, as_of_date)
);

CREATE TABLE category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'transfer', 'valuation')),
  parent_id TEXT REFERENCES category(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (name, direction)
);

CREATE TABLE ledger_transaction (
  id TEXT PRIMARY KEY,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer', 'adjustment')),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  category_id TEXT REFERENCES category(id),
  note TEXT NOT NULL DEFAULT '',
  source_import_id TEXT,
  source_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transaction_entry (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES ledger_transaction(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES account(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Application invariant: a transfer has exactly two entries, in the same currency, whose sum is zero.
-- Income and expense have one account entry. Do not encode full account identifiers in notes.
CREATE INDEX transaction_entry_transaction_idx ON transaction_entry(transaction_id);
CREATE INDEX transaction_entry_account_idx ON transaction_entry(account_id);
CREATE INDEX ledger_transaction_date_idx ON ledger_transaction(transaction_date);

CREATE TABLE asset (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('real_estate', 'vehicle', 'equity', 'option', 'license', 'other')),
  status TEXT NOT NULL CHECK (status IN ('held', 'for_sale', 'for_rent', 'to_acquire', 'disposed', 'needs_review')),
  liquidity_level TEXT NOT NULL CHECK (liquidity_level IN ('high', 'medium', 'low')),
  legal_status TEXT NOT NULL DEFAULT 'needs_review',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE asset_owner (
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  party_id TEXT NOT NULL REFERENCES party(id),
  ownership_bps INTEGER NOT NULL CHECK (ownership_bps BETWEEN 0 AND 10000),
  PRIMARY KEY (asset_id, party_id)
);

CREATE TABLE asset_valuation (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  valuation_date TEXT NOT NULL,
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  gross_value_minor INTEGER NOT NULL,
  valuation_basis TEXT NOT NULL CHECK (valuation_basis IN ('cost', 'market_quote', 'comparable', 'contract', 'exercise_price', 'manual')),
  source_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (asset_id, valuation_date, valuation_basis)
);

CREATE TABLE liability (
  id TEXT PRIMARY KEY,
  owner_party_id TEXT NOT NULL REFERENCES party(id),
  linked_asset_id TEXT REFERENCES asset(id),
  display_name TEXT NOT NULL,
  liability_type TEXT NOT NULL CHECK (liability_type IN ('mortgage', 'credit_card', 'loan', 'other')),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'needs_review')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE liability_balance_snapshot (
  id TEXT PRIMARY KEY,
  liability_id TEXT NOT NULL REFERENCES liability(id) ON DELETE CASCADE,
  as_of_date TEXT NOT NULL,
  balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (liability_id, as_of_date)
);

CREATE TABLE expected_cashflow (
  id TEXT PRIMARY KEY,
  due_date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  category_id TEXT REFERENCES category(id),
  title TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'base' CHECK (scenario IN ('base', 'conservative')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'occurred', 'cancelled')),
  linked_transaction_id TEXT REFERENCES ledger_transaction(id),
  source_import_id TEXT,
  source_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX expected_cashflow_due_idx ON expected_cashflow(due_date, scenario, status);

CREATE TABLE document_record (
  id TEXT PRIMARY KEY,
  owner_party_id TEXT REFERENCES party(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('identity', 'insurance', 'contract', 'account_material', 'other')),
  display_name TEXT NOT NULL,
  issue_date TEXT,
  expiry_date TEXT,
  perpetual INTEGER NOT NULL DEFAULT 0 CHECK (perpetual IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('valid', 'expired', 'needs_review')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (perpetual = 1 OR expiry_date IS NOT NULL OR status = 'needs_review')
);

CREATE TABLE secret_reference (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('account', 'asset', 'document')),
  entity_id TEXT NOT NULL,
  vault_provider TEXT NOT NULL,
  vault_item_reference TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entity_type, entity_id, vault_provider, vault_item_reference)
);
-- No password, PIN, CVV, OTP seed, recovery code or private key column is permitted in this schema.

CREATE TABLE attachment (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  file_hash TEXT NOT NULL,
  encrypted INTEGER NOT NULL CHECK (encrypted IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reminder (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  due_date TEXT NOT NULL,
  offset_days INTEGER NOT NULL CHECK (offset_days >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reminder_due_idx ON reminder(due_date, status);

CREATE TABLE source_import (
  id TEXT PRIMARY KEY,
  source_filename TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL CHECK (status IN ('draft', 'reviewed', 'applied', 'rolled_back')),
  UNIQUE (source_sha256)
);

CREATE TABLE source_record (
  id TEXT PRIMARY KEY,
  source_import_id TEXT NOT NULL REFERENCES source_import(id) ON DELETE CASCADE,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row > 0),
  target_entity_type TEXT,
  target_entity_id TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'skipped', 'needs_review')),
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (source_import_id, source_sheet, source_row)
);

CREATE TABLE reconciliation_check (
  id TEXT PRIMARY KEY,
  check_date TEXT NOT NULL,
  check_type TEXT NOT NULL,
  actual_minor INTEGER,
  expected_minor INTEGER,
  difference_minor INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'needs_review')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_event (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_party_id TEXT REFERENCES party(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_event_entity_idx ON audit_event(entity_type, entity_id, occurred_at);

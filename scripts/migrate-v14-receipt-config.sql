-- V14: Add receipt_config JSONB column to empresa table
-- Stores receipt/invoice design configuration (font sizes, toggles, footer text, etc.)

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS receipt_config JSONB DEFAULT NULL;

-- Migration 0017: Add Suryalogix OEM Provider to oem_provider enum
-- Safe, additive, non-blocking operation

ALTER TYPE public.oem_provider ADD VALUE IF NOT EXISTS 'suryalogix';


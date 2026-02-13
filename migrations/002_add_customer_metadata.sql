-- Migration: Add customer-facing metadata fields
-- Description: Adds version_name, version_description to segmentation_jobs
--              and display_name, description to segments for customer console

-- Add fields to segmentation_jobs table
ALTER TABLE public.segmentation_jobs
ADD COLUMN IF NOT EXISTS version_name TEXT,
ADD COLUMN IF NOT EXISTS version_description TEXT;

-- created_by already exists in the schema, just verify
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'segmentation_jobs'
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.segmentation_jobs ADD COLUMN created_by UUID REFERENCES profiles(id);
    END IF;
END $$;

-- Add fields to segments table
ALTER TABLE public.segments
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add helpful comment
COMMENT ON COLUMN public.segmentation_jobs.version_name IS 'Human-readable version name for customer console';
COMMENT ON COLUMN public.segmentation_jobs.version_description IS 'Customer-facing description of this segmentation version';
COMMENT ON COLUMN public.segments.display_name IS 'Customer-facing display name (defaults to segment_name if null)';
COMMENT ON COLUMN public.segments.description IS 'Customer-facing description for this segment';

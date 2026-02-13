-- Migration: Ensure segment display_name and description columns exist
-- Description: Adds display_name and description to segments table if they don't exist
--              These are customer-facing fields for segment name and description

-- Add display_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'segments'
        AND column_name = 'display_name'
    ) THEN
        ALTER TABLE public.segments ADD COLUMN display_name TEXT;
        COMMENT ON COLUMN public.segments.display_name IS 'Customer-facing display name for segment (defaults to segment_name if null)';
    END IF;
END $$;

-- Add description column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'segments'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.segments ADD COLUMN description TEXT;
        COMMENT ON COLUMN public.segments.description IS 'Customer-facing description for this segment';
    END IF;
END $$;

-- Update existing segments: set display_name = segment_name where display_name is null
UPDATE public.segments
SET display_name = segment_name
WHERE display_name IS NULL;

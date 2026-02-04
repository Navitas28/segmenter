-- Migration: Add wedge geometry column to segments table
-- Purpose: Store radial segmentation wedge polygons for efficient rendering
-- Author: Auto-generated
-- Date: 2026-02-04

-- ========================================
-- STEP 1: Ensure PostGIS Extension
-- ========================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ========================================
-- STEP 2: Add Geometry Column (Safe)
-- ========================================
-- Add geometry column only if it doesn't exist
-- This column will store the radial wedge polygon for each segment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'segments'
      AND column_name = 'geometry'
  ) THEN
    ALTER TABLE public.segments
    ADD COLUMN geometry geometry(Polygon, 4326);

    RAISE NOTICE 'Added geometry column to segments table';
  ELSE
    RAISE NOTICE 'Geometry column already exists, skipping';
  END IF;
END$$;

-- ========================================
-- STEP 3: Create Spatial Index
-- ========================================
-- Create spatial index for efficient geometry queries
CREATE INDEX IF NOT EXISTS idx_segments_geometry
ON public.segments
USING GIST (geometry);

-- ========================================
-- STEP 4: Add Comments
-- ========================================
COMMENT ON COLUMN public.segments.geometry IS 'Radial wedge polygon geometry for segment visualization. This represents the angular slice from the global centroid. Computed during segmentation and stored for efficient map rendering. SRID: 4326 (WGS84)';

-- ========================================
-- VERIFICATION QUERY
-- ========================================
-- Run this to verify the migration succeeded:
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_name = 'segments' AND column_name = 'geometry';

/*
# Add top_size, bottom_size, and fit columns to profiles table

## Purpose
These columns store the user's clothing sizes (shirt, pants, fit preference)
alongside the existing body metrics and shoe size, so that edited sizes
persist across sessions and sync between the onboarding scan, profile edit,
and feed screens.

## Changes
1. New Columns on `profiles`:
   - `top_size` (text) — shirt size (e.g. "S", "M", "L")
   - `bottom_size` (text) — EU pants size (e.g. "36", "38", "40")
   - `fit` (text) — fit preference (e.g. "Slim Fit", "Regular", "Relaxed")

2. Security
   - No RLS policy changes. Existing policies on `profiles` remain in effect.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS top_size text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bottom_size text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fit text;
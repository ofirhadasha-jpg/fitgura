-- Add registered_device and shoe_size columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registered_device text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shoe_size text;
-- Migration 009: Add photo_url to employee_applications and payroll enhancement
ALTER TABLE employee_applications ADD COLUMN photo_url TEXT;

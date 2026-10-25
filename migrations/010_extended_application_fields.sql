-- Extended application fields for comprehensive employee registration
ALTER TABLE employee_applications ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_applications ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_applications ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_applications ADD COLUMN discussed_salary TEXT NOT NULL DEFAULT '';
ALTER TABLE employee_applications ADD COLUMN education_10th_doc TEXT;
ALTER TABLE employee_applications ADD COLUMN education_inter_doc TEXT;
ALTER TABLE employee_applications ADD COLUMN education_higher_doc TEXT;
ALTER TABLE employee_applications ADD COLUMN pan_front TEXT;
ALTER TABLE employee_applications ADD COLUMN pan_back TEXT;
ALTER TABLE employee_applications ADD COLUMN aadhar_front TEXT;
ALTER TABLE employee_applications ADD COLUMN aadhar_back TEXT;

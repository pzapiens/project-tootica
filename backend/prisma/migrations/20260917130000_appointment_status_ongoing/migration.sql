-- Add the ONGOING appointment status (an appointment currently in progress).
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'ONGOING' AFTER 'CONFIRMED';

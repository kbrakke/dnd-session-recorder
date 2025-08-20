-- Initialize the D&D Session Recorder database
-- This script runs when the PostgreSQL container is first created

-- Create additional databases for testing
CREATE DATABASE dnd_recorder_test;

-- Grant privileges to the main user
GRANT ALL PRIVILEGES ON DATABASE dnd_recorder TO dnd_user;
GRANT ALL PRIVILEGES ON DATABASE dnd_recorder_test TO dnd_user;

-- Set default search path for convenience
ALTER USER dnd_user SET search_path TO public;

-- Log initialization complete
\echo 'D&D Session Recorder databases initialized successfully';
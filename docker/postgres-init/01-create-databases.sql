-- UpHunter: create per-service databases
SELECT 'CREATE DATABASE jobs_db OWNER ' || current_user
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jobs_db')\gexec

SELECT 'CREATE DATABASE clients_db OWNER ' || current_user
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'clients_db')\gexec

SELECT 'CREATE DATABASE letters_db OWNER ' || current_user
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'letters_db')\gexec

SELECT 'CREATE DATABASE auth_db OWNER ' || current_user
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')\gexec

SELECT 'CREATE DATABASE analytics_db OWNER ' || current_user
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'analytics_db')\gexec

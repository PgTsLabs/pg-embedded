@echo off
REM Windows batch script to extract PostgreSQL version
REM This script calls the Node.js version which should work on Windows

node scripts/extract-pg-version.js %*
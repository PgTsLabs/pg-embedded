--
-- PostgreSQL database cluster dump
--

\restrict OguFcvVA9uZeU6DzB6bDVaInLyMpe0dOZGrfOB0PyMOFZzzx5ycOq3755mNfOMK

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:2EsV4Rcnwbho1ReaPBQZ3w==$FMYArVoBdZ+sg/ja2nTPhZVn1Nb9HzExWELPe6mdhjM=:E5ymR41iS8t5GFJD0Y7skh8t3rcG7IUN6dsRQHXUD+8=';

--
-- User Configurations
--








\unrestrict OguFcvVA9uZeU6DzB6bDVaInLyMpe0dOZGrfOB0PyMOFZzzx5ycOq3755mNfOMK

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict 8OQCgWDj4Z6KpurNtuPmVUSGao7NqdrlJLCz8zTsZlBirIiPsDtNuqBwhJFSMnp

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict 8OQCgWDj4Z6KpurNtuPmVUSGao7NqdrlJLCz8zTsZlBirIiPsDtNuqBwhJFSMnp

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict Juu8YGgAUSL5w1WY8nigsdPbLctJb8Ly4wOZFHhUw8RZdzMUyKyV3KPL3JHxDPY

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- PostgreSQL database dump complete
--

\unrestrict Juu8YGgAUSL5w1WY8nigsdPbLctJb8Ly4wOZFHhUw8RZdzMUyKyV3KPL3JHxDPY

--
-- PostgreSQL database cluster dump complete
--


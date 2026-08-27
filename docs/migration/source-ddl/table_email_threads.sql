--
-- PostgreSQL database dump
--

\restrict w4FSSHofO6Dm4tLBitx92a9nfDOfYy5MDHC6O46Qh0jLA6zYO8dQgyCCj5gz7U1

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: email_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gmail_account_id uuid NOT NULL,
    gmail_thread_id text NOT NULL,
    contact_id uuid,
    subject text DEFAULT ''::text NOT NULL,
    snippet text DEFAULT ''::text NOT NULL,
    label_ids text[] DEFAULT '{}'::text[] NOT NULL,
    message_count integer DEFAULT 0 
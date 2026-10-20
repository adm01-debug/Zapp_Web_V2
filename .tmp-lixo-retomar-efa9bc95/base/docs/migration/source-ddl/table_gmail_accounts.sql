--
-- PostgreSQL database dump
--

\restrict 3R6RKOgltGwbNziW4OLwxLU9CFzxQ8RdwisKIwrh5Nq9mWwOethoji46dNuR1Pn

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
-- Name: gmail_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gmail_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sync_status text DEFAULT 'pending'::text NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    token_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    access_token_encrypted bytea,
    refresh_token_encrypted bytea
);


--
-- Name: gmail_accounts gmail_accounts_email_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_accounts
    ADD CONSTRAINT gmail_accounts_email_address_key UNIQUE (email_address);


--
-- Name: gmail_accounts gmail_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gmail_accounts
    ADD CONSTRAINT gmail_accounts_pkey PRIMARY KEY (id);


--
-- Name: gmail_accounts update_gmail_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON public.gmail_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gmail_accounts Block authenticated gmail deletes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated gmail deletes" ON public.gmail_accounts FOR DELETE TO authenticated USING (false);


--
-- Name: gmail_accounts Block authenticated gmail inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated gmail inserts" ON public.gmail_accounts FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: gmail_accounts Block authenticated gmail updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated gmail updates" ON public.gmail_accounts FOR UPDATE TO authenticated USING (false);


--
-- Name: gmail_accounts Service role only for gmail accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only for gmail accounts" ON public.gmail_accounts TO service_role USING (true) WITH CHECK (true);


--
-- Name: gmail_accounts Users can view their own gmail accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own gmail accounts" ON public.gmail_accounts FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: gmail_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 3R6RKOgltGwbNziW4OLwxLU9CFzxQ8RdwisKIwrh5Nq9mWwOethoji46dNuR1Pn


--
-- PostgreSQL database dump
--

\restrict vVh3TziWSa45lu7hYWIHdGelaHfW7nzvMiz0DRjYq0Jc70GYcXPkr27IjGOgjUR

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
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    gmail_message_id text NOT NULL,
    gmail_account_id uuid NOT NULL,
    from_address text DEFAULT ''::text NOT NULL,
    from_name text,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    cc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    bcc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    reply_to_address text,
    subject text DEFAULT ''::text NOT NULL,
    body_text text DEFAULT ''::text NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    snippet text DEFAULT ''::text NOT NULL,
    label_ids text[] DEFAULT '{}'::text[] NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    has_attachments boolean DEFAULT false NOT NULL,
    in_reply_to text,
    references_header text,
    internal_date timestamp with time zone DEFAULT now() NOT NULL,
    direction text DEFAULT 'inbound'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_messages email_messages_gmail_account_id_gmail_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_gmail_account_id_gmail_message_id_key UNIQUE (gmail_account_id, gmail_message_id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: idx_email_messages_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_account ON public.email_messages USING btree (gmail_account_id);


--
-- Name: idx_email_messages_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_date ON public.email_messages USING btree (internal_date DESC);


--
-- Name: idx_email_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_messages_thread ON public.email_messages USING btree (thread_id);


--
-- Name: email_messages email_messages_gmail_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;


--
-- Name: email_messages Users can insert messages for own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages for own accounts" ON public.email_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: email_messages Users can update messages of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update messages of own accounts" ON public.email_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: email_messages Users can view messages of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages of own accounts" ON public.email_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_messages.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: email_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict vVh3TziWSa45lu7hYWIHdGelaHfW7nzvMiz0DRjYq0Jc70GYcXPkr27IjGOgjUR


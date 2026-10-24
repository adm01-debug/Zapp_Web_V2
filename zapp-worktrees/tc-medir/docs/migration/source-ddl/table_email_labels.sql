--
-- PostgreSQL database dump
--

\restrict 8Gtf3jhelYrRnBJV9PMR1HUMoplF6Mzn9lBLZ5OzaH8Pw1Y0rA4fJBNtZh5BR4J

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
-- Name: email_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gmail_account_id uuid NOT NULL,
    gmail_label_id text NOT NULL,
    name text NOT NULL,
    label_type text DEFAULT 'user'::text NOT NULL,
    color text,
    message_count integer DEFAULT 0 NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_labels email_labels_gmail_account_id_gmail_label_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_labels
    ADD CONSTRAINT email_labels_gmail_account_id_gmail_label_id_key UNIQUE (gmail_account_id, gmail_label_id);


--
-- Name: email_labels email_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_labels
    ADD CONSTRAINT email_labels_pkey PRIMARY KEY (id);


--
-- Name: idx_email_labels_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_labels_account ON public.email_labels USING btree (gmail_account_id);


--
-- Name: email_labels email_labels_gmail_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_labels
    ADD CONSTRAINT email_labels_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: email_labels Users can manage labels of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage labels of own accounts" ON public.email_labels TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: email_labels Users can view labels of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view labels of own accounts" ON public.email_labels FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: email_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 8Gtf3jhelYrRnBJV9PMR1HUMoplF6Mzn9lBLZ5OzaH8Pw1Y0rA4fJBNtZh5BR4J


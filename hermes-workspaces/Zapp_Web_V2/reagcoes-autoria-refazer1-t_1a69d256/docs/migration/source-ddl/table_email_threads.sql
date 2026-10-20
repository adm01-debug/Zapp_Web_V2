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
    message_count integer DEFAULT 0 NOT NULL,
    is_unread boolean DEFAULT true NOT NULL,
    is_starred boolean DEFAULT false NOT NULL,
    is_important boolean DEFAULT false NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_to uuid,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_threads email_threads_gmail_account_id_gmail_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_gmail_account_id_gmail_thread_id_key UNIQUE (gmail_account_id, gmail_thread_id);


--
-- Name: email_threads email_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);


--
-- Name: idx_email_threads_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_threads_account ON public.email_threads USING btree (gmail_account_id);


--
-- Name: idx_email_threads_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_threads_contact ON public.email_threads USING btree (contact_id);


--
-- Name: idx_email_threads_last_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_threads_last_message ON public.email_threads USING btree (last_message_at DESC);


--
-- Name: email_threads update_email_threads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_threads email_threads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: email_threads email_threads_gmail_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_gmail_account_id_fkey FOREIGN KEY (gmail_account_id) REFERENCES public.gmail_accounts(id) ON DELETE CASCADE;


--
-- Name: email_threads Users can delete threads of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete threads of own accounts" ON public.email_threads FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: email_threads Users can insert threads for own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert threads for own accounts" ON public.email_threads FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid())))));


--
-- Name: email_threads Users can update threads of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update threads of own accounts" ON public.email_threads FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: email_threads Users can view threads of own accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.gmail_accounts ga
  WHERE ((ga.id = email_threads.gmail_account_id) AND ((ga.user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid()))))));


--
-- Name: email_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict w4FSSHofO6Dm4tLBitx92a9nfDOfYy5MDHC6O46Qh0jLA6zYO8dQgyCCj5gz7U1


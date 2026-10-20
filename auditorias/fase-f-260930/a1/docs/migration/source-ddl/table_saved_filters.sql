--
-- PostgreSQL database dump
--

\restrict ELybaTkLc0qge7B19P2fw750od71PvBfXfyrEYXX0OTIMMrTGlBKy2g3YqESv2v

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
-- Name: saved_filters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_shared boolean DEFAULT false
);


--
-- Name: saved_filters saved_filters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_filters
    ADD CONSTRAINT saved_filters_pkey PRIMARY KEY (id);


--
-- Name: idx_saved_filters_user_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_filters_user_entity ON public.saved_filters USING btree (user_id, entity_type);


--
-- Name: saved_filters ensure_single_default_filter_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_single_default_filter_trigger BEFORE INSERT OR UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_filter();


--
-- Name: saved_filters update_saved_filters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_filters_updated_at BEFORE UPDATE ON public.saved_filters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: saved_filters Users can delete own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own saved filters" ON public.saved_filters FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_filters Users can insert own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own saved filters" ON public.saved_filters FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: saved_filters Users can update own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own saved filters" ON public.saved_filters FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_filters Users can view own saved filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own saved filters" ON public.saved_filters FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: saved_filters Users can view shared filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view shared filters" ON public.saved_filters FOR SELECT TO authenticated USING ((is_shared = true));


--
-- Name: saved_filters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict ELybaTkLc0qge7B19P2fw750od71PvBfXfyrEYXX0OTIMMrTGlBKy2g3YqESv2v


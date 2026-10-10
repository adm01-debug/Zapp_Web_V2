--
-- PostgreSQL database dump
--

\restrict axhGeFAUNW8gHRtTPLIeaCSVAzcJyq4RSzJev9KyvCS5Cn7KJoqaBg18K8eTuCN

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
-- Name: entity_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    version_number integer NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    changed_by uuid,
    change_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_versions entity_versions_entity_type_entity_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_versions
    ADD CONSTRAINT entity_versions_entity_type_entity_id_version_number_key UNIQUE (entity_type, entity_id, version_number);


--
-- Name: entity_versions entity_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_versions
    ADD CONSTRAINT entity_versions_pkey PRIMARY KEY (id);


--
-- Name: idx_versions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_date ON public.entity_versions USING btree (created_at DESC);


--
-- Name: idx_versions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_entity ON public.entity_versions USING btree (entity_type, entity_id);


--
-- Name: entity_versions Admins can view entity versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view entity versions" ON public.entity_versions FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));


--
-- Name: entity_versions Block authenticated version inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block authenticated version inserts" ON public.entity_versions FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: entity_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict axhGeFAUNW8gHRtTPLIeaCSVAzcJyq4RSzJev9KyvCS5Cn7KJoqaBg18K8eTuCN


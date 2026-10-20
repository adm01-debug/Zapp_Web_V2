--
-- PostgreSQL database dump
--

\restrict d6H69fCI0KVhL1A8tFEtlCUArDl45Kjfr9cPHjK8uov2kcpUu305NYZShi5XWCN

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
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    avatar_url text,
    assigned_to uuid,
    whatsapp_connection_id uuid,
    tags text[] DEFAULT '{}'::text[],
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nickname text,
    surname text,
    job_title text,
    company text,
    queue_id uuid,
    contact_type text DEFAULT 'cliente'::text,
    ai_priority text DEFAULT 'normal'::text,
    ai_sentiment text DEFAULT 'neutral'::text,
    channel_type text DEFAULT 'whatsapp'::text,
    channel_connection_id uuid,
    group_category text,
    lead_score integer DEFAULT 0,
    risk_score integer DEFAULT 0,
    lead_origin text,
    consent_status text DEFAULT 'unknown'::text
);


--
-- Name: COLUMN contacts.contact_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.contact_type IS 'Type of contact: cliente, fornecedor, colaborador, prestador_servico';


--
-- Name: contacts contacts_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_key UNIQUE (phone);


--
-- Name: contacts contacts_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_unique UNIQUE (phone);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: idx_contacts_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_assigned_to ON public.contacts USING btree (assigned_to);


--
-- Name: idx_contacts_company_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company_trgm ON public.contacts USING gin (company extensions.gin_trgm_ops);


--
-- Name: idx_contacts_contact_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (contact_type);


--
-- Name: idx_contacts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC);


--
-- Name: idx_contacts_email_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops);


--
-- Name: idx_contacts_job_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_job_title_trgm ON public.contacts USING gin (job_title extensions.gin_trgm_ops);


--
-- Name: idx_contacts_name_asc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_name_asc ON public.contacts USING btree (name);


--
-- Name: idx_contacts_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_name_trgm ON public.contacts USING gin (name extensions.gin_trgm_ops);


--
-- Name: idx_contacts_nickname_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_nickname_trgm ON public.contacts USING gin (nickname extensions.gin_trgm_ops);


--
-- Name: idx_contacts_phone_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_phone_trgm ON public.contacts USING gin (phone extensions.gin_trgm_ops);


--
-- Name: idx_contacts_queue_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_queue_id ON public.contacts USING btree (queue_id);


--
-- Name: idx_contacts_surname_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_surname_trgm ON public.contacts USING gin (surname extensions.gin_trgm_ops);


--
-- Name: idx_contacts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_type ON public.contacts USING btree (contact_type);


--
-- Name: contacts on_contact_created_auto_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_contact();


--
-- Name: contacts on_contact_queue_auto_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_contact_queue_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_to_queue_agent();


--
-- Name: contacts trg_log_assignment_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_assignment_change AFTER UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.log_assignment_change();


--
-- Name: contacts trg_normalize_contact_phone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();


--
-- Name: contacts update_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contacts contacts_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_channel_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_channel_connection_id_fkey FOREIGN KEY (channel_connection_id) REFERENCES public.channel_connections(id);


--
-- Name: contacts contacts_queue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.queues(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_whatsapp_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_whatsapp_connection_id_fkey FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;


--
-- Name: contacts Admins can view all contacts including unassigned; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all contacts including unassigned" ON public.contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: contacts Users can insert contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK ((public.is_admin_or_supervisor(auth.uid()) OR ((assigned_to IS NOT NULL) AND (assigned_to IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_id = auth.uid()))))));


--
-- Name: contacts Users can update their assigned contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their assigned contacts" ON public.contacts FOR UPDATE TO authenticated USING (((assigned_to IN ( SELECT public.get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)) OR public.is_admin_or_supervisor(auth.uid())));


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_select_policy ON public.contacts FOR SELECT TO authenticated USING ((public.is_admin_or_supervisor(auth.uid()) OR (assigned_to = public.get_profile_id_for_user(auth.uid())) OR (assigned_to IS NULL)));


--
-- PostgreSQL database dump complete
--

\unrestrict d6H69fCI0KVhL1A8tFEtlCUArDl45Kjfr9cPHjK8uov2kcpUu305NYZShi5XWCN


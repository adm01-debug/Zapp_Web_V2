-- Add INSERT policy for admins to create products
CREATE POLICY "Admins can insert products"
ON public.products
FOR INSERT
WITH CHECK (is_admin_or_supervisor(auth.uid()));
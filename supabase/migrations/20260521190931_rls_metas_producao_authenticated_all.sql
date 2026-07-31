
CREATE POLICY "authenticated_all_metas_producao"
ON public.metas_producao
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
;

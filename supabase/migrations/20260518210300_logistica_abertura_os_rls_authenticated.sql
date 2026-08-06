
CREATE POLICY "abertura_os_authenticated_all"
ON logistica_abertura_os
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
;

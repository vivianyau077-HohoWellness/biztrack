-- Allow all operations on receipts bucket for authenticated and anon users
CREATE POLICY "Allow all on receipts" ON storage.objects
  FOR ALL
  USING (bucket_id = 'receipts')
  WITH CHECK (bucket_id = 'receipts');

-- If RLS is blocking, also run:
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

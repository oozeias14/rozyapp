const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sewwoxhttmhjayufrqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3dveGh0dG1oamF5dWZycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDUyNjMsImV4cCI6MjEwMDc4MTI2M30.xXcEz_5gtKllyJTlhSWGBNkXAaxc2ceVXEdF5hdQaqQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: users, error } = await supabase.from('profiles').select('id, name, whatsapp, phone, role').order('created_at', { ascending: false }).limit(30);
  if (error) console.error('Supabase error:', error);
  console.log('Total profiles in Supabase:', users?.length);
  users?.forEach(u => {
    console.log(`User: ${u.name} | Phone: ${u.whatsapp || u.phone} | Role: ${u.role}`);
  });
}
main();

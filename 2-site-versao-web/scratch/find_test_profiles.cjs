const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sewwoxhttmhjayufrqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3dveGh0dG1oamF5dWZycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDUyNjMsImV4cCI6MjEwMDc4MTI2M30.xXcEz_5gtKllyJTlhSWGBNkXAaxc2ceVXEdF5hdQaqQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const { data: users, error } = await supabase.from('profiles').select('id, name, whatsapp, phone, role');
  console.log('Total profiles:', users?.length);
  
  const searchTerms = ['kauan', 'kamilla', 'rozy', 'marcelo', 'jaqueline', 'rayanne'];
  for (const term of searchTerms) {
    const matched = users?.filter(u => (u.name || '').toLowerCase().includes(term) || (u.whatsapp || u.phone || '').includes(term));
    console.log(`\n--- Term "${term}": ${matched?.length} encontrados ---`);
    matched?.forEach(m => console.log(`ID: ${m.id} | Name: ${m.name} | Phone: ${m.whatsapp || m.phone}`));
  }
}
main();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sewwoxhttmhjayufrqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3dveGh0dG1oamF5dWZycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDUyNjMsImV4cCI6MjEwMDc4MTI2M30.xXcEz_5gtKllyJTlhSWGBNkXAaxc2ceVXEdF5hdQaqQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const tempEmail = `temp_tester_${Date.now()}@example.com`;
  const tempPassword = 'password123';
  
  console.log('Registering a temporary authenticated user...');
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: tempEmail,
    password: tempPassword
  });
  
  if (authError) {
    console.error('Error signing up temp user:', authError);
    return;
  }
  
  console.log('Successfully authenticated. Fetching profiles...');
  const { data: profiles, error: selectError } = await supabase
    .from('profiles')
    .select('*');
    
  if (selectError) {
    console.error('Error selecting profiles:', selectError);
  } else {
    console.log(`Found ${profiles.length} profiles:`, profiles);
  }
  
  // Clean up: delete user
  // (We cannot delete from client without admin key, but they will remain in auth.users as temp)
  console.log('Done.');
}

main();

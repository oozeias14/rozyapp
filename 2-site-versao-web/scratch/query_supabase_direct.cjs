const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wumzihudwddxvyxszjxh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1bXppaHVkd2RkeHZ5eHN6anhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1MDgyNTAsImV4cCI6MjA1NDA4NDI1MH0.2W3o2jX7Y2Z3b1c6d7e8f9a0b1c2d3e4f5a6b7c8d9e';

// Let's read from src/lib/supabase.js
const fs = require('fs');
const code = fs.readFileSync('./src/lib/supabase.js', 'utf8');
const urlMatch = code.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = code.match(/supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);

const url = urlMatch ? urlMatch[1] : '';
const key = keyMatch ? keyMatch[1] : '';

console.log('Supabase URL:', url);
const supabase = createClient(url, key);

async function main() {
  const { data: users, error } = await supabase.from('profiles').select('id, name, whatsapp, phone, role').order('created_at', { ascending: false }).limit(20);
  if (error) console.error('Supabase error:', error);
  console.log('Total profiles in Supabase:', users?.length);
  users?.forEach(u => {
    console.log(`User: ${u.name} | Phone: ${u.whatsapp || u.phone} | Role: ${u.role}`);
  });
}
main();

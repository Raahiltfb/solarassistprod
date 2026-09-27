const fs = require('fs');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('frontend/.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...value] = line.split('=');
  if (key && !key.startsWith('#')) acc[key.trim()] = value.join('=').trim().replace(/^"|"$/g, '');
  return acc;
}, {});

async function testRoute() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: 'tech1@demo.com', password: 'password123' });
  if (error) return console.error(error);

  const session = auth.session;
  const projectRef = env.NEXT_PUBLIC_SUPABASE_URL.split('//')[1].split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = encodeURIComponent(JSON.stringify(session));

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/technician/sites/5b2dc943-fe8b-45ce-b7b0-077701e68f3d',
    method: 'GET',
    headers: {
      'Cookie': `${cookieName}=${cookieValue}`
    }
  }, (res) => {
    console.log('Status Code:', res.statusCode);
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Body length:', body.length);
      console.log('Contains Ivy by courtyard?', body.includes('Ivy by courtyard'));
      console.log('Contains Technician Field Hub?', body.includes('Technician Field Hub'));
    });
  });
  req.end();
}
testRoute();

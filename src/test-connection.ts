import 'dotenv/config';
import https from 'https';

async function testDiscordConnection() {
  console.log('Testing Discord API connectivity...');

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN not found');
  }

  console.log('Token preview:', token.substring(0, 20) + '...');

  // Test 1: Check if we can reach Discord API
  console.log('\n1. Testing HTTPS connection to Discord API...');

  return new Promise((resolve, reject) => {
    const req = https.get('https://discord.com/api/v10/gateway', (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('✅ Discord API reachable');
        console.log('Status:', res.statusCode);
        console.log('Response:', data);

        // Test 2: Try to get bot user info
        console.log('\n2. Testing bot authentication...');

        const authReq = https.get('https://discord.com/api/v10/users/@me', {
          headers: {
            'Authorization': `Bot ${token}`
          }
        }, (authRes) => {
          let authData = '';

          authRes.on('data', (chunk) => {
            authData += chunk;
          });

          authRes.on('end', () => {
            console.log('Status:', authRes.statusCode);
            console.log('Response:', authData);

            if (authRes.statusCode === 200) {
              console.log('✅ Bot token is valid!');
            } else {
              console.log('❌ Bot token validation failed!');
            }

            resolve(true);
          });
        });

        authReq.on('error', (error) => {
          console.error('❌ Auth request failed:', error);
          reject(error);
        });

        authReq.end();
      });
    });

    req.on('error', (error) => {
      console.error('❌ Cannot reach Discord API:', error);
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.error('❌ Request timeout');
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

testDiscordConnection()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });

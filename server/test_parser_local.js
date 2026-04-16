async function testParser() {
  const url = 'https://www.google.com/maps/dir/10.7769,106.7009/10.8231,106.6297/';
  try {
    const response = await fetch('http://localhost:3001/api/parse-google-maps-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testParser();

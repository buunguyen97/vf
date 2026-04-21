// Test cases for Google Maps Parser
// Run with: node test_parser_cases.js

const testCases = [
  {
    name: 'URL with saddr (coordinates) and daddr (address)',
    url: 'https://www.google.com/maps?geocode=FRiYpAAd3URcBg%3D%3D;FZxvugAdv1aCBim7xRb4Q2dwMTEw7ywjR-hrsA%3D%3D&daddr=28e+Trần+Phú,+Nha+Trang,+Khánh+Hòa&saddr=10.7868400,106.7102370&dirflg=d&ftid=0x31706743f816c5bb:0xb06be847232cef30',
    expected: { hasOrigin: true, hasDestination: true }
  },
  {
    name: 'Place-only URL with coordinates',
    url: 'https://www.google.com/maps/place/10.7769,106.7009',
    expected: { hasOrigin: false, hasDestination: true }
  },
  {
    name: 'Route URL with two coordinate pairs',
    url: 'https://www.google.com/maps/dir/10.7769,106.7009/10.8231,106.6297/',
    expected: { hasOrigin: true, hasDestination: true }
  },
  {
    name: 'URL with both saddr and daddr as coordinates',
    url: 'https://www.google.com/maps?saddr=10.7868400,106.7102370&daddr=12.2388,109.1967',
    expected: { hasOrigin: true, hasDestination: true }
  },
  {
    name: 'URL with text addresses (requires geocoding)',
    url: 'https://www.google.com/maps?saddr=Hồ+Chí+Minh&daddr=Hà+Nội',
    expected: { hasOrigin: false, hasDestination: true }
  }
];

async function runTests() {
  console.log('Running Google Maps Parser Tests...\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const response = await fetch('http://localhost:3001/api/parse-google-maps-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testCase.url })
      });

      const data = await response.json();

      const hasOrigin = data.origin !== null && data.origin !== undefined;
      const hasDestination = data.destination !== null && data.destination !== undefined;

      const success = data.success &&
        hasOrigin === testCase.expected.hasOrigin &&
        hasDestination === testCase.expected.hasDestination;

      if (success) {
        console.log(`✓ PASS: ${testCase.name}`);
        console.log(`  Origin: ${data.origin ? `[${data.origin}]` : 'null'}`);
        console.log(`  Destination: [${data.destination}]`);
        passed++;
      } else {
        console.log(`✗ FAIL: ${testCase.name}`);
        console.log(`  Expected: origin=${testCase.expected.hasOrigin}, destination=${testCase.expected.hasDestination}`);
        console.log(`  Got: origin=${hasOrigin}, destination=${hasDestination}`);
        console.log(`  Response:`, data);
        failed++;
      }
    } catch (err) {
      console.log(`✗ ERROR: ${testCase.name}`);
      console.log(`  ${err.message}`);
      failed++;
    }
    console.log('');
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();

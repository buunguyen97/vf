const { getDb } = require('./init');

const vehicles = [
  {
    name: 'VF3',
    display_name: 'VinFast VF 3',
    battery_capacity_kwh: 18.64,
    base_consumption_wh_km: 89,
    wltp_range_km: 210,
    image_url: '/assets/vehicles/vf3.png'
  },
  {
    name: 'Minio_Green',
    display_name: 'VinFast Minio Green',
    battery_capacity_kwh: 18.3,
    base_consumption_wh_km: 87,
    wltp_range_km: 210,
    image_url: '/assets/vehicles/minio-green.png'
  },
  {
    name: 'EC_Van',
    display_name: 'VinFast EC Van',
    battery_capacity_kwh: 18.3,
    base_consumption_wh_km: 105,
    wltp_range_km: 175,
    image_url: '/assets/vehicles/ec-van.png'
  },
  {
    name: 'VF5',
    display_name: 'VinFast VF 5 Plus',
    battery_capacity_kwh: 37.23,
    base_consumption_wh_km: 114,
    wltp_range_km: 326,
    image_url: '/assets/vehicles/vf5.png'
  },
  {
    name: 'Herio_Green',
    display_name: 'VinFast Herio Green',
    battery_capacity_kwh: 37.23,
    base_consumption_wh_km: 114,
    wltp_range_km: 326,
    image_url: '/assets/vehicles/herio-green.png'
  },
  {
    name: 'VFe34',
    display_name: 'VinFast VF e34',
    battery_capacity_kwh: 42,
    base_consumption_wh_km: 132,
    wltp_range_km: 318,
    image_url: '/assets/vehicles/vfe34.png'
  },
  {
    name: 'Nerio_Green',
    display_name: 'VinFast Nerio Green',
    battery_capacity_kwh: 42,
    base_consumption_wh_km: 147,
    wltp_range_km: 285,
    image_url: '/assets/vehicles/nerio-green.png'
  },
  {
    name: 'VF6_Eco',
    display_name: 'VinFast VF 6 Eco',
    battery_capacity_kwh: 59.6,
    base_consumption_wh_km: 124,
    wltp_range_km: 480,
    image_url: '/assets/vehicles/vf6.png'
  },
  {
    name: 'VF6',
    display_name: 'VinFast VF 6 Plus',
    battery_capacity_kwh: 59.6,
    base_consumption_wh_km: 130,
    wltp_range_km: 460,
    image_url: '/assets/vehicles/vf6.png'
  },
  {
    name: 'VF7_Eco',
    display_name: 'VinFast VF 7 Eco',
    battery_capacity_kwh: 59.6,
    base_consumption_wh_km: 135,
    wltp_range_km: 440,
    image_url: '/assets/vehicles/vf7.png'
  },
  {
    name: 'VF7',
    display_name: 'VinFast VF 7 Plus',
    battery_capacity_kwh: 75.3,
    base_consumption_wh_km: 175,
    wltp_range_km: 431,
    image_url: '/assets/vehicles/vf7.png'
  },
  {
    name: 'Limo_Green',
    display_name: 'VinFast Limo Green',
    battery_capacity_kwh: 60.13,
    base_consumption_wh_km: 134,
    wltp_range_km: 450,
    image_url: '/assets/vehicles/limo-green.png'
  },
  {
    name: 'VF8_Eco',
    display_name: 'VinFast VF 8 Eco',
    battery_capacity_kwh: 87.7,
    base_consumption_wh_km: 186,
    wltp_range_km: 471,
    image_url: '/assets/vehicles/vf8.png'
  },
  {
    name: 'VF8_Plus',
    display_name: 'VinFast VF 8 Plus',
    battery_capacity_kwh: 87.7,
    base_consumption_wh_km: 192,
    wltp_range_km: 457,
    image_url: '/assets/vehicles/vf8.png'
  },
  {
    name: 'VF9_Eco',
    display_name: 'VinFast VF 9 Eco',
    battery_capacity_kwh: 123,
    base_consumption_wh_km: 211,
    wltp_range_km: 531,
    image_url: '/assets/vehicles/vf9.png'
  },
  {
    name: 'VF9_Plus',
    display_name: 'VinFast VF 9 Plus',
    battery_capacity_kwh: 123,
    base_consumption_wh_km: 237,
    wltp_range_km: 468,
    image_url: '/assets/vehicles/vf9.png'
  }
];

const stations = [
  // Hanoi
  { name: 'Vincom Mega Mall Royal City', address: '72A Nguyễn Trãi, Thanh Xuân, Hà Nội', latitude: 21.0031, longitude: 105.8158, city: 'Hanoi', power_kw: 150 },
  { name: 'Vincom Mega Mall Times City', address: '458 Minh Khai, Hai Bà Trưng, Hà Nội', latitude: 20.9959, longitude: 105.8672, city: 'Hanoi', power_kw: 150 },
  { name: 'Vinhomes Ocean Park', address: 'Đa Tốn, Gia Lâm, Hà Nội', latitude: 20.9930, longitude: 105.9398, city: 'Hanoi', power_kw: 150 },
  { name: 'Vincom Center Bà Triệu', address: '191 Bà Triệu, Hai Bà Trưng, Hà Nội', latitude: 21.0116, longitude: 105.8497, city: 'Hanoi', power_kw: 60 },
  { name: 'Vincom Center Metropolis', address: '29 Liễu Giai, Ba Đình, Hà Nội', latitude: 21.0315, longitude: 105.8143, city: 'Hanoi', power_kw: 60 },
  
  // HCMC
  { name: 'Vincom Center Landmark 81', address: '720A P. Điện Biên Phủ, Vinhomes Central Park, Bình Thạnh, HCM', latitude: 10.7946, longitude: 106.7223, city: 'HCMC', power_kw: 150 },
  { name: 'Vincom Center Đồng Khởi', address: '72 Lê Thánh Tôn, Bến Nghé, Quận 1, HCM', latitude: 10.7780, longitude: 106.7020, city: 'HCMC', power_kw: 60 },
  { name: 'Vincom Mega Mall Thảo Điền', address: '161 Xa Lộ Hà Nội, Thảo Điền, Quận 2, HCM', latitude: 10.8038, longitude: 106.7360, city: 'HCMC', power_kw: 150 },
  { name: 'Vinhomes Grand Park', address: 'Nguyễn Xiển, Long Thạnh Mỹ, Quận 9, HCM', latitude: 10.8447, longitude: 106.8378, city: 'HCMC', power_kw: 150 },
  
  // Da Nang
  { name: 'Vincom Plaza Ngô Quyền', address: '910A Ngô Quyền, Sơn Trà, Đà Nẵng', latitude: 16.0694, longitude: 108.2361, city: 'Da Nang', power_kw: 150 },
  { name: 'Bãi đỗ xe Điện Biên Phủ', address: '150 Điện Biên Phủ, Thanh Khê, Đà Nẵng', latitude: 16.0673, longitude: 108.1969, city: 'Da Nang', power_kw: 60 },
  
  // Highways
  { name: 'Trạm dừng nghỉ V52 Hải Dương', address: 'Cao tốc HN-HP, Gia Lộc, Hải Dương', latitude: 20.8354, longitude: 106.3117, city: 'Hai Duong', power_kw: 150 },
  { name: 'Trạm dừng nghỉ cao tốc Long Thành', address: 'Cao tốc TP HCM - Long Thành', latitude: 10.7938, longitude: 106.9452, city: 'Dong Nai', power_kw: 150 }
];

function seed() {
  const db = getDb();

  console.log('Seeding vehicles...');
  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (name, display_name, battery_capacity_kwh, base_consumption_wh_km, wltp_range_km, image_url)
    VALUES (@name, @display_name, @battery_capacity_kwh, @base_consumption_wh_km, @wltp_range_km, @image_url)
    ON CONFLICT(name) DO UPDATE SET
      display_name = excluded.display_name,
      battery_capacity_kwh = excluded.battery_capacity_kwh,
      base_consumption_wh_km = excluded.base_consumption_wh_km,
      wltp_range_km = excluded.wltp_range_km,
      image_url = excluded.image_url
  `);

  const insertVehicleTransaction = db.transaction((items) => {
    for (const item of items) insertVehicle.run(item);
  });
  insertVehicleTransaction(vehicles);

  console.log('Seeding charging stations...');
  const insertStation = db.prepare(`
    INSERT INTO charging_stations (name, address, latitude, longitude, power_kw, city)
    VALUES (@name, @address, @latitude, @longitude, @power_kw, @city)
    ON CONFLICT(name, latitude, longitude, power_kw) DO UPDATE SET
      address = excluded.address,
      city = excluded.city
  `);

  const insertStationTransaction = db.transaction((items) => {
    for (const item of items) insertStation.run(item);
  });
  insertStationTransaction(stations);

  console.log('Database seeded successfully.');
}

// Auto-run when called directly (npm run seed), export for programmatic use
if (require.main === module) {
  seed();
}

module.exports = { seed };

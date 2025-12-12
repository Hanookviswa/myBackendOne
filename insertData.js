const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'campus_booking.db');

const insertData = async () => {
  try {
    const db = await open({ filename: dbPath, driver: sqlite3.Database });


    const users = [
      { name: 'John Doe', email: 'john@example.com', password: 'password123' },
      { name: 'Jane Smith', email: 'jane@example.com', password: 'mypassword' },
    ];

    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await db.run(
        `INSERT OR IGNORE INTO users (name, email, password) VALUES (?, ?, ?)`,
        [user.name, user.email, hashedPassword]
      );
    }

    
    const resources = [
      { name: 'Conference Room A', type: 'Room', capacity: 20, image_url: '' },
      { name: 'Auditorium', type: 'Hall', capacity: 200, image_url: '' },
      { name: 'Projector', type: 'Equipment', capacity: 1, image_url: '' },
    ];

    for (const res of resources) {
      await db.run(
        `INSERT OR IGNORE INTO resources (name, type, capacity, image_url) VALUES (?, ?, ?, ?)`,
        [res.name, res.type, res.capacity, res.image_url]
      );
    }

    console.log('Seed data inserted successfully!');
    await db.close();
  } catch (err) {
    console.error('Error inserting data:', err);
  }
};

insertData();
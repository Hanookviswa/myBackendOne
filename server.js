const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const { open } = require("sqlite");
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());


const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;


const dbPath = path.join(__dirname, "campus_booking.db");


let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(PORT, () => {
      console.log(`Server running at PORT ${PORT}`);
    });

  } catch (e) {
    console.log("DB Error:", e.message);
    process.exit(1);
  }
};

initializeDBAndServer();



app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const user = await db.get(
      "SELECT * FROM users WHERE email = ?", 
      [email]
    );

    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.run(
      `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
      [name, email, hashedPassword]
    );

    const jwtToken = jwt.sign({ userId: result.lastID }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ jwtToken });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const dbUser = await db.get(
      "SELECT * FROM users WHERE email = ?", 
      [email]
    );

    if (!dbUser) {
      return res.status(400).json({ message: "User not found" });
    }

    const isValid = await bcrypt.compare(password, dbUser.password);

    if (!isValid) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const jwtToken = jwt.sign({ userId: dbUser.id }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ jwtToken });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



const logger = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  let jwtToken;

  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (!jwtToken) {
    return res.status(401).send("Invalid JWT Token");
  }

  jwt.verify(jwtToken, JWT_SECRET, (error, payload) => {
    if (error) return res.status(401).send("Invalid JWT Token");

    req.userId = payload.userId;
    next();
  });
};





app.get("/api/resources/", logger, async (req, res) => {
  const data = await db.all("SELECT * FROM resources ORDER BY resource_id");
  res.send(data);
});


app.get("/api/resources/:id/", logger, async (req, res) => {
  const { id } = req.params;

  const resource = await db.get(
    "SELECT * FROM resources WHERE resource_id = ?", 
    [id]
  );

  if (!resource) return res.status(404).send("Resource not found");

  res.send(resource);
});


app.post("/api/resources/book/", logger, async (req, res) => {
  const { name, type, capacity, image_url } = req.body;

  const result = await db.run(
    `INSERT INTO resources (name, type, capacity, image_url) 
     VALUES (?, ?, ?, ?)`,
    [name, type, capacity, image_url]
  );

  res.send({ resource_id: result.lastID });
});


app.put("/api/resources/:id/cancel", logger, async (req, res) => {
  const { id } = req.params;

  await db.run(
    "UPDATE resources SET status = 'cancelled' WHERE resource_id = ?",
    [id]
  );

  res.send(`Resource ${id} cancelled successfully`);
});


app.put("/api/resources/:id/update", logger, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  await db.run(
    "UPDATE resources SET name = ? WHERE resource_id = ?",
    [name, id]
  );

  res.send(`Resource ${id} updated successfully`);
});




app.get("/api/resources/search/", logger, async (req, res) => {
  const { query } = req.query;

  const data = await db.all(
    `SELECT * FROM resources 
     WHERE name LIKE ? OR type LIKE ? OR image_url LIKE ?`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );

  res.send(data);
});


app.get("/api/resources/filter/", logger, async (req, res) => {
  const { type, status } = req.query;

  let sql = `
    SELECT 
      resources.resource_id,
      resources.name,
      resources.type,
      resources.capacity,
      resources.image_url,
      bookings.status
    FROM resources
    LEFT JOIN bookings ON resources.resource_id = bookings.resource_id
    WHERE 1=1
  `;

  const params = [];

  if (type) {
    sql += ` AND resources.type = ?`;
    params.push(type);
  }

  if (status) {
    sql += ` AND bookings.status = ?`;
    params.push(status);
  }

  const data = await db.all(sql, params);
  res.send(data);
});


app.get("/api/resources/sort/", logger, async (req, res) => {
  const { by } = req.query;

  let sql = `
    SELECT 
      resources.resource_id,
      resources.name,
      resources.type,
      resources.capacity,
      resources.image_url,
      bookings.date
    FROM resources
    LEFT JOIN bookings ON resources.resource_id = bookings.resource_id
  `;

  if (by === "date") sql += ` ORDER BY bookings.date ASC`;

  const data = await db.all(sql);
  res.send(data);
});




app.get("/api/analytics/usage/", logger, async (req, res) => {
  const sql = `
    SELECT 
      resources.resource_id,
      resources.name,
      COUNT(bookings.booking_id) AS total_bookings
    FROM resources
    LEFT JOIN bookings ON resources.resource_id = bookings.resource_id
    GROUP BY resources.resource_id
  `;

  const data = await db.all(sql);
  res.send(data);
});


app.get("/api/analytics/top-rooms/", logger, async (req, res) => {
  const sql = `
    SELECT 
      resources.resource_id,
      resources.name,
      COUNT(bookings.booking_id) AS total_bookings
    FROM resources
    LEFT JOIN bookings ON resources.resource_id = bookings.resource_id
    GROUP BY resources.resource_id
    ORDER BY total_bookings DESC
    LIMIT 10
  `;

  const data = await db.all(sql);
  res.send(data);
});




app.get("/api/users/:id/bookings/", logger, async (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      bookings.booking_id,
      bookings.date,
      bookings.start_time,
      bookings.end_time,
      bookings.status,
      resources.name AS resource_name,
      resources.type AS resource_type
    FROM bookings
    INNER JOIN resources ON bookings.resource_id = resources.resource_id
    WHERE bookings.user_id = ?
  `;

  const data = await db.all(sql, [id]);
  res.send(data);
});




app.delete("/api/resources/:id/", logger, async (req, res) => {
  const { id } = req.params;

  await db.run("DELETE FROM resources WHERE resource_id = ?", [id]);

  res.send(`Resource ${id} deleted successfully`);
});
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;
const SECRET = process.env.JWT_SECRET || "change-this-secret";

// Check server
app.get("/", (req, res) => {
  res.send("Mock Interview Scheduling System Backend is running!");
});

// Register student or mentor
app.post("/api/register", (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password ||
      !["student", "mentor"].includes(role)) {
    return res.status(400).json({
      error: "Enter valid details and select student or mentor."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: "Password must contain at least 6 characters."
    });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(name, email.toLowerCase(), hash, role);

    res.status(201).json({
      message: "Registration successful!",
      userId: result.lastInsertRowid
    });
  } catch (error) {
    res.status(409).json({
      error: "Email already registered or details invalid."
    });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).get((email || "").toLowerCase());

  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({
      error: "Invalid email or password."
    });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    message: "Login successful!",
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

// Authentication middleware
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Login required." });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token." });
  }
}

// Add mentor availability
app.post("/api/availability", authenticate, (req, res) => {
  if (req.user.role !== "mentor") {
    return res.status(403).json({
      error: "Only mentors can add availability."
    });
  }

  const { startTime, endTime } = req.body;

  if (
    !startTime || !endTime ||
    !Number.isFinite(Date.parse(startTime)) ||
    !Number.isFinite(Date.parse(endTime)) ||
    Date.parse(endTime) <= Date.parse(startTime)
  ) {
    return res.status(400).json({
      error: "Enter valid start and end times."
    });
  }

  const result = db.prepare(`
    INSERT INTO availability
      (mentor_id, start_time, end_time)
    VALUES (?, ?, ?)
  `).run(
    req.user.id,
    new Date(startTime).toISOString(),
    new Date(endTime).toISOString()
  );

  res.status(201).json({
    message: "Availability added!",
    slotId: result.lastInsertRowid
  });
});

// View available slots
app.get("/api/availability", (req, res) => {
  const slots = db.prepare(`
    SELECT a.id, a.mentor_id, u.name AS mentor_name,
           a.start_time, a.end_time
    FROM availability a
    JOIN users u ON a.mentor_id = u.id
    WHERE a.is_booked = 0
    ORDER BY a.start_time
  `).all();

  res.json(slots);
});

// Book an interview
app.post("/api/bookings", authenticate, (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({
      error: "Only students can request interviews."
    });
  }

  const { availabilityId, topic } = req.body;

  if (!availabilityId || !topic?.trim()) {
    return res.status(400).json({
      error: "Slot ID and interview topic are required."
    });
  }

  const book = db.transaction(() => {
    const slot = db.prepare(`
      SELECT * FROM availability WHERE id = ?
    `).get(availabilityId);

    if (!slot || slot.is_booked) {
      throw new Error("Slot is unavailable.");
    }

    if (Date.parse(slot.start_time) <= Date.now()) {
      throw new Error("Cannot book a past slot.");
    }

    const result = db.prepare(`
      INSERT INTO bookings
        (student_id, mentor_id, availability_id, topic)
      VALUES (?, ?, ?, ?)
    `).run(
      req.user.id,
      slot.mentor_id,
      slot.id,
      topic.trim()
    );

    db.prepare(`
      UPDATE availability SET is_booked = 1 WHERE id = ?
    `).run(slot.id);

    return result.lastInsertRowid;
  });

  try {
    res.status(201).json({
      message: "Interview request submitted!",
      bookingId: book()
    });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

// View bookings
app.get("/api/bookings", authenticate, (req, res) => {
  const column = req.user.role === "student"
    ? "b.student_id"
    : "b.mentor_id";

  const bookings = db.prepare(`
    SELECT b.*, s.name AS student_name,
           m.name AS mentor_name,
           a.start_time, a.end_time
    FROM bookings b
    JOIN users s ON b.student_id = s.id
    JOIN users m ON b.mentor_id = m.id
    JOIN availability a ON b.availability_id = a.id
    WHERE ${column} = ?
    ORDER BY a.start_time
  `).all(req.user.id);

  res.json(bookings);
});

// Mentor confirms or cancels a request
app.patch(
  "/api/bookings/:id/status",
  authenticate,
  (req, res) => {
    if (req.user.role !== "mentor") {
      return res.status(403).json({
        error: "Only mentors can update bookings."
      });
    }

    const { status } = req.body;

    if (!["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({
        error: "Status must be confirmed or cancelled."
      });
    }

    const booking = db.prepare(`
      SELECT * FROM bookings
      WHERE id = ? AND mentor_id = ?
    `).get(req.params.id, req.user.id);

    if (!booking || booking.status !== "pending") {
      return res.status(404).json({
        error: "Pending booking not found."
      });
    }

    const update = db.transaction(() => {
      db.prepare(`
        UPDATE bookings SET status = ? WHERE id = ?
      `).run(status, booking.id);

      if (status === "cancelled") {
        db.prepare(`
          UPDATE availability SET is_booked = 0 WHERE id = ?
        `).run(booking.availability_id);
      }
    });

    update();

    res.json({ message: `Booking ${status}.` });
  }
);

// Mentor completes an interview
app.patch(
  "/api/bookings/:id/complete",
  authenticate,
  (req, res) => {
    if (req.user.role !== "mentor") {
      return res.status(403).json({ error: "Mentors only." });
    }

    const result = db.prepare(`
      UPDATE bookings SET status = 'completed'
      WHERE id = ? AND mentor_id = ? AND status = 'confirmed'
    `).run(req.params.id, req.user.id);

    if (!result.changes) {
      return res.status(404).json({
        error: "Confirmed booking not found."
      });
    }

    res.json({ message: "Interview completed!" });
  }
);

// Student adds feedback
app.patch(
  "/api/bookings/:id/feedback",
  authenticate,
  (req, res) => {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Students only." });
    }

    const { feedback, rating } = req.body;

    if (!feedback?.trim() ||
        !Number.isInteger(rating) ||
        rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Enter feedback and a rating from 1 to 5."
      });
    }

    const result = db.prepare(`
      UPDATE bookings
      SET feedback = ?, rating = ?
      WHERE id = ? AND student_id = ? AND status = 'completed'
    `).run(
      feedback.trim(),
      rating,
      req.params.id,
      req.user.id
    );

    if (!result.changes) {
      return res.status(404).json({
        error: "Completed booking not found."
      });
    }

    res.json({ message: "Feedback saved successfully!" });
  }
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${5000
  }`);
});
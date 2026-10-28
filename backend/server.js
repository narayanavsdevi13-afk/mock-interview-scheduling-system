
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error("JWT_SECRET is missing from backend/.env");
}

// Check server
app.get("/", (req, res) => {
  res.send("Mock Interview Scheduling System Backend is running!");
});

// Register student or mentor
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (
      !name?.trim() ||
      !email?.trim() ||
      !password ||
      !["student", "mentor"].includes(role)
    ) {
      return res.status(400).json({
        error: "Enter valid details and select student or mentor."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must contain at least 6 characters."
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const { data, error } = await db
      .from("users")
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password_hash: hash,
        role
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "Email already registered."
        });
      }

      console.error("Registration error:", error.message);
      return res.status(500).json({
        error: "Could not register. Please try again."
      });
    }

    res.status(201).json({
      message: "Registration successful!",
      userId: data.id
    });
  } catch (error) {
    console.error("Registration error:", error.message);
    res.status(500).json({ error: "Registration failed." });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await db
      .from("users")
      .select("id, name, email, password_hash, role")
      .eq("email", (email || "").trim().toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("Login database error:", error.message);
      return res.status(500).json({ error: "Login failed." });
    }

    if (
      !user ||
      !(await bcrypt.compare(password || "", user.password_hash))
    ) {
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
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Login failed." });
  }
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
app.post("/api/availability", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "mentor") {
      return res.status(403).json({
        error: "Only mentors can add availability."
      });
    }

    const { startTime, endTime } = req.body;

    if (
      !startTime ||
      !endTime ||
      !Number.isFinite(Date.parse(startTime)) ||
      !Number.isFinite(Date.parse(endTime)) ||
      Date.parse(endTime) <= Date.parse(startTime)
    ) {
      return res.status(400).json({
        error: "Enter valid start and end times."
      });
    }

    const { data, error } = await db
      .from("availability")
      .insert({
        mentor_id: req.user.id,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        is_booked: 0
      })
      .select("id")
      .single();

    if (error) {
      console.error("Availability error:", error.message);
      return res.status(500).json({
        error: "Could not add availability."
      });
    }

    res.status(201).json({
      message: "Availability added!",
      slotId: data.id
    });
  } catch (error) {
    console.error("Availability error:", error.message);
    res.status(500).json({ error: "Could not add availability." });
  }
});

// View available slots
app.get("/api/availability", async (req, res) => {
  try {
    const { data: slots, error } = await db
      .from("availability")
      .select("id, mentor_id, start_time, end_time")
      .eq("is_booked", 0)
      .order("start_time");

    if (error) {
      console.error("Load availability error:", error.message);
      return res.status(500).json({
        error: "Could not load availability."
      });
    }

    if (!slots.length) {
      return res.json([]);
    }

    const mentorIds = [...new Set(slots.map(slot => slot.mentor_id))];

    const { data: mentors, error: mentorError } = await db
      .from("users")
      .select("id, name")
      .in("id", mentorIds);

    if (mentorError) {
      console.error("Load mentors error:", mentorError.message);
      return res.status(500).json({
        error: "Could not load mentor details."
      });
    }

    const mentorNames = new Map(
      mentors.map(mentor => [mentor.id, mentor.name])
    );

    res.json(
      slots.map(slot => ({
        ...slot,
        mentor_name: mentorNames.get(slot.mentor_id) || "Mentor"
      }))
    );
  } catch (error) {
    console.error("Load availability error:", error.message);
    res.status(500).json({ error: "Could not load availability." });
  }
});

// Book an interview
app.post("/api/bookings", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        error: "Only students can request interviews."
      });
    }

    const { availabilityId, topic } = req.body;
    const slotId = Number(availabilityId);

    if (!Number.isInteger(slotId) || slotId < 1 || !topic?.trim()) {
      return res.status(400).json({
        error: "Slot ID and interview topic are required."
      });
    }

    const { data: slot, error: slotError } = await db
      .from("availability")
      .select("id, mentor_id, start_time, end_time, is_booked")
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) {
      console.error("Find slot error:", slotError.message);
      return res.status(500).json({ error: "Could not check the slot." });
    }

    if (!slot || slot.is_booked !== 0) {
      return res.status(409).json({ error: "Slot is unavailable." });
    }

    if (Date.parse(slot.start_time) <= Date.now()) {
      return res.status(409).json({ error: "Cannot book a past slot." });
    }

    // Reserve the slot only if it is still free.
    const { data: reserved, error: reserveError } = await db
      .from("availability")
      .update({ is_booked: 1 })
      .eq("id", slot.id)
      .eq("is_booked", 0)
      .select("id")
      .maybeSingle();

    if (reserveError) {
      console.error("Reserve slot error:", reserveError.message);
      return res.status(500).json({ error: "Could not reserve the slot." });
    }

    if (!reserved) {
      return res.status(409).json({ error: "Slot is no longer available." });
    }

    const { data: booking, error: bookingError } = await db
      .from("bookings")
      .insert({
        student_id: req.user.id,
        mentor_id: slot.mentor_id,
        availability_id: slot.id,
        topic: topic.trim()
      })
      .select("id")
      .single();

    if (bookingError) {
      // Release the slot if creating the booking failed.
      const { error: releaseError } = await db
        .from("availability")
        .update({ is_booked: 0 })
        .eq("id", slot.id);

      if (releaseError) {
        console.error("Could not release slot:", releaseError.message);
      }

      if (bookingError.code === "23505") {
        return res.status(409).json({ error: "Slot is unavailable." });
      }

      console.error("Create booking error:", bookingError.message);
      return res.status(500).json({
        error: "Could not create the booking."
      });
    }

    res.status(201).json({
      message: "Interview request submitted!",
      bookingId: booking.id
    });
  } catch (error) {
    console.error("Booking error:", error.message);
    res.status(500).json({ error: "Could not create the booking." });
  }
});

// View bookings for the logged-in student or mentor
app.get("/api/bookings", authenticate, async (req, res) => {
  try {
    const column = req.user.role === "student"
      ? "student_id"
      : "mentor_id";

    const { data: bookings, error } = await db
      .from("bookings")
      .select("*")
      .eq(column, req.user.id)
      .order("id");

    if (error) {
      console.error("Load bookings error:", error.message);
      return res.status(500).json({ error: "Could not load bookings." });
    }

    if (!bookings.length) {
      return res.json([]);
    }

    const userIds = [
      ...new Set(bookings.flatMap(b => [b.student_id, b.mentor_id]))
    ];
    const slotIds = [...new Set(bookings.map(b => b.availability_id))];

    const [
      { data: users, error: usersError },
      { data: slots, error: slotsError }
    ] = await Promise.all([
      db.from("users").select("id, name").in("id", userIds),
      db.from("availability")
        .select("id, start_time, end_time")
        .in("id", slotIds)
    ]);

    if (usersError || slotsError) {
      console.error("Booking details error:", usersError || slotsError);
      return res.status(500).json({
        error: "Could not load booking details."
      });
    }

    const userNames = new Map(users.map(u => [u.id, u.name]));
    const slotMap = new Map(slots.map(s => [s.id, s]));

    res.json(
      bookings.map(booking => ({
        ...booking,
        student_name: userNames.get(booking.student_id) || "Student",
        mentor_name: userNames.get(booking.mentor_id) || "Mentor",
        start_time: slotMap.get(booking.availability_id)?.start_time,
        end_time: slotMap.get(booking.availability_id)?.end_time
      }))
    );
  } catch (error) {
    console.error("Load bookings error:", error.message);
    res.status(500).json({ error: "Could not load bookings." });
  }
});

// Mentor confirms or cancels a request
app.patch("/api/bookings/:id/status", authenticate, async (req, res) => {
  try {
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

    const bookingId = Number(req.params.id);

    const { data: booking, error: findError } = await db
      .from("bookings")
      .select("id, availability_id, status")
      .eq("id", bookingId)
      .eq("mentor_id", req.user.id)
      .maybeSingle();

    if (findError) {
      console.error("Find booking error:", findError.message);
      return res.status(500).json({ error: "Could not find booking." });
    }

    if (!booking || booking.status !== "pending") {
      return res.status(404).json({
        error: "Pending booking not found."
      });
    }

    const { data: updated, error: updateError } = await db
      .from("bookings")
      .update({ status })
      .eq("id", booking.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Update booking error:", updateError.message);
      return res.status(500).json({ error: "Could not update booking." });
    }

    if (!updated) {
      return res.status(409).json({
        error: "Booking status has already changed."
      });
    }

    if (status === "cancelled") {
      const { error: releaseError } = await db
        .from("availability")
        .update({ is_booked: 0 })
        .eq("id", booking.availability_id);

      if (releaseError) {
        console.error("Release slot error:", releaseError.message);
        return res.status(500).json({
          error: "Booking cancelled, but the slot could not be released."
        });
      }
    }

    res.json({ message: `Booking ${status}.` });
  } catch (error) {
    console.error("Update booking error:", error.message);
    res.status(500).json({ error: "Could not update booking." });
  }
});

// Mentor completes an interview
app.patch("/api/bookings/:id/complete", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "mentor") {
      return res.status(403).json({ error: "Mentors only." });
    }

    const { data, error } = await db
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", Number(req.params.id))
      .eq("mentor_id", req.user.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Complete booking error:", error.message);
      return res.status(500).json({
        error: "Could not complete the interview."
      });
    }

    if (!data) {
      return res.status(404).json({
        error: "Confirmed booking not found."
      });
    }

    res.json({ message: "Interview completed!" });
  } catch (error) {
    console.error("Complete booking error:", error.message);
    res.status(500).json({ error: "Could not complete the interview." });
  }
});

// Student adds feedback
app.patch("/api/bookings/:id/feedback", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Students only." });
    }

    const { feedback, rating } = req.body;

    if (
      !feedback?.trim() ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        error: "Enter feedback and a rating from 1 to 5."
      });
    }

    const { data, error } = await db
      .from("bookings")
      .update({
        feedback: feedback.trim(),
        rating
      })
      .eq("id", Number(req.params.id))
      .eq("student_id", req.user.id)
      .eq("status", "completed")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Save feedback error:", error.message);
      return res.status(500).json({
        error: "Could not save feedback."
      });
    }

    if (!data) {
      return res.status(404).json({
        error: "Completed booking not found."
      });
    }

    res.json({ message: "Feedback saved successfully!" });
  } catch (error) {
    console.error("Feedback error:", error.message);
    res.status(500).json({ error: "Could not save feedback." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${5000}`);
});

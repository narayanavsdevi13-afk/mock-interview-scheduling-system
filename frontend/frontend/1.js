const API_URL = "http://localhost:5000";async function loadAvailability() {
  try {
    const response = await fetch(
      `${API_URL}/api/availability`
    );

    if (!response.ok) {
      throw new Error("Could not load availability");
    }

    const slots = await response.json();
    console.log(slots);
  } catch (error) {
    console.error("API error:", error);
  }
}const API = "/api";
const $ = (selector) => document.querySelector(selector);

const state = {
  token: localStorage.getItem("mi_token"),
  user: null,
  mode: "login",
  view: "overview",
  slots: [],
  bookings: []
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
      });
}

function setMessage(element, message, error = false) {
  element.textContent = message;
  element.classList.remove("hidden", "error");

  if (error) element.classList.add("error");
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("error");
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = { error: "The server returned an invalid response." };
  }

  if (!response.ok) {
    if (response.status === 401 && state.token) {
      logout(false);
    }

    throw new Error(data.error || "Request failed.");
  }

  return data;
}

// Show the landing page.
function showLanding() {
  $("#landing").classList.remove("hidden");
  $("#features").classList.remove("hidden");
  $("#how-it-works").classList.remove("hidden");
  $("#auth-section").classList.add("hidden");
  $("#dashboard").classList.add("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Show login or registration.
function showAuth(mode = "login") {
  state.mode = mode;

  $("#landing").classList.add("hidden");
  $("#features").classList.add("hidden");
  $("#how-it-works").classList.add("hidden");
  $("#dashboard").classList.add("hidden");
  $("#auth-section").classList.remove("hidden");

  const signup = mode === "signup";

  $("#auth-title").textContent = signup
    ? "Create your account"
    : "Welcome back";

  $("#auth-subtitle").textContent = signup
    ? "Start building interview confidence today."
    : "Sign in to continue your preparation.";

  $("#name-field").classList.toggle("hidden", !signup);
  $("#full-name").required = signup;

  $("#password").autocomplete = signup
    ? "new-password"
    : "current-password";

  $("#auth-submit").textContent = signup
    ? "Create account"
    : "Log in";

  $("#auth-switch").innerHTML = signup
    ? 'Already have an account? <button id="switch-mode" class="text-button" type="button">Log in</button>'
    : 'New here? <button id="switch-mode" class="text-button" type="button">Create an account</button>';

  $("#switch-mode").addEventListener("click", () => {
    showAuth(signup ? "login" : "signup");
  });

  clearMessage($("#auth-message"));

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Clear the current session.
function logout(showHome = true) {
  state.token = null;
  state.user = null;
  state.slots = [];
  state.bookings = [];

  localStorage.removeItem("mi_token");

  if (showHome) showLanding();
}

// Retrieve the logged-in user's profile.
async function loadUser() {
  const result = await api("/auth/me");

  state.user = result.user;

  return state.user;
}

// Open the dashboard.
async function enterDashboard() {
  $("#landing").classList.add("hidden");
  $("#features").classList.add("hidden");
  $("#how-it-works").classList.add("hidden");
  $("#auth-section").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");

  $("#user-name").textContent = state.user.name;
  $("#user-role").textContent = state.user.role;

  $("#user-avatar").textContent = state.user.name
    .split(/\s+/)
    .map(s => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  $("#header-email").textContent = state.user.email;

  $("#mentor-nav").classList.toggle(
    "hidden",
    state.user.role !== "mentor"
  );

  $("#dashboard-heading").textContent =
    `Welcome, ${state.user.name.split(" ")[0]}.`;

  await loadDashboard();
}

// Retrieve slots and bookings.
async function loadDashboard() {
  try {
    const [slotsResult, bookingsResult] = await Promise.all([
      api("/slots"),
      api("/bookings")
    ]);

    state.slots = slotsResult.slots;
    state.bookings = bookingsResult.bookings;

    renderView();
  } catch (error) {
    setMessage($("#dashboard-message"), error.message, true);
  }
}

function statusBadge(status) {
  return `<span class="status status-${escapeHTML(status)}">${escapeHTML(status)}</span>`;
}

function emptyState(title, description) {
  return `<div class="empty-state">
    <strong>${escapeHTML(title)}</strong>
    ${escapeHTML(description)}
  </div>`;
}

// Display the selected dashboard page.
function renderView() {
  const content = $("#dashboard-content");
  const role = state.user.role;

  $("#dashboard-subheading").textContent =
    state.view === "overview"
      ? "Your interview preparation, all in one place."
      : "";

  if (state.view === "slots") {
    content.innerHTML = renderSlots();
  } else if (state.view === "bookings") {
    content.innerHTML = renderBookings();
  } else if (state.view === "manage" && role === "mentor") {
    content.innerHTML = renderManage();
  } else {
    content.innerHTML = renderOverview();
  }

  document.querySelectorAll(".side-link").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === state.view
    );
  });
}

// Dashboard overview.
function renderOverview() {
  const myBookings = state.bookings;

  const upcoming = myBookings.filter(b =>
    ["requested", "confirmed"].includes(b.status)
  );

  const feedbackCount = myBookings.filter(b => b.feedback).length;

  const available = state.slots.filter(s =>
    s.status === "open" &&
    new Date(s.start_time) > new Date()
  ).length;

  return `
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">My interviews</span>
        <strong>${myBookings.length}</strong>
        <small>All booking requests</small>
      </div>

      <div class="stat-card">
        <span class="stat-label">Upcoming / pending</span>
        <strong>${upcoming.length}</strong>
        <small>Requests and confirmed sessions</small>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          ${state.user.role === "mentor" ? "Open slots" : "Feedback received"}
        </span>
        <strong>
          ${state.user.role === "mentor" ? available : feedbackCount}
        </strong>
        <small>
          ${state.user.role === "mentor"
            ? "Future slots available to book"
            : "Completed session feedback"}
        </small>
      </div>
    </div>

    ${state.user.role === "mentor"
      ? `
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Mentor workspace</h2>
              <p>Publish availability and review interview requests.</p>
            </div>
            <button class="button button-primary button-small" data-view="manage">
              Manage slots
            </button>
          </div>
          <p class="muted">
            Create future slots, confirm or reject student requests,
            and add feedback after completed interviews.
          </p>
        </section>
      `
      : `
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Find your next practice session</h2>
              <p>Choose an available mentor and request a time.</p>
            </div>
            <button class="button button-primary button-small" data-view="slots">
              Browse slots →
            </button>
          </div>
          ${
            upcoming.length
              ? renderBookingTable(upcoming.slice(0, 4), false)
              : emptyState(
                  "No upcoming interviews yet",
                  "Browse available slots to request your first session."
                )
          }
        </section>
      `
    }

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Recent interviews</h2>
          <p>Your latest booking activity.</p>
        </div>
        <button class="button button-muted button-small" data-view="bookings">
          View all
        </button>
      </div>

      ${
        myBookings.length
          ? renderBookingTable(myBookings.slice(0, 5), false)
          : emptyState(
              "Nothing here yet",
              "Your interview bookings will appear here."
            )
      }
    </section>
  `;
}

// Display future available slots.
function renderSlots() {
  const available = state.slots.filter(s =>
    s.status === "open" &&
    new Date(s.start_time) > new Date()
  );

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Available interview slots</h2>
          <p>All times are displayed in your browser's local time zone.</p>
        </div>
        <button class="button button-muted button-small" data-action="refresh">
          Refresh
        </button>
      </div>

      ${
        state.user.role === "mentor"
          ? `<p class="muted">
              You can book slots published by other mentors.
              Use Manage slots to publish your own availability.
            </p>`
          : ""
      }

      ${
        available.length
          ? `
            <div class="slot-grid">
              ${available.map(slot => `
                <article class="slot-card">
                  <h3>${escapeHTML(slot.title)}</h3>
                  <p>
                    Mentor: ${escapeHTML(slot.mentor_name)}<br>
                    Starts: ${escapeHTML(formatDate(slot.start_time))}<br>
                    Ends: ${escapeHTML(formatDate(slot.end_time))}
                    ${slot.description
                      ? `<br>${escapeHTML(slot.description)}`
                      : ""}
                  </p>

                  <div class="slot-card-footer">
                    ${statusBadge("open")}

                    ${
                      state.user.role === "student"
                        ? `<button class="button button-primary button-small"
                             data-book="${escapeHTML(slot.id)}">
                             Request slot
                           </button>`
                        : ""
                    }
                  </div>
                </article>
              `).join("")}
            </div>
          `
          : emptyState(
              "No open slots available",
              "Check back later, or ask a mentor to publish their availability."
            )
      }
    </section>
  `;
}

// Create the bookings table.
function renderBookingTable(bookings, actions = true) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>INTERVIEW</th>
            <th>${state.user.role === "mentor" ? "STUDENT" : "MENTOR"}</th>
            <th>DATE & TIME</th>
            <th>STATUS</th>
            ${actions ? "<th>ACTION</th>" : ""}
          </tr>
        </thead>

        <tbody>
          ${bookings.map(b => `
            <tr>
              <td>
                ${escapeHTML(b.slot_title || "Interview")}<br>
                <small>${escapeHTML(b.slot_description || "")}</small>
              </td>

              <td>
                ${escapeHTML(
                  state.user.role === "mentor"
                    ? b.student_name
                    : b.mentor_name
                )}
              </td>

              <td>${escapeHTML(formatDate(b.start_time))}</td>
              <td>${statusBadge(b.status)}</td>

              ${
                actions
                  ? `<td>${renderBookingActions(b)}</td>`
                  : ""
              }
            </tr>

            ${
              b.feedback
                ? `
                  <tr>
                    <td colspan="${actions ? 5 : 4}">
                      <div class="feedback-box">
                        <strong>
                          Mentor feedback · Score ${b.feedback.score}/10
                        </strong>
                        ${escapeHTML(b.feedback.comments)}
                      </div>
                    </td>
                  </tr>
                `
                : ""
            }
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Choose the appropriate action for each booking.
function renderBookingActions(b) {
  if (state.user.role === "mentor") {
    if (b.status === "requested") {
      return `
        <button class="button button-primary button-small"
                data-booking-action="confirm"
                data-id="${escapeHTML(b.id)}">
          Confirm
        </button>

        <button class="button button-danger button-small"
                data-booking-action="reject"
                data-id="${escapeHTML(b.id)}">
          Reject
        </button>
      `;
    }

    if (
      b.status === "confirmed" &&
      new Date(b.end_time) < new Date()
    ) {
      return `
        <button class="button button-muted button-small"
                data-feedback="${escapeHTML(b.id)}">
          Add feedback
        </button>
      `;
    }
  }

  if (
    state.user.role === "student" &&
    ["requested", "confirmed"].includes(b.status) &&
    new Date(b.start_time) > new Date()
  ) {
    return `
      <button class="button button-danger button-small"
              data-booking-action="cancel"
              data-id="${escapeHTML(b.id)}">
        Cancel
      </button>
    `;
  }

  if (b.status === "confirmed" && state.user.role === "mentor") {
    return `<span class="muted">Scheduled</span>`;
  }

  return "—";
}

// Display all bookings.
function renderBookings() {
  const bookings = [...state.bookings].sort(
    (a, b) => new Date(b.start_time) - new Date(a.start_time)
  );

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>
            ${state.user.role === "mentor"
              ? "Student interview requests"
              : "My interviews"}
          </h2>
          <p>Review status, upcoming sessions, and feedback.</p>
        </div>

        <button class="button button-muted button-small" data-action="refresh">
          Refresh
        </button>
      </div>

      ${
        bookings.length
          ? renderBookingTable(bookings, true)
          : emptyState(
              "No interviews found",
              "New bookings will appear here."
            )
      }
    </section>
  `;
}

// Mentor availability management.
function renderManage() {
  const ownSlots = state.slots.filter(
    s => s.mentor_id === state.user.id
  );

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Publish availability</h2>
          <p>Create a slot students can request.</p>
        </div>
      </div>

      <form id="slot-form">
        <div class="form-grid">
          <div class="field">
            <label for="slot-title">Interview title</label>
            <input id="slot-title" name="title" required maxlength="100"
                   placeholder="e.g. Frontend mock interview">
          </div>

          <div class="field">
            <label for="slot-description">Topic / notes</label>
            <input id="slot-description" name="description" maxlength="500"
                   placeholder="JavaScript, communication...">
          </div>

          <div class="field">
            <label for="slot-start">Start date and time</label>
            <input id="slot-start" name="start_time"
                   type="datetime-local" required>
          </div>

          <div class="field">
            <label for="slot-end">End date and time</label>
            <input id="slot-end" name="end_time"
                   type="datetime-local" required>
          </div>
        </div>

        <button class="button button-primary" type="submit">
          Publish slot
        </button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>My published slots</h2>
          <p>Remove slots that have not been booked.</p>
        </div>
      </div>

      ${
        ownSlots.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TITLE</th>
                    <th>START</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  ${ownSlots.map(s => `
                    <tr>
                      <td>${escapeHTML(s.title)}</td>
                      <td>${escapeHTML(formatDate(s.start_time))}</td>
                      <td>${statusBadge(s.status)}</td>
                      <td>
                        ${
                          s.status === "open"
                            ? `<button class="button button-danger button-small"
                                 data-delete-slot="${escapeHTML(s.id)}">
                                 Delete
                               </button>`
                            : "—"
                        }
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : emptyState(
              "No slots published",
              "Use the form above to publish your first slot."
            )
      }
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Interview requests</h2>
          <p>Confirm or reject requests, then add feedback after the session.</p>
        </div>
      </div>

      ${
        state.bookings.length
          ? renderBookingTable(state.bookings, true)
          : emptyState(
              "No requests yet",
              "Student requests will appear here."
            )
      }
    </section>
  `;
}

// Switch dashboard sections.
function setView(view) {
  state.view = view;
  renderView();

  $("#dashboard").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// Refresh dashboard information.
async function refresh() {
  clearMessage($("#dashboard-message"));
  await loadDashboard();
}

// Handle registration and login.
async function handleAuth(event) {
  event.preventDefault();

  const submit = $("#auth-submit");
  submit.disabled = true;
  submit.textContent = "Please wait…";

  clearMessage($("#auth-message"));

  const form = new FormData($("#auth-form"));

  try {
    const endpoint = state.mode === "signup"
      ? "/auth/signup"
      : "/auth/login";

    const body = state.mode === "signup"
      ? {
          name: form.get("name").trim(),
          email: form.get("email").trim(),
          password: form.get("password")
        }
      : {
          email: form.get("email").trim(),
          password: form.get("password")
        };

    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(body)
    });

    if (!result.token) {
      setMessage(
        $("#auth-message"),
        result.message ||
          "Account created. Check your email to confirm it, then log in."
      );
      return;
    }

    state.token = result.token;
    localStorage.setItem("mi_token", result.token);

    state.user = result.user || await loadUser();

    await enterDashboard();
  } catch (error) {
    setMessage($("#auth-message"), error.message, true);
  } finally {
    submit.disabled = false;
    submit.textContent = state.mode === "signup"
      ? "Create account"
      : "Log in";
  }
}

// Request an interview slot.
async function bookSlot(slotId) {
  if (!confirm("Request this interview slot?")) return;

  try {
    await api("/bookings", {
      method: "POST",
      body: JSON.stringify({ slot_id: slotId })
    });

    await refresh();
    setView("bookings");

    setMessage(
      $("#dashboard-message"),
      "Interview slot requested successfully."
    );
  } catch (error) {
    setMessage($("#dashboard-message"), error.message, true);
  }
}

// Confirm, reject, or cancel a booking.
async function bookingAction(action, id) {
  const prompts = {
    confirm: "Confirm this interview request?",
    reject: "Reject this interview request?",
    cancel: "Cancel this interview booking?"
  };

  if (!confirm(prompts[action] || "Continue?")) return;

  try {
    await api(
      `/bookings/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    await refresh();

    const messages = {
      confirm: "Booking confirmed successfully.",
      reject: "Booking rejected successfully.",
      cancel: "Booking cancelled successfully."
    };

    setMessage($("#dashboard-message"), messages[action]);
  } catch (error) {
    setMessage($("#dashboard-message"), error.message, true);
  }
}

// Submit mentor feedback.
async function submitFeedback(id) {
  const comments = prompt("Enter specific feedback for the student:");

  if (comments === null) return;

  if (!comments.trim()) {
    setMessage(
      $("#dashboard-message"),
      "Feedback comments cannot be empty.",
      true
    );
    return;
  }

  const scoreText = prompt("Enter a score from 1 to 10:");

  if (scoreText === null) return;

  const score = Number(scoreText);

  if (!Number.isInteger(score) || score < 1 || score > 10) {
    setMessage(
      $("#dashboard-message"),
      "Score must be a whole number from 1 to 10.",
      true
    );
    return;
  }

  try {
    await api(`/bookings/${encodeURIComponent(id)}/feedback`, {
      method: "POST",
      body: JSON.stringify({
        comments: comments.trim(),
        score
      })
    });

    await refresh();

    setMessage($("#dashboard-message"), "Feedback saved.");
  } catch (error) {
    setMessage($("#dashboard-message"), error.message, true);
  }
}

// Publish a mentor's availability.
async function createSlot(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  const startValue = form.get("start_time");
  const endValue = form.get("end_time");

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start <= new Date() ||
    end <= start
  ) {
    setMessage(
      $("#dashboard-message"),
      "Choose a future start time and an end time after the start.",
      true
    );
    return;
  }

  const body = {
    title: form.get("title").trim(),
    description: form.get("description").trim(),
    start_time: start.toISOString(),
    end_time: end.toISOString()
  };

  try {
    await api("/slots", {
      method: "POST",
      body: JSON.stringify(body)
    });

    event.currentTarget.reset();

    await refresh();

    setMessage($("#dashboard-message"), "Availability published.");
  } catch (error) {
    setMessage($("#dashboard-message"), error.message, true);
  }
}

// Delete an open slot.
async function deleteSlot(id) {
  if (!confirm("Delete this open slot? This cannot be undone.")) return;

  try {
    await api(`/slots/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    await refresh();

    setMessage($("#dashboard-message"), "Slot deleted.");
  } catch (error) {
    setMessage($("#dashboard-message"), error.message, true);
  }
}

// Handle dashboard actions using event delegation.
document.addEventListener("click", async event => {
  const viewButton = event.target.closest("[data-view]");

  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }

  const bookButton = event.target.closest("[data-book]");

  if (bookButton) {
    await bookSlot(bookButton.dataset.book);
    return;
  }

  const actionButton = event.target.closest("[data-booking-action]");

  if (actionButton) {
    await bookingAction(
      actionButton.dataset.bookingAction,
      actionButton.dataset.id
    );
    return;
  }

  const feedbackButton = event.target.closest("[data-feedback]");

  if (feedbackButton) {
    await submitFeedback(feedbackButton.dataset.feedback);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-slot]");

  if (deleteButton) {
    await deleteSlot(deleteButton.dataset.deleteSlot);
    return;
  }

  if (event.target.closest('[data-action="refresh"]')) {
    await refresh();
  }
});

// Landing page navigation.
$("#nav-login").addEventListener("click", () => showAuth("login"));
$("#nav-signup").addEventListener("click", () => showAuth("signup"));
$("#hero-signup").addEventListener("click", () => showAuth("signup"));
$("#hero-login").addEventListener("click", () => showAuth("login"));
$("#auth-back").addEventListener("click", showLanding);
$("#auth-form").addEventListener("submit", handleAuth);
$("#logout").addEventListener("click", () => logout(true));

// The slot form is rendered dynamically, so use delegated submit handling.
document.addEventListener("submit", event => {
  if (event.target.id === "slot-form") {
    createSlot(event);
  }
});

// Restore an existing login session on page load.
(async function init() {
  if (state.token) {
    try {
      await loadUser();
      await enterDashboard();
      return;
    } catch {
      logout(false);
    }
  }

  showLanding();
})();
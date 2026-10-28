
# Mock Interview Scheduling System

A web application backend for scheduling mock interviews between students and mentors.

## Technologies Used

- Node.js
- Express.js
- SQLite
- JWT Authentication
- bcryptjs
- REST API

## Features

1. Student and mentor registration
2. Secure password hashing
3. Login and authentication
4. Mentor availability management
5. Interview booking requests
6. Booking confirmation and cancellation
7. Interview completion
8. Student feedback and ratings

## Project Structure

```text
mock-interview-backend/
├── server.js
├── db.js
├── package.json
├── .env
├── .env.example
├── .gitignore
├── README.md
└── mock_interviews.db
```

Note: `.env` and `mock_interviews.db` are generated or local files
and should not be committed to Git.

## Installation

### Prerequisites

- Node.js installed
- npm installed
- VS Code (recommended)

### Step 1: Install Dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

### Step 2: Configure Environment Variables

Create a `.env` file using `.env.example` as a template.

Example:

```env
PORT=5000
JWT_SECRET=replace_with_a_long_random_secret_key
```

Replace the example secret with a strong random value.

### Step 3: Start the Server

```bash
npm start
```

Expected output:

```text
Server running at http://localhost:5000
```

### Step 4: Test the Server

Open this URL in your browser:

http://localhost:5000

Expected response:

```text
Mock Interview Scheduling System Backend is running!
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/register | Register a student or mentor |
| POST | /api/login | Log in |
| GET | /api/availability | View available slots |
| POST | /api/availability | Add mentor availability |
| POST | /api/bookings | Book an interview |
| GET | /api/bookings | View bookings |
| PATCH | /api/bookings/:id/status | Confirm or cancel a booking |
| PATCH | /api/bookings/:id/complete | Mark an interview completed |
| PATCH | /api/bookings/:id/feedback | Submit feedback |

## Testing

Use Postman or Thunder Client to test the REST API.

For protected endpoints, first log in and copy the returned JWT token.

Add this request header:

```text
Authorization: Bearer YOUR_TOKEN
```

For JSON request bodies, use:

```text
Content-Type: application/json
```

## Database

SQLite stores:

- User accounts
- Mentor availability
- Interview bookings
- Interview feedback and ratings

The database is created automatically when the backend starts.

## Security Notes

- Passwords are hashed before being stored.
- JWT tokens protect authenticated endpoints.
- Role checks restrict student and mentor actions.
- Use a strong secret and HTTPS before deploying publicly.
- Never commit `.env` or real user data to GitHub.

## Future Improvements

- Email notifications
- Calendar integration
- Video interview links
- Admin dashboard
- Automated testing
- Deployment to a cloud server

## Author

Student project — Mock Interview Scheduling System.

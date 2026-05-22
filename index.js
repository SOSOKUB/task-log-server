require("dotenv").config();
import cors from 'cors'
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, "http://localhost:5173"]
  : ["http://localhost:5173"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

//app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(cors({
  origin: 'https://tasklog-client.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}))
// ── MongoDB ──────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ── Task Schema ──────────────────────────────────────────────
const taskSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ["TODO", "DOING", "DONE"],
      default: "TODO",
    },
    deadline: { type: Date, default: null },
  },
  { timestamps: true }
);

const Task = mongoose.model("Task", taskSchema);

// ── REST API ─────────────────────────────────────────────────

// GET /api/tasks?username=xxx&status=xxx&overdue=true
app.get("/api/tasks", async (req, res) => {
  try {
    const { username, status, overdue } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });

    const filter = { username };
    if (status && status !== "ALL") filter.status = status;
    if (overdue === "true") {
      filter.deadline = { $lt: new Date() };
      filter.status = { $ne: "DONE" };
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks
app.post("/api/tasks", async (req, res) => {
  try {
    const { username, title, status, deadline } = req.body;
    if (!username || !title)
      return res.status(400).json({ error: "username and title required" });

    const task = await Task.create({ username, title, status, deadline });
    io.to(username).emit("task:created", task);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/:id
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { username, title, status, deadline } = req.body;
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { title, status, deadline },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    io.to(username).emit("task:updated", task);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { username } = req.query;
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    io.to(username).emit("task:deleted", req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => res.json({ status: "ok", service: "TaskLog API" }));

// ── Socket.io ────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("join", (username) => {
    socket.join(username);
  });
  socket.on("disconnect", () => {});
});

// ── Start ────────────────────────────────────────────────────
//const PORT = process.env.PORT || 4000;
module.exports = app;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

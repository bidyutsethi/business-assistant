require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:8790,https://bidyutsethi.github.io"
)
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Express 5 forwards rejected promises from async route handlers here.
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  res.status(500).json({ error: "Something went wrong." });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Business Assistant API listening on port ${port}`));

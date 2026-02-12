require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// SMTP: set in .env or here for local testing
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const CAREER_TO_EMAIL = process.env.CAREER_TO_EMAIL || process.env.SMTP_USER || "rarebeelifesciences@yahoo.com";

// In-memory storage for CV upload (no disk write; buffer attached to email)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|doc|docx)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF or DOC/DOCX files are allowed for CV."));
    }
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Career form submission
app.post("/api/career", upload.single("cv"), async (req, res) => {
  try {
    const name = (req.body && req.body.name && req.body.name.trim()) || "";
    const phone = (req.body && req.body.phone && req.body.phone.trim()) || "";
    const email = (req.body && req.body.email && req.body.email.trim()) || "";

    if (!name || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Name, phone number, and email are required.",
      });
    }

    if (!SMTP_USER || !SMTP_PASS) {
      console.error("SMTP_USER and SMTP_PASS must be set for career emails.");
      return res.status(503).json({
        success: false,
        message: "Email service is not configured. Please try again later.",
      });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const cvFile = req.file;
    const attachments = [];
    if (cvFile && cvFile.buffer) {
      attachments.push({
        filename: cvFile.originalname || "CV.pdf",
        content: cvFile.buffer,
      });
    }

    const mailOptions = {
      from: `"RareBee Career Form" <${SMTP_USER}>`,
      to: CAREER_TO_EMAIL,
      replyTo: email,
      subject: `Career application: ${name}`,
      text: [
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Email: ${email}`,
        cvFile ? `CV attached: ${cvFile.originalname}` : "No CV attached",
      ].join("\n"),
      html: [
        "<p><strong>Name:</strong> " + escapeHtml(name) + "</p>",
        "<p><strong>Phone:</strong> " + escapeHtml(phone) + "</p>",
        "<p><strong>Email:</strong> " + escapeHtml(email) + "</p>",
        cvFile ? "<p><strong>CV attached:</strong> " + escapeHtml(cvFile.originalname) + "</p>" : "<p>No CV attached.</p>",
      ].join(""),
      attachments,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: "Your application has been submitted successfully. We will get back to you soon.",
    });
  } catch (err) {
    console.error("Career form error:", err);
    if (err.code === "EAUTH" || err.responseCode === 535) {
      return res.status(503).json({
        success: false,
        message: "Email service error. Please try again later or contact us directly.",
      });
    }
    res.status(500).json({
      success: false,
      message: err.message || "Something went wrong. Please try again.",
    });
  }
});

// Multer file filter errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "CV file must be under 5 MB." });
    }
  }
  if (err.message && err.message.includes("Only PDF")) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!SMTP_USER || !SMTP_PASS) {
    console.log("Note: Set SMTP_USER and SMTP_PASS (and optionally CAREER_TO_EMAIL) for career form emails.");
  }
});

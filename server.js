const express = require("express");
const multer = require("multer");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();

/* =========================
   CORS
========================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   DIRECTORIES
========================= */
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

/* =========================
   MULTER
========================= */
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/* =========================
   MERGE PDF
========================= */
app.post("/merge", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).send("Upload at least 2 PDF files");
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const bytes = fs.readFileSync(file.path);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
      fs.unlinkSync(file.path);
    }

    const outPath = path.join(outputDir, `merged-${Date.now()}.pdf`);
    fs.writeFileSync(outPath, await mergedPdf.save());

    res.download(outPath, () => fs.unlinkSync(outPath));
  } catch (err) {
    console.error("MERGE ERROR:", err);
    res.status(500).send("PDF merge failed");
  }
});

/* =========================
   COMPRESS PDF (GHOSTSCRIPT)
========================= */
app.post("/compress", upload.single("pdf"), (req, res) => {
  if (!req.file) return res.status(400).send("No PDF uploaded");

  const inputPath = req.file.path;
  const outPath = path.join(outputDir, `compressed-${Date.now()}.pdf`);

  const gsCommand =
    process.platform === "win32"
      ? "C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe"
      : "gs";

  const quality = {
    low: "/printer",
    medium: "/ebook",
    high: "/screen"
  };

  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    `-dPDFSETTINGS=${quality[req.body.level] || "/ebook"}`,
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
    `-sOutputFile=${outPath}`,
    inputPath
  ];

  const gs = spawn(gsCommand, args);

  gs.on("error", err => {
    console.error("GHOSTSCRIPT ERROR:", err);
    fs.unlinkSync(inputPath);
    res.status(500).send("Compression failed");
  });

  gs.on("close", code => {
    fs.unlinkSync(inputPath);
    if (code !== 0 || !fs.existsSync(outPath)) {
      return res.status(500).send("Compression failed");
    }
    res.download(outPath, () => fs.unlinkSync(outPath));
  });
});

/* =========================
   SPLIT PDF
========================= */
app.post("/split", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No PDF uploaded");

    const [s, e] = req.body.range.split("-").map(n => parseInt(n) - 1);

    const src = await PDFDocument.load(
      fs.readFileSync(req.file.path),
      { ignoreEncryption: true }
    );

    if (e >= src.getPageCount()) {
      fs.unlinkSync(req.file.path);
      return res.status(400).send("Invalid page range");
    }

    const outPdf = await PDFDocument.create();
    const pages = await outPdf.copyPages(
      src,
      Array.from({ length: e - s + 1 }, (_, i) => s + i)
    );
    pages.forEach(p => outPdf.addPage(p));

    const outPath = path.join(outputDir, `split-${Date.now()}.pdf`);
    fs.writeFileSync(outPath, await outPdf.save());
    fs.unlinkSync(req.file.path);

    res.download(outPath, () => fs.unlinkSync(outPath));
  } catch (err) {
    console.error("SPLIT ERROR:", err);
    res.status(500).send("PDF split failed");
  }
});

/* =========================
   DOC → PDF (LIBREOFFICE)
========================= */
app.post("/doc-to-pdf", upload.single("doc"), (req, res) => {
  if (!req.file) return res.status(400).send("No document uploaded");

  const inputPath = req.file.path;

  const loCommand =
    process.platform === "win32"
      ? "C:\Program Files\LibreOffice\program\soffice.exe"
      : "libreoffice";

  const args = [
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    inputPath
  ];

  const lo = spawn(loCommand, args);

  lo.on("error", err => {
    console.error("LIBREOFFICE ERROR:", err);
    fs.unlinkSync(inputPath);
    res.status(500).send("Conversion failed");
  });

  lo.on("close", code => {
    fs.unlinkSync(inputPath);

    if (code !== 0) {
      return res.status(500).send("Conversion failed");
    }

    const pdfName =
      path.basename(inputPath).replace(path.extname(inputPath), ".pdf");

    const generated = path.join(outputDir, pdfName);

    if (!fs.existsSync(generated)) {
      return res.status(500).send("Conversion failed");
    }

    res.download(generated, () => fs.unlinkSync(generated));
  });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
